// Types for the Health History & Alerts feature

// ── Timeline ───────────────────────────────────────────────────────────────

/** A single entry in the chronological health timeline (patient or physician view). */
export interface HealthTimelineEntry {
  id: string;
  title: string;
  condition: string;
  description: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'Pending' | 'Active' | 'Completed';
  escalated: boolean;
  confidence: number;
  physicianNotes?: string;
  physicianName?: string;
  physicianDecision?: string;
  hasPrescription?: boolean;
  investigations?: Array<{ test: string; reason: string; urgency: string }>;
  /** ISO-8601 creation date */
  createdAt: string;
  updatedAt: string;

  // Physician-side extra fields (only present on the doctor timeline)
  patientName?: string;
  patientId?: string;
}

export interface HealthTimelineResponse {
  entries: HealthTimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Alerts ─────────────────────────────────────────────────────────────────

export type AlertCategory =
  | 'follow_up'
  | 'recurring'
  | 'medication'
  | 'urgent'
  | 'preventive';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PreventiveAlert {
  id: string;
  diagnosisId?: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** ISO-8601 timestamp of when the action is due (optional). */
  scheduledFor?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AlertsResponse {
  alerts: PreventiveAlert[];
  total: number;
}
