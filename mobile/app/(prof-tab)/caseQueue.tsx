import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProfessionalStore } from '../../stores/professional-store';
import { CaseCard } from '../../components/CaseCard';
import { CaseQueueItem } from '../../types/professional-types';

type Tab = 'Pending' | 'Active' | 'Completed';
const TABS: Tab[] = ['Pending', 'Active', 'Completed'];

const TAB_COUNT_COLORS: Record<Tab, string> = {
  Pending: 'bg-purple-100 text-purple-700',
  Active: 'bg-blue-100 text-blue-700',
  Completed: 'bg-green-100 text-green-700',
};

export default function CaseQueueScreen() {
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();

  const { pendingCases, activeCases, completedCases, isQueueLoading, fetchCaseQueue, takeCase } =
    useProfessionalStore();

  const [activeTab, setActiveTab] = useState<Tab>('Pending');
  const [takingId, setTakingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCaseQueue();
  }, [fetchCaseQueue]);

  // If launched from a notification with a caseId, switch to the tab that contains it
  useEffect(() => {
    if (!caseId) return;
    const isActive = activeCases.some((c) => c.id === caseId);
    const isCompleted = completedCases.some((c) => c.id === caseId);
    if (isActive) setActiveTab('Active');
    else if (isCompleted) setActiveTab('Completed');
    else setActiveTab('Pending');
  }, [caseId, activeCases, completedCases]);

  const cases = activeTab === 'Pending' ? pendingCases : activeTab === 'Active' ? activeCases : completedCases;

  const handleTakeCase = useCallback(
    async (id: string) => {
      setTakingId(id);
      try {
        await takeCase(id);
        setActiveTab('Active');
      } catch (err: any) {
        Alert.alert('Could not take case', err?.message ?? 'Please try again.');
      } finally {
        setTakingId(null);
      }
    },
    [takeCase]
  );

  const handlePress = useCallback(
    (id: string) => {
      // Navigate to consultation detail — using existing consultation screen pattern
      router.push({ pathname: '/(prof-tab)/consultation', params: { caseId: id } });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: CaseQueueItem }) => (
      <CaseCard
        item={item}
        onTakeCase={activeTab === 'Pending' ? handleTakeCase : undefined}
        onPress={handlePress}
        isTaking={takingId === item.id}
      />
    ),
    [activeTab, handleTakeCase, handlePress, takingId]
  );

  const countFor = (tab: Tab) =>
    tab === 'Pending' ? pendingCases.length : tab === 'Active' ? activeCases.length : completedCases.length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900">Case Queue</Text>
        <Text className="text-sm text-gray-500 mt-0.5">Manage and review patient cases</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 gap-2 mb-3">
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          const count = countFor(tab);
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`flex-1 flex-row items-center justify-center gap-1 py-2 rounded-xl ${
                isActive ? 'bg-blue-600' : 'bg-white'
              }`}
              style={
                isActive
                  ? undefined
                  : { elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 }
              }
            >
              <Text
                className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-600'}`}
              >
                {tab}
              </Text>
              {count > 0 && (
                <View
                  className={`px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/30' : TAB_COUNT_COLORS[tab].split(' ')[0]
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isActive ? 'text-white' : TAB_COUNT_COLORS[tab].split(' ')[1]
                    }`}
                  >
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Case List */}
      <FlatList
        data={cases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isQueueLoading}
            onRefresh={fetchCaseQueue}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Text className="text-4xl mb-4">
              {activeTab === 'Pending' ? '📋' : activeTab === 'Active' ? '🩺' : '✅'}
            </Text>
            <Text className="text-gray-500 text-sm">
              {isQueueLoading ? 'Loading cases…' : `No ${activeTab.toLowerCase()} cases`}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
