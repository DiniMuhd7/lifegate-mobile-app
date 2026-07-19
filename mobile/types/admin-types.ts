// Admin system types — mirrors backend internal/admin package

export type DashboardStats = {
  totalCases: number;
  casesByStatus: Record<string, number>;
  totalPhysicians: number;
  availablePhysicians: number;
  activeUsers7d: number;
  totalPatients: number;
  escalatedToday: number;
  completedToday: number;
};

export type AdminCaseRow = {
  id: string;
  patientName: string;
  patientEmail: string;
  title: string;
  condition: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'Pending' | 'Active' | 'Completed';
  category: string;
  escalated: boolean;
  confidence: number;
  physicianName: string;
  createdAt: string;
  updatedAt: string;
};

export type SLAItem = {
  id: string;
  title: string;
  urgency: string;
  secondsWait: number;
  slaColor: 'green' | 'yellow' | 'red';
  waitFormatted: string;
  createdAt: string;
};

export type FlagCount = {
  flag: string;
  count: number;
};

export type EDISMetrics = {
  totalDiagnoses: number;
  escalationCount: number;
  escalationRatePct: number;
  avgConfidence: number;
  lowConfidenceCount: number;
  lowConfidencePct: number;
  flagFrequency: FlagCount[];
  avgConditionsPerCase: number;
  periodDays: number;
};

export type PhysicianRow = {
  id: string;
  name: string;
  email: string;
  specialization: string;
  mdcnVerified: boolean;
  mdcnOverrideStatus: '' | 'confirmed' | 'rejected';
  accountStatus: 'active' | 'suspended';
  flagged: boolean;
  flaggedReason?: string;
  slaBreachCountWeek: number;
  activeCases: number;
  totalCompleted: number;
  available: boolean;
};

export type PhysicianCaseHistory = {
  id: string;
  title: string;
  condition: string;
  urgency: string;
  status: string;
  escalated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PhysicianDetail = PhysicianRow & {
  phone: string;
  dob: string;
  gender: string;
  yearsOfExperience: string;
  certificateName: string;
  certificateId: string;
  certificateIssueDate: string;
  certificateUrl: string;
  flaggedAt?: string;
  mdcnOverrideBy?: string;
  mdcnOverrideAt?: string;
  createdAt: string;
  recentCases: PhysicianCaseHistory[];
};

export type CreatePhysicianInput = {
  name: string;
  email: string;
  password: string;
  specialization?: string;
  phone?: string;
  yearsOfExperience?: string;
  certificateName?: string;
  certificateId?: string;
};

export type UpdatePhysicianInput = {
  name?: string;
  email?: string;
  specialization?: string;
  phone?: string;
  yearsOfExperience?: string;
};

export type AdminCaseFilters = {
  status?: string;
  urgency?: string;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type PaginatedCases = {
  data: AdminCaseRow[];
  meta: { total: number; page: number; pageSize: number };
};

// ─── SLA Enforcement ─────────────────────────────────────────────────────────

/** A single SLA breach event record (from sla_reassignment_log). */
export type SLABreachAlert = {
  id: string;
  caseId: string;
  caseTitle: string;
  urgency: string;
  waitSeconds: number;
  waitFormatted: string;
  originalPhysicianName?: string;
  newPhysicianName?: string;
  natsPublished: boolean;
  createdAt: string;
};

export type ReassignmentLogResult = {
  data: SLABreachAlert[];
  meta: { total: number; page: number; pageSize: number };
};

// ─── Compliance & Audit ───────────────────────────────────────────────────────

export type AuditEvent = {
  id: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  eventType: string;
  resource: string;
  resourceId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditFilters = {
  eventType?: string;
  actorRole?: string;
  resource?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type PaginatedAudit = {
  data: AuditEvent[];
  meta: { total: number; page: number; pageSize: number };
};

export type AdminTransactionRow = {
  id: string;
  userId: string;
  patientName: string;
  patientEmail: string;
  txRef: string;
  flwTxId: string;
  amount: number;
  creditsGranted: number;
  status: string;
  bundleId: string;
  createdAt: string;
};

export type PaginatedTransactions = {
  data: AdminTransactionRow[];
  meta: { total: number; page: number; pageSize: number };
};

export type NDPASnapshot = {
  id: string;
  snapshotDate: string;
  totalDataSubjects: number;
  consentCapturedPct: number;
  dataMinimisationOk: boolean;
  retentionPolicyOk: boolean;
  breachIncidents30d: number;
  pendingDsar: number;
  notes: string;
  createdAt: string;
};

export type AlertThreshold = {
  key: string;
  label: string;
  description: string;
  value: number;
  unit: string;
  category: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy?: string;
};

export type LifecoinRedemptionRequest = {
  id: string;
  userId: string;
  patientName: string;
  patientEmail: string;
  coins: number;
  nairaAmount: number;
  healthFirmName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  transferStatus: string;
  adminNote?: string;
  createdAt: string;
};

export type AdminPayoutView = {
  id: string;
  physicianId: string;
  physicianName: string;
  physicianEmail: string;
  periodStart: string;
  periodEnd: string;
  caseCount: number;
  totalAmount: number;
  status: 'pending' | 'requested' | 'processing' | 'paid' | 'rejected';
  requestedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  paidAt?: string;
  createdAt: string;
};

export type MedicationReleaseRow = {
  diagnosisId: string;
  patientName: string;
  patientId: string;
  condition: string;
  requestedAt: string;
  alreadyApproved: boolean;
};

// ─── Analytics types ──────────────────────────────────────────────────────────

export type DailyPoint = {
  date: string;   // "YYYY-MM-DD"
  count: number;
};

export type RevenuePoint = {
  date: string;
  amount: number;
};

export type DemographicPoint = {
  label: string;
  count: number;
  pct: number;
};

export type PhysicianProductivity = {
  name: string;
  resolvedCases: number;
};

export type AnalyticsData = {
  periodDays: number;

  // Global KPIs
  totalRegisteredUsers: number;
  totalRegisteredPhysicians: number;
  avgCasesPerPatient: number;

  // Acquisition
  newUsersTotal: number;
  newPhysiciansTotal: number;
  dailyNewUsers: DailyPoint[];
  dailyNewCases: DailyPoint[];

  // Engagement
  dailyActiveCases: DailyPoint[];
  dailyCompletedCases: DailyPoint[];
  dailyActivePatients: DailyPoint[];

  // Outcomes
  totalCompletedCases: number;
  totalEscalatedCases: number;
  completionRatePct: number;
  escalationRatePct: number;
  avgCaseDurationMins: number;

  // Retention
  retentionD7: number;
  retentionD30: number;

  // Patient demographics
  genderBreakdown: DemographicPoint[];
  ageGroupBreakdown: DemographicPoint[];
  bloodTypeBreakdown: DemographicPoint[];
  genotypeBreakdown: DemographicPoint[];
  languageBreakdown: DemographicPoint[];

  // Geographic
  countryBreakdown: DemographicPoint[];
  stateBreakdown: DemographicPoint[];

  // Medical insights
  urgencyBreakdown: DemographicPoint[];
  topConditions: DemographicPoint[];

  // Revenue
  revenuePeriodTotal: number;
  totalRevenueAllTime: number;
  totalPayingUsers: number;
  totalTransactions: number;
  avgRevenuePerUser: number;
  dailyRevenue: RevenuePoint[];

  // Physician productivity
  dailyPhysicianResolutions: DailyPoint[];
  topPhysicians: PhysicianProductivity[];

  // Session / engagement time
  avgSessionMinsPatient: number;      // avg session length in minutes — patients
  avgSessionMinsPhysician: number;    // avg session length in minutes — physicians
  totalSessionsPatient: number;       // completed patient sessions in period
  totalSessionsPhysician: number;     // completed physician sessions in period
  avgSessionsPerPatient: number;      // sessions per unique patient
  dailyAvgSessionMins: FloatPoint[];  // daily avg session duration (all roles)
  dailySessionsPatient: DailyPoint[]; // daily session count — patients
  dailySessionsPhysician: DailyPoint[];// daily session count — physicians
};

export type FloatPoint = {
  date: string;
  value: number;
};

// ── Patients: registration export & clinical-data CSV import ─────────────────

export type PatientRow = {
  id: string;
  patientId: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  dob: string;
  bloodGroup: string;
  genotype: string;
  heightCm: number;
  weightKg: number;
  bmi?: number;
  testResults: string; // raw JSON object as a string, e.g. '{"hemoglobin":"13.5"}'
  createdAt: string;
};

export type PatientImportRowResult = {
  row: number;
  email: string;
  status: 'updated' | 'error';
  message?: string;
};

export type PatientImportSummary = {
  totalRows: number;
  updated: number;
  failed: number;
  results: PatientImportRowResult[];
};

export type PatientHealthUpdatePayload = {
  email: string;
  fields: Record<string, string>;
  testType?: string;
};

export type BulkPatientEmailDraft = {
  subject: string;
  preheader?: string;
  body: string;
  cta?: string;
  ctaUrl?: string;
  batchSize?: number;
};

export type BulkPatientEmailResult = {
  recipientCount: number;
  sent: number;
  failed: number;
  pending: number;
  campaignKey: string;
  errors?: string[];
};
