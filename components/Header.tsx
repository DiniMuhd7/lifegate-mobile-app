import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileMenu } from './ProfileMenu';

interface HeaderProps {
  onProfilePress?: () => void;
  onMenuPress?: () => void;
  onSettingsPress?: () => void;
  onHelpPress?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onProfilePress,
  onMenuPress,
  onSettingsPress,
  onHelpPress,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleAvatarPress = () => {
    setShowProfileMenu(true);
    onProfilePress?.();
  };

  return (
    <>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
        {/* Avatar */}
          <View className="h-11 w-11 items-center justify-center rounded-full border-2 border-teal-700 bg-white/30">
            <Ionicons name="person" size={22} color="#1a6b5e" />
          </View>


         {/* hamburger menu */}
        <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7} className="p-1">
          <View className="h-11 w-11 items-center justify-center">
            <Ionicons name="menu" size={40} color="#1a6b5e" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Profile Menu */}
      <ProfileMenu
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        onProfilePress={onProfilePress}
        onSettingsPress={onSettingsPress}
        onHelpPress={onHelpPress}
        onLogout={onLogout}
      />
    </>
  );
};
