/**
 * DifferentialList
 *
 * Renders the EDIS ranked differential diagnosis list (conditions: ConditionScore[]).
 * Shows each condition with a confidence bar and brief clinical reasoning.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ConditionScore } from 'types/chat-types';

interface Props {
  conditions: ConditionScore[];
}

function confidenceColor(v: number): string {
  if (v >= 70) return '#16a34a';
  if (v >= 45) return '#d97706';
  return '#dc2626';
}

export const DifferentialList: React.FC<Props> = ({ conditions }) => {
  const [expanded, setExpanded] = useState(false);

  if (!conditions || conditions.length === 0) return null;

  const visible = expanded ? conditions : conditions.slice(0, 3);

  return (
    <View
      style={{
        marginTop: 8,
        borderRadius: 14,
        padding: 12,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#0f766e22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="list" size={13} color="#0f766e" />
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
          Differential Diagnosis
        </Text>
      </View>

      {visible.map((item, idx) => {
        const color = confidenceColor(item.confidence);
        return (
          <View key={idx} style={{ marginBottom: idx < visible.length - 1 ? 10 : 0 }}>
            {/* Name + confidence */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600', minWidth: 16 }}>
                  {idx + 1}.
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e293b', flex: 1 }} numberOfLines={1}>
                  {item.condition}
                </Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color, marginLeft: 8 }}>
                {item.confidence}%
              </Text>
            </View>
            {/* Confidence bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                <View style={{ width: `${item.confidence}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
              </View>
            </View>
            {/* Description */}
            {item.description ? (
              <Text style={{ fontSize: 11, color: '#64748b', lineHeight: 16, marginLeft: 21 }}>
                {item.description}
              </Text>
            ) : null}
          </View>
        );
      })}

      {conditions.length > 3 && (
        <TouchableOpacity
          onPress={() => setExpanded((p) => !p)}
          style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 2 }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 11, color: '#0f766e', fontWeight: '600' }}>
            {expanded ? 'Show less' : `Show ${conditions.length - 3} more`}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color="#0f766e" />
        </TouchableOpacity>
      )}
    </View>
  );
};
