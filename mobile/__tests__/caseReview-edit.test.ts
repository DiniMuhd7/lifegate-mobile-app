/**
 * Tests for the physician case-review edit & save flow.
 *
 * Covers three layers:
 *  1. ProfessionalService.updateAIOutput — correct HTTP call + error handling
 *  2. useProfessionalStore.updateLocalAIOutput — optimistic store update
 *  3. useProfessionalStore.updateCaseStatus — status sync including
 *     the case-not-in-queue path (opened from notification / direct link)
 *
 * Does NOT render the React component itself (that requires a full Expo test
 * environment); instead we exercise the exact logic that handleSaveEdit
 * calls and verify it produces the right state / API payload.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    patch: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Stub DiagnosisService so patient-store tests control what the API returns.
// Must use the bare path because diagnosis-store.ts imports it as 'services/diagnosis-service'
// (tsconfig baseUrl: '.') — relative and bare paths are different module IDs in Jest.
jest.mock('services/diagnosis-service', () => ({
  DiagnosisService: {
    getDiagnoses: jest.fn(),
    getDiagnosisDetail: jest.fn(),
    submitOutcome: jest.fn(),
  },
}));

// Prevent zustand from complaining about React not being available.
jest.mock('zustand', () => {
  const { create: actualCreate } = jest.requireActual('zustand');
  return { create: actualCreate };
});

// Stub out ProfessionalService calls used by the store (getCaseQueue, etc.)
// so unit tests for store actions don't make real network calls.
jest.mock('../services/professional-service', () => ({
  ProfessionalService: {
    getCaseQueue: jest.fn().mockResolvedValue({ pending: [], active: [], completed: [] }),
    getCaseDetail: jest.fn(),
    getPatientProfile: jest.fn(),
    takeCase: jest.fn().mockResolvedValue(undefined),
    updateAIOutput: jest.fn(),
    approveCase: jest.fn(),
    rejectCase: jest.fn(),
    getProfessionalReports: jest.fn().mockResolvedValue([]),
    getProfessionalStats: jest.fn().mockResolvedValue({ totalReports: 0, pendingCount: 0, activeCount: 0, completedCount: 0 }),
    getEarningsSummary: jest.fn(),
    getEarningsHistory: jest.fn(),
    getPayouts: jest.fn(),
    completeCase: jest.fn(),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import api from '../services/api';
import { ProfessionalService } from '../services/professional-service';
import { DiagnosisService } from 'services/diagnosis-service';
import { useProfessionalStore } from '../stores/professional-store';
import { useDiagnosisStore } from '../stores/diagnosis-store';
import type { CaseDetail, CaseQueueItem } from '../types/professional-types';
import type { DiagnosisDetail } from '../types/diagnosis-types';

const mockPatch = (api as any).patch as jest.Mock;
const mockUpdateAIOutput = ProfessionalService.updateAIOutput as jest.Mock;
const mockGetDiagnosisDetail = DiagnosisService.getDiagnosisDetail as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CASE_ID = 'case-abc-123';

const makeActiveCase = (overrides: Partial<CaseDetail> = {}): CaseDetail => ({
  id: CASE_ID,
  patientId: 'patient-xyz',
  patientName: 'Test Patient',
  title: 'Headache',
  description: 'Severe headache for 3 days',
  condition: 'Tension Headache',
  urgency: 'MEDIUM',
  status: 'Active',
  escalated: false,
  aiResponse: {
    text: 'AI narrative',
    diagnosis: { condition: 'Tension Headache', urgency: 'MEDIUM', description: 'AI desc', confidence: 72 },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const makeCaseQueueItem = (overrides: Partial<CaseQueueItem> = {}): CaseQueueItem => ({
  id: CASE_ID,
  patientId: 'patient-xyz',
  patientName: 'Test Patient',
  title: 'Headache',
  symptomSnippet: 'Severe headache for 3 days',
  urgency: 'MEDIUM',
  status: 'Active',
  escalated: false,
  timeInQueue: '2h 15m',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─── Helper: reset store between tests ───────────────────────────────────────

function resetStore() {
  useProfessionalStore.setState({
    currentCase: null,
    currentPatient: null,
    isCaseLoading: false,
    caseLoadError: null,
    pendingCases: [],
    activeCases: [],
    completedCases: [],
    reports: [],
    filteredReports: [],
  });
}

// ─── 1. ProfessionalService.updateAIOutput ────────────────────────────────────

describe('ProfessionalService.updateAIOutput', () => {
  beforeEach(() => {
    mockPatch.mockReset();
  });

  it('sends PATCH /physician/cases/:id/ai with correct body on success', async () => {
    mockPatch.mockResolvedValue({ data: { success: true, message: 'AI output updated' } });

    // Call the real service (not the mock — temporarily use direct api mock)
    const { ProfessionalService: realSvc } = jest.requireActual('../services/professional-service') as
      typeof import('../services/professional-service');

    await realSvc.updateAIOutput(
      CASE_ID,
      'Migraine',
      'HIGH',
      85,
      'Patient has photophobia',
      { medicine: 'Ibuprofen', dosage: '400mg', frequency: 'TDS', duration: '5 days', instructions: 'After meals' },
      [{ test: 'Brain MRI', reason: 'Rule out tumour', urgency: 'URGENT' }],
    );

    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(
      `/physician/cases/${CASE_ID}/ai`,
      {
        condition: 'Migraine',
        urgency: 'HIGH',
        confidence: 85,
        notes: 'Patient has photophobia',
        prescription: { medicine: 'Ibuprofen', dosage: '400mg', frequency: 'TDS', duration: '5 days', instructions: 'After meals' },
        investigations: [{ test: 'Brain MRI', reason: 'Rule out tumour', urgency: 'URGENT' }],
      },
    );
  });

  it('sends PATCH without prescription/investigations when not provided', async () => {
    mockPatch.mockResolvedValue({ data: { success: true, message: 'AI output updated' } });

    const { ProfessionalService: realSvc } = jest.requireActual('../services/professional-service') as
      typeof import('../services/professional-service');

    await realSvc.updateAIOutput(CASE_ID, 'Migraine', 'HIGH', 85, 'Notes only');

    expect(mockPatch).toHaveBeenCalledWith(
      `/physician/cases/${CASE_ID}/ai`,
      expect.objectContaining({
        condition: 'Migraine',
        urgency: 'HIGH',
        confidence: 85,
        notes: 'Notes only',
        prescription: undefined,
        investigations: undefined,
      }),
    );
  });

  it('throws when backend returns success:false', async () => {
    mockPatch.mockResolvedValue({ data: { success: false, message: 'Case must be Active' } });

    const { ProfessionalService: realSvc } = jest.requireActual('../services/professional-service') as
      typeof import('../services/professional-service');

    await expect(
      realSvc.updateAIOutput(CASE_ID, 'Migraine', 'HIGH', 85, ''),
    ).rejects.toThrow('Case must be Active');
  });

  it('propagates network errors', async () => {
    mockPatch.mockRejectedValue(new Error('Network Error'));

    const { ProfessionalService: realSvc } = jest.requireActual('../services/professional-service') as
      typeof import('../services/professional-service');

    await expect(
      realSvc.updateAIOutput(CASE_ID, 'Migraine', 'HIGH', 85, ''),
    ).rejects.toThrow('Network Error');
  });
});

// ─── 2. useProfessionalStore.updateLocalAIOutput ──────────────────────────────

describe('useProfessionalStore — updateLocalAIOutput', () => {
  beforeEach(resetStore);

  it('updates condition, urgency, notes and aiResponse.diagnosis on currentCase', () => {
    useProfessionalStore.setState({ currentCase: makeActiveCase() });

    useProfessionalStore.getState().updateLocalAIOutput(
      'Migraine',
      'HIGH',
      90,
      'Physician notes here',
      undefined,
      undefined,
    );

    const { currentCase } = useProfessionalStore.getState();
    expect(currentCase?.condition).toBe('Migraine');
    expect(currentCase?.urgency).toBe('HIGH');
    expect(currentCase?.physicianNotes).toBe('Physician notes here');
    expect(currentCase?.aiResponse?.diagnosis?.condition).toBe('Migraine');
    expect(currentCase?.aiResponse?.diagnosis?.urgency).toBe('HIGH');
    expect(currentCase?.aiResponse?.diagnosis?.confidence).toBe(90);
  });

  it('sets physicianOutput when prescription is provided', () => {
    useProfessionalStore.setState({ currentCase: makeActiveCase() });

    const rx = { medicine: 'Paracetamol', dosage: '500mg', frequency: 'QDS', duration: '3 days' };
    useProfessionalStore.getState().updateLocalAIOutput('Migraine', 'HIGH', 85, '', rx, []);

    const { currentCase } = useProfessionalStore.getState();
    expect(currentCase?.physicianOutput?.prescription?.medicine).toBe('Paracetamol');
  });

  it('sets physicianOutput when investigations are provided', () => {
    useProfessionalStore.setState({ currentCase: makeActiveCase() });

    const inv = [{ test: 'FBC', reason: 'Baseline', urgency: 'ROUTINE' as const }];
    useProfessionalStore.getState().updateLocalAIOutput('Migraine', 'HIGH', 85, '', undefined, inv);

    const { currentCase } = useProfessionalStore.getState();
    expect(currentCase?.physicianOutput?.investigations).toEqual(inv);
  });

  it('preserves existing physicianOutput when prescription and investigations are both absent', () => {
    const existing = { prescription: { medicine: 'Aspirin', dosage: '75mg', frequency: 'OD', duration: '7 days' } };
    useProfessionalStore.setState({ currentCase: makeActiveCase({ physicianOutput: existing }) });

    useProfessionalStore.getState().updateLocalAIOutput('Migraine', 'HIGH', 85, 'Notes', undefined, []);

    const { currentCase } = useProfessionalStore.getState();
    expect(currentCase?.physicianOutput?.prescription?.medicine).toBe('Aspirin');
  });

  it('syncs condition and urgency into reports and filteredReports', () => {
    const report = { id: CASE_ID, condition: 'Old condition', urgency: 'LOW', status: 'Active' } as any;
    useProfessionalStore.setState({
      currentCase: makeActiveCase(),
      reports: [report],
      filteredReports: [report],
    });

    useProfessionalStore.getState().updateLocalAIOutput('Migraine', 'HIGH', 85, '');

    const { reports, filteredReports } = useProfessionalStore.getState();
    expect(reports[0].condition).toBe('Migraine');
    expect(reports[0].urgency).toBe('HIGH');
    expect(filteredReports[0].condition).toBe('Migraine');
  });

  it('is a no-op when currentCase is null', () => {
    useProfessionalStore.setState({ currentCase: null });

    expect(() =>
      useProfessionalStore.getState().updateLocalAIOutput('Migraine', 'HIGH', 85, ''),
    ).not.toThrow();

    expect(useProfessionalStore.getState().currentCase).toBeNull();
  });
});

// ─── 3. useProfessionalStore.updateCaseStatus ─────────────────────────────────

describe('useProfessionalStore — updateCaseStatus', () => {
  beforeEach(resetStore);

  it('updates currentCase.status when case IS in activeCases', () => {
    const queueItem = makeCaseQueueItem({ status: 'Active' });
    useProfessionalStore.setState({
      currentCase: makeActiveCase(),
      activeCases: [queueItem],
    });

    useProfessionalStore.getState().updateCaseStatus(CASE_ID, 'Completed');

    const state = useProfessionalStore.getState();
    expect(state.currentCase?.status).toBe('Completed');
    expect(state.activeCases).toHaveLength(0);
    expect(state.completedCases).toHaveLength(1);
    expect(state.completedCases[0].status).toBe('Completed');
  });

  it('still updates currentCase.status when case is NOT in any queue array (opened via direct link)', () => {
    // This was the bug: if the case wasn't pre-loaded in the queue arrays,
    // the original code did `if (!item) return {}` — skipping currentCase update.
    useProfessionalStore.setState({
      currentCase: makeActiveCase({ status: 'Pending' }),
      pendingCases: [], // empty — case navigated to directly
      activeCases: [],
      completedCases: [],
    });

    useProfessionalStore.getState().updateCaseStatus(CASE_ID, 'Active');

    expect(useProfessionalStore.getState().currentCase?.status).toBe('Active');
  });

  it('syncs status in reports and filteredReports', () => {
    const report = { id: CASE_ID, status: 'Active' } as any;
    useProfessionalStore.setState({
      currentCase: makeActiveCase(),
      activeCases: [makeCaseQueueItem()],
      reports: [report],
      filteredReports: [report],
    });

    useProfessionalStore.getState().updateCaseStatus(CASE_ID, 'Completed');

    expect(useProfessionalStore.getState().reports[0].status).toBe('Completed');
    expect(useProfessionalStore.getState().filteredReports[0].status).toBe('Completed');
  });

  it('does not mutate unrelated cases', () => {
    const other = makeCaseQueueItem({ id: 'other-case', status: 'Active' });
    useProfessionalStore.setState({
      currentCase: makeActiveCase(),
      activeCases: [makeCaseQueueItem(), other],
    });

    useProfessionalStore.getState().updateCaseStatus(CASE_ID, 'Completed');

    const { activeCases } = useProfessionalStore.getState();
    expect(activeCases).toHaveLength(1);
    expect(activeCases[0].id).toBe('other-case');
    expect(activeCases[0].status).toBe('Active');
  });
});

// ─── 4. handleSaveEdit flow — service + store in sequence ────────────────────

describe('handleSaveEdit flow (service + store combined)', () => {
  beforeEach(() => {
    resetStore();
    mockUpdateAIOutput.mockReset();
  });

  it('calls updateAIOutput then updateLocalAIOutput on success', async () => {
    mockUpdateAIOutput.mockResolvedValue(undefined);
    useProfessionalStore.setState({ currentCase: makeActiveCase() });

    // Simulate exactly what handleSaveEdit does after validation passes:
    await ProfessionalService.updateAIOutput(
      CASE_ID, 'Migraine', 'HIGH', 90, 'Physician notes',
    );
    useProfessionalStore.getState().updateLocalAIOutput(
      'Migraine', 'HIGH', 90, 'Physician notes',
    );

    expect(mockUpdateAIOutput).toHaveBeenCalledWith(
      CASE_ID, 'Migraine', 'HIGH', 90, 'Physician notes',
    );
    expect(useProfessionalStore.getState().currentCase?.condition).toBe('Migraine');
    expect(useProfessionalStore.getState().currentCase?.urgency).toBe('HIGH');
    expect(useProfessionalStore.getState().currentCase?.physicianNotes).toBe('Physician notes');
  });

  it('does NOT call updateLocalAIOutput when the API call fails', async () => {
    mockUpdateAIOutput.mockRejectedValue(new Error('Case must be Active'));
    useProfessionalStore.setState({ currentCase: makeActiveCase() });

    let updateStoreCalled = false;
    try {
      await ProfessionalService.updateAIOutput(CASE_ID, 'Migraine', 'HIGH', 90, '');
      // Only reaches here on success:
      useProfessionalStore.getState().updateLocalAIOutput('Migraine', 'HIGH', 90, '');
      updateStoreCalled = true;
    } catch {
      // Error caught — as handleSaveEdit does in the catch block.
    }

    expect(updateStoreCalled).toBe(false);
    // Store condition unchanged:
    expect(useProfessionalStore.getState().currentCase?.condition).toBe('Tension Headache');
  });
});

// ─── 5. Patient-side: useDiagnosisStore reflects physician edits ──────────────
//
// After the physician saves, the patient app re-fetches GET /diagnoses/:id.
// The backend returns the updated fields (condition, urgency, confidence,
// prescription, investigations) sourced from physician_ai_output.
// These tests verify useDiagnosisStore correctly stores and exposes those fields
// so the patient diagnosis card shows the physician's edits.

const makeDiagnosisDetail = (overrides: Partial<DiagnosisDetail> = {}): DiagnosisDetail => ({
  id: CASE_ID,
  title: 'Headache',
  description: 'AI narrative',
  condition: 'Tension Headache',
  urgency: 'MEDIUM',
  confidence: 72,
  status: 'Active',
  escalated: false,
  hasPrescription: false,
  outcomeChecked: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function resetDiagnosisStore() {
  useDiagnosisStore.setState({
    diagnoses: [],
    selectedDiagnosis: null,
    loading: false,
    detailLoading: false,
    error: null,
  });
}

describe('useDiagnosisStore — patient card reflects physician edits', () => {
  beforeEach(() => {
    resetDiagnosisStore();
    mockGetDiagnosisDetail.mockReset();
  });

  it('fetchDiagnosisDetail stores physician-edited condition and urgency', async () => {
    const updated = makeDiagnosisDetail({ condition: 'Migraine', urgency: 'HIGH', confidence: 90 });
    mockGetDiagnosisDetail.mockResolvedValue(updated);

    await useDiagnosisStore.getState().fetchDiagnosisDetail(CASE_ID);

    const { selectedDiagnosis } = useDiagnosisStore.getState();
    expect(selectedDiagnosis?.condition).toBe('Migraine');
    expect(selectedDiagnosis?.urgency).toBe('HIGH');
    expect(selectedDiagnosis?.confidence).toBe(90);
  });

  it('fetchDiagnosisDetail stores physician-edited prescription (shown when Completed + Approved)', async () => {
    const rx = { medicine: 'Ibuprofen', dosage: '400mg', frequency: 'TDS', duration: '5 days', instructions: 'After meals' };
    const updated = makeDiagnosisDetail({
      status: 'Completed',
      physicianDecision: 'Approved',
      hasPrescription: true,
      prescription: rx,
    });
    mockGetDiagnosisDetail.mockResolvedValue(updated);

    await useDiagnosisStore.getState().fetchDiagnosisDetail(CASE_ID);

    const d = useDiagnosisStore.getState().selectedDiagnosis;
    expect(d?.status).toBe('Completed');
    expect(d?.physicianDecision).toBe('Approved');
    expect(d?.prescription?.medicine).toBe('Ibuprofen');
    expect(d?.prescription?.dosage).toBe('400mg');
  });

  it('fetchDiagnosisDetail stores physician-edited investigations', async () => {
    const inv = [
      { test: 'Brain MRI', reason: 'Rule out tumour', urgency: 'URGENT' as const },
      { test: 'FBC', reason: 'Baseline bloods', urgency: 'ROUTINE' as const },
    ];
    const updated = makeDiagnosisDetail({ investigations: inv });
    mockGetDiagnosisDetail.mockResolvedValue(updated);

    await useDiagnosisStore.getState().fetchDiagnosisDetail(CASE_ID);

    const d = useDiagnosisStore.getState().selectedDiagnosis;
    expect(d?.investigations).toHaveLength(2);
    expect(d?.investigations?.[0].test).toBe('Brain MRI');
    expect(d?.investigations?.[1].urgency).toBe('ROUTINE');
  });

  it('fetchDiagnosisDetail patches the in-list copy so the list view is also updated', async () => {
    // Pre-populate list with stale data
    useDiagnosisStore.setState({ diagnoses: [makeDiagnosisDetail()] });

    const updated = makeDiagnosisDetail({ condition: 'Migraine', urgency: 'HIGH' });
    mockGetDiagnosisDetail.mockResolvedValue(updated);

    await useDiagnosisStore.getState().fetchDiagnosisDetail(CASE_ID);

    const { diagnoses } = useDiagnosisStore.getState();
    expect(diagnoses[0].condition).toBe('Migraine');
    expect(diagnoses[0].urgency).toBe('HIGH');
  });

  it('updateDiagnosisStatus syncs status and physicianDecision on selectedDiagnosis', () => {
    useDiagnosisStore.setState({
      selectedDiagnosis: makeDiagnosisDetail({ status: 'Active' }),
      diagnoses: [makeDiagnosisDetail({ status: 'Active' })],
    });

    useDiagnosisStore.getState().updateDiagnosisStatus(CASE_ID, 'Completed', 'Approved');

    const { selectedDiagnosis, diagnoses } = useDiagnosisStore.getState();
    expect(selectedDiagnosis?.status).toBe('Completed');
    expect(selectedDiagnosis?.physicianDecision).toBe('Approved');
    expect(diagnoses[0].status).toBe('Completed');
    expect(diagnoses[0].physicianDecision).toBe('Approved');
  });

  it('does not alter other diagnoses in the list when status changes', () => {
    const other = makeDiagnosisDetail({ id: 'other-id', status: 'Active' });
    useDiagnosisStore.setState({
      selectedDiagnosis: makeDiagnosisDetail(),
      diagnoses: [makeDiagnosisDetail(), other],
    });

    useDiagnosisStore.getState().updateDiagnosisStatus(CASE_ID, 'Completed', 'Approved');

    const { diagnoses } = useDiagnosisStore.getState();
    const otherEntry = diagnoses.find(d => d.id === 'other-id');
    expect(otherEntry?.status).toBe('Active');
    expect(otherEntry?.physicianDecision).toBeUndefined();
  });

  it('sets error when fetchDiagnosisDetail fails', async () => {
    mockGetDiagnosisDetail.mockRejectedValue(new Error('Failed to fetch diagnosis'));

    await useDiagnosisStore.getState().fetchDiagnosisDetail(CASE_ID);

    const { error, detailLoading } = useDiagnosisStore.getState();
    expect(error).toBe('Failed to fetch diagnosis');
    expect(detailLoading).toBe(false);
  });
});
