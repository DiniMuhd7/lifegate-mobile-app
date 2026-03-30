// Patient-facing diagnosis types returned from GET /api/diagnoses
export type DiagnosisStatus = 'Pending' | 'Active' | 'Completed';

export interface DiagnosisPrescription {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
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
  physicianNotes?: string;
  prescription?: DiagnosisPrescription;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosisListResponse {
  records: DiagnosisDetail[];
  total: number;
  page: number;
  pageSize: number;
}
