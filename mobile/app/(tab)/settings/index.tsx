import { View, Text, ScrollView, Pressable, TouchableOpacity, Linking, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from 'stores/auth-store';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? '';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? '';

async function openUrl(url: string) {
  if (!url) return;
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else if (Platform.OS !== 'web') {
    Alert.alert('Cannot open link', url);
  }
}

const TEAL = '#0AADA2';
const TEAL_LIGHT = '#f0fdfb';
const TEAL_DARK = '#0d7c74';

type SectionItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  badge?: string;
  badgeColor?: string;
  danger?: boolean;
};

export default function SettingsScreen() {
  const { logout, user } = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleLabel =
    user?.role === 'professional'
      ? 'Healthcare Professional'
      : user?.role === 'admin'
      ? 'Administrator'
      : 'Patient';

  const sections: { title: string; color: string; items: SectionItem[] }[] = [
    {
      title: 'Account',
      color: '#0891b2',
      items: [
        {
          icon: 'person-outline',
          label: 'Manage Profile',
          sublabel: 'Edit name, photo & info',
          onPress: () => router.push('/(tab)/settings/profile'),
        },
        {
          icon: 'notifications-outline',
          label: 'Notifications',
          sublabel: 'Alerts & push preferences',
          onPress: () => router.push('/(tab)/settings/notification'),
        },
        {
          icon: 'card-outline',
          label: 'Subscription',
          sublabel: 'Credits & billing',
          onPress: () => router.push('/(tab)/settings/subscription'),
        },
      ],
    },
    {
      title: 'Health',
      color: '#0AADA2',
      items: [
        {
          icon: 'fitness-outline',
          label: 'Health Profile',
          sublabel: 'Blood type, allergies & medications',
          onPress: () => router.push('/(tab)/settings/manage-profile'),
        },
      ],
    },
    {
      title: 'Support',
      color: '#7c3aed',
      items: [
        {
          icon: 'mail-outline',
          label: 'About',
          sublabel: 'Learn about LifeGate',
          onPress: () => router.push('/(tab)/settings/contact-us'),
        },
        {
          icon: 'help-circle-outline',
          label: 'Help Center',
          sublabel: 'FAQs & guides',
          onPress: () => router.push('/(tab)/settings/help-center'),
        },
      ],
    },
    {
      title: 'Legal',
      color: '#6b7280',
      items: [
        {
          icon: 'document-text-outline',
          label: 'Terms & Conditions',
          sublabel: 'Read our terms of use',
          onPress: () => router.push('/terms'),
        },
        {
          icon: 'shield-checkmark-outline',
          label: 'Privacy Policy',
          sublabel: 'How we handle your data',
          onPress: () => router.push('/policy'),
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* ── Header ── */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 16,
          paddingHorizontal: 20,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' }}>Settings</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Sections ── */}
        {sections.map((section) => (
          <View key={section.title} style={{ marginHorizontal: 20, marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: 8,
                marginLeft: 4,
              }}
            >
              {section.title}
            </Text>
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#f3f4f6',
              }}
            >
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: idx < section.items.length - 1 ? 1 : 0,
                    borderBottomColor: '#f9fafb',
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: section.color + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Ionicons name={item.icon} size={19} color={section.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: item.danger ? '#dc2626' : '#111827' }}>
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.sublabel}</Text>
                    ) : null}
                  </View>
                  {item.badge ? (
                    <View
                      style={{
                        backgroundColor: item.badgeColor ?? TEAL,
                        borderRadius: 20,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        marginRight: 8,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{item.badge}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* ── Logout ── */}
        <View style={{ marginHorizontal: 20, marginTop: 4 }}>
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: '#fef2f2',
              borderWidth: 1,
              borderColor: '#fecaca',
              borderRadius: 16,
              paddingVertical: 14,
            }}
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#dc2626' }}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* ── Version ── */}
        <Text style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 24 }}>
          LifeGate v1.0.0 · Built by DSHub
        </Text>
      </ScrollView>
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}