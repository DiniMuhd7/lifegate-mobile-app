import React, { useCallback } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VerifiedPhysician } from 'types/chat-types';

interface PhysicianPreviewListProps {
  physicians: VerifiedPhysician[];
}

// ---------------------------------------------------------------------------
// Card — memoized so re-renders of the parent list don't recreate every card
// ---------------------------------------------------------------------------
const PhysicianCard = React.memo<{ physician: VerifiedPhysician }>(({ physician }) => (
  <View
    style={{
      width: 140,
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
export const PhysicianPreviewList: React.FC<PhysicianPreviewListProps> = ({ physicians }) => {
  // Never render an inline empty-state card — if there are no physicians, the AI
  // text response already guides the patient. Only render when we have real cards.
  if (!physicians || physicians.length === 0) {
    return null;
  }

  const renderCard = useCallback(
    ({ item }: { item: VerifiedPhysician }) => <PhysicianCard physician={item} />,
    [],
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
