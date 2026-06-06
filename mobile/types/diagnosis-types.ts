// Patient-facing diagnosis types returned from GET /api/diagnoses
export type DiagnosisStatus = 'Pending' | 'Active' | 'Completed';

/** Structured symptom profile (OLDCARTS) collected from the patient during triage. */
export interface DiagnosisTriageNotes {
  onset?: string;
  duration?: string;
  severityScore?: number;
  location?: string;
  character?: string;
}

export interface DiagnosisPrescription {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface DiagnosisInvestigation {
  test: string;
  reason: string;
  urgency: 'ROUTINE' | 'URGENT' | 'STAT';
}

export interface DiagnosisConditionScore {
  condition: string;
  confidence: number; // 0–100
  description: string;
}

export interface FollowUpPlan {
  daysUntil: number;
  triggerSymptoms: string[];
}

export interface DiagnosisDetail {
  id: string;
  title: string;
  description: string;
  condition: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  confidence: number; // 0–100 confidence score
  status: DiagnosisStatus;
  escalated: boolean;
  /** True when the AI included a prescription — visible payment of the actual
   *  prescription data is gated on status=Completed + physicianDecision=Approved. */
  hasPrescription: boolean;
  /** Set by the reviewing physician: "Approved" | "Rejected" */
  physicianDecision?: string;
  physicianNotes?: string;
  /** Personalised health tips written by the reviewing physician. */
  physicianHealthTips?: string;
  /** Full name of the physician who reviewed / edited this case */
  physicianName?: string;
  /** User ID of the assigned physician (used as the call peer ID). */
  physicianId?: string;
  /** True only when a real human physician is assigned (not an AI/OpenClaw agent).
   *  Drives whether voice/video call options are shown to the patient. */
  physicianIsHuman?: boolean;
  /** ISO-8601 follow-up date set by EDIS */
  followUpDate?: string;
  /** Instructions listing trigger symptoms to watch for before the follow-up date */
  followUpInstructions?: string;
  /** True once the patient has submitted an outcome for this follow-up */
  outcomeChecked: boolean;
  /** True when the patient has requested early release of medication */
  medicationReleaseRequested?: boolean;
  /** True when an admin has approved the medication release request */
  medicationReleaseApproved?: boolean;
  /** Structured triage notes (OLDCARTS) collected during the AI intake conversation. */
  triageNotes?: DiagnosisTriageNotes;
  prescription?: DiagnosisPrescription;
  /**
   * Recommended investigations — sourced from physician_ai_output when the
   * physician has edited them, otherwise from ai_response.
   */
  investigations?: DiagnosisInvestigation[];
  /**
   * Ranked differential conditions — sourced from physician_ai_output when the
   * physician has edited them, otherwise from ai_response.
   */
  conditions?: DiagnosisConditionScore[];
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosisListResponse {
  records: DiagnosisDetail[];
  total: number;
  page: number;
  pageSize: number;
}
