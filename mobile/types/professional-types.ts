export type ReportStatus = 'Pending' | 'Active' | 'Completed';

export interface PatientReport {
  id: string;
  patientId: string;
  patientName: string;
  reportType: string;
  title: string;
  description: string;
  status: ReportStatus;
  timestamp: string;
  createdAt: Date;
}

export interface ProfessionalStats {
  totalReports: number;
  pendingCount: number;
  activeCount: number;
  completedCount: number;
}

export interface ProfessionalDashboard {
  stats: ProfessionalStats;
  reports: PatientReport[];
  filteredReports: PatientReport[];
  selectedFilter: ReportStatus | 'All';
  searchQuery: string;
  loading: boolean;
  error: string | null;
}

export type ActivityType = 'Verified' | 'Escalated' | 'Rejected' | 'Pending';

export interface Activity {
  id: string;
  patientId: string;
  patientName?: string;
  caseType: ActivityType;
  condition: string;
  timestamp: string;
  timeAgo: string;
}

export interface DiagnosisRecord {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string;
  condition: string;
  urgency: string;
  status: string;
  createdAt: string;
}

export interface ActivityMetric {
  label: string;
  percentage: number;
  color: string;
}

export interface ReviewAnalysis {
  date: Date;
  totalReview: number;
  pendingCases: number;
  activeCases: number;
  completedCases: number;
  activities: Activity[];
  metrics: ActivityMetric[];
  loading: boolean;
  error: string | null;
}

export type CaseUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AICondition {
  condition: string;
  urgency: CaseUrgency;
  description: string;
  confidence: number;
}

export interface PrescriptionInfo {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface AIOutput {
  text: string;
  diagnosis?: AICondition;
  prescription?: PrescriptionInfo;
}

export type PhysicianDecision = 'Approved' | 'Rejected';

export interface CaseDetail {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string;
  condition: string;
  urgency: CaseUrgency;
  status: ReportStatus;
  physicianId?: string;
  physicianNotes?: string;
  physicianDecision?: PhysicianDecision;
  rejectionReason?: string;
  escalated: boolean;
  aiResponse?: AIOutput;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  dob?: string;
  gender?: string;
  bloodType?: string;
  allergies?: string;
  medicalHistory?: string;
  currentMedications?: string;
  emergencyContact?: string;
  healthHistory?: string;
  createdAt: string;
}

export interface CaseQueueItem {
  id: string;
  patientName: string;
  patientId: string;
  title: string;
  symptomSnippet: string;
  urgency: CaseUrgency;
  status: ReportStatus;
  physicianId?: string;
  escalated: boolean;
  timeInQueue: string;
  queuePosition?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CaseQueue {
  pending: CaseQueueItem[];
  active: CaseQueueItem[];
  completed: CaseQueueItem[];
}

// ── Earnings & Payouts ────────────────────────────────────────────────────────

export type EarningStatus = 'pending' | 'paid';
export type PayoutStatus = 'pending' | 'processing' | 'paid';

export interface EarningsSummary {
  totalEarned: number;
  pendingPayout: number;
  paidOut: number;
  casesCompleted: number;
  casesPending: number;
  perCaseRate: number;
  nextPayoutDate: string;
  lastPayoutAmount: number;
}

export interface EarningRecord {
  id: string;
  diagnosisId: string;
  patientName: string;
  condition: string;
  urgency: CaseUrgency;
  decision: PhysicianDecision;
  amount: number;
  status: EarningStatus;
  casedAt: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  periodStart: string;
  periodEnd: string;
  caseCount: number;
  totalAmount: number;
  status: PayoutStatus;
  paidAt?: string;
  createdAt: string;
}
