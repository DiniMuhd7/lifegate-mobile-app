import { ScrollView, View, Text, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';

const TEAL = '#0AADA2';
const LAST_UPDATED = 'May 6, 2026';

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

function Para({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={[{ fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 8 }, style]}>
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6, paddingRight: 8 }}>
      <Text style={{ fontSize: 14, color: TEAL, marginRight: 8, lineHeight: 22 }}>•</Text>
      <Text style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 6, marginTop: 4 }}>
      {children}
    </Text>
  );
}

export default function PolicyScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'Privacy Policy — LifeGate';
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = 'LifeGate Privacy Policy — How we collect, use, and protect your health data.';
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {router.canGoBack() && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>
            Privacy Policy
          </Text>
          <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
            Last updated: {LAST_UPDATED}
          </Text>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#f0fdfb',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={TEAL} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: insets.bottom + 40,
          maxWidth: 720,
          alignSelf: 'center',
          width: '100%',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View
          style={{
            backgroundColor: '#f0fdfb',
            borderRadius: 12,
            padding: 16,
            marginBottom: 28,
            borderLeftWidth: 3,
            borderLeftColor: TEAL,
          }}
        >
          <Text style={{ fontSize: 13, color: '#0d7c74', lineHeight: 20 }}>
            DSHub ("we", "us", or "our") operates LifeGate. This Privacy Policy explains how we
            collect, use, store, and protect your personal and health data. We are committed to
            compliance with the Nigeria Data Protection Act (NDPA) 2023 and applicable data
            protection regulations.
          </Text>
        </View>

        <Section title="1. Data Controller">
          <Para>
            The data controller for your personal information is:
          </Para>
          <Para style={{ fontWeight: '600', color: '#1e293b' } as any}>
            DSHub{'\n'}
            Email: contact@dshub.com.ng{'\n'}
            Website: https://lifegate.dshub.com.ng
          </Para>
        </Section>

        <Section title="2. Information We Collect">
          <SubHeading>2.1 Information You Provide Directly</SubHeading>
          <Bullet>Account registration details: name, email address, phone number, date of birth</Bullet>
          <Bullet>Health profile: blood type, genotype, allergies, current medications, emergency contact</Bullet>
          <Bullet>Symptom reports, health assessments, and clinical consultation content</Bullet>
          <Bullet>Payment information (processed via Flutterwave — we do not store card details)</Bullet>
          <Bullet>Feedback, support messages, and in-app communications</Bullet>

          <SubHeading>2.2 Information Collected Automatically</SubHeading>
          <Bullet>Device identifiers, operating system, and app version</Bullet>
          <Bullet>Usage data: screens visited, features used, session duration</Bullet>
          <Bullet>Push notification tokens (for delivering alerts)</Bullet>
          <Bullet>App performance and crash reports</Bullet>

          <SubHeading>2.3 Health & Clinical Data</SubHeading>
          <Para>
            We collect clinical data necessary to provide health services, including diagnosis
            reports, physician review notes, test results, and follow-up records. This data is
            classified as sensitive personal data and is afforded enhanced protection.
          </Para>
        </Section>

        <Section title="3. How We Use Your Data">
          <Para>We use your personal data to:</Para>
          <Bullet>Provide, operate, and maintain the LifeGate platform and its services</Bullet>
          <Bullet>Connect you with licensed physicians for clinical review and consultation</Bullet>
          <Bullet>Personalise health recommendations, video content, and platform experience</Bullet>
          <Bullet>Process payments and manage subscription credits</Bullet>
          <Bullet>Send transactional notifications, alerts, and health reminders</Bullet>
          <Bullet>Conduct safety monitoring, fraud detection, and abuse prevention</Bullet>
          <Bullet>Comply with legal obligations and regulatory requirements</Bullet>
          <Bullet>Improve platform features through aggregated, de-identified analytics</Bullet>
        </Section>

        <Section title="4. Legal Basis for Processing">
          <Para>We process your data on the following legal bases under the NDPA 2023:</Para>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Contract: </Text>
            Processing necessary to deliver the services you signed up for
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Consent: </Text>
            For optional features such as marketing communications and AI-personalised content
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Legal obligation: </Text>
            Where we are required to retain records for regulatory compliance
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Vital interests: </Text>
            For clinical safety monitoring where your health or safety may be at risk
          </Bullet>
        </Section>

        <Section title="5. Sharing Your Information">
          <Para>We do not sell your personal or health data. We may share it with:</Para>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Licensed physicians </Text>
            assigned to review your case — limited to data relevant to your active consultation
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Payment processors (Flutterwave) </Text>
            for transaction handling — governed by their own privacy policy
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Cloud infrastructure providers </Text>
            (hosting, database, storage) under data processing agreements
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Authorised admin personnel </Text>
            for safety, compliance, and audit purposes
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Law enforcement or regulators </Text>
            when required by a lawful court order or applicable Nigerian law
          </Bullet>
        </Section>

        <Section title="6. Data Retention">
          <Para>
            We retain your personal data for as long as your account is active and for a period
            thereafter as required by Nigerian law and our legitimate business purposes.
          </Para>
          <Bullet>Clinical consultation records are retained for a minimum of 5 years after the last interaction</Bullet>
          <Bullet>Payment transaction records are retained as required by financial regulations</Bullet>
          <Bullet>Account data is deleted within 90 days of a verified account deletion request, subject to legal holds</Bullet>
          <Para>
            Upon account deletion, data that is no longer required for legal or regulatory purposes
            is irreversibly purged from our systems.
          </Para>
        </Section>

        <Section title="7. Data Security">
          <Para>
            We implement technical and organisational measures to protect your data, including:
          </Para>
          <Bullet>Encrypted data transmission (TLS/HTTPS) between the app and our servers</Bullet>
          <Bullet>Encrypted storage for sensitive credentials and tokens</Bullet>
          <Bullet>Role-based access controls limiting data access to authorised personnel</Bullet>
          <Bullet>Regular security assessments and vulnerability monitoring</Bullet>
          <Para>
            No method of electronic transmission or storage is 100% secure. If you discover any
            security vulnerability, please report it immediately to contact@dshub.com.ng.
          </Para>
        </Section>

        <Section title="8. Your Rights Under the NDPA">
          <Para>
            As a data subject under the Nigeria Data Protection Act 2023, you have the right to:
          </Para>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Access: </Text>
            Request a copy of the personal data we hold about you
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Rectification: </Text>
            Request correction of inaccurate or incomplete data
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Erasure: </Text>
            Request deletion of your data where no legal basis exists for continued processing
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Restriction: </Text>
            Request that we limit how we process your data in certain circumstances
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Portability: </Text>
            Request your data in a structured, machine-readable format
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Objection: </Text>
            Object to processing based on legitimate interests or direct marketing
          </Bullet>
          <Bullet>
            <Text style={{ fontWeight: '600' }}>Withdraw consent: </Text>
            At any time, where processing is based on your consent
          </Bullet>
          <Para>
            To exercise any of these rights, contact us at contact@dshub.com.ng. We will respond
            within 30 days. You may also lodge a complaint with the Nigeria Data Protection
            Commission (NDPC).
          </Para>
        </Section>

        <Section title="9. Cookies & Tracking (Web)">
          <Para>
            The LifeGate web platform uses essential cookies and local storage to maintain your
            session and remember your preferences. We do not use cross-site tracking cookies.
          </Para>
          <Para>
            We use Google AdMob advertising services on the web platform, which may use cookies or
            similar technologies. You may opt out of personalised ads via Google's Ad Settings.
          </Para>
        </Section>

        <Section title="10. Children's Privacy">
          <Para>
            The Platform is not directed to children under the age of 18. We do not knowingly collect
            personal data from minors. If you believe a minor has provided us with personal data,
            contact us immediately at contact@dshub.com.ng.
          </Para>
        </Section>

        <Section title="11. Third-Party Services">
          <Para>
            The Platform integrates third-party services whose data practices are governed by their
            own privacy policies:
          </Para>
          <Bullet>Google Firebase — Push notifications and analytics</Bullet>
          <Bullet>YouTube — Educational video content playback</Bullet>
          <Bullet>Flutterwave — Payment processing</Bullet>
          <Bullet>Google AdMob — In-app and web advertising</Bullet>
          <Para>
            We encourage you to review the privacy policies of these services.
          </Para>
        </Section>

        <Section title="12. Changes to This Policy">
          <Para>
            We may update this Privacy Policy periodically. Material changes will be notified via
            in-app notification or email. The "Last updated" date at the top of this page reflects
            the most recent revision. Continued use of the Platform after updates constitutes
            acceptance of the revised policy.
          </Para>
        </Section>

        <Section title="13. Contact & Data Requests">
          <Para>
            For privacy enquiries, data access requests, or complaints:
          </Para>
          <Para style={{ fontWeight: '600', color: TEAL } as any}>
            DSHub — Data Privacy{'\n'}
            Email: contact@dshub.com.ng{'\n'}
            Website: https://lifegate.dshub.com.ng
          </Para>
        </Section>

        {/* Footer */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: '#e2e8f0',
            paddingTop: 20,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            © {new Date().getFullYear()} DSHub. All rights reserved.{'\n'}
            LifeGate is a product of DSHub.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
