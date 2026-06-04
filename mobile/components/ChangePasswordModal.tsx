import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LabeledInput } from './LabeledInput';

interface ChangePasswordModalProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSave: (values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => void;
}

function HintRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={13}
        color={ok ? '#0EA5A4' : '#9CA3AF'}
      />
      <Text style={{ marginLeft: 7, fontSize: 12, color: ok ? '#0B8E8D' : '#94A3B8' }}>
        {label}
      </Text>
    </View>
  );
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  visible,
  loading,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const hints = {
    minLength: form.newPassword.length >= 8,
    hasUpper: /[A-Z]/.test(form.newPassword),
    hasLower: /[a-z]/.test(form.newPassword),
    hasNumber: /\d/.test(form.newPassword),
    matches:
      form.newPassword.length > 0 && form.newPassword === form.confirmPassword,
  };
  const isValid =
    form.currentPassword.trim().length > 0 &&
    hints.minLength &&
    hints.matches;

  const handleSave = () => {
    if (!isValid) return;
    onSave(form);
  };

  const handleClose = () => {
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fff', padding: 24, paddingBottom: 32 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#1F2937' }}>Change Password</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 340 }}
            contentContainerStyle={{ paddingBottom: 8 }}>
            <LabeledInput
              label="Current Password"
              required
              secureToggle
              placeholder="Enter current password"
              value={form.currentPassword}
              onChangeText={(text) => setForm({ ...form, currentPassword: text })}
            />

            <LabeledInput
              label="New Password"
              required
              secureToggle
              placeholder="Enter new password"
              value={form.newPassword}
              onChangeText={(text) => setForm({ ...form, newPassword: text })}
            />

            {/* Password hints */}
            {form.newPassword.length > 0 && (
              <View style={{ backgroundColor: '#F7FAFA', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <HintRow label="At least 8 characters" ok={hints.minLength} />
                <HintRow label="Uppercase letter (A–Z)" ok={hints.hasUpper} />
                <HintRow label="Lowercase letter (a–z)" ok={hints.hasLower} />
                <HintRow label="Number (0–9)" ok={hints.hasNumber} />
              </View>
            )}

            <LabeledInput
              label="Confirm New Password"
              required
              secureToggle
              placeholder="Confirm new password"
              value={form.confirmPassword}
              onChangeText={(text) => setForm({ ...form, confirmPassword: text })}
            />

            {/* Match hint */}
            {form.confirmPassword.length > 0 && (
              <View style={{ paddingHorizontal: 2, marginBottom: 4, marginTop: -6 }}>
                <HintRow label="Passwords match" ok={hints.matches} />
              </View>
            )}
          </ScrollView>

          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity
              onPress={handleClose}
              style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff', paddingVertical: 13 }}>
              <Text style={{ textAlign: 'center', fontWeight: '600', color: '#374151' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={loading || !isValid}
              style={{ flex: 1, borderRadius: 10, backgroundColor: isValid ? '#0D9488' : '#99D6D3', paddingVertical: 13 }}>
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ textAlign: 'center', fontWeight: '600', color: '#fff' }}>Update</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
