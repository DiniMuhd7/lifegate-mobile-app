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

export type ActivityType = 'Verified' | 'Escalated' | 'Rejected';

export interface Activity {
  id: string;
  patientId: string;
  caseType: ActivityType;
  condition: string;
  timestamp: string;
  timeAgo: string;
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
