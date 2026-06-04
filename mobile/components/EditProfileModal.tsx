import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LabeledInput } from './LabeledInput';

interface EditProfileModalProps {
  visible: boolean;
  initialValues: {
    firstName: string;
    lastName: string;
    phone: string;
  };
  loading?: boolean;
  onClose: () => void;
  onSave: (values: { firstName: string; lastName: string; phone: string }) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  initialValues,
  loading,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState(initialValues);

  useEffect(() => {
    if (visible) setForm(initialValues);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return;
    }
    onSave(form);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-3xl bg-white p-6 pb-8">
          {/* Header */}
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-gray-800">Edit Profile</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
            <LabeledInput
              label="First Name"
              required
              placeholder="First Name"
              value={form.firstName}
              onChangeText={(text) => setForm({ ...form, firstName: text })}
            />

            <LabeledInput
              label="Last Name"
              required
              placeholder="Last Name"
              value={form.lastName}
              onChangeText={(text) => setForm({ ...form, lastName: text })}
            />

            <LabeledInput
              label="Phone Number"
              placeholder="Phone Number"
              keyboardType="phone-pad"
              value={form.phone}
              onChangeText={(text) => setForm({ ...form, phone: text })}
            />

            {/* Info Text */}
            <View className="rounded-lg bg-gray-100 p-3">
              <Text className="text-xs text-gray-600">
                <Text className="font-semibold">Note:</Text> Email and Professional Information
                cannot be changed.
              </Text>
            </View>
          </ScrollView>

          {/* Buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-3">
              <Text className="text-center font-semibold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={loading}
              className="flex-1 rounded-lg bg-teal-600 py-3">
              <Text className="text-center font-semibold text-white">Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
