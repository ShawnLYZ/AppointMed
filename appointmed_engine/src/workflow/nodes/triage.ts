import { OllamaUnavailableError } from '../../ollama/client.js';
import { triageSchema, type TriageDecision } from '../../llm/schemas.js';
import { DISCLAIMER, triageSystemPrompt, urgencyLabel } from '../../llm/prompts.js';
import { appendMessages, logStep, saveRun } from '../runs.js';
import type { EngineDeps } from '../../server.js';
import type { ConsultReply, Run } from '../types.js';

const FIRST_PREFS_QUESTION =
  "Now let's find you an appointment. What's your budget range for the consultation, in RM?";

export async function runTriage(deps: EngineDeps, run: Run): Promise<ConsultReply> {
  const docs = run.state.attachments.filter((a) => a.extractedText)
    .map((a) => `Document "${a.name}": ${a.extractedText}`).join('\n');
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
    verdict = { specialty: 'General Practice', urgency: 'routine',
      explanation: 'I could not complete a detailed triage, so a General Practice doctor is the safest first step.',
      redFlags: [] };
    await logStep(deps.pool, run.id, 'triage', 'fallback', run.state.symptoms, verdict);
  }

  run.state.verdict = verdict;
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
