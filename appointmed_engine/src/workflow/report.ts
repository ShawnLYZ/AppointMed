import type { TranscriptEntry } from './runs.js';
import type { Attachment, CaseReport, RunState, Symptoms, Verdict } from './types.js';

/**
 * Attachment context for the INTAKE prompt.
 *
 * MUST stay byte-identical to the string intake.ts built inline before this
 * helper existed - documents only, extractedText only, NO observation. It feeds
 * a live prompt whose behaviour is explicitly out of scope for this change, and
 * test/report.test.ts pins the exact output.
 */
export function intakeAttachmentContext(attachments: Attachment[]): string {
  return attachments.filter((a) => a.extractedText)
    .map((a) => `\n[Attached document "${a.name}"]:\n${a.extractedText}`).join('');
}

/**
 * Attachment context for the TRIAGE prompt. Unlike intake's, this one carries
 * observations and covers images - triage previously saw nothing at all about
 * an uploaded photo.
 */
export function triageAttachmentContext(attachments: Attachment[]): string {
  return attachments
    .map((a) => {
      const body = a.observation ?? a.extractedText;
      if (!body) return null;
      return `${a.type === 'pdf' ? 'Document' : 'Photo'} "${a.name}": ${body}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

export interface ReportInput {
  symptoms: Symptoms;
  verdict: Verdict | undefined;
  triageDegraded: boolean;
  attachments: { type: string; name: string; observation: string }[];
  patientAccount: string[];
}

/**
 * Everything the summary stage is allowed to see. Assistant turns are dropped:
 * their content is already implied by the six structured fields, and including
 * them is the surest way to get the model echoing its own prior phrasing back
 * as patient history. Upload turns are dropped structurally via `kind`, not by
 * prefix-matching their text.
 *
 * Storage paths are never included - the model has no use for them and they
 * must not travel any further than the engine.
 */
export function buildReportInput(
  state: RunState, transcript: TranscriptEntry[], triageDegraded: boolean,
): ReportInput {
  return {
    symptoms: state.symptoms,
    verdict: state.verdict,
    triageDegraded,
    attachments: state.attachments.map((a) => ({
      type: a.type,
      name: a.name,
      observation: a.observation ?? a.extractedText ?? 'No description available.',
    })),
    patientAccount: transcript
      .filter((m) => m.role === 'user' && m.kind !== 'upload')
      .map((m) => m.content),
  };
}

export const PRIORITY_BY_URGENCY: Record<string, 'low' | 'medium' | 'high'> =
  { asap: 'high', week: 'medium', month: 'low', routine: 'low' };

const NOT_REPORTED = 'Not reported';

/** Never returns an empty, undefined or null-ish string - clinical prose must not read "undefined". */
function stated(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return NOT_REPORTED;
  const s = String(v).trim();
  return s === '' ? NOT_REPORTED : s;
}

/**
 * Deterministic report assembled from data already in the run - used when the
 * summary stage is unreachable. Everything here comes from the patient's own
 * answers; no clinical inference is performed, and clinicianNotes says so.
 */
export function fallbackReport(state: RunState, triageDegraded: boolean): CaseReport {
  const s = state.symptoms;
  const v = state.verdict;
  const files = state.attachments;
  const specialty = v?.specialty ?? 'General Practice';
  const urgency = v?.urgency ?? 'routine';

  const hpi = [
    s.mainComplaint ? `Patient reports ${s.mainComplaint}` : 'The patient did not state a main complaint',
    s.duration ? ` lasting ${s.duration}` : '',
    s.severity !== null && s.severity !== undefined ? `, rated ${s.severity} out of 10` : '',
    '. Assembled automatically from the patient\'s own answers; no AI clinical reasoning was applied.',
  ].join('');

  return {
    generated: 'fallback',
    triageDegraded,
    summary: `${stated(s.mainComplaint)} · ${stated(s.duration)} · severity ${stated(s.severity)}/10 · ${specialty} (${urgency}).`,
    chiefComplaint: stated(s.mainComplaint),
    historyOfPresentIllness: hpi,
    associatedSymptoms: stated(s.associatedSymptoms),
    pastMedicalHistory: stated(s.medicalHistory),
    currentMedications: stated(s.currentMedications),
    attachmentFindings: files.length === 0
      ? 'No files were uploaded.'
      : `${files.length} file(s) attached: ` +
        files.map((f) => `${f.name} — ${f.observation ?? 'not analysed'}`).join('; '),
    triageAssessment: triageDegraded
      ? `Routed to ${specialty} (${urgency}) by automatic default — AI triage was unavailable.`
      : `AI triage routed this case to ${specialty} (${urgency}).` +
        (v?.explanation ? ` ${v.explanation}` : ''),
    redFlags: v?.redFlags ?? [],
    clinicianNotes:
      'This report was assembled automatically from the patient\'s own answers. ' +
      'No AI clinical reasoning was applied — please review the patient directly.',
    priority: PRIORITY_BY_URGENCY[urgency] ?? 'low',
  };
}
