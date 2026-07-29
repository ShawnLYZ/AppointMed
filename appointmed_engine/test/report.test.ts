import { expect, test } from 'vitest';
import {
  buildReportInput, fallbackReport, intakeAttachmentContext, triageAttachmentContext,
} from '../src/workflow/report.js';
import { emptyState, type RunState } from '../src/workflow/types.js';

// No makeTestContext here on purpose: report.ts is pure, so this file needs no
// Supabase, no pool and no network. Keep it that way.

function stateWith(over: Partial<RunState> = {}): RunState {
  return { ...emptyState(), ...over };
}

const fullSymptoms = {
  mainComplaint: 'chest tightness on exertion', duration: '2 weeks', severity: 6,
  associatedSymptoms: 'breathless climbing stairs', medicalHistory: 'hypertension',
  currentMedications: 'amlodipine',
};

const cardiology = {
  specialty: 'Cardiology', urgency: 'week' as const,
  explanation: 'Exertional chest tightness with hypertension warrants review.',
  redFlags: ['exertional chest pain'],
};

test('intakeAttachmentContext is byte-identical to the string intake built inline', () => {
  const state = stateWith({ attachments: [
    { type: 'pdf', name: 'labs.pdf', path: 'p/1', extractedText: 'Hb 9.1', observation: 'Low haemoglobin.' },
    { type: 'image', name: 'rash.png', path: 'p/2', observation: 'Erythematous plaque.' },
  ] });
  // Exactly what intake.ts:20-21 produced before the helper existed: documents
  // only, extractedText only, NO observation. Changing this changes a live
  // prompt, which is out of scope for this feature.
  expect(intakeAttachmentContext(state.attachments))
    .toBe('\n[Attached document "labs.pdf"]:\nHb 9.1');
});

test('triageAttachmentContext prefers observations and covers images too', () => {
  const state = stateWith({ attachments: [
    { type: 'pdf', name: 'labs.pdf', path: 'p/1', extractedText: 'Hb 9.1', observation: 'Low haemoglobin.' },
    { type: 'image', name: 'rash.png', path: 'p/2', observation: 'Erythematous plaque.' },
  ] });
  expect(triageAttachmentContext(state.attachments)).toBe(
    'Document "labs.pdf": Low haemoglobin.\nPhoto "rash.png": Erythematous plaque.');
});

test('triageAttachmentContext falls back to extracted text and skips empty entries', () => {
  const state = stateWith({ attachments: [
    { type: 'pdf', name: 'old.pdf', path: 'p/1', extractedText: 'raw text' },
    { type: 'image', name: 'blank.png', path: 'p/2' },
  ] });
  expect(triageAttachmentContext(state.attachments)).toBe('Document "old.pdf": raw text');
});

test('buildReportInput keeps patient turns and drops assistant + upload turns', () => {
  const state = stateWith({ symptoms: fullSymptoms, verdict: cardiology });
  const input = buildReportInput(state, [
    { role: 'assistant', content: 'How long has this been going on?' },
    { role: 'user', content: 'about two weeks' },
    { role: 'user', content: "I've shared a photo of my condition", kind: 'upload' },
    { role: 'user', content: 'my dad had a heart attack at 50' },
  ], false);
  expect(input.patientAccount).toEqual(['about two weeks', 'my dad had a heart attack at 50']);
  expect(input.symptoms).toEqual(fullSymptoms);
  expect(input.verdict).toEqual(cardiology);
  expect(input.triageDegraded).toBe(false);
});

test('buildReportInput carries attachment observations, never storage paths', () => {
  const state = stateWith({ attachments: [
    { type: 'image', name: 'rash.png', path: 'user-id/run-id/secret.png', observation: 'Erythematous plaque.' },
  ] });
  const input = buildReportInput(state, [], false);
  expect(input.attachments).toEqual([
    { type: 'image', name: 'rash.png', observation: 'Erythematous plaque.' },
  ]);
  expect(JSON.stringify(input)).not.toContain('secret.png');
});

test('fallbackReport fills every section and marks its own provenance', () => {
  const state = stateWith({ symptoms: fullSymptoms, verdict: cardiology });
  const r = fallbackReport(state, false);
  expect(r.generated).toBe('fallback');
  expect(r.triageDegraded).toBe(false);
  expect(r.chiefComplaint).toBe('chest tightness on exertion');
  expect(r.pastMedicalHistory).toBe('hypertension');
  expect(r.currentMedications).toBe('amlodipine');
  expect(r.redFlags).toEqual(['exertional chest pain']);
  expect(r.priority).toBe('medium'); // urgency 'week'
  expect(r.attachmentFindings).toBe('No files were uploaded.');
  expect(r.clinicianNotes.toLowerCase()).toContain('no ai clinical reasoning');
});

test('fallbackReport never leaks undefined or null into clinical prose', () => {
  const r = fallbackReport(stateWith(), false); // every symptom null, no verdict
  for (const [key, value] of Object.entries(r)) {
    if (typeof value !== 'string') continue;
    expect(value, `${key} leaked a stringified empty value`).not.toMatch(/undefined|null|NaN/);
  }
  expect(r.chiefComplaint).toBe('Not reported');
  expect(r.priority).toBe('low');
  expect(r.redFlags).toEqual([]);
});

test('fallbackReport says so plainly when triage itself degraded', () => {
  const r = fallbackReport(stateWith({ symptoms: fullSymptoms }), true);
  expect(r.triageDegraded).toBe(true);
  expect(r.triageAssessment).toContain('automatic default');
  expect(r.triageAssessment).toContain('General Practice');
});

test('fallbackReport lists attached files by name', () => {
  const state = stateWith({ attachments: [
    { type: 'image', name: 'rash.png', path: 'p/1', observation: 'Erythematous plaque.' },
    { type: 'pdf', name: 'labs.pdf', path: 'p/2' },
  ] });
  const r = fallbackReport(state, false);
  expect(r.attachmentFindings).toContain('rash.png');
  expect(r.attachmentFindings).toContain('Erythematous plaque.');
  expect(r.attachmentFindings).toContain('labs.pdf');
  expect(r.attachmentFindings).toContain('not analysed');
});
