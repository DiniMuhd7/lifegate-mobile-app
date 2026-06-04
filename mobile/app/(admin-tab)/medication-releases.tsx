/**
 * Admin — Medication Release Approval Queue
 *
 * Lists all patient medication release requests. Admins can approve individual
 * requests or bulk-approve all pending ones with a single tap.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AdminService } from '../../services/admin-service';
import type { MedicationReleaseRow } from '../../types/admin-types';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

// ── Release Request Card ──────────────────────────────────────────────────────

function ReleaseCard({
  item,
  onApprove,
  busy,
}: {
  item: MedicationReleaseRow;
  onApprove: () => void;
  busy: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Patient info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#e0f2fe',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Ionicons name="person-outline" size={20} color="#0369a1" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, color: '#1e293b' }}>
            {item.patientName || 'Unknown patient'}
          </Text>
          <Text style={{ fontSize: 12, color: '#64748b' }}>ID: {item.patientId}</Text>
        </View>
        {item.alreadyApproved && (
          <View
            style={{
              backgroundColor: '#dcfce7',
              borderRadius: 20,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
            <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600' }}>Approved</Text>
          </View>
        )}
      </View>

      {/* Condition & date */}
      <View style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: '#64748b' }}>Condition</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#1e293b', maxWidth: '60%', textAlign: 'right' }}>
            {item.condition || '—'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: '#64748b' }}>Requested</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#1e293b' }}>
            {formatDate(item.requestedAt)}
          </Text>
        </View>
      </View>

      {/* Approve button (only when pending) */}
      {!item.alreadyApproved && (
        <TouchableOpacity
          onPress={onApprove}
          disabled={busy}
          style={{
            backgroundColor: busy ? '#94a3b8' : '#0d9488',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="checkmark-outline" size={16} color="white" />
          )}
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
            {busy ? 'Approving…' : 'Approve'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MedicationReleasesScreen() {
  const [items, setItems] = useState<MedicationReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await AdminService.getMedicationReleases();
      setItems(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = items.filter((i) => !i.alreadyApproved);

  const handleApproveAll = () => {
    if (pending.length === 0) return;
    Alert.alert(
      'Approve All',
      `Approve all ${pending.length} pending medication release request(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          style: 'default',
          onPress: async () => {
            setApprovingAll(true);
            try {
              const { approved } = await AdminService.approveAllMedicationReleases();
              Alert.alert('Done', `${approved} request(s) approved.`);
              load(true);
            } catch {
              Alert.alert('Error', 'Failed to approve all requests. Please try again.');
            } finally {
              setApprovingAll(false);
            }
          },
        },
      ]
    );
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await AdminService.approveMedicationRelease(id);
      load(true);
    } catch {
      Alert.alert('Error', 'Failed to approve request. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

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
            Medication Releases
          </Text>
          <Text style={{ fontSize: 13, color: '#bae6fd' }}>
            {pending.length} pending
          </Text>
        </View>
        {pending.length > 0 && (
          <TouchableOpacity
            onPress={handleApproveAll}
            disabled={approvingAll}
            style={{
              backgroundColor: approvingAll ? '#64748b' : '#0d9488',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 7,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {approvingAll ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="checkmark-done-outline" size={16} color="white" />
            )}
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>
              Approve All
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0369a1" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#0369a1"
            />
          }
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="medical-outline" size={48} color="#94a3b8" />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#64748b', marginTop: 16 }}>
                No requests yet
              </Text>
              <Text style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
                When patients request early access to their medication recommendations, they will appear here.
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <ReleaseCard
                key={item.diagnosisId}
                item={item}
                onApprove={() => handleApprove(item.diagnosisId)}
                busy={busyId === item.diagnosisId}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
