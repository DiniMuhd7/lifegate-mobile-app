import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useProfessionalStore } from '../../stores/professional-store';
import { PhysicianHeader } from '../../components/PhysicianHeader';
import type { CaseQueueItem } from '../../types/professional-types';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  Pending:   { color: '#d97706', bg: '#fffbeb', label: 'Pending' },
  Active:    { color: '#2563eb', bg: '#eff6ff', label: 'Active' },
  Completed: { color: '#16a34a', bg: '#f0fdf4', label: 'Completed' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Case conversation row ────────────────────────────────────────────────────

function CaseRow({ item }: { item: CaseQueueItem }) {
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.Pending;
  const initials = (item.patientName ?? 'P')[0].toUpperCase();

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/(prof-tab)/caseReview', params: { caseId: item.id } })
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: pressed ? '#f9fafb' : '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        gap: 12,
      })}
    >
      {/* Avatar */}
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: '#f0fdfa',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#ccfbf1',
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#0AADA2' }}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 3,
          }}
        >
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}
            numberOfLines={1}
          >
            {item.patientName ?? 'Unknown Patient'}
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 5 }} numberOfLines={1}>
          {item.title || item.symptomSnippet || 'No details provided'}
        </Text>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: cfg.bg,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 11, color: cfg.color, fontWeight: '600' }}>{cfg.label}</Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PhysicianChatScreen() {
  const { pendingCases, activeCases, completedCases, isQueueLoading, fetchCaseQueue } =
    useProfessionalStore();

  useEffect(() => {
    fetchCaseQueue();
  }, [fetchCaseQueue]);

  const onRefresh = useCallback(async () => {
    await fetchCaseQueue();
  }, [fetchCaseQueue]);

  // Most recent first across all statuses
  const allCases: CaseQueueItem[] = [...activeCases, ...pendingCases, ...completedCases]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <PhysicianHeader />

      {/* Title row */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
            Case Discussions
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            {allCases.length} case{allCases.length !== 1 ? 's' : ''} · tap to review
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(prof-tab)/caseQueue')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: '#f0fdfa',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Ionicons name="list-outline" size={14} color="#0AADA2" />
          <Text style={{ fontSize: 12, color: '#0AADA2', fontWeight: '600' }}>Queue</Text>
        </Pressable>
      </View>

      {isQueueLoading && allCases.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Loading cases…</Text>
        </View>
      ) : allCases.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="chatbubbles-outline" size={52} color="#d1d5db" />
          <Text style={{ marginTop: 14, fontSize: 16, fontWeight: '700', color: '#374151' }}>
            No cases yet
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
            Cases assigned to you will appear here for review and discussion.
          </Text>
        </View>
      ) : (
        <FlatList
          data={allCases}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CaseRow item={item} />}
          refreshControl={
            <RefreshControl
              refreshing={isQueueLoading}
              onRefresh={onRefresh}
              tintColor="#0AADA2"
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </SafeAreaView>
  );
}
