import { OllamaUnavailableError } from '../../ollama/client.js';
import { prefsSchema, relaxSchema, type PrefsDecision, type RelaxDecision } from '../../llm/schemas.js';
import { prefsSystemPrompt, relaxSystemPrompt } from '../../llm/prompts.js';
import { appendMessages, getTranscript, logStep, saveRun } from '../runs.js';
import type { EngineDeps } from '../../server.js';
import type { ConsultReply, Run, SlotOption } from '../types.js';

const WINDOW_DAYS: Record<string, number> = { asap: 2, week: 7, month: 7, routine: 7 };
const TIME_RANGES: Record<string, [number, number]> = { morning: [6, 12], afternoon: [12, 17], evening: [17, 21] };

const klHour = (iso: string) => (new Date(iso).getUTCHours() + 8) % 24; // MY has no DST

export async function handleMatchMessage(deps: EngineDeps, run: Run, text: string): Promise<ConsultReply> {
  if (run.state.matchPhase === 'ready') {
    await appendMessages(deps.pool, run.id, [{ role: 'user', content: text }]);
    return matchAndPresent(deps, run);
  }
  // collecting (also re-entered from 'presented' when the patient keeps typing)
  const transcript = await getTranscript(deps.pool, run.id);
  let d: PrefsDecision;
  try {
    const r = await deps.ollama.structured<PrefsDecision>({
      stage: 'prefs',
      messages: [{ role: 'system', content: prefsSystemPrompt },
        ...transcript.map((m) => ({ role: m.role, content: m.content }) as const),
        { role: 'user', content: text }],
      schema: prefsSchema,
    });
    d = r.value;
    await logStep(deps.pool, run.id, 'match', 'llm_decision', { text }, d, r.model, r.latencyMs);
  } catch (err) {
    if (!(err instanceof OllamaUnavailableError)) throw err;
    const reply = "I'm having trouble reaching my reasoning engine — could you repeat that in a moment?";
    await logStep(deps.pool, run.id, 'match', 'fallback', { text }, { reply });
    await appendMessages(deps.pool, run.id, [{ role: 'user', content: text }, { role: 'assistant', content: reply }]);
    return { runId: run.id, node: 'match', status: run.status, reply };
  }
  await appendMessages(deps.pool, run.id, [{ role: 'user', content: text }, { role: 'assistant', content: d.reply }]);
  run.state.prefs = d.prefs;
  if (!d.complete) {
    run.state.matchPhase = 'collecting';
    await saveRun(deps.pool, run);
    return { runId: run.id, node: 'match', status: run.status, reply: d.reply };
  }
  await logStep(deps.pool, run.id, 'match', 'transition', { prefsComplete: true }, d.prefs);
  return matchAndPresent(deps, run);
}

interface Candidate { hospitalId: string; hospitalName: string; apiKey: string }

async function candidateHospitals(deps: EngineDeps, run: Run): Promise<Candidate[]> {
  const pref = run.state.prefs?.preferredHospital;
  const { rows } = await deps.pool.query(
    `select h.id, h.name, k.api_key
       from public.hospitals h
       join public.hospital_api_keys k on k.hospital_id = h.id and k.is_active
      where not (h.id = any($1::uuid[]))
        and ($2::text is null or h.name ilike '%' || $2 || '%')
      order by h.name`,
    [run.state.excludeHospitalIds, pref && pref.toLowerCase() !== 'any' ? pref : null],
  );
  return rows.map((r) => ({ hospitalId: r.id, hospitalName: r.name, apiKey: r.api_key }));
}

async function searchOnce(deps: EngineDeps, run: Run): Promise<SlotOption[] | 'adapter_error'> {
  const prefs = run.state.prefs!;
  const verdict = run.state.verdict!;
  const days = run.state.relaxations.some((r) => r.relaxed === 'time') ? 7 : WINDOW_DAYS[verdict.urgency];
  const from = new Date().toISOString();
  const to = new Date(Date.now() + days * 86_400_000).toISOString();
  const hospitals = await candidateHospitals(deps, run);
  const all: SlotOption[] = [];
  for (const h of hospitals) {
    try {
      const slots = await deps.adapter.getSlots(h.apiKey, {
        specialty: verdict.specialty,
        maxPrice: prefs.budget ?? undefined, from, to, limit: 20,
      });
      await logStep(deps.pool, run.id, 'match', 'tool_call',
        { tool: 'adapter.getSlots', hospital: h.hospitalName, specialty: verdict.specialty, maxPrice: prefs.budget, from, to },
        { count: slots.length });
      all.push(...slots);
    } catch (err) {
      await logStep(deps.pool, run.id, 'match', 'error',
        { tool: 'adapter.getSlots', hospital: h.hospitalName }, { message: String(err) });
      return 'adapter_error';
    }
  }
  const tod = prefs.preferredTime && prefs.preferredTime !== 'any' ? TIME_RANGES[prefs.preferredTime] : null;
  return all
    .filter((s) => !tod || (klHour(s.startsAt) >= tod[0] && klHour(s.startsAt) < tod[1]))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 5);
}

export async function matchAndPresent(deps: EngineDeps, run: Run): Promise<ConsultReply> {
  run.state.relaxations = []; // fresh relaxation budget for each matching attempt (including re-entries)
  const explanations: string[] = [];
  for (let round = 0; round <= 3; round++) {
    const result = await searchOnce(deps, run);
    if (result === 'adapter_error') {
      const reply = 'The hospital systems are unreachable right now — please try again in a few minutes; your details are saved.';
      await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: reply }]);
      run.state.matchPhase = 'ready';
      await saveRun(deps.pool, run);
      return { runId: run.id, node: 'match', status: run.status, reply };
    }
    if (result.length > 0) {
      run.state.options = result;
      run.state.matchPhase = 'presented';
      await saveRun(deps.pool, run);
      const prefix = explanations.length > 0 ? explanations.join(' ') + '\n\n' : '';
      const reply = `${prefix}Here are the best available slots — tap one to request the booking:`;
      await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: reply }]);
      return { runId: run.id, node: 'match', status: run.status, reply,
        verdict: run.state.verdict, slotOptions: result };
    }
    if (round === 3 || run.state.relaxations.length >= 3) break;
    // choose one constraint to relax
    let relax: RelaxDecision;
    try {
      const r = await deps.ollama.structured<RelaxDecision>({
        stage: 'relax',
        messages: [{ role: 'system', content: relaxSystemPrompt },
          { role: 'user', content: JSON.stringify({ prefs: run.state.prefs, verdict: run.state.verdict, alreadyRelaxed: run.state.relaxations.map((x) => x.relaxed) }) }],
        schema: relaxSchema,
      });
      relax = r.value;
      await logStep(deps.pool, run.id, 'match', 'llm_decision', { emptySearchRound: round }, relax, r.model, r.latencyMs);
    } catch (err) {
      if (!(err instanceof OllamaUnavailableError)) throw err;
      const order: RelaxDecision['relax'][] = ['time', 'hospital', 'budget'];
      const next = order.find((o) => !run.state.relaxations.some((x) => x.relaxed === o)) ?? 'budget';
      relax = { relax: next, explanation: 'I broadened the search to find you an appointment.' };
      await logStep(deps.pool, run.id, 'match', 'fallback', { emptySearchRound: round }, relax);
    }
    if (relax.relax === 'time') run.state.prefs!.preferredTime = 'any';
    if (relax.relax === 'hospital') run.state.prefs!.preferredHospital = null;
    if (relax.relax === 'budget') run.state.prefs!.budget = null;
    run.state.relaxations.push({ relaxed: relax.relax, explanation: relax.explanation });
    explanations.push(relax.explanation);
  }
  const reply = "I couldn't find any suitable slots even after widening the search. " +
    'You can tell me different preferences, or try again later — your consultation is saved.';
  run.state.matchPhase = 'collecting';
  await saveRun(deps.pool, run);
  await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: reply }]);
  return { runId: run.id, node: 'match', status: run.status, reply };
}
