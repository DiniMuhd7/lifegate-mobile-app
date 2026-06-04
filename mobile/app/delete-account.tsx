import { ScrollView, View, Text, Pressable, Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { openExternalUrl } from '@/utils/external-link';

const TEAL = '#0AADA2';
const RED  = '#DC2626';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6, paddingRight: 8 }}>
      <Text style={{ fontSize: 14, color: RED, marginRight: 8, lineHeight: 22 }}>•</Text>
      <Text style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'Delete Account — LifeGate';
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <View style={{
        backgroundColor: '#fff',
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        flexDirection: 'row',
        alignItems: 'center',
      }}>
        {Platform.OS !== 'web' && (
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ marginRight: 12 }}>
            <Ionicons name="chevron-back" size={24} color={TEAL} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a' }}>Delete Your Account</Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>LifeGate · com.dshub.lifegate</Text>
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="trash-outline" size={20} color={RED} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Warning banner */}
        <View style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, padding: 16, marginBottom: 28, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Ionicons name="warning" size={20} color={RED} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 14, color: '#991B1B', lineHeight: 22 }}>
            Account deletion is <Text style={{ fontWeight: '700' }}>permanent</Text> after a 90-day grace period. All health records, consultation history, and personal data will be erased and cannot be recovered.
          </Text>
        </View>

        {/* Option 1 — In-app */}
        <Section title="Option 1 — Delete from the App">
          <Para>If you have access to the LifeGate app, follow these steps:</Para>
          <Step n={1}>Open the LifeGate app and sign in.</Step>
          <Step n={2}>Tap the <Text style={{ fontWeight: '600' }}>Settings</Text> tab at the bottom of the screen.</Step>
          <Step n={3}>Tap <Text style={{ fontWeight: '600' }}>Account Settings</Text>.</Step>
          <Step n={4}>Scroll to the <Text style={{ fontWeight: '600' }}>Danger Zone</Text> section and tap <Text style={{ fontWeight: '600' }}>Delete Account</Text>.</Step>
          <Step n={5}>Confirm the deletion. Your account will be scheduled for permanent deletion in 90 days.</Step>
          <Para style={{ marginTop: 4, color: '#6b7280', fontSize: 13 }}>
            You can cancel the deletion at any time within the 90-day window by returning to Account Settings and tapping <Text style={{ fontWeight: '600' }}>Cancel Deletion</Text>.
          </Para>
        </Section>

        {/* Option 2 — Email */}
        <Section title="Option 2 — Request via Email">
          <Para>If you no longer have access to the app, send a deletion request to our support team:</Para>
          <Pressable
            onPress={() => { void openExternalUrl('mailto:support@dshub.com.ng?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20LifeGate%20account.%0A%0ARegistered%20email%3A%20'); }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FFFE', borderWidth: 1, borderColor: '#99F6E4', borderRadius: 10, padding: 14, marginBottom: 12, gap: 10 }}
          >
            <Ionicons name="mail-outline" size={18} color={TEAL} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: TEAL }}>support@dshub.com.ng</Text>
          </Pressable>
          <Para>Include the email address associated with your LifeGate account. We will process your request within <Text style={{ fontWeight: '600' }}>7 business days</Text> and send a confirmation email.</Para>
        </Section>

        {/* What gets deleted */}
        <Section title="What Gets Deleted">
          <Para>Upon permanent deletion, the following data is removed from our systems:</Para>
          <Bullet>Your name, email address, and phone number</Bullet>
          <Bullet>Health profile (blood type, genotype, allergies, medical history)</Bullet>
          <Bullet>All consultation and diagnosis history</Bullet>
          <Bullet>Chat transcripts and AI conversation data</Bullet>
          <Bullet>Payment history and LifeCoins wallet balance</Bullet>
          <Bullet>Push notification tokens and device records</Bullet>
        </Section>

        {/* What may be retained */}
        <Section title="Data That May Be Retained">
          <Para>
            Certain records may be retained for up to <Text style={{ fontWeight: '600' }}>90 days</Text> after the grace period ends to comply with legal obligations, resolve disputes, or prevent fraud, after which they are permanently purged.
          </Para>
        </Section>

        {/* Contact */}
        <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4 }}>Need help?</Text>
          <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 20 }}>
            Contact us at{' '}
            <Text
              style={{ color: TEAL, fontWeight: '600' }}
              onPress={() => { void openExternalUrl('mailto:support@dshub.com.ng'); }}
            >
              support@dshub.com.ng
            </Text>
            {' '}or visit our{' '}
            <Text
              style={{ color: TEAL, fontWeight: '600' }}
              onPress={() => router.push('/privacy' as any)}
            >
              Privacy Policy
            </Text>.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
