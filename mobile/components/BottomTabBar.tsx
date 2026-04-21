import { View, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';

export type TabBarTab = 'consultation' | 'chat' | 'review';

interface BottomTabBarProps {
  /** Optionally override the active tab. Defaults to pathname-based auto-detection. */
  currentTab?: TabBarTab;
  onTabChange?: (tab: TabBarTab) => void;
}

interface TabConfig {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const TABS: Record<TabBarTab, TabConfig> = {
  consultation: {
    label: 'Consultation',
    icon: 'heart',
    route: '/(prof-tab)/consultation',
  },
  chat: {
    label: 'Chat',
    icon: 'chatbubble-ellipses',
    route: '/(prof-tab)/chat',
  },
  review: {
    label: 'Review',
    icon: 'document-text',
    route: '/(prof-tab)/review',
  },
};

export const BottomTabBar = ({ currentTab, onTabChange }: BottomTabBarProps) => {
  const router = useRouter();
  const pathname = usePathname();

  // Derive active tab from the current pathname so it always reflects
  // the actual visible screen regardless of how navigation happened.
  const activeTab: TabBarTab = currentTab ?? (
    pathname.includes('/consultation') ? 'consultation'
    : pathname.includes('/chat') ? 'chat'
    : 'review'
  );

  const handleTabPress = (tab: TabBarTab) => {
    onTabChange?.(tab);
    // Use replace so the stack doesn't grow on every tab press.
    router.replace(TABS[tab].route as any);
  };

  return (
    <View className="flex-row border-t border-gray-200 bg-white">
      {(Object.entries(TABS) as [TabBarTab, TabConfig][]).map(([tabKey, tab]) => {
        const isActive = activeTab === tabKey;
        return (
          <Pressable
            key={tabKey}
            onPress={() => handleTabPress(tabKey)}
            className="flex-1 items-center justify-center py-4"
          >
            <Ionicons
              name={tab.icon}
              size={24}
              color={isActive ? '#0AADA2' : '#9E9E9E'}
            />
            <Text
              className={`text-xs mt-1 font-medium ${
                isActive ? 'text-teal-600' : 'text-gray-500'
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
