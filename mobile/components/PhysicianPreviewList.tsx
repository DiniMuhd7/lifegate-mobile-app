import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VerifiedPhysician } from 'types/chat-types';

interface PhysicianPreviewListProps {
  physicians: VerifiedPhysician[];
  /** If present, call buttons are shown on each physician card. */
  diagnosisId?: string;
  onCallPress?: (physicianId: string, physicianName: string, callType: 'voice' | 'video') => void;
}

// ---------------------------------------------------------------------------
// Card — memoized so re-renders of the parent list don't recreate every card
// ---------------------------------------------------------------------------
const PhysicianCard = React.memo<{
  physician: VerifiedPhysician;
  diagnosisId?: string;
  onCallPress?: (physicianId: string, physicianName: string, callType: 'voice' | 'video') => void;
}>(({ physician, diagnosisId, onCallPress }) => (
  <View
    style={{
      width: 158,
      backgroundColor: '#ffffff',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1.5,
      borderColor: '#99f6e4',
      shadowColor: '#0d9488',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    }}
  >
    {/* Avatar placeholder */}
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ccfbf1',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        alignSelf: 'center',
      }}
    >
      <Ionicons name="person" size={22} color="#0f766e" />
    </View>

    {/* Name */}
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 3,
      }}
      numberOfLines={2}
    >
      Dr. {physician.name}
    </Text>

    {/* Specialization */}
    {physician.specialization ? (
      <Text
        style={{
          fontSize: 10,
          color: '#64748b',
          textAlign: 'center',
          lineHeight: 14,
          marginBottom: 8,
        }}
        numberOfLines={2}
      >
        {physician.specialization}
      </Text>
    ) : null}

    {/* MDCN verified badge */}
    {physician.isVerified && (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          backgroundColor: '#f0fdf4',
          borderRadius: 8,
          paddingHorizontal: 6,
          paddingVertical: 3,
          alignSelf: 'center',
        }}
      >
        <Ionicons name="shield-checkmark" size={10} color="#15803d" />
        <Text style={{ fontSize: 9, fontWeight: '700', color: '#15803d' }}>
          MDCN Verified
        </Text>
      </View>
    )}

    {/* Call buttons — only shown when a diagnosisId + callback are provided */}
    {diagnosisId && onCallPress && (
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        <TouchableOpacity
          onPress={() => onCallPress(physician.id, physician.name, 'voice')}
          activeOpacity={0.78}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: '#0f766e',
            borderRadius: 8,
            paddingVertical: 7,
          }}
        >
          <Ionicons name="call" size={13} color="#fff" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onCallPress(physician.id, physician.name, 'video')}
          activeOpacity={0.78}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: '#fff',
            borderWidth: 1.5,
            borderColor: '#0f766e',
            borderRadius: 8,
            paddingVertical: 7,
          }}
        >
          <Ionicons name="videocam" size={13} color="#0f766e" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#0f766e' }}>Video</Text>
        </TouchableOpacity>
      </View>
    )}
  </View>
));
PhysicianCard.displayName = 'PhysicianCard';

/**
 * PhysicianPreviewList
 *
 * Renders a horizontally scrollable row of MDCN-verified physician cards.
 * Displayed inline in the chat when the patient requests a physician
 * in Clinical Diagnosis mode.
 */
export const PhysicianPreviewList: React.FC<PhysicianPreviewListProps> = ({ physicians, diagnosisId, onCallPress }) => {
  // Never render an inline empty-state card — if there are no physicians, the AI
  // text response already guides the patient. Only render when we have real cards.
  if (!physicians || physicians.length === 0) {
    return null;
  }

  const renderCard = useCallback(
    ({ item }: { item: VerifiedPhysician }) => (
      <PhysicianCard physician={item} diagnosisId={diagnosisId} onCallPress={onCallPress} />
    ),
    [diagnosisId, onCallPress],
  );

  const keyExtractor = useCallback((item: VerifiedPhysician) => item.id, []);

  return (
    <View style={{ marginTop: 10 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: '#0f766e22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="people" size={13} color="#0f766e" />
        </View>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            color: '#0f766e',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Available Licensed Physicians
        </Text>
      </View>

      {/* Horizontally scrollable physician cards */}
      <FlatList
        horizontal
        data={physicians}
        keyExtractor={keyExtractor}
        renderItem={renderCard}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 4 }}
        removeClippedSubviews
      />

      {/* Footer note */}
      <Text
        style={{
          fontSize: 10,
          color: '#94a3b8',
          marginTop: 8,
          lineHeight: 14,
        }}
      >
        A physician has been notified and will review your case shortly.
      </Text>
    </View>
  );
};
