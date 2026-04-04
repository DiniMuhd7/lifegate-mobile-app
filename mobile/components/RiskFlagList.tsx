/**
 * RiskFlagList
 *
 * Renders EDIS early-stage risk flags (riskFlags: RiskFlag[]) as colored
 * alert rows beneath the AI message.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiskFlag } from 'types/chat-types';

const SEVERITY_CONFIG = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'information-circle' as const },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'warning'             as const },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'alert-circle'        as const },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe', icon: 'pulse'               as const },
} as const;

// Convert "EARLY_INFECTION_RISK" → "Early Infection Risk"
function humanizeFlag(flag: string): string {
  return flag
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface Props {
  riskFlags: RiskFlag[];
}

export const RiskFlagList: React.FC<Props> = ({ riskFlags }) => {
  if (!riskFlags || riskFlags.length === 0) return null;

  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      {riskFlags.map((rf, idx) => {
        const cfg = SEVERITY_CONFIG[rf.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.MEDIUM;
        return (
          <View
            key={idx}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              borderRadius: 12,
              padding: 10,
              backgroundColor: cfg.bg,
              borderWidth: 1,
              borderColor: cfg.border,
            }}
          >
            <Ionicons name={cfg.icon} size={16} color={cfg.color} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: cfg.color }}>
                  {humanizeFlag(rf.flag)}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 8,
                    backgroundColor: cfg.color + '22',
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {rf.severity}
                  </Text>
                </View>
              </View>
              {rf.description ? (
                <Text style={{ fontSize: 11, color: '#475569', lineHeight: 16 }}>
                  {rf.description}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};
