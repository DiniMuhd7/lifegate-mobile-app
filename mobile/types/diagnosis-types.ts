// Patient-facing diagnosis types returned from GET /api/diagnoses
export type DiagnosisStatus = 'Pending' | 'Active' | 'Completed';

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
  /** ISO-8601 follow-up date set by EDIS */
  followUpDate?: string;
  /** Instructions listing trigger symptoms to watch for before the follow-up date */
  followUpInstructions?: string;
  /** True once the patient has submitted an outcome for this follow-up */
  outcomeChecked: boolean;
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
