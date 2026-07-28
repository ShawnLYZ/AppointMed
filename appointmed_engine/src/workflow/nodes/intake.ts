import { OllamaUnavailableError, type ChatMessage } from '../../ollama/client.js';
import { intakeSchema, type IntakeDecision } from '../../llm/schemas.js';
import { escalationReply, intakeSystemPrompt } from '../../llm/prompts.js';
import { appendMessages, getTranscript, logStep, saveRun } from '../runs.js';
import type { EngineDeps } from '../../server.js';
import type { ConsultReply, Run, Symptoms } from '../types.js';
import { runTriage } from './triage.js';

const mergeSymptoms = (cur: Symptoms, next: Symptoms): Symptoms => ({
  mainComplaint: next.mainComplaint ?? cur.mainComplaint,
  duration: next.duration ?? cur.duration,
  severity: next.severity ?? cur.severity,
  associatedSymptoms: next.associatedSymptoms ?? cur.associatedSymptoms,
  medicalHistory: next.medicalHistory ?? cur.medicalHistory,
  currentMedications: next.currentMedications ?? cur.currentMedications,
});

export async function handleIntakeMessage(deps: EngineDeps, run: Run, text: string): Promise<ConsultReply> {
  const transcript = await getTranscript(deps.pool, run.id);
  const docs = run.state.attachments.filter((a) => a.extractedText)
    .map((a) => `\n[Attached document "${a.name}"]:\n${a.extractedText}`).join('');
  const userMsg: ChatMessage = { role: 'user', content: docs ? text + docs : text };
  if (run.state.pendingImages.length > 0) userMsg.images = run.state.pendingImages;

  const messages: ChatMessage[] = [
    { role: 'system', content: intakeSystemPrompt },
    ...transcript.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    userMsg,
  ];

  let decision: IntakeDecision;
  try {
    const r = await deps.ollama.structured<IntakeDecision>({ stage: 'intake', messages, schema: intakeSchema });
    decision = r.value;
    await logStep(deps.pool, run.id, 'intake', 'llm_decision',
      { text }, decision, r.model, r.latencyMs);
  } catch (err) {
    if (!(err instanceof OllamaUnavailableError)) throw err;
    const reply = "I'm having trouble reaching my reasoning engine right now — could you say that again in a moment?";
    await logStep(deps.pool, run.id, 'intake', 'fallback', { text }, { reply, cause: String(err) });
    await appendMessages(deps.pool, run.id, [{ role: 'user', content: text }, { role: 'assistant', content: reply }]);
    return { runId: run.id, node: run.node, status: run.status, reply };
  }

  run.state.symptoms = mergeSymptoms(run.state.symptoms, decision.fields);
  run.state.pendingImages = [];

  if (decision.redFlag) {
    run.status = 'escalated';
    const reply = escalationReply(decision.redFlagReason);
    await logStep(deps.pool, run.id, 'intake', 'transition', { to: 'escalated' }, { reason: decision.redFlagReason });
    await saveRun(deps.pool, run);
    await appendMessages(deps.pool, run.id, [{ role: 'user', content: text }, { role: 'assistant', content: reply }]);
    return { runId: run.id, node: run.node, status: 'escalated', reply, escalated: true };
  }

  await appendMessages(deps.pool, run.id, [{ role: 'user', content: text }, { role: 'assistant', content: decision.reply }]);

  if (decision.complete) {
    await logStep(deps.pool, run.id, 'intake', 'transition', { to: 'triage' }, { symptoms: run.state.symptoms });
    run.node = 'triage';
    await saveRun(deps.pool, run);
    return runTriage(deps, run); // triage continues the same turn
  }

  await saveRun(deps.pool, run);
  return { runId: run.id, node: 'intake', status: run.status, reply: decision.reply };
}
