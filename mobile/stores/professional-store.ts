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
  PrescriptionInfo,
  InvestigationInfo,
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
  caseLoadError: string | null;
  updateCaseStatus: (caseId: string, status: ReportStatus) => void;

  // Case review actions
  loadCaseDetail: (caseId: string) => Promise<void>;
  loadPatientProfile: (patientId: string) => Promise<void>;
  updateLocalAIOutput: (
    condition: string,
    urgency: CaseUrgency,
    confidence: number,
    notes: string,
    prescription?: PrescriptionInfo,
    investigations?: InvestigationInfo[],
  ) => void;
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
  caseLoadError: null,

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
      const [reports, stats] = await Promise.all([
        ProfessionalService.getProfessionalReports(),
        ProfessionalService.getProfessionalStats(),
      ]);
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
    await ProfessionalService.takeCase(caseId);
    // Optimistically mark currentCase as Active so the Edit/Approve/Reject
    // action panel appears immediately without waiting for the queue refetch.
    set(state => ({
      currentCase: state.currentCase?.id === caseId
        ? { ...state.currentCase, status: 'Active' as const }
        : state.currentCase,
    }));
    // Refetch the full queue so the moved case appears with all correct fields.
    await get().fetchCaseQueue();
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

      // Always sync currentCase regardless of whether the case is in a queue array.
      const updatedCurrentCase =
        state.currentCase?.id === caseId
          ? { ...state.currentCase, status }
          : state.currentCase;

      // Sync reports / filteredReports list shown on the consultation screen.
      const syncReports = (list: any[]) =>
        list.map(r => r.id === caseId ? { ...r, status } : r);

      if (!item) {
        // Case not found in queue arrays (e.g. opened via direct link / notification).
        // Still update currentCase so the review screen reflects the new status.
        return {
          currentCase: updatedCurrentCase,
          reports: syncReports(state.reports),
          filteredReports: syncReports(state.filteredReports),
        };
      }

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
        currentCase: updatedCurrentCase,
        reports: syncReports(state.reports),
        filteredReports: syncReports(state.filteredReports),
      };
    });
  },

  // ── Case review ──────────────────────────────────────────────────────────

  loadCaseDetail: async (caseId: string) => {
    set({ isCaseLoading: true, currentCase: null, currentPatient: null, caseLoadError: null });
    try {
      const detail = await ProfessionalService.getCaseDetail(caseId);
      set({ currentCase: detail, isCaseLoading: false });
      // Kick off patient profile fetch immediately — no need to wait for a React re-render cycle.
      if (detail?.patientId) {
        ProfessionalService.getPatientProfile(detail.patientId)
          .then((profile) => set({ currentPatient: profile }))
          .catch(() => { });
      }
    } catch (err) {
      set({
        isCaseLoading: false,
        caseLoadError: err instanceof Error ? err.message : 'Failed to load case',
      });
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

  updateLocalAIOutput: (condition, urgency, confidence, notes, prescription, investigations) => {
    set((state) => {
      if (!state.currentCase) return state;

      const caseId = state.currentCase.id;
      const hasPrescription = !!prescription?.medicine?.trim();
      const cleanedInvestigations = (investigations ?? []).filter((i) => i.test?.trim());
      const hasInvestigations = cleanedInvestigations.length > 0;

      const physicianOutput =
        hasPrescription || hasInvestigations
          ? {
            prescription: hasPrescription ? prescription : undefined,
            investigations: hasInvestigations ? cleanedInvestigations : undefined,
          }
          : undefined;

      const syncReports = (list: typeof state.reports) =>
        list.map((r) => (r.id === caseId ? { ...r, condition, urgency } : r));

      return {
        reports: syncReports(state.reports),
        filteredReports: syncReports(state.filteredReports),
        currentCase: {
          ...state.currentCase,
          condition,
          urgency,
          physicianNotes: notes,
          physicianOutput,
          aiResponse: {
            ...(state.currentCase.aiResponse ?? { text: '' }),
            diagnosis: state.currentCase.aiResponse?.diagnosis
              ? {
                ...state.currentCase.aiResponse.diagnosis,
                condition,
                urgency,
                confidence,
              }
              : { condition, urgency, description: '', confidence },
            prescription: hasPrescription ? prescription : undefined,
            investigations: hasInvestigations ? cleanedInvestigations : undefined,
          },
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
