import { OllamaUnavailableError } from '../../ollama/client.js';
import { summarySchema, triageSchema, type SummaryDecision, type TriageDecision } from '../../llm/schemas.js';
import { DISCLAIMER, summarySystemPrompt, triageSystemPrompt, urgencyLabel } from '../../llm/prompts.js';
import { appendMessages, getTranscript, logStep, saveRun } from '../runs.js';
import type { EngineDeps } from '../../server.js';
import type { ConsultReply, Run } from '../types.js';
import { buildReportInput, fallbackReport, PRIORITY_BY_URGENCY, triageAttachmentContext } from '../report.js';
import type { CaseReport } from '../types.js';

const FIRST_PREFS_QUESTION =
  "Now let's find you an appointment. What's your budget range for the consultation, in RM?";

export async function runTriage(deps: EngineDeps, run: Run): Promise<ConsultReply> {
  // Now carries image observations too - triage previously saw nothing at all
  // about an uploaded photo, only PDF text.
  const docs = triageAttachmentContext(run.state.attachments);
  let triageDegraded = false;
  let verdict: TriageDecision;
  try {
    const r = await deps.ollama.structured<TriageDecision>({
      stage: 'triage',
      messages: [
        { role: 'system', content: triageSystemPrompt },
        { role: 'user', content: `Patient symptoms: ${JSON.stringify(run.state.symptoms)}${docs ? `\n${docs}` : ''}` },
      ],
      schema: triageSchema,
    });
    verdict = r.value;
    await logStep(deps.pool, run.id, 'triage', 'llm_decision', run.state.symptoms, verdict, r.model, r.latencyMs);
  } catch (err) {
    if (!(err instanceof OllamaUnavailableError)) throw err;
    triageDegraded = true;
    verdict = { specialty: 'General Practice', urgency: 'routine',
      explanation: 'I could not complete a detailed triage, so a General Practice doctor is the safest first step.',
      redFlags: [] };
    await logStep(deps.pool, run.id, 'triage', 'fallback', run.state.symptoms, verdict);
  }

  run.state.verdict = verdict;

  // The case report is fully determined here: all six symptom fields are filled
  // (that is intake's completion gate) and every attachment exists (uploads are
  // intake-only). Generating it now keeps the Book tap a pure database write.
  const transcript = await getTranscript(deps.pool, run.id);
  let report: CaseReport;
  try {
    const r = await deps.ollama.structured<SummaryDecision>({
      stage: 'summary',
      messages: [{ role: 'system', content: summarySystemPrompt },
        { role: 'user', content: JSON.stringify(buildReportInput(run.state, transcript, triageDegraded)) }],
      schema: summarySchema,
    });
    // `priority`, `generated` and `triageDegraded` are stamped HERE, not by the
    // model - priority is a four-entry lookup TypeScript already owns (see
    // fallbackReport), and generated/triageDegraded must never be asserted by
    // the model about its own provenance.
    report = {
      ...r.value,
      priority: PRIORITY_BY_URGENCY[verdict.urgency] ?? 'low',
      generated: 'model',
      triageDegraded,
    };
    await logStep(deps.pool, run.id, 'triage', 'llm_decision',
      { for: 'case_report' }, report, r.model, r.latencyMs);
  } catch (err) {
    if (!(err instanceof OllamaUnavailableError)) throw err;
    report = fallbackReport(run.state, triageDegraded);
    await logStep(deps.pool, run.id, 'triage', 'fallback', { for: 'case_report' }, report);
  }
  run.state.report = report;

  run.node = 'match';
  run.state.matchPhase = 'collecting';
  await logStep(deps.pool, run.id, 'triage', 'transition', { to: 'match' }, verdict);
  await saveRun(deps.pool, run);

  const reply =
    `Based on your symptoms, I recommend seeing **${verdict.specialty}** ${urgencyLabel(verdict.urgency)}.\n\n` +
    `${verdict.explanation}\n\n${DISCLAIMER}\n\n${FIRST_PREFS_QUESTION}`;
  await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: reply }]);
  return { runId: run.id, node: 'match', status: run.status, reply, verdict };
}
