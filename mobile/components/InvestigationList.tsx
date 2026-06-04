import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Investigation } from 'types/chat-types';

const URGENCY_CFG = {
  STAT: { label: 'STAT', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'alert-circle' as const },
  URGENT: { label: 'Urgent', color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'time' as const },
  ROUTINE: { label: 'Routine', color: '#0891b2', bg: '#e0f2fe', border: '#bae6fd', icon: 'flask' as const },
};

interface InvestigationListProps {
  investigations: Investigation[];
}

export const InvestigationList: React.FC<InvestigationListProps> = ({ investigations }) => {
  if (!investigations || investigations.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 10,
        borderRadius: 12,
        backgroundColor: '#f0fdf9',
        borderWidth: 1,
        borderColor: '#99f6e4',
        padding: 10,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="beaker-outline" size={15} color="#0f766e" />
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#0f766e', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Recommended Tests
        </Text>
      </View>

      {/* Test rows */}
      {investigations.map((inv, idx) => {
        const cfg = URGENCY_CFG[inv.urgency as keyof typeof URGENCY_CFG] ?? URGENCY_CFG.ROUTINE;
        return (
          <View
            key={idx}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              paddingVertical: 7,
              borderTopWidth: idx > 0 ? 1 : 0,
              borderTopColor: '#ccfbf1',
              gap: 8,
            }}
          >
            {/* Icon */}
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: cfg.bg,
                borderWidth: 1,
                borderColor: cfg.border,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <Ionicons name={cfg.icon} size={14} color={cfg.color} />
            </View>

            {/* Text */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{inv.test}</Text>
                <View
                  style={{
                    backgroundColor: cfg.bg,
                    borderRadius: 20,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderWidth: 1,
                    borderColor: cfg.border,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 15 }}>{inv.reason}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};
