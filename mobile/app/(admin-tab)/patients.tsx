/**
 * Admin — Patient Management
 *
 * Two features on one screen:
 *
 * 1. EXPORT — admin picks a date range (required) and downloads a CSV of all
 *    patients registered in that window, including blood group, genotype,
 *    height/weight/BMI, and test results. The native share sheet opens so
 *    the file can be saved or sent anywhere.
 *
 * 2. IMPORT — admin uploads a CSV file to bulk-update existing patients'
 *    blood group, genotype, height/weight (for BMI), and arbitrary test-result
 *    fields (hemoglobin, glucose, etc.). Rows are matched by email. New
 *    accounts are never created from the CSV. A per-row summary is shown after
 *    each import.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AdminService } from '../../services/admin-service';
import type { PatientImportSummary } from '../../types/admin-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Returns today's date in YYYY-MM-DD for the default "to" picker value. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns the date 30 days ago in YYYY-MM-DD for the default "from" value. */
function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Basic YYYY-MM-DD validation. */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

const HEALTH_FIELDS = [
  { key: 'subsidized_genotype_test', label: 'Subsidized Genotype Test', placeholder: 'e.g. AA / AS / SS or completed' },
  { key: 'vital_signs_check', label: 'Vital Signs Check', placeholder: 'e.g. BP 120/80, pulse 76' },
  { key: 'bmi', label: 'BMI Assessment', placeholder: 'e.g. 24.8' },
  { key: 'blood_group', label: 'Blood Group Test', placeholder: 'e.g. O+' },
  { key: 'packed_cell_volume', label: 'Packed Cell Volume', placeholder: 'e.g. 38%' },
  { key: 'malaria_test', label: 'Malaria Test', placeholder: 'e.g. Negative / Positive' },
  { key: 'hepatitis_screening', label: 'Hepatitis Screening', placeholder: 'e.g. HBsAg negative' },
  { key: 'hiv_screening', label: 'HIV Screening', placeholder: 'e.g. Non-reactive' },
] as const;

type HealthFieldKey = typeof HEALTH_FIELDS[number]['key'];

const emptyHealthFields = (): Record<HealthFieldKey, string> =>
  HEALTH_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {} as Record<HealthFieldKey, string>);

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionTitle({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: color + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon as never} size={16} color={color} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>{label}</Text>
    </View>
  );
}

function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: '600' }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#94a3b8"
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        style={{
          borderWidth: 1,
          borderColor: error ? '#ef4444' : '#e2e8f0',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
          color: '#1e293b',
          backgroundColor: '#f8fafc',
        }}
      />
    </View>
  );
}

// Import result summary card
function ImportResultCard({ summary }: { summary: PatientImportSummary }) {
  const [expanded, setExpanded] = useState(false);
  const failedRows = summary.results.filter((r) => r.status === 'error');

  return (
    <View
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: summary.failed > 0 ? '#fca5a5' : '#86efac',
        marginTop: 12,
      }}
    >
      {/* Summary bar */}
      <View
        style={{
          backgroundColor: summary.failed === 0 ? '#f0fdf4' : '#fef2f2',
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Ionicons
          name={summary.failed === 0 ? 'checkmark-circle' : 'warning'}
          size={22}
          color={summary.failed === 0 ? '#16a34a' : '#dc2626'}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 14, color: '#1e293b' }}>
            Import complete — {summary.totalRows} row{summary.totalRows !== 1 ? 's' : ''} processed
          </Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            <Text style={{ color: '#16a34a', fontWeight: '700' }}>{summary.updated} updated</Text>
            {summary.failed > 0 && (
              <Text style={{ color: '#dc2626', fontWeight: '700' }}>
                {'  '}·{'  '}{summary.failed} failed
              </Text>
            )}
          </Text>
        </View>
        {summary.failed > 0 && (
          <TouchableOpacity onPress={() => setExpanded((x) => !x)}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#64748b"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Error rows (collapsible) */}
      {expanded && failedRows.length > 0 && (
        <View style={{ backgroundColor: '#fff', padding: 10 }}>
          {failedRows.map((r) => (
            <View
              key={r.row}
              style={{
                flexDirection: 'row',
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <Text style={{ fontSize: 11, color: '#94a3b8', width: 30 }}>#{r.row}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1e293b' }}>
                  {r.email}
                </Text>
                <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                  {r.message}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PatientsScreen() {
  // ── Export state ──────────────────────────────────────────────────────────
  const [exportFrom, setExportFrom] = useState(thirtyDaysAgo());
  const [exportTo, setExportTo]     = useState(today());
  const [exporting, setExporting]   = useState(false);
  const [exportDateError, setExportDateError] = useState('');

  // ── Import state ──────────────────────────────────────────────────────────
  const [importing, setImporting]       = useState(false);
  const [importSummary, setImportSummary] = useState<PatientImportSummary | null>(null);

  // ── Direct health update state ───────────────────────────────────────────
  const [healthEmail, setHealthEmail] = useState('');
  const [healthFields, setHealthFields] = useState<Record<HealthFieldKey, string>>(emptyHealthFields);
  const [updatingHealth, setUpdatingHealth] = useState(false);

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    // Validate dates before hitting the network
    if (!isValidDate(exportFrom) || !isValidDate(exportTo)) {
      setExportDateError('Please enter valid dates in YYYY-MM-DD format.');
      return;
    }
    if (exportFrom > exportTo) {
      setExportDateError('"From" date must be before or equal to "To" date.');
      return;
    }
    setExportDateError('');
    setExporting(true);
    try {
      await AdminService.exportPatientsCSV(exportFrom, exportTo);
      // Share sheet opens inside exportPatientsCSV; nothing more to do here.
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Could not generate the CSV. Please try again.';
      Alert.alert('Export failed', msg);
    } finally {
      setExporting(false);
    }
  }, [exportFrom, exportTo]);

  // ── Import handler ────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setImportSummary(null);
    setImporting(true);
    try {
      const summary = await AdminService.importPatientsCSV();
      if (!summary) {
        // User cancelled the picker — nothing to do
        return;
      }
      setImportSummary(summary);
      if (summary.failed === 0) {
        Alert.alert(
          'Import complete',
          `${summary.updated} patient record${summary.updated !== 1 ? 's' : ''} updated successfully.`
        );
      } else {
        Alert.alert(
          'Import finished with errors',
          `${summary.updated} updated, ${summary.failed} failed. See details below.`
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'CSV upload failed. Please try again.';
      Alert.alert('Import failed', msg);
    } finally {
      setImporting(false);
    }
  }, []);

  // ── Direct health update handler ─────────────────────────────────────────
  const handleHealthUpdate = useCallback(async () => {
    const email = healthEmail.trim().toLowerCase();
    const fields = Object.fromEntries(
      Object.entries(healthFields)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value)
    ) as Record<string, string>;

    if (!email) {
      Alert.alert('Patient email required', 'Enter the patient email address to update.');
      return;
    }
    if (Object.keys(fields).length === 0) {
      Alert.alert('No health data entered', 'Enter at least one result before saving.');
      return;
    }

    setUpdatingHealth(true);
    try {
      await AdminService.updatePatientHealthData({ email, fields });
      Alert.alert('Health data updated', 'The patient health data has been saved.');
      setHealthFields(emptyHealthFields());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update patient health data.';
      Alert.alert('Update failed', msg);
    } finally {
      setUpdatingHealth(false);
    }
  }, [healthEmail, healthFields]);

  // ── CSV template helper ───────────────────────────────────────────────────
  const showTemplateInfo = () => {
    Alert.alert(
      'CSV format',
      'Your CSV must include an "email" column to match patients.\n\n' +
        'Supported columns (column names are case- and space-insensitive):\n\n' +
        '• email — used to match the patient (required)\n' +
        '• blood_group / bloodgroup\n' +
        '• genotype\n' +
        '• height_cm / height\n' +
        '• weight_kg / weight\n\n' +
        'Any other column (e.g. hemoglobin, glucose, cholesterol) is saved as a test result.\n\n' +
        'Only existing patients are updated — no new accounts are created.',
      [{ text: 'Got it' }]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f9ff' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 16,
          backgroundColor: '#0369a1',
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: 'white' }}>
            Patient Management
          </Text>
          <Text style={{ fontSize: 13, color: '#bae6fd' }}>
            Export registrations · bulk-update records
          </Text>
        </View>
        <Ionicons name="people-outline" size={22} color="#bae6fd" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── EXPORT SECTION ────────────────────────────────────────────── */}
        <SectionCard>
          <SectionTitle icon="download-outline" label="Export Registrations (CSV)" color="#0369a1" />

          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 18 }}>
            Download a CSV of all patients who registered in the selected date window. Includes
            name, email, blood group, genotype, BMI inputs, and lab results.
          </Text>

          {/* Date range row */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 6 }}>
            <DateField
              label="From (YYYY-MM-DD)"
              value={exportFrom}
              onChange={(v) => { setExportFrom(v); setExportDateError(''); }}
              error={!!exportDateError}
            />
            <DateField
              label="To (YYYY-MM-DD)"
              value={exportTo}
              onChange={(v) => { setExportTo(v); setExportDateError(''); }}
              error={!!exportDateError}
            />
          </View>

          {exportDateError ? (
            <Text style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>
              {exportDateError}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
              Both dates are required. Date range is inclusive.
            </Text>
          )}

          <TouchableOpacity
            onPress={handleExport}
            disabled={exporting}
            style={{
              backgroundColor: exporting ? '#94a3b8' : '#0369a1',
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="download-outline" size={18} color="white" />
            )}
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>
              {exporting ? 'Preparing CSV…' : 'Export to CSV'}
            </Text>
          </TouchableOpacity>
        </SectionCard>

        {/* ── IMPORT SECTION ────────────────────────────────────────────── */}
        <SectionCard>
          <SectionTitle icon="cloud-upload-outline" label="Import Patient Data (CSV)" color="#0d9488" />

          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 18 }}>
            Upload a CSV to bulk-update existing patients' blood group, genotype, height/weight,
            and other test results (hemoglobin, glucose, etc.). Patients are matched by{' '}
            <Text style={{ fontWeight: '700', color: '#1e293b' }}>email address</Text>. Rows with
            unrecognised emails are skipped — no new accounts are created.
          </Text>

          {/* CSV format hint */}
          <TouchableOpacity
            onPress={showTemplateInfo}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#f0fdf4',
              borderRadius: 10,
              padding: 10,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: '#86efac',
            }}
          >
            <Ionicons name="information-circle-outline" size={16} color="#16a34a" />
            <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '600', flex: 1 }}>
              Tap to see the expected CSV column format
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#15803d" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleImport}
            disabled={importing}
            style={{
              backgroundColor: importing ? '#94a3b8' : '#0d9488',
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {importing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color="white" />
            )}
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>
              {importing ? 'Uploading…' : 'Choose CSV & Upload'}
            </Text>
          </TouchableOpacity>

          {/* Per-row import summary */}
          {importSummary && <ImportResultCard summary={importSummary} />}
        </SectionCard>


        {/* ── DIRECT HEALTH UPDATE SECTION ─────────────────────────────── */}
        <SectionCard>
          <SectionTitle icon="medkit-outline" label="Update Patient Health Data" color="#7c3aed" />

          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 18 }}>
            Enter a patient email address and save individual screening results directly from the
            admin dashboard. Blank fields are ignored.
          </Text>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: '600' }}>
              Patient email
            </Text>
            <TextInput
              value={healthEmail}
              onChangeText={setHealthEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="patient@example.com"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: '#1e293b',
                backgroundColor: '#f8fafc',
              }}
            />
          </View>

          {HEALTH_FIELDS.map((field) => (
            <View key={field.key} style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: '#475569', marginBottom: 4, fontWeight: '600' }}>
                {field.label}
              </Text>
              <TextInput
                value={healthFields[field.key]}
                onChangeText={(value) => setHealthFields((prev) => ({ ...prev, [field.key]: value }))}
                placeholder={field.placeholder}
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: '#1e293b',
                  backgroundColor: '#f8fafc',
                }}
              />
            </View>
          ))}

          <TouchableOpacity
            onPress={handleHealthUpdate}
            disabled={updatingHealth}
            style={{
              backgroundColor: updatingHealth ? '#94a3b8' : '#7c3aed',
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            {updatingHealth ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="save-outline" size={18} color="white" />
            )}
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>
              {updatingHealth ? 'Saving…' : 'Save Health Data'}
            </Text>
          </TouchableOpacity>
        </SectionCard>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
        <SectionCard style={{ backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Ionicons name="bulb-outline" size={18} color="#b45309" />
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#92400e' }}>
              Typical workflow
            </Text>
          </View>
          {[
            ['1', 'Export all patients for a registration period to get the email list.'],
            ['2', 'Fill in the exported file with lab results, blood group, genotype, etc.'],
            ['3', 'Re-upload the filled CSV using "Choose CSV & Upload" above.'],
            ['4', 'The results page shows which rows succeeded and which were skipped.'],
          ].map(([step, text]) => (
            <View
              key={step}
              style={{ flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#fbbf24',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#78350f' }}>{step}</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#78350f', flex: 1, lineHeight: 18 }}>
                {text}
              </Text>
            </View>
          ))}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
