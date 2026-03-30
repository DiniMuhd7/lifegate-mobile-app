import { create } from 'zustand';
import { DiagnosisDetail } from 'types/diagnosis-types';
import { DiagnosisService } from 'services/diagnosis-service';

interface DiagnosisState {
  diagnoses: DiagnosisDetail[];
  selectedDiagnosis: DiagnosisDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;

  fetchDiagnoses: () => Promise<void>;
  fetchDiagnosisDetail: (id: string) => Promise<void>;
  updateDiagnosisStatus: (id: string, status: DiagnosisDetail['status']) => void;
  clearSelectedDiagnosis: () => void;
}

export const useDiagnosisStore = create<DiagnosisState>((set, get) => ({
  diagnoses: [],
  selectedDiagnosis: null,
  loading: false,
  detailLoading: false,
  error: null,

  fetchDiagnoses: async () => {
    set({ loading: true, error: null });
    try {
      const result = await DiagnosisService.getDiagnoses();
      set({ diagnoses: result.records, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load diagnoses' });
    }
  },

  fetchDiagnosisDetail: async (id: string) => {
    // Return cached version if already loaded
    const cached = get().diagnoses.find((d) => d.id === id);
    if (cached) {
      set({ selectedDiagnosis: cached });
    }
    set({ detailLoading: true, error: null });
    try {
      const detail = await DiagnosisService.getDiagnosisDetail(id);
      set({ selectedDiagnosis: detail, detailLoading: false });
      // Patch in-list copy with fresh data
      set((state) => ({
        diagnoses: state.diagnoses.some((d) => d.id === id)
          ? state.diagnoses.map((d) => (d.id === id ? detail : d))
          : [detail, ...state.diagnoses],
      }));
    } catch (e) {
      set({ detailLoading: false, error: e instanceof Error ? e.message : 'Failed to load diagnosis' });
    }
  },

  // Called by the WebSocket hook when a `diagnosis.update` event arrives.
  updateDiagnosisStatus: (id: string, status: DiagnosisDetail['status']) => {
    set((state) => ({
      diagnoses: state.diagnoses.map((d) => (d.id === id ? { ...d, status } : d)),
      selectedDiagnosis:
        state.selectedDiagnosis?.id === id
          ? { ...state.selectedDiagnosis, status }
          : state.selectedDiagnosis,
    }));
  },

  clearSelectedDiagnosis: () => set({ selectedDiagnosis: null }),
}));
