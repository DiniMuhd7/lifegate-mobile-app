import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Prescription } from 'types/chat-types';

interface PrescriptionCardProps {
  prescription: Prescription;
}

export const PrescriptionCard: React.FC<PrescriptionCardProps> = ({ prescription }) => {
  const rows = [
    { label: 'Dosage', value: prescription.dosage },
    { label: 'Frequency', value: prescription.frequency },
    { label: 'Duration', value: prescription.duration },
  ].filter((r) => r.value);

  return (
    <View
      style={{
        marginTop: 8,
        borderRadius: 14,
        padding: 12,
        backgroundColor: '#f0fdfa',
        borderWidth: 1.5,
        borderColor: '#5eead4',
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
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
          <Ionicons name="medkit" size={13} color="#0f766e" />
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
          Suggested Medication
        </Text>
      </View>

      {/* Medicine name */}
      <Text
        style={{ fontSize: 13.5, fontWeight: '700', color: '#134e4a', marginBottom: 8 }}
      >
        {prescription.medicine}
      </Text>

      {/* Detail rows */}
      {rows.map((item) => (
        <View
          key={item.label}
          style={{ flexDirection: 'row', gap: 8, marginBottom: 3, alignItems: 'flex-start' }}
        >
          <Text
            style={{ fontSize: 11, color: '#0f766e', fontWeight: '600', width: 62 }}
          >
            {item.label}
          </Text>
          <Text style={{ fontSize: 11, color: '#374151', flex: 1 }}>{item.value}</Text>
        </View>
      ))}

      {/* Instructions */}
      {prescription.instructions ? (
        <View
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: '#99f6e4',
          }}
        >
          <Text style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', lineHeight: 16 }}>
            {prescription.instructions}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
