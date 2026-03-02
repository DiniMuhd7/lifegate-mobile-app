import React from 'react';
import { View, TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ProfileMenuProps {
  visible: boolean;
  onClose: () => void;
  onProfilePress?: () => void;
  onSettingsPress?: () => void;
  onHelpPress?: () => void;
  onLogout?: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  visible,
  onClose,
  onProfilePress,
  onSettingsPress,
  onHelpPress,
  onLogout,
}) => {
  const handleMenuItemPress = (callback?: () => void) => {
    onClose();
    callback?.();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1" onPress={onClose}>
        <View className="flex-1 justify-start pt-10 pr-5 items-end">
          <View className="bg-white rounded-lg shadow-md overflow-hidden" style={{ width: 180 }}>
            {/* Profile Option */}
            <TouchableOpacity
              onPress={() => handleMenuItemPress(onProfilePress)}
              className="px-4 py-3 flex-row items-center border-b border-gray-200"
            >
              <Ionicons name="person-outline" size={18} color="#0AADA2" />
              <Text className="ml-3 text-gray-700">My Profile</Text>
            </TouchableOpacity>

            {/* Settings Option */}
            <TouchableOpacity
              onPress={() => handleMenuItemPress(onSettingsPress)}
              className="px-4 py-3 flex-row items-center border-b border-gray-200"
            >
              <Ionicons name="settings-outline" size={18} color="#0AADA2" />
              <Text className="ml-3 text-gray-700">Settings</Text>
            </TouchableOpacity>

            {/* Help Option */}
            <TouchableOpacity
              onPress={() => handleMenuItemPress(onHelpPress)}
              className="px-4 py-3 flex-row items-center border-b border-gray-200"
            >
              <Ionicons name="help-circle-outline" size={18} color="#0AADA2" />
              <Text className="ml-3 text-gray-700">Help & Support</Text>
            </TouchableOpacity>

            {/* Logout Option */}
            <TouchableOpacity
              onPress={() => handleMenuItemPress(onLogout)}
              className="px-4 py-3 flex-row items-center"
            >
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              <Text className="ml-3 text-red-500 font-semibold">Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};
