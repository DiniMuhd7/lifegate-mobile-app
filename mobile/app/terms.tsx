import { ScrollView, View, Text, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';

const TEAL = '#0AADA2';
const LAST_UPDATED = 'May 26, 2026';

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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6, paddingRight: 8 }}>
      <Text style={{ fontSize: 14, color: TEAL, marginRight: 8, lineHeight: 22 }}>•</Text>
      <Text style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

export default function TermsScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'Terms & Conditions — LifeGate';
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = 'LifeGate Terms & Conditions — Read the terms governing your use of the LifeGate health platform.';
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
            Terms & Conditions
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
          <Ionicons name="document-text-outline" size={18} color={TEAL} />
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
            Please read these Terms & Conditions carefully before using the LifeGate platform. By
            creating an account or using our services, you agree to be bound by these terms.
          </Text>
        </View>

        <Section title="1. Acceptance of Terms">
          <Para>
            These Terms & Conditions ("Terms") govern your access to and use of the LifeGate mobile
            application and web platform ("Platform") operated by DSHub ("we", "us", or "our"). By
            accessing or using the Platform you confirm that you have read, understood, and agreed to
            these Terms and our Privacy Policy.
          </Para>
          <Para>
            If you do not agree to these Terms, you must not use the Platform. We reserve the right to
            update these Terms at any time. Continued use of the Platform after changes are published
            constitutes acceptance of the revised Terms.
          </Para>
        </Section>

        <Section title="2. Description of Service">
          <Para>
            LifeGate is a digital health platform that provides:
          </Para>
          <Bullet>AI-assisted symptom assessment and health triage support</Bullet>
          <Bullet>Connection to licensed physicians for clinical review and consultation</Bullet>
          <Bullet>Human physician AI-mode workflows that combine clinician oversight with AI support</Bullet>
          <Bullet>AI physician support tools for guided triage, summaries, and report drafting</Bullet>
          <Bullet>EDIS follow-up question flows that guide users toward a final clinical report</Bullet>
          <Bullet>Camera-based medical document scanning and OCR-assisted intake</Bullet>
          <Bullet>Voice messaging and audio-assisted symptom reporting</Bullet>
          <Bullet>Progressive Web App access with browser-based install support</Bullet>
          <Bullet>Push notifications, unread badges, and return-to-app reminders</Bullet>
          <Bullet>LifeGate public health analytics for de-identified trend monitoring and service improvement</Bullet>
          <Bullet>Health education content, videos, and wellness resources (Explore)</Bullet>
          <Bullet>Lifecoins reward system for health engagement activities</Bullet>
          <Bullet>Diagnostic report viewing, follow-up management, and messaging</Bullet>
          <Bullet>Health metric tracking and personalised health guidance</Bullet>
          <Para>
            The Platform is available on iOS, Android, and web. Features may vary by platform and
            subscription tier.
          </Para>
        </Section>

        <Section title="3. Medical Disclaimer">
          <View
            style={{
              backgroundColor: '#fff7ed',
              borderRadius: 10,
              padding: 14,
              marginBottom: 10,
              borderLeftWidth: 3,
              borderLeftColor: '#f97316',
            }}
          >
            <Text style={{ fontSize: 13, color: '#9a3412', lineHeight: 20, fontWeight: '600' }}>
              IMPORTANT — LifeGate is not a substitute for professional medical advice, diagnosis, or
              treatment. Always seek the guidance of your physician or other qualified health provider
              with any questions you may have regarding a medical condition.
            </Text>
          </View>
          <Para>
            In a medical emergency, call your local emergency services immediately. Do not use the
            Platform as your primary means of managing a life-threatening condition.
          </Para>
          <Para>
            AI-generated outputs, triage scores, and health recommendations on the Platform are
            decision-support tools only. Final clinical decisions are made by licensed physicians.
            LifeGate assumes no liability for clinical outcomes arising from user reliance on
            AI-generated content.
          </Para>
          <Para>
            Document scans, voice inputs, notification content, and all AI-assisted prompts are
            also support tools only. They are designed to help you reach a more complete clinical
            summary, not to replace a doctor’s judgement or urgent in-person care.
          </Para>
          <Para>
            Human physician AI-mode and AI physician tools remain subject to clinician oversight.
            Public health analytics are generated from aggregated or de-identified data and are not
            used to make individual medical decisions.
          </Para>
        </Section>

        <Section title="4. Eligibility & Registration">
          <Para>You must be at least 18 years old to create an account. By registering, you confirm that:</Para>
          <Bullet>All information you provide is accurate and up to date</Bullet>
          <Bullet>You will maintain the confidentiality of your account credentials</Bullet>
          <Bullet>You will not share your account with any third party</Bullet>
          <Bullet>You will notify us immediately of any unauthorised access</Bullet>
          <Para>
            We reserve the right to suspend or terminate accounts that violate these Terms or provide
            false information.
          </Para>
        </Section>

        <Section title="5. Subscription & Billing">
          <Para>
            Certain features of the Platform require purchased credits or an active subscription.
          </Para>
          <Bullet>Credits are non-transferable and expire according to the terms stated at purchase</Bullet>
          <Bullet>All payments are processed through our payment partners (Flutterwave) and are subject to their terms</Bullet>
          <Bullet>Refunds may be issued for verifiable failed transactions or duplicate debits, subject to review</Bullet>
          <Bullet>Subscription tiers and pricing may be updated with prior notice</Bullet>
          <Para>
            Contact support with your transaction reference for billing disputes. We aim to resolve
            payment issues within 5 business days.
          </Para>
        </Section>

        <Section title="6. Lifecoins & Rewards">
          <Para>
            Lifecoins are in-app reward points earned through qualifying health engagement activities.
          </Para>
          <Bullet>Lifecoins have no monetary value and cannot be exchanged for cash</Bullet>
          <Bullet>We reserve the right to modify, suspend, or discontinue the Lifecoins programme at any time</Bullet>
          <Bullet>Abuse of the reward system (e.g. automated bots, fake completions) will result in account suspension</Bullet>
          <Bullet>Redemption conditions and eligible activities are subject to change with notice</Bullet>
        </Section>

        <Section title="7. User Conduct">
          <Para>You agree not to:</Para>
          <Bullet>Submit false, misleading, or fraudulent health information</Bullet>
          <Bullet>Harass, threaten, or abuse physicians, staff, or other users</Bullet>
          <Bullet>Attempt to reverse-engineer, scrape, or exploit any part of the Platform</Bullet>
          <Bullet>Use automated tools or bots to interact with the Platform</Bullet>
          <Bullet>Upload malicious code, viruses, or any content intended to damage the Platform</Bullet>
          <Bullet>Violate any applicable law, regulation, or third-party right</Bullet>
        </Section>

        <Section title="8. Intellectual Property">
          <Para>
            All content, branding, design, software, and data on the Platform are the exclusive
            property of DSHub or its licensors. You are granted a limited, non-exclusive,
            non-transferable licence to use the Platform for personal, non-commercial purposes.
          </Para>
          <Para>
            You may not copy, modify, distribute, sell, or create derivative works from any Platform
            content without our prior written consent.
          </Para>
        </Section>

        <Section title="9. Third-Party Services">
          <Para>
            The Platform integrates third-party services including but not limited to YouTube (video
            content), Firebase and Expo Notifications (push alerts and badges), Flutterwave
            (payments), Google AdMob / AdSense (advertising), analytics tools, and AI providers
            used for triage, OCR, report generation, and public health insights. Your use of these
            services is subject to the respective third-party terms and privacy policies.
          </Para>
          <Para>
            We are not responsible for the content, accuracy, or practices of any third-party service.
          </Para>
        </Section>

        <Section title="10. Limitation of Liability">
          <Para>
            To the fullest extent permitted by law, DSHub shall not be liable for any indirect,
            incidental, consequential, or punitive damages arising from your use of the Platform,
            including but not limited to health outcomes, data loss, or service interruptions.
          </Para>
          <Para>
            Our total liability for any claim arising from the use of the Platform shall not exceed the
            amount you paid to us in the 12 months preceding the claim.
          </Para>
        </Section>

        <Section title="11. Termination">
          <Para>
            We reserve the right to suspend or permanently terminate your access to the Platform at
            any time, with or without notice, for violations of these Terms, fraudulent activity, or
            any conduct we determine to be harmful to users, physicians, or the Platform.
          </Para>
          <Para>
            You may delete your account at any time via Settings. Deletion is subject to applicable
            data retention requirements under Nigerian law.
          </Para>
        </Section>

        <Section title="12. Governing Law">
          <Para>
            These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute
            arising from these Terms shall be subject to the exclusive jurisdiction of the courts of
            Nigeria.
          </Para>
        </Section>

        <Section title="13. Contact Us">
          <Para>For questions about these Terms, contact us at:</Para>
          <Para style={{ fontWeight: '600', color: TEAL } as any}>
            DSHub — LifeGate Support{'\n'}
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
