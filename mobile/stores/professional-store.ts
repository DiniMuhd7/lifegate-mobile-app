import { create } from 'zustand';
import {
  ReportStatus,
  ProfessionalDashboard,
  CaseQueueItem,
  CaseDetail,
  PatientProfile,
  CaseUrgency,
  EarningsSummary,
  EarningRecord,
  Payout,
} from '../types/professional-types';
import { ProfessionalService } from '../services/professional-service';

type ProfessionalStore = ProfessionalDashboard & {
  // Case queue
  pendingCases: CaseQueueItem[];
  activeCases: CaseQueueItem[];
  completedCases: CaseQueueItem[];
  isQueueLoading: boolean;

  // Case review detail
  currentCase: CaseDetail | null;
  currentPatient: PatientProfile | null;
  isCaseLoading: boolean;

  fetchReports: () => Promise<void>;
  setFilter: (filter: ReportStatus | 'All') => void;
  searchReports: (query: string) => void;
  clearSearch: () => void;
  fetchCaseQueue: () => Promise<void>;
  takeCase: (caseId: string) => Promise<void>;
  completeCase: (caseId: string, notes: string) => Promise<void>;
  appendPendingCase: (item: CaseQueueItem) => void;
  updateCaseStatus: (caseId: string, status: ReportStatus) => void;

  // Case review actions
  loadCaseDetail: (caseId: string) => Promise<void>;
  loadPatientProfile: (patientId: string) => Promise<void>;
  updateLocalAIOutput: (condition: string, urgency: CaseUrgency, confidence: number) => void;
  clearCurrentCase: () => void;

  // Earnings
  earningsSummary: EarningsSummary | null;
  earningsHistory: EarningRecord[];
  earningsTotal: number;
  payouts: Payout[];
  isEarningsLoading: boolean;
  loadEarningsSummary: () => Promise<void>;
  loadEarningsHistory: (page?: number, pageSize?: number) => Promise<void>;
  loadPayouts: () => Promise<void>;
};

export const useProfessionalStore = create<ProfessionalStore>((set, get) => ({
  // Initial state
  stats: {
    totalReports: 0,
    pendingCount: 0,
    activeCount: 0,
    completedCount: 0,
  },
  reports: [],
  filteredReports: [],
  selectedFilter: 'All',
  searchQuery: '',
  loading: false,
  error: null,

  // Case queue initial state
  pendingCases: [],
  activeCases: [],
  completedCases: [],
  isQueueLoading: false,

  // Case review initial state
  currentCase: null,
  currentPatient: null,
  isCaseLoading: false,

  // Earnings initial state
  earningsSummary: null,
  earningsHistory: [],
  earningsTotal: 0,
  payouts: [],
  isEarningsLoading: false,

  // Actions
  fetchReports: async () => {
    set({ loading: true, error: null });
    try {
      const reports = await ProfessionalService.getProfessionalReports();
      const stats = await ProfessionalService.getProfessionalStats();  
      set({
        reports,
        filteredReports: reports,
        stats,
        loading: false,
      });
      
      // Apply current filter
      get().setFilter(get().selectedFilter);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch reports',
        loading: false,
      });
    }
  },

  setFilter: (filter: ReportStatus | 'All') => {
    set(state => {
      const filtered = filter === 'All'
        ? state.reports
        : state.reports.filter(report => report.status === filter);

      return {
        selectedFilter: filter,
        filteredReports: filtered,
      };
    });
  },

  searchReports: (query: string) => {
    set(state => {
      const lowerQuery = query.toLowerCase();
      const filtered = state.reports.filter(report =>
        report.title.toLowerCase().includes(lowerQuery) ||
        report.description.toLowerCase().includes(lowerQuery) ||
        report.patientId.toLowerCase().includes(lowerQuery) ||
        report.patientName.toLowerCase().includes(lowerQuery)
      );

      // Apply current filter on top of search
      const currentFilter = state.selectedFilter;
      const finalFiltered = currentFilter === 'All'
        ? filtered
        : filtered.filter(report => report.status === currentFilter);

      return {
        searchQuery: query,
        filteredReports: finalFiltered,
      };
    });
  },

  clearSearch: () => {
    set(state => {
      const currentFilter = state.selectedFilter;
      const filtered = currentFilter === 'All'
        ? state.reports
        : state.reports.filter(report => report.status === currentFilter);

      return {
        searchQuery: '',
        filteredReports: filtered,
      };
    });
  },

  fetchCaseQueue: async () => {
    set({ isQueueLoading: true });
    try {
      const queue = await ProfessionalService.getCaseQueue();
      set({
        pendingCases: queue.pending ?? [],
        activeCases: queue.active ?? [],
        completedCases: queue.completed ?? [],
        isQueueLoading: false,
      });
    } catch {
      set({ isQueueLoading: false });
    }
  },

  takeCase: async (caseId: string) => {
    const item = await ProfessionalService.takeCase(caseId);
    set(state => ({
      pendingCases: state.pendingCases.filter(c => c.id !== caseId),
      activeCases: [item, ...state.activeCases],
    }));
  },

  completeCase: async (caseId: string, notes: string) => {
    await ProfessionalService.completeCase(caseId, notes);
    set(state => {
      const item = state.activeCases.find(c => c.id === caseId);
      return {
        activeCases: state.activeCases.filter(c => c.id !== caseId),
        completedCases: item
          ? [{ ...item, status: 'Completed' as const }, ...state.completedCases]
          : state.completedCases,
      };
    });
  },

  appendPendingCase: (item: CaseQueueItem) => {
    set(state => ({ pendingCases: [item, ...state.pendingCases] }));
  },

  updateCaseStatus: (caseId: string, status: ReportStatus) => {
    set(state => {
      const allCases = [...state.pendingCases, ...state.activeCases, ...state.completedCases];
      const item = allCases.find(c => c.id === caseId);
      if (!item) return {};
      const updated = { ...item, status };
      return {
        pendingCases: status === 'Pending'
          ? [...state.pendingCases.filter(c => c.id !== caseId), updated]
          : state.pendingCases.filter(c => c.id !== caseId),
        activeCases: status === 'Active'
          ? [...state.activeCases.filter(c => c.id !== caseId), updated]
          : state.activeCases.filter(c => c.id !== caseId),
        completedCases: status === 'Completed'
          ? [...state.completedCases.filter(c => c.id !== caseId), updated]
          : state.completedCases.filter(c => c.id !== caseId),
      };
    });
  },

  // ── Case review ──────────────────────────────────────────────────────────

  loadCaseDetail: async (caseId: string) => {
    set({ isCaseLoading: true, currentCase: null });
    try {
      const detail = await ProfessionalService.getCaseDetail(caseId);
      set({ currentCase: detail, isCaseLoading: false });
    } catch {
      set({ isCaseLoading: false });
    }
  },

  loadPatientProfile: async (patientId: string) => {
    try {
      const profile = await ProfessionalService.getPatientProfile(patientId);
      set({ currentPatient: profile });
    } catch {
      // best-effort
    }
  },

  updateLocalAIOutput: (condition: string, urgency: CaseUrgency, confidence: number) => {
    set(state => {
      if (!state.currentCase) return {};
      return {
        currentCase: {
          ...state.currentCase,
          condition,
          urgency,
          aiResponse: state.currentCase.aiResponse
            ? {
                ...state.currentCase.aiResponse,
                diagnosis: state.currentCase.aiResponse.diagnosis
                  ? { ...state.currentCase.aiResponse.diagnosis, condition, urgency, confidence }
                  : { condition, urgency, description: '', confidence },
              }
            : undefined,
        },
      };
    });
  },

  clearCurrentCase: () => set({ currentCase: null, currentPatient: null }),

  loadEarningsSummary: async () => {
    set({ isEarningsLoading: true });
    try {
      const summary = await ProfessionalService.getEarningsSummary();
      set({ earningsSummary: summary, isEarningsLoading: false });
    } catch {
      set({ isEarningsLoading: false });
    }
  },

  loadEarningsHistory: async (page = 1, pageSize = 20) => {
    try {
      const { records, total } = await ProfessionalService.getEarningsHistory(page, pageSize);
      set({ earningsHistory: records, earningsTotal: total });
    } catch {
      // silently fail — UI shows empty state
    }
  },

  loadPayouts: async () => {
    try {
      const payouts = await ProfessionalService.getPayouts();
      set({ payouts });
    } catch {
      // silently fail
    }
  },
}));
