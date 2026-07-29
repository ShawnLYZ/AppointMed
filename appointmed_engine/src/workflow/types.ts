export type Node = 'intake' | 'triage' | 'match' | 'book_request' | 'hospital_review' | 'postback' | 'done';
export type RunStatus = 'active' | 'waiting_hospital' | 'completed' | 'failed' | 'escalated';

export interface Symptoms {
  mainComplaint: string | null;
  duration: string | null;
  severity: number | null;
  associatedSymptoms: string | null;
  medicalHistory: string | null;
  currentMedications: string | null;
}

export interface Prefs {
  budget: number | null;
  preferredHospital: string | null;
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'any' | null;
}

export interface Verdict {
  specialty: string;
  urgency: 'asap' | 'week' | 'month' | 'routine';
  explanation: string;
  redFlags: string[];
}

/** Mirrors the adapter's ApiSlot wire shape. */
export interface SlotOption {
  id: string;
  specialistId: string;
  specialistName: string;
  specialty: string;
  startsAt: string;
  endsAt: string;
  price: number;
  hospitalId: string;
  hospitalName: string;
  hospitalAddress: string;
}

export type MatchPhase = 'collecting' | 'ready' | 'presented';

/** One patient-uploaded file. `observation` is the attachment stage's description. */
export interface Attachment {
  type: 'image' | 'pdf';
  name: string;
  path: string;
  extractedText?: string;
  observation?: string;
}

/**
 * Exactly what the `summary` stage returns. `generated` and `triageDegraded`
 * are deliberately ABSENT: the model must not be able to assert its own
 * provenance in either direction. TypeScript stamps them after the call.
 */
export interface CaseReportDecision {
  summary: string;                  // one line -> appointments.ai_summary
  chiefComplaint: string;
  historyOfPresentIllness: string;  // the detailed narrative
  associatedSymptoms: string;
  pastMedicalHistory: string;
  currentMedications: string;
  attachmentFindings: string;
  triageAssessment: string;
  redFlags: string[];
  clinicianNotes: string;
  priority: 'low' | 'medium' | 'high';
}

/** What is persisted to appointments.ai_report. */
export type CaseReport = CaseReportDecision & {
  generated: 'model' | 'fallback';
  triageDegraded: boolean;
};

export interface RunState {
  symptoms: Symptoms;
  attachments: Attachment[];
  pendingImages: string[]; // base64 images awaiting the next intake turn
  prefs?: Prefs;
  verdict?: Verdict;
  report?: CaseReport;
  matchPhase?: MatchPhase;
  options?: SlotOption[];
  excludeHospitalIds: string[];
  relaxations: { relaxed: 'time' | 'hospital' | 'budget'; explanation: string }[];
}

export const emptyState = (): RunState => ({
  symptoms: { mainComplaint: null, duration: null, severity: null,
    associatedSymptoms: null, medicalHistory: null, currentMedications: null },
  attachments: [], pendingImages: [], excludeHospitalIds: [], relaxations: [],
});

export interface Run {
  id: string;
  userId: string;
  status: RunStatus;
  node: Node;
  state: RunState;
}

/** Envelope returned by every /consult endpoint. Phase 4 mobile parses this. */
export interface ConsultReply {
  runId: string;
  node: Node;
  status: RunStatus;
  reply: string;
  verdict?: Verdict;
  slotOptions?: SlotOption[];
  appointment?: {
    id: string; status: string; startsAt: string; hospitalName: string;
    specialistName: string; specialty: string; price: number | null;
  };
  escalated?: boolean;
}
