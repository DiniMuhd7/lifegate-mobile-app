import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useProfessionalStore } from '../../stores/professional-store';
import { ProfessionalService } from '../../services/professional-service';
import { ConfidenceBar } from '../../components/ConfidenceBar';
import { SuggestInput } from '../../components/SuggestInput';
import { CaseUrgency, PrescriptionInfo, InvestigationInfo, ConditionScore, RiskFlag, HPIInfo } from '../../types/professional-types';
import { extractErrorMessage } from '../../utils/error-utils';
import { InstantMessageModal } from '../../components/InstantMessageModal';
import { useIMStore } from '../../stores/im-store';

// ─── Autocomplete data ────────────────────────────────────────────────────────

const CONDITION_SUGGESTIONS = [
  'Malaria', 'Plasmodium falciparum Malaria', 'Plasmodium vivax Malaria',
  'Typhoid Fever', 'Enteric Fever', 'Dengue Fever', 'Viral Fever',
  'Upper Respiratory Tract Infection (URTI)', 'Lower Respiratory Tract Infection (LRTI)',
  'Community-Acquired Pneumonia', 'Bronchitis', 'Asthma', 'COPD Exacerbation',
  'Pulmonary Tuberculosis (PTB)', 'Extrapulmonary Tuberculosis',
  'Urinary Tract Infection (UTI)', 'Pyelonephritis', 'Cystitis',
  'Peptic Ulcer Disease', 'Gastroenteritis', 'Acute Gastritis', 'GERD',
  'Appendicitis', 'Irritable Bowel Syndrome (IBS)',
  'Hypertension', 'Hypertensive Urgency', 'Hypertensive Emergency',
  'Type 2 Diabetes Mellitus', 'Type 1 Diabetes Mellitus', 'Diabetic Ketoacidosis',
  'Hypoglycaemia', 'Hyperglycaemia',
  'Anaemia', 'Iron Deficiency Anaemia', 'Sickle Cell Crisis', 'Sickle Cell Disease',
  'Cellulitis', 'Abscess', 'Wound Infection', 'Sepsis',
  'Meningitis', 'Encephalitis', 'Febrile Convulsion',
  'Stroke', 'Transient Ischaemic Attack (TIA)',
  'Acute Coronary Syndrome', 'Heart Failure', 'Arrhythmia',
  'Hepatitis B', 'Hepatitis C', 'Liver Cirrhosis', 'Fatty Liver Disease',
  'HIV/AIDS', 'Opportunistic Infection',
  'Otitis Media', 'Otitis Externa', 'Sinusitis', 'Tonsillitis', 'Pharyngitis',
  'Conjunctivitis', 'Uveitis',
  'Eczema', 'Psoriasis', 'Fungal Skin Infection', 'Scabies', 'Ringworm (Tinea)',
  'Arthritis', 'Gout', 'Osteoarthritis', 'Rheumatoid Arthritis',
  'Back Pain', 'Cervical Spondylosis', 'Lumbar Spondylosis',
  'Migraine', 'Tension Headache', 'Cluster Headache',
  'Anxiety Disorder', 'Depression', 'Insomnia',
  'Pre-eclampsia', 'Ectopic Pregnancy', 'Pelvic Inflammatory Disease (PID)',
  'Benign Prostatic Hyperplasia (BPH)', 'Prostatitis',
  'Renal Calculi', 'Nephrotic Syndrome', 'Chronic Kidney Disease (CKD)',
];

const DRUG_SUGGESTIONS = [
  // Antimalarials
  'Artemether-Lumefantrine (Coartem)', 'Artesunate-Amodiaquine', 'Dihydroartemisinin-Piperaquine',
  'Chloroquine', 'Quinine', 'Primaquine',
  // Antibiotics
  'Amoxicillin', 'Amoxicillin-Clavulanate (Augmentin)', 'Ampicillin',
  'Azithromycin', 'Clarithromycin', 'Erythromycin',
  'Ciprofloxacin', 'Levofloxacin', 'Ofloxacin',
  'Metronidazole (Flagyl)', 'Tinidazole',
  'Doxycycline', 'Tetracycline',
  'Cefuroxime', 'Ceftriaxone', 'Cefalexin',
  'Trimethoprim-Sulfamethoxazole (Cotrimoxazole)', 'Nitrofurantoin',
  'Clindamycin', 'Gentamicin',
  // Analgesics / Antipyretics
  'Paracetamol (Acetaminophen)', 'Ibuprofen', 'Diclofenac', 'Naproxen', 'Aspirin',
  'Tramadol', 'Codeine', 'Morphine',
  // Antihypertensives
  'Amlodipine', 'Nifedipine', 'Verapamil',
  'Lisinopril', 'Enalapril', 'Ramipril',
  'Losartan', 'Valsartan',
  'Atenolol', 'Metoprolol', 'Bisoprolol', 'Carvedilol',
  'Hydrochlorothiazide', 'Furosemide', 'Spironolactone',
  'Methyldopa',
  // Antidiabetics
  'Metformin', 'Glibenclamide', 'Glimepiride',
  'Insulin (Regular)', 'Insulin (NPH)', 'Insulin (Glargine)',
  // GI
  'Omeprazole', 'Pantoprazole', 'Rabeprazole', 'Ranitidine',
  'Metoclopramide', 'Domperidone', 'Ondansetron',
  'Oral Rehydration Salts (ORS)', 'Zinc Sulfate',
  'Lactulose', 'Bisacodyl',
  // Respiratory
  'Salbutamol (Ventolin)', 'Ipratropium Bromide', 'Budesonide Inhaler',
  'Prednisolone', 'Dexamethasone', 'Hydrocortisone',
  'Cetirizine', 'Loratadine', 'Chlorpheniramine',
  // Antifungals
  'Fluconazole', 'Ketoconazole', 'Clotrimazole', 'Nystatin', 'Griseofulvin',
  // Antivirals / HIV
  'Tenofovir-Lamivudine-Dolutegravir (TLD)', 'Acyclovir',
  // Vitamins / Supplements
  'Ferrous Sulfate', 'Folic Acid', 'Vitamin C', 'Vitamin D3', 'Calcium Carbonate',
  'Multivitamin', 'Zinc',
  // Other
  'Diazepam', 'Phenobarbitone', 'Phenytoin', 'Carbamazepine',
  'Haloperidol', 'Chlorpromazine', 'Amitriptyline', 'Fluoxetine',
  'Warfarin', 'Heparin', 'Enoxaparin', 'Aspirin 75mg',
  'Atorvastatin', 'Simvastatin',
  'Levothyroxine', 'Carbimazole',
  'Misoprostol', 'Oxytocin', 'Magnesium Sulfate',
];

const DOSAGE_SUGGESTIONS = [
  '1 tablet', '2 tablets', '½ tablet',
  '1 capsule', '2 capsules',
  '500mg', '250mg', '1g', '200mg', '400mg', '600mg', '800mg', '100mg',
  '5ml', '10ml', '15ml', '20ml',
  '1 sachet', '2 sachets',
  '1 puff', '2 puffs',
  '1 drop', '2 drops',
  '1 vial', '1 ampoule',
  '1 unit', '10 units', '20 units',
];

export const FREQUENCY_CHIPS = [
  'Once daily (OD)', 'Twice daily (BD)', 'Three times daily (TDS)',
  'Four times daily (QDS)', 'Every 8 hours', 'Every 6 hours',
  'Every 12 hours', 'At bedtime (nocte)', 'Morning & evening',
  'As needed (PRN)', 'Stat (single dose)',
];

export const DURATION_CHIPS = [
  '3 days', '5 days', '7 days', '10 days', '14 days',
  '3 weeks', '1 month', '2 months', '3 months', 'Ongoing', 'As directed',
];

const INVESTIGATION_SUGGESTIONS = [
  'Full Blood Count (FBC)', 'Complete Blood Count (CBC)',
  'Packed Cell Volume (PCV)', 'Haemoglobin Level',
  'Blood Group & Genotype', 'Blood Film for Malaria Parasite',
  'Malaria Rapid Diagnostic Test (RDT)',
  'Widal Test', 'Blood Culture & Sensitivity',
  'Fasting Blood Sugar (FBS)', 'Random Blood Sugar (RBS)',
  'HbA1c (Glycated Haemoglobin)',
  'Liver Function Tests (LFTs)', 'Renal Function Tests (RFTs)',
  'Serum Electrolytes (U&E)',
  'Serum Creatinine', 'eGFR',
  'Serum Uric Acid', 'Serum Lipid Profile',
  'Thyroid Function Tests (TFTs)', 'TSH', 'Free T4',
  'Erythrocyte Sedimentation Rate (ESR)', 'C-Reactive Protein (CRP)',
  'Prothrombin Time (PT/INR)', 'APTT',
  'HIV Rapid Test', 'CD4 Count', 'Viral Load',
  'Hepatitis B Surface Antigen (HBsAg)', 'Hepatitis C Antibody (Anti-HCV)',
  'Urine Full & Microscopy (UFM)', 'Urine Culture & Sensitivity',
  'Urine Pregnancy Test (UPT)',
  'Stool Microscopy & Culture', 'Stool for Ova & Parasites',
  'Sputum AFB (Ziehl-Neelsen stain)', 'Sputum Culture (TB)',
  'Wound Swab Culture & Sensitivity', 'Throat Swab Culture & Sensitivity',
  'Pus Swab Culture & Sensitivity',
  'Electrocardiogram (ECG)', 'Echocardiogram',
  'Chest X-Ray (CXR)', 'Abdominal X-Ray',
  'Abdominal Ultrasound', 'Pelvic Ultrasound', 'Transvaginal Ultrasound',
  'Scrotal Ultrasound', 'Renal Ultrasound',
  'CT Scan (Head)', 'CT Scan (Chest)', 'CT Scan (Abdomen & Pelvis)',
  'MRI Brain', 'MRI Spine',
  'Lumbar Puncture (LP) / CSF Analysis',
  'Serum Bilirubin (Total & Direct)', 'Serum Albumin', 'Serum Proteins',
  'Serum Calcium', 'Serum Phosphate', 'Serum Magnesium',
  'Sickle Cell Screening', 'Haemoglobin Electrophoresis',
  'Mantoux Test (Tuberculin Skin Test)',
  'Fasting Lipid Profile', 'Serum Iron', 'TIBC', 'Serum Ferritin',
  'PSA (Prostate-Specific Antigen)', 'Pap Smear',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate age in whole years from a date-of-birth string.
 * Handles YYYY-MM-DD, DD/MM/YYYY and MM/DD/YYYY.
 * Returns null when the string is absent or unparseable.
 */
function calculateAge(dob: string | undefined): number | null {
  if (!dob) return null;
  let date: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}/.test(dob)) {
    date = new Date(dob);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
    const [a, b, y] = dob.split('/').map(Number);
    // Prefer DD/MM/YYYY (more common internationally)
    const dmY = new Date(y, b - 1, a);
    const mdY = new Date(y, a - 1, b);
    date = dmY.getFullYear() === y && dmY.getMonth() === b - 1 ? dmY : mdY;
  }

  if (!date || isNaN(date.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const notHadBirthdayYet =
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  if (notHadBirthdayYet) age -= 1;
  return age >= 0 ? age : null;
}

// ─── Health-tips generator ────────────────────────────────────────────────────
// Generates personalised, safety-validated health tips for common conditions.
// Used as the "Generate Suggestions" shortcut in the case-review edit form.
// All generated tips are clinically conservative and prompt patients to defer
// to their physician rather than self-treat.

function generateHealthTipsForCondition(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('malaria')) {
    return 'Complete your full antimalarial course even if you feel better, and return if fever persists after 48 hours.';
  }
  if (c.includes('typhoid')) {
    return 'Eat soft foods, drink only boiled or bottled water, and complete all prescribed antibiotics without stopping early.';
  }
  if (c.includes('hypertension') || c.includes('blood pressure')) {
    return 'Reduce salt intake and take your blood pressure medication at the same time every day without skipping.';
  }
  if (c.includes('diabetes')) {
    return 'Avoid sugary drinks and processed foods, take a short walk after meals, and never skip your diabetes medication.';
  }
  if (c.includes('tuberculosis') || c.includes('tb')) {
    return 'Take all TB medications daily without missing a dose, as missed doses cause drug resistance — complete the full course.';
  }
  if (c.includes('hiv') || c.includes('aids')) {
    return 'Take your antiretroviral medication every day at the same time and keep all clinic appointments for viral load monitoring.';
  }
  if (c.includes('sickle cell') || c.includes('scd')) {
    return 'Stay well-hydrated with 2–3 litres of water daily, avoid extreme temperatures, and seek emergency care for chest pain or shortness of breath.';
  }
  if (c.includes('peptic') || c.includes('ulcer') || c.includes('gastritis')) {
    return 'Avoid ibuprofen, aspirin, alcohol, and spicy foods while taking your prescribed antacid or PPI medication.';
  }
  if (c.includes('uti') || c.includes('urinary')) {
    return 'Drink 2–3 litres of water daily and complete the full antibiotic course — return if symptoms persist or back pain and fever develop.';
  }
  if (c.includes('respiratory') || c.includes('pneumonia') || c.includes('bronchitis') || c.includes('asthma')) {
    return 'Avoid cigarette smoke and dusty environments, and use your inhaler exactly as directed without stopping steroids abruptly.';
  }
  if (c.includes('heart failure') || c.includes('cardiac') || c.includes('coronary')) {
    return 'Take all heart medications daily, limit salt to under 2g per day, and report a weight gain of more than 2 kg in 24 hours.';
  }
  if (c.includes('anaemia') || c.includes('anemia')) {
    return 'Eat iron-rich foods such as beans, liver, and dark leafy greens, and take iron supplements with orange juice to improve absorption.';
  }
  if (c.includes('dengue')) {
    return 'Rest, stay well-hydrated, and use only paracetamol for fever — avoid aspirin and NSAIDs, and seek emergency care for any bleeding.';
  }
  if (c.includes('arthritis') || c.includes('gout') || c.includes('joint')) {
    return 'Keep affected joints elevated at rest and take prescribed anti-inflammatory medication with food to protect your stomach.';
  }
  // Generic safe fallback
  const conditionLabel = condition.trim() || 'your condition';
  return `Follow your physician's instructions for ${conditionLabel}, take all prescribed medications as directed, and attend all follow-up appointments.`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

type ReviewMode = 'view' | 'edit' | 'approve' | 'reject';

const URGENCY_COLORS: Record<CaseUrgency, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

const URGENCY_BG: Record<CaseUrgency, string> = {
  LOW: '#dcfce7',
  MEDIUM: '#fef9c3',
  HIGH: '#ffedd5',
  CRITICAL: '#fee2e2',
};

const URGENCY_OPTIONS: CaseUrgency[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const INV_URGENCY_COLORS: Record<string, string> = {
  ROUTINE: '#10b981',
  URGENT: '#f59e0b',
  STAT: '#ef4444',
};

const INV_URGENCY_BG: Record<string, string> = {
  ROUTINE: '#d1fae5',
  URGENT: '#fef3c7',
  STAT: '#fee2e2',
};

// ─── Date helper ──────────────────────────────────────────────────────────────

function safeFormatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl mx-4 mb-3 p-4" style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}>
      <Text className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row mb-2">
      <Text className="text-xs text-gray-500 w-32 flex-shrink-0">{label}</Text>
      <Text className="text-xs text-gray-800 flex-1" numberOfLines={4}>{value}</Text>
    </View>
  );
}

function UrgencyBadge({ urgency }: { urgency: CaseUrgency }) {
  return (
    <View
      className="px-3 py-1 rounded-full self-start"
      style={{ backgroundColor: URGENCY_BG[urgency] }}
    >
      <Text className="text-xs font-bold" style={{ color: URGENCY_COLORS[urgency] }}>
        {urgency}
      </Text>
    </View>
  );
}

const RISK_SEVERITY_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444',
};
const RISK_SEVERITY_BG: Record<string, string> = {
  LOW: '#dcfce7', MEDIUM: '#fef9c3', HIGH: '#ffedd5', CRITICAL: '#fee2e2',
};

function ConditionsSection({ conditions }: { conditions: ConditionScore[] }) {
  if (!conditions || conditions.length === 0) return null;
  return (
    <SectionCard title="Differential Diagnosis">
      {conditions.map((c, i) => (
        <View key={i} className="mb-3 last:mb-0">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-sm font-semibold text-gray-800 flex-1 mr-2" numberOfLines={1}>
              {c.condition}
            </Text>
            <Text className="text-xs font-bold text-teal-700">{c.confidence}%</Text>
          </View>
          <ConfidenceBar confidence={c.confidence} />
          {c.description ? (
            <Text className="text-xs text-gray-500 mt-1 leading-4">{c.description}</Text>
          ) : null}
        </View>
      ))}
    </SectionCard>
  );
}

function RiskFlagsSection({ flags }: { flags: RiskFlag[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <SectionCard title="Risk Flags">
      {flags.map((f, i) => (
        <View
          key={i}
          className="flex-row items-start gap-2 mb-2 p-2.5 rounded-xl"
          style={{ backgroundColor: RISK_SEVERITY_BG[f.severity] ?? '#f3f4f6' }}
        >
          <Ionicons name="warning" size={14} color={RISK_SEVERITY_COLOR[f.severity] ?? '#374151'} style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="text-xs font-bold" style={{ color: RISK_SEVERITY_COLOR[f.severity] ?? '#374151' }}>
              {f.flag.replace(/_/g, ' ')}
            </Text>
            {f.description ? (
              <Text className="text-xs text-gray-600 mt-0.5 leading-4">{f.description}</Text>
            ) : null}
          </View>
          <View
            className="px-2 py-0.5 rounded-full self-start"
            style={{ backgroundColor: RISK_SEVERITY_COLOR[f.severity] ?? '#6b7280' }}
          >
            <Text className="text-xs font-bold text-white">{f.severity}</Text>
          </View>
        </View>
      ))}
    </SectionCard>
  );
}

function HPISection({ hpi }: { hpi: HPIInfo }) {
  const rows: { label: string; value?: string | number }[] = [
    { label: 'Onset', value: hpi.onset },
    { label: 'Duration', value: hpi.duration },
    { label: 'Severity (0-10)', value: hpi.severityScore !== undefined ? String(hpi.severityScore) : undefined },
    { label: 'Location', value: hpi.location },
    { label: 'Character', value: hpi.character },
  ].filter(r => r.value !== undefined && r.value !== '' && r.value !== null);
  if (rows.length === 0) return null;
  return (
    <SectionCard title="History of Present Illness">
      {rows.map((r, i) => (
        <InfoRow key={i} label={r.label} value={String(r.value)} />
      ))}
    </SectionCard>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CaseReviewScreen() {
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();

  const {
    currentCase,
    currentPatient,
    isCaseLoading,
    caseLoadError,
    loadCaseDetail,
    updateLocalAIOutput,
    clearCurrentCase,
    updateCaseStatus,
    takeCase,
  } = useProfessionalStore();

  // Review mode state
  const [mode, setMode] = useState<ReviewMode>('view');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Edit mode state
  const [editCondition, setEditCondition] = useState('');
  const [editUrgency, setEditUrgency] = useState<CaseUrgency>('LOW');
  const [editConfidence, setEditConfidence] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editHealthTips, setEditHealthTips] = useState('');
  const [editMedications, setEditMedications] = useState<PrescriptionInfo[]>([]);
  const [editInvestigations, setEditInvestigations] = useState<InvestigationInfo[]>([]);

  // Approve / Reject state
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Instant messaging panel
  const [imVisible, setImVisible] = useState(false);

  // Unread IM count for the badge
  const imUnread = useIMStore(
    (s) => s.conversations[caseId as string]?.unreadCount ?? 0,
  );

  // Load data on mount
  useEffect(() => {
    if (!caseId) return;
    loadCaseDetail(caseId);
    return () => clearCurrentCase();
  }, [caseId]);

  // Sync edit state when case is loaded
  useEffect(() => {
    if (!currentCase) return;
    setEditCondition(currentCase.condition || currentCase.aiResponse?.diagnosis?.condition || '');
    setEditUrgency((currentCase.urgency as CaseUrgency) || 'LOW');
    setEditConfidence(currentCase.aiResponse?.diagnosis?.confidence ?? 0);
    setEditNotes(currentCase.physicianNotes || '');
    setEditHealthTips(currentCase.physicianHealthTips || '');
    // Populate medications array from physician override, then AI, then empty slot
    const existingMeds: PrescriptionInfo[] =
      currentCase.physicianOutput?.prescriptions ??
      (currentCase.physicianOutput?.prescription
        ? [currentCase.physicianOutput.prescription]
        : currentCase.aiResponse?.prescription
        ? [currentCase.aiResponse.prescription]
        : []);
    setEditMedications(existingMeds.length > 0 ? existingMeds : [{ medicine: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
    setEditInvestigations(
      currentCase.physicianOutput?.investigations ??
      currentCase.aiResponse?.investigations ??
      []
    );
  }, [currentCase]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveEdit = useCallback(async () => {
    if (!caseId || !editCondition.trim()) {
      Alert.alert('Validation', 'Condition name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      const prescriptions = editMedications
        .filter(m => m.medicine.trim())
        .map(m => ({
          medicine: m.medicine.trim(),
          dosage: m.dosage.trim(),
          frequency: m.frequency.trim(),
          duration: m.duration.trim(),
          instructions: m.instructions?.trim() ?? '',
        }));
        
      const investigations = editInvestigations.filter(i => i.test.trim());
      await ProfessionalService.updateAIOutput(
        caseId,
        editCondition.trim(),
        editUrgency,
        editConfidence,
        editNotes.trim(),
        prescriptions.length > 0 ? prescriptions : undefined,
        investigations.length > 0 ? investigations : undefined,
        editHealthTips.trim() || undefined,
      );
      // Apply an optimistic local update so the view reflects changes immediately.
      updateLocalAIOutput(
        editCondition.trim(),
        editUrgency,
        editConfidence,
        editNotes.trim(),
        prescriptions[0],
        investigations,
        editHealthTips.trim() || undefined,
      );
      setMode('view');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, editCondition, editUrgency, editConfidence, editNotes, editHealthTips, editMedications, editInvestigations, updateLocalAIOutput]);

  const addInvestigation = useCallback(() => {
    setEditInvestigations(prev => [...prev, { test: '', reason: '', urgency: 'ROUTINE' }]);
  }, []);

  const removeInvestigation = useCallback((idx: number) => {
    setEditInvestigations(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const addMedication = useCallback(() => {
    setEditMedications(prev => [...prev, { medicine: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  }, []);

  const removeMedication = useCallback((idx: number) => {
    setEditMedications(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateMedication = useCallback((idx: number, field: keyof PrescriptionInfo, value: string) => {
    setEditMedications(prev =>
      prev.map((med, i) => (i === idx ? { ...med, [field]: value } : med))
    );
  }, []);

  const updateInvestigation = useCallback((idx: number, field: keyof InvestigationInfo, value: string) => {
    setEditInvestigations(prev =>
      prev.map((inv, i) => (i === idx ? { ...inv, [field]: value } : inv))
    );
  }, []);

  const handleTakeCase = useCallback(async () => {
    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await takeCase(caseId);
      // takeCase already updates currentCase.status → 'Active' optimistically,
      // so the Edit/Approve/Reject panel appears without needing updateCaseStatus.
      Alert.alert('Case Assigned', 'You have taken this case. You can now review and submit a decision.');
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, takeCase]);

  const handleApprove = useCallback(async () => {    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await ProfessionalService.approveCase(caseId, notes);
      updateCaseStatus(caseId, 'Completed');
      Alert.alert('Case Approved', 'The case has been successfully approved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, notes, updateCaseStatus, router]);

  const handleReject = useCallback(async () => {
    if (!caseId) return;
    if (!rejectionReason.trim()) {
      Alert.alert('Required', 'A rejection reason is required before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      await ProfessionalService.rejectCase(caseId, rejectionReason.trim(), notes);
      updateCaseStatus(caseId, 'Completed');
      Alert.alert('Case Rejected', 'The case has been rejected with your notes.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [caseId, rejectionReason, notes, updateCaseStatus, router]);

  // ── Loading / error states ──────────────────────────────────────────────

  if (isCaseLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3 text-sm">Loading case…</Text>
      </SafeAreaView>
    );
  }

  if (!currentCase) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-gray-800 font-bold text-base mt-4 text-center">
          {caseLoadError ?? 'Case not found'}
        </Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          The case may have been reassigned or is no longer available.
        </Text>
        <TouchableOpacity
          onPress={() => caseId && loadCaseDetail(caseId)}
          className="mt-6 px-6 py-3 rounded-xl bg-blue-600"
        >
          <Text className="text-white font-semibold text-sm">Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} className="mt-3">
          <Text className="text-gray-500 text-sm">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const ai = currentCase.aiResponse;
  const diagnosis = ai?.diagnosis;
  const prescription = ai?.prescription;
  const urgency = (currentCase.urgency as CaseUrgency) || 'LOW';
  const isCompleted = currentCase.status === 'Completed';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <SafeAreaView className="flex-1 bg-gray-50">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#1e3a5f', '#0f2440']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="px-4 pt-3 pb-4"
        >
          <View className="flex-row items-center mb-3">
            <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2">
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold" numberOfLines={1}>
                {currentCase.title || 'Case Review'}
              </Text>
              <Text className="text-white/60 text-xs mt-0.5">
                {currentCase.patientName} · {currentCase.id.slice(0, 8).toUpperCase()}
              </Text>
            </View>
            <UrgencyBadge urgency={urgency} />
          </View>

          {/* Status row */}
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center bg-white/10 rounded-full px-3 py-1">
              <View
                className="w-2 h-2 rounded-full mr-2"
                style={{
                  backgroundColor:
                    currentCase.status === 'Active'
                      ? '#60a5fa'
                      : currentCase.status === 'Pending'
                      ? '#a78bfa'
                      : '#4ade80',
                }}
              />
              <Text className="text-white text-xs font-semibold">{currentCase.status}</Text>
            </View>
            {currentCase.escalated && (
              <View className="flex-row items-center bg-red-500/20 rounded-full px-3 py-1">
                <Ionicons name="alert-circle" size={12} color="#fca5a5" />
                <Text className="text-red-300 text-xs font-semibold ml-1">Escalated</Text>
              </View>
            )}
            {currentCase.physicianDecision && (
              <View
                className="flex-row items-center rounded-full px-3 py-1"
                style={{
                  backgroundColor:
                    currentCase.physicianDecision === 'Approved'
                      ? 'rgba(34,197,94,0.2)'
                      : 'rgba(239,68,68,0.2)',
                }}
              >
                <Ionicons
                  name={currentCase.physicianDecision === 'Approved' ? 'checkmark-circle' : 'close-circle'}
                  size={12}
                  color={currentCase.physicianDecision === 'Approved' ? '#4ade80' : '#f87171'}
                />
                <Text
                  className="text-xs font-semibold ml-1"
                  style={{ color: currentCase.physicianDecision === 'Approved' ? '#4ade80' : '#f87171' }}
                >
                  {currentCase.physicianDecision}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* ── Save success banner ────────────────────────────────────── */}
        {savedSuccess && (
          <View className="flex-row items-center bg-green-500 px-4 py-3 gap-x-2">
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text className="text-white text-sm font-semibold flex-1">Changes saved successfully.</Text>
          </View>
        )}

        {/* ── Scrollable content ─────────────────────────────────────── */}
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
        >

          {/* ── Message Patient card ─────────────────────────────────── */}
          {(currentCase.status === 'Active' || currentCase.status === 'Completed') && (
            <TouchableOpacity
              onPress={() => setImVisible(true)}
              activeOpacity={0.85}
              className="mx-4 mb-3 rounded-2xl overflow-hidden"
              style={{ elevation: 2, shadowColor: '#0AADA2', shadowOpacity: 0.12, shadowRadius: 6 }}
            >
              <View
                className="flex-row items-center px-4 py-3"
                style={{ backgroundColor: '#f0fdfc', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 16 }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#0AADA2' }}
                >
                  <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                  {imUnread > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: '#ef4444',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 3,
                        borderWidth: 1.5,
                        borderColor: '#fff',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                        {imUnread > 9 ? '9+' : imUnread}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-teal-800">
                    Message Patient
                  </Text>
                  <Text className="text-xs text-teal-600 mt-0.5">
                    {imUnread > 0
                      ? `${imUnread} unread message${imUnread > 1 ? 's' : ''}`
                      : 'Chat with ' + (currentCase.patientName || 'the patient')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#0AADA2" />
              </View>
            </TouchableOpacity>
          )}
          <SectionCard title="AI Analysis">
            {mode === 'edit' ? (
              /* Edit mode — inline fields */
              <View>
                <Text className="text-xs text-gray-500 mb-1">Condition</Text>
                <SuggestInput
                  inputClassName="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-1 bg-blue-50"
                  value={editCondition}
                  onChangeText={setEditCondition}
                  suggestions={CONDITION_SUGGESTIONS}
                  placeholder="Condition name"
                  placeholderTextColor="#93c5fd"
                />
                <View className="mb-2" />

                <Text className="text-xs text-gray-500 mb-1.5">Urgency</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {URGENCY_OPTIONS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setEditUrgency(u)}
                      className="px-4 py-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          editUrgency === u ? URGENCY_COLORS[u] : URGENCY_BG[u],
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: editUrgency === u ? '#fff' : URGENCY_COLORS[u] }}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-xs text-gray-500 mb-1">
                  Confidence score (0–100)
                </Text>
                <View className="flex-row items-center gap-3 mb-1">
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-center text-lg font-bold w-20 bg-blue-50"
                    value={String(editConfidence)}
                    onChangeText={(t) =>
                      setEditConfidence(Math.min(100, Math.max(0, parseInt(t) || 0)))
                    }
                    keyboardType="numeric"
                    maxLength={3}
                  />
                  <View className="flex-1">
                    <ConfidenceBar confidence={editConfidence} />
                  </View>
                </View>

                {diagnosis?.description ? (
                  <>
                    <Text className="text-xs text-gray-500 mb-1 mt-2">AI Description</Text>
                    <Text className="text-xs text-gray-700 leading-5">{diagnosis.description}</Text>
                  </>
                ) : null}
              </View>
            ) : (
              /* View mode */
              <View>
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-bold text-gray-900 mb-1">
                      {currentCase.condition || diagnosis?.condition || '—'}
                    </Text>
                    <UrgencyBadge urgency={urgency} />
                  </View>
                </View>

                {/* Confidence bar */}
                <View className="mb-3">
                  <ConfidenceBar confidence={diagnosis?.confidence ?? 0} />
                </View>

                {/* AI text description */}
                {diagnosis?.description ? (
                  <View className="bg-gray-50 rounded-xl p-3">
                    <Text className="text-xs text-gray-600 leading-5">{diagnosis.description}</Text>
                  </View>
                ) : null}

                {/* AI narrative text */}
                {ai?.text ? (
                  <View className="mt-3 bg-blue-50 rounded-xl p-3">
                    <Text className="text-xs text-blue-800 leading-5 font-medium mb-1">
                      AI Narrative
                    </Text>
                    <Text className="text-xs text-blue-700 leading-5">{ai.text}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </SectionCard>

          {/* ── Edit-mode: Clinical Notes ────────────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Clinical Notes">
              <TextInput
                className="border border-blue-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-blue-50"
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Enter clinical notes, observations, or recommendations…"
                placeholderTextColor="#93c5fd"
                multiline
                numberOfLines={4}
                style={{ minHeight: 88, textAlignVertical: 'top' }}
              />
            </SectionCard>
          )}

          {/* ── Edit-mode: Recommended Medications ───────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Recommended Medications">
              <Text className="text-xs text-gray-400 mb-3">Add one or more medications. Leave the first entry blank if none are needed.</Text>
              {editMedications.map((med, idx) => (
                <View key={idx} className="border border-blue-100 rounded-xl p-3 mb-3 bg-blue-50">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-semibold text-gray-600">Medication {idx + 1}</Text>
                    {editMedications.length > 1 && (
                      <TouchableOpacity onPress={() => removeMedication(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500 mb-1">Medicine / Drug name</Text>
                  <SuggestInput
                    inputClassName="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-2 bg-white"
                    value={med.medicine}
                    onChangeText={v => updateMedication(idx, 'medicine', v)}
                    suggestions={DRUG_SUGGESTIONS}
                    placeholder="e.g. Amoxicillin 500mg"
                    placeholderTextColor="#93c5fd"
                  />

                  {/* Dosage row (left) + Frequency row (right) */}
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-xs text-gray-500 mb-1">Dosage</Text>
                      <SuggestInput
                        inputClassName="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white"
                        value={med.dosage}
                        onChangeText={v => updateMedication(idx, 'dosage', v)}
                        suggestions={DOSAGE_SUGGESTIONS}
                        placeholder="e.g. 1 tablet"
                        placeholderTextColor="#93c5fd"
                        autoCapitalize="none"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs text-gray-500 mb-1">Frequency</Text>
                      <TextInput
                        className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white"
                        value={med.frequency}
                        onChangeText={v => updateMedication(idx, 'frequency', v)}
                        placeholder="e.g. 3× daily"
                        placeholderTextColor="#93c5fd"
                        autoCorrect={false}
                      />
                    </View>
                  </View>
                  {/* Frequency quick-select chips */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1.5 mb-3" keyboardShouldPersistTaps="handled">
                    <View className="flex-row gap-1.5 px-0.5">
                      {FREQUENCY_CHIPS.map(chip => (
                        <TouchableOpacity
                          key={chip}
                          onPress={() => updateMedication(idx, 'frequency', chip)}
                          className="px-2.5 py-1 rounded-full border"
                          style={{
                            borderColor: med.frequency === chip ? '#3b82f6' : '#bfdbfe',
                            backgroundColor: med.frequency === chip ? '#eff6ff' : '#f8fafc',
                          }}
                        >
                          <Text
                            className="text-xs"
                            style={{ color: med.frequency === chip ? '#1d4ed8' : '#64748b' }}
                          >
                            {chip}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text className="text-xs text-gray-500 mb-1">Duration</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white"
                    value={med.duration}
                    onChangeText={v => updateMedication(idx, 'duration', v)}
                    placeholder="e.g. 7 days"
                    placeholderTextColor="#93c5fd"
                    autoCorrect={false}
                  />
                  {/* Duration quick-select chips */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1.5 mb-3" keyboardShouldPersistTaps="handled">
                    <View className="flex-row gap-1.5 px-0.5">
                      {DURATION_CHIPS.map(chip => (
                        <TouchableOpacity
                          key={chip}
                          onPress={() => updateMedication(idx, 'duration', chip)}
                          className="px-2.5 py-1 rounded-full border"
                          style={{
                            borderColor: med.duration === chip ? '#3b82f6' : '#bfdbfe',
                            backgroundColor: med.duration === chip ? '#eff6ff' : '#f8fafc',
                          }}
                        >
                          <Text
                            className="text-xs"
                            style={{ color: med.duration === chip ? '#1d4ed8' : '#64748b' }}
                          >
                            {chip}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text className="text-xs text-gray-500 mb-1">Instructions (optional)</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 bg-white"
                    value={med.instructions}
                    onChangeText={v => updateMedication(idx, 'instructions', v)}
                    placeholder="e.g. Take after meals"
                    placeholderTextColor="#93c5fd"
                    multiline
                    numberOfLines={2}
                    style={{ minHeight: 56, textAlignVertical: 'top' }}
                  />
                </View>
              ))}
              <TouchableOpacity
                onPress={addMedication}
                className="flex-row items-center justify-center border border-dashed border-blue-300 rounded-xl py-2.5 gap-2"
              >
                <Ionicons name="add-circle-outline" size={16} color="#3b82f6" />
                <Text className="text-blue-500 text-xs font-semibold">Add Another Medication</Text>
              </TouchableOpacity>
            </SectionCard>
          )}

          {/* ── Edit-mode: Recommended Tests ────────────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Recommended Tests">
              <Text className="text-xs text-gray-400 mb-3">Add any investigations or lab tests to recommend.</Text>
              {editInvestigations.map((inv, idx) => (
                <View key={idx} className="border border-blue-100 rounded-xl p-3 mb-3 bg-blue-50">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-semibold text-gray-600">Test {idx + 1}</Text>
                    <TouchableOpacity onPress={() => removeInvestigation(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <Text className="text-xs text-gray-500 mb-1">Test / Investigation name</Text>
                  <SuggestInput
                    inputClassName="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-2 bg-white"
                    value={inv.test}
                    onChangeText={v => updateInvestigation(idx, 'test', v)}
                    suggestions={INVESTIGATION_SUGGESTIONS}
                    placeholder="e.g. Complete Blood Count"
                    placeholderTextColor="#93c5fd"
                  />
                  <Text className="text-xs text-gray-500 mb-1">Reason (optional)</Text>
                  <TextInput
                    className="border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-800 mb-2 bg-white"
                    value={inv.reason}
                    onChangeText={v => updateInvestigation(idx, 'reason', v)}
                    placeholder="e.g. To rule out infection"
                    placeholderTextColor="#93c5fd"
                    autoCorrect
                  />
                  <Text className="text-xs text-gray-500 mb-1.5">Priority</Text>
                  <View className="flex-row gap-2">
                    {(['ROUTINE', 'URGENT', 'STAT'] as const).map(u => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => updateInvestigation(idx, 'urgency', u)}
                        className="flex-1 py-1.5 rounded-full items-center"
                        style={{
                          backgroundColor: inv.urgency === u ? INV_URGENCY_COLORS[u] : INV_URGENCY_BG[u],
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: inv.urgency === u ? '#fff' : INV_URGENCY_COLORS[u] }}
                        >
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                onPress={addInvestigation}
                className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-blue-300"
              >
                <Ionicons name="add-circle-outline" size={16} color="#3b82f6" />
                <Text className="text-blue-600 text-sm font-medium">Add Test</Text>
              </TouchableOpacity>
            </SectionCard>
          )}

          {/* ── Edit-mode: Patient Health Tips ───────────────────────── */}
          {mode === 'edit' && (
            <SectionCard title="Patient Health Tips">
              <Text className="text-xs text-gray-400 mb-3">
                Add a short, actionable health tip for this patient's condition.
              </Text>

              {/* Generate button */}
              <TouchableOpacity
                onPress={() => setEditHealthTips(generateHealthTipsForCondition(editCondition))}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 12,
                  backgroundColor: '#0AADA2',
                  borderRadius: 12,
                  paddingVertical: 11,
                  paddingHorizontal: 16,
                  elevation: 2,
                  shadowColor: '#0AADA2',
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <Ionicons name="sparkles" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  Generate health tips for this condition
                </Text>
              </TouchableOpacity>

              <TextInput
                className="border border-blue-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-blue-50"
                value={editHealthTips}
                onChangeText={setEditHealthTips}
                placeholder="e.g. Take your medication daily and stay well-hydrated."
                placeholderTextColor="#93c5fd"
                multiline
                numberOfLines={5}
                style={{ minHeight: 110, textAlignVertical: 'top' }}
                maxLength={600}
              />
              <Text className="text-xs text-gray-400 mt-1 text-right">
                {editHealthTips.length}/600
              </Text>

              {/* Safety disclaimer */}
              <View className="flex-row items-start gap-2 mt-2 bg-amber-50 rounded-xl p-3">
                <Ionicons name="shield-checkmark-outline" size={14} color="#b45309" style={{ marginTop: 1 }} />
                <Text className="text-xs text-amber-800 flex-1 leading-4">
                  Tips are advisory only and visible to the patient on their health screen.
                </Text>
              </View>
            </SectionCard>
          )}

          {/* ── Prescription (view mode only) ────────────────────────── */}
          {mode !== 'edit' && prescription && (
            <SectionCard title="AI Prescription">
              <InfoRow label="Medicine" value={prescription.medicine} />
              <InfoRow label="Dosage" value={prescription.dosage} />
              <InfoRow label="Frequency" value={prescription.frequency} />
              <InfoRow label="Duration" value={prescription.duration} />
              {prescription.instructions && (
                <InfoRow label="Instructions" value={prescription.instructions} />
              )}
            </SectionCard>
          )}

          {/* ── AI Investigations (view mode) ───────────────────────── */}
          {mode !== 'edit' && ai?.investigations && ai.investigations.length > 0 && (
            <SectionCard title="AI Recommended Tests">
              {ai.investigations.map((inv, idx) => (
                <View key={idx} className="flex-row items-start justify-between mb-2 p-2.5 bg-gray-50 rounded-xl">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs font-semibold text-gray-800">{inv.test}</Text>
                    {inv.reason ? <Text className="text-xs text-gray-500 mt-0.5">{inv.reason}</Text> : null}
                  </View>
                  <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: INV_URGENCY_BG[inv.urgency] ?? '#f3f4f6' }}
                  >
                    <Text className="text-xs font-bold" style={{ color: INV_URGENCY_COLORS[inv.urgency] ?? '#374151' }}>
                      {inv.urgency}
                    </Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          )}

          {/* ── Differential Diagnosis ──────────────────────────────── */}
          {mode !== 'edit' && <ConditionsSection conditions={ai?.conditions ?? []} />}

          {/* ── Risk Flags ──────────────────────────────────────────── */}
          {mode !== 'edit' && <RiskFlagsSection flags={ai?.riskFlags ?? []} />}

          {/* ── HPI ─────────────────────────────────────────────────── */}
          {mode !== 'edit' && ai?.hpi && <HPISection hpi={ai.hpi} />}

          {/* ── Case Timeline ────────────────────────────────────────── */}
          <SectionCard title="Case Timeline">
            <View className="bg-gray-50 rounded-xl p-3 mb-2">
              <Text className="text-xs font-semibold text-gray-500 mb-1">Patient-Reported Symptoms</Text>
              <Text className="text-xs text-gray-700 leading-5">
                {currentCase.description || 'No symptom description provided.'}
              </Text>
            </View>
            <View className="flex-row gap-4">
              <View>
                <Text className="text-xs text-gray-400">Created</Text>
                <Text className="text-xs text-gray-700 font-medium">
                  {safeFormatDate(currentCase.createdAt)}
                </Text>
              </View>
              <View>
                <Text className="text-xs text-gray-400">Last updated</Text>
                <Text className="text-xs text-gray-700 font-medium">
                  {safeFormatDate(currentCase.updatedAt)}
                </Text>
              </View>
            </View>

            {/* Rejection reason (read-only on Completed cases) */}
            {currentCase.rejectionReason ? (
              <View className="mt-3 bg-red-50 rounded-xl p-3">
                <Text className="text-xs font-semibold text-red-700 mb-1">Rejection Reason</Text>
                <Text className="text-xs text-red-600 leading-5">{currentCase.rejectionReason}</Text>
              </View>
            ) : null}
          </SectionCard>

          {/* ── Physician Recommendations (view mode) ────────────────── */}
          {mode !== 'edit' && (currentCase.physicianNotes || currentCase.physicianOutput || currentCase.physicianHealthTips) && (
            <SectionCard title="Physician Recommendations">
              {currentCase.physicianNotes ? (
                <View className="bg-green-50 rounded-xl p-3 mb-3">
                  <Text className="text-xs font-semibold text-green-700 mb-1">Clinical Notes</Text>
                  <Text className="text-xs text-green-800 leading-5">{currentCase.physicianNotes}</Text>
                </View>
              ) : null}
              {currentCase.physicianHealthTips ? (
                <View className="bg-teal-50 rounded-xl p-3 mb-3" style={{ borderWidth: 1, borderColor: '#99f6e4' }}>
                  <View className="flex-row items-center gap-1.5 mb-1.5">
                    <Ionicons name="sparkles" size={12} color="#0AADA2" />
                    <Text className="text-xs font-semibold text-teal-700">Patient Health Tips</Text>
                  </View>
                  <Text className="text-xs text-teal-900 leading-5">{currentCase.physicianHealthTips}</Text>
                </View>
              ) : null}
              {currentCase.physicianOutput?.prescription ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-600 mb-2">Recommended Medication</Text>
                  <InfoRow label="Medicine" value={currentCase.physicianOutput.prescription.medicine} />
                  <InfoRow label="Dosage" value={currentCase.physicianOutput.prescription.dosage} />
                  <InfoRow label="Frequency" value={currentCase.physicianOutput.prescription.frequency} />
                  <InfoRow label="Duration" value={currentCase.physicianOutput.prescription.duration} />
                  {currentCase.physicianOutput.prescription.instructions ? (
                    <InfoRow label="Instructions" value={currentCase.physicianOutput.prescription.instructions} />
                  ) : null}
                </View>
              ) : null}
              {currentCase.physicianOutput?.investigations && currentCase.physicianOutput.investigations.length > 0 ? (
                <View>
                  <Text className="text-xs font-semibold text-gray-600 mb-2">Recommended Tests</Text>
                  {currentCase.physicianOutput.investigations.map((inv, idx) => (
                    <View key={idx} className="flex-row items-start justify-between mb-2 p-2.5 bg-gray-50 rounded-xl">
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-semibold text-gray-800">{inv.test}</Text>
                        {inv.reason ? (
                          <Text className="text-xs text-gray-500 mt-0.5">{inv.reason}</Text>
                        ) : null}
                      </View>
                      <View
                        className="px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: INV_URGENCY_BG[inv.urgency] ?? '#f3f4f6' }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: INV_URGENCY_COLORS[inv.urgency] ?? '#374151' }}
                        >
                          {inv.urgency}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </SectionCard>
          )}

          {/* ── Patient History ──────────────────────────────────────── */}
          {currentPatient && (
            <SectionCard title="Patient Profile">
              <View className="flex-row flex-wrap gap-2 mb-3">
                {currentPatient.bloodType ? (
                  <View className="bg-red-50 rounded-full px-3 py-1">
                    <Text className="text-xs font-bold text-red-700">
                      🩸 {currentPatient.bloodType}
                    </Text>
                  </View>
                ) : null}
                {currentPatient.gender ? (
                  <View className="bg-purple-50 rounded-full px-3 py-1">
                    <Text className="text-xs font-bold text-purple-700">
                      {currentPatient.gender}
                    </Text>
                  </View>
                ) : null}
                {currentPatient.dob ? (
                  <View className="bg-gray-100 rounded-full px-3 py-1">
                    <Text className="text-xs text-gray-600">
                      {(() => {
                        const age = calculateAge(currentPatient.dob);
                        return age !== null
                          ? `${currentPatient.dob} · ${age} yrs`
                          : `DOB: ${currentPatient.dob}`;
                      })()}
                    </Text>
                  </View>
                ) : null}
              </View>
              <InfoRow label="Allergies" value={currentPatient.allergies} />
              <InfoRow label="Medications" value={currentPatient.currentMedications} />
              <InfoRow label="Medical History" value={currentPatient.medicalHistory} />
              <InfoRow label="Health History" value={currentPatient.healthHistory} />
              <InfoRow label="Emergency Contact" value={currentPatient.emergencyContact} />
              <InfoRow label="Phone" value={currentPatient.phone} />
            </SectionCard>
          )}

        </ScrollView>

        {/* ── Action Panel ──────────────────────────────────────────── */}
        {currentCase.status === 'Pending' && (
          <View
            className="bg-white border-t border-gray-100 px-4 pt-3 pb-5"
            style={{ elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 }}
          >
            <View className="bg-amber-50 rounded-xl p-3 flex-row items-center gap-2 mb-3">
              <Ionicons name="information-circle-outline" size={18} color="#b45309" />
              <Text className="text-amber-800 text-xs flex-1">
                This case is unassigned. Take it to begin your review.
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => router.replace('/(prof-tab)/caseQueue' as any)}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100"
              >
                <Ionicons name="list-outline" size={16} color="#4b5563" />
                <Text className="text-gray-700 font-semibold text-sm">Back to Queue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTakeCase}
                disabled={isSubmitting}
                className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-teal-600"
                style={{ flex: 2 }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="hand-right-outline" size={16} color="#fff" />
                    <Text className="text-white font-semibold text-sm">Take Case</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!isCompleted && currentCase.status === 'Active' && (
          <View
            className="bg-white border-t border-gray-100 px-4 pt-3 pb-5"
            style={{ elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8 }}
          >
            {/* VIEW mode */}
            {mode === 'view' && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setMode('edit')}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100"
                >
                  <Ionicons name="pencil-outline" size={16} color="#4b5563" />
                  <Text className="text-gray-700 font-semibold text-sm">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('reject')}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-red-50"
                >
                  <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                  <Text className="text-red-600 font-semibold text-sm">Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setNotes(currentCase.physicianNotes ?? ''); setMode('approve'); }}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl bg-green-600"
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text className="text-white font-semibold text-sm">Approve</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* EDIT mode */}
            {mode === 'edit' && (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setMode('view')}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                >
                  <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={isSubmitting}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-blue-600"
                  style={{ flex: 2 }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text className="text-white font-semibold text-sm">Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* APPROVE mode */}
            {mode === 'approve' && (
              <View>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 text-sm text-gray-800"
                  placeholder="Physician notes (optional)"
                  placeholderTextColor="#9ca3af"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => { setMode('view'); setNotes(''); }}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                  >
                    <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleApprove}
                    disabled={isSubmitting}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-green-600"
                    style={{ flex: 2 }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text className="text-white font-semibold text-sm">Confirm Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* REJECT mode */}
            {mode === 'reject' && (
              <View>
                <TextInput
                  className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-2 text-sm text-gray-800"
                  placeholder="Rejection reason (required) *"
                  placeholderTextColor="#f87171"
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3 text-sm text-gray-800"
                  placeholder="Additional notes (optional)"
                  placeholderTextColor="#9ca3af"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                  style={{ minHeight: 56, textAlignVertical: 'top' }}
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => { setMode('view'); setRejectionReason(''); setNotes(''); }}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                  >
                    <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReject}
                    disabled={isSubmitting || !rejectionReason.trim()}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{
                      flex: 2,
                      backgroundColor:
                        !rejectionReason.trim() ? '#fca5a5' : '#dc2626',
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={16} color="#fff" />
                        <Text className="text-white font-semibold text-sm">Confirm Reject</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Read-only banner for completed cases */}
        {isCompleted && (
          <View className="bg-gray-50 border-t border-gray-100 px-4 py-3 items-center">
            <Text className="text-gray-400 text-xs">
              This case is completed — no further actions are available.
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* ── Instant Message Modal ──────────────────────────────────────── */}
      {imVisible && currentCase && (
        <Modal
          visible={imVisible}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => setImVisible(false)}
        >
          <InstantMessageModal
            diagnosisId={currentCase.id}
            counterpartName={currentCase.patientName}
            perspective="physician"
            onClose={() => setImVisible(false)}
          />
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}
