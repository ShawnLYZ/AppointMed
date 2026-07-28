import { OllamaUnavailableError } from '../../ollama/client.js';
import { summarySchema, type SummaryDecision } from '../../llm/schemas.js';
import { summarySystemPrompt } from '../../llm/prompts.js';
import { appendMessages, logStep, saveRun } from '../runs.js';
import type { EngineDeps } from '../../server.js';
import type { ConsultReply, Run } from '../types.js';

const PRIORITY_BY_URGENCY: Record<string, 'low' | 'medium' | 'high'> =
  { asap: 'high', week: 'medium', month: 'low', routine: 'low' };

export async function bookSelectedSlot(deps: EngineDeps, run: Run, slotId: string): Promise<ConsultReply | { httpError: [number, string] }> {
  // A booked run sits at 'hospital_review' — only a run still matching may book.
  // Without this, a double-tap/retry would re-confirm with the adapter and insert
  // a second appointment for the same run (state.options stays populated on success).
  if (run.node !== 'match') return { httpError: [409, 'already_booked'] };
  const option = run.state.options?.find((o) => o.id === slotId);
  if (!option || run.state.matchPhase !== 'presented') return { httpError: [400, 'unknown_slot_option'] };

  const keyRow = await deps.pool.query(
    `select api_key from public.hospital_api_keys where hospital_id = $1 and is_active limit 1`,
    [option.hospitalId]);
  if (keyRow.rows.length === 0) return { httpError: [500, 'hospital_key_missing'] };

  const prof = await deps.pool.query('select full_name from public.profiles where id = $1', [run.userId]);
  const patientName = prof.rows[0]?.full_name ?? 'AppointMed patient';

  let externalAppointmentId: string;
  try {
    const r = await deps.adapter.confirm(keyRow.rows[0].api_key, { slotId, patientName });
    externalAppointmentId = r.externalAppointmentId;
    await logStep(deps.pool, run.id, 'book_request', 'tool_call',
      { tool: 'adapter.confirm', slotId, hospital: option.hospitalName }, r);
  } catch (err) {
    await logStep(deps.pool, run.id, 'book_request', 'error', { tool: 'adapter.confirm', slotId }, { message: String(err) });
    run.node = 'match'; // options may be stale (e.g. slot taken) - re-present on next message
    run.state.matchPhase = 'ready';
    await saveRun(deps.pool, run);
    const reply = "I couldn't submit that booking (the slot may have just been taken). Send any message and I'll try to find fresh options.";
    await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: reply }]);
    return { runId: run.id, node: 'match', status: run.status, reply };
  }

  let summary: SummaryDecision;
  try {
    const r = await deps.ollama.structured<SummaryDecision>({
      stage: 'summary',
      messages: [{ role: 'system', content: summarySystemPrompt },
        { role: 'user', content: JSON.stringify({ symptoms: run.state.symptoms, verdict: run.state.verdict }) }],
      schema: summarySchema,
    });
    summary = r.value;
    await logStep(deps.pool, run.id, 'book_request', 'llm_decision', { for: 'case_summary' }, summary, r.model, r.latencyMs);
  } catch (err) {
    if (!(err instanceof OllamaUnavailableError)) throw err;
    const s = run.state.symptoms;
    summary = {
      summary: `Patient reports ${s.mainComplaint ?? 'symptoms'} for ${s.duration ?? 'an unknown duration'}, severity ${s.severity ?? '?'} /10. History: ${s.medicalHistory ?? 'none stated'}. AI triage: ${run.state.verdict?.specialty} (${run.state.verdict?.urgency}).`,
      priority: PRIORITY_BY_URGENCY[run.state.verdict?.urgency ?? 'routine'],
    };
    await logStep(deps.pool, run.id, 'book_request', 'fallback', { for: 'case_summary' }, summary);
  }

  // Atomic: the appointment row and its "booking submitted" notification are
  // related writes and must commit together (Phase-3 policy mirroring the
  // Phase-2 adapter). The adapter.confirm() network call above stays OUTSIDE
  // this transaction - never hold a DB transaction open across a network call.
  const client = await deps.pool.connect();
  let apptId: string;
  try {
    await client.query('begin');
    const ins = await client.query(
      `insert into public.appointments
         (user_id, patient_name, hospital_id, hospital_name, specialist_id, specialist_name, specialty,
          slot_id, external_slot_id, external_appointment_id, run_id, starts_at, price,
          status, status_source, created_via_ai, ai_summary, suggested_priority)
       values ($1,$2,$3,$4,$5,$6,$7, null,$8,$9,$10,$11,$12, 'pending','appointmed',true,$13,$14)
       returning id, starts_at`,
      [run.userId, patientName, option.hospitalId, option.hospitalName, option.specialistId,
       option.specialistName, option.specialty, option.id, externalAppointmentId, run.id,
       option.startsAt, option.price, summary.summary, summary.priority]);
    apptId = ins.rows[0].id;
    await client.query(
      `insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)`,
      [run.userId, 'booking_update', 'Booking request submitted',
       `Your request for ${option.specialistName} at ${option.hospitalName} is pending hospital confirmation.`,
       JSON.stringify({ appointmentId: apptId })]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  run.node = 'hospital_review';
  run.status = 'waiting_hospital';
  await logStep(deps.pool, run.id, 'book_request', 'transition', { to: 'hospital_review' }, { appointmentId: apptId });
  await saveRun(deps.pool, run);

  const reply = `✅ Your booking request is in!\n\n👨‍⚕️ ${option.specialistName} — ${option.specialty}\n🏥 ${option.hospitalName}\n📅 ${new Date(option.startsAt).toUTCString()}\n\nIt is now **pending** hospital confirmation — I'll notify you the moment they respond.`;
  await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: reply }]);
  return { runId: run.id, node: 'hospital_review', status: 'waiting_hospital', reply,
    appointment: { id: apptId, status: 'pending', startsAt: option.startsAt,
      hospitalName: option.hospitalName, specialistName: option.specialistName,
      specialty: option.specialty, price: option.price } };
}
