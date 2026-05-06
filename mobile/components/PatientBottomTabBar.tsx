import { View, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIMStore } from '../stores/im-store';

export type PatientTab = 'health' | 'profile' | 'settings';

interface PatientBottomTabBarProps {
  activeTab?: PatientTab;
}

interface TabConfig {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const TABS: Record<PatientTab, TabConfig> = {
  health: {
    label: 'Health',
    icon: 'heart-outline',
    activeIcon: 'heart',
    route: '/(tab)/health',
  },
  profile: {
    label: 'Profile',
    icon: 'person-outline',
    activeIcon: 'person',
    route: '/(tab)/profile',
  },
  settings: {
    label: 'Settings',
    icon: 'settings-outline',
    activeIcon: 'settings',
    route: '/(tab)/settings',
  },
};

export const PatientBottomTabBar = ({ activeTab }: PatientBottomTabBarProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Total unread IM messages across all conversations
  const imUnread = useIMStore((s) =>
    Object.values(s.conversations).reduce((sum, c) => sum + c.unreadCount, 0),
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        backgroundColor: '#fff',
        paddingBottom: insets.bottom,
      }}
    >      {(Object.entries(TABS) as [PatientTab, TabConfig][]).map(([tabKey, tab]) => {
        const isActive = activeTab !== undefined && activeTab === tabKey;
        const badgeCount = tabKey === 'profile' ? imUnread : 0;
        return (
          <Pressable
            key={tabKey}
            onPress={() => router.replace(tab.route as never)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={isActive ? tab.activeIcon : tab.icon}
                size={24}
                color={isActive ? '#0AADA2' : '#9E9E9E'}
              />
              {badgeCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: '#ef4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                    borderWidth: 1.5,
                    borderColor: '#fff',
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff', lineHeight: 12 }}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{
                fontSize: 11,
                marginTop: 4,
                fontWeight: '600',
                color: isActive ? '#0AADA2' : '#9E9E9E',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};