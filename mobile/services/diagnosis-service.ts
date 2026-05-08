import api from './api';
import { DiagnosisDetail, DiagnosisListResponse } from 'types/diagnosis-types';

export const DiagnosisService = {
  /**
   * Fetches the authenticated patient's diagnosis records (paginated).
   */
  async getDiagnoses(page = 1, pageSize = 20): Promise<DiagnosisListResponse> {
    const response = await api.get<{ success: boolean; data: DiagnosisListResponse }>(
      '/diagnoses',
      { params: { page, pageSize } }
    );
    if (!response.data.success) throw new Error('Failed to fetch diagnoses');
    return response.data.data;
  },

  /**
   * Fetches a single diagnosis by its record ID (patient-scoped).
   */
  async getDiagnosisDetail(id: string): Promise<DiagnosisDetail> {
    const response = await api.get<{ success: boolean; data: DiagnosisDetail }>(
      `/diagnoses/${id}`
    );
    if (!response.data.success) throw new Error('Failed to fetch diagnosis');
    return response.data.data;
  },

  /**
   * Submits a follow-up outcome for a diagnosis.
   */
  async submitOutcome(
    id: string,
    outcome: 'improved' | 'same' | 'worse'
  ): Promise<{ success: boolean; message: string; escalated: boolean }> {
    const response = await api.post<{
      success: boolean;
      message: string;
      escalated: boolean;
    }>(`/diagnoses/${id}/outcome`, { outcome });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to submit follow-up outcome');
    }

    return response.data;
  },
};
