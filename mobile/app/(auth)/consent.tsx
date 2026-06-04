import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from 'components/Button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openExternalUrl } from '@/utils/external-link';

const PRIVACY_URL = 'https://lifegate.dshub.com.ng/privacy-policy';
const TERMS_URL = 'https://lifegate.dshub.com.ng/terms';
const NDPC_URL = 'https://ndpc.gov.ng';

// Section component for clean structure
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View className="mb-5">
    <Text className="mb-2 text-sm font-bold text-[#0EA5A4]">{title}</Text>
    <View>{children}</View>
  </View>
);

const Bullet = ({ text }: { text: string }) => (
  <View className="mb-1 flex-row items-start">
    <Text className="mr-2 text-xs text-gray-500">•</Text>
    <Text className="flex-1 text-xs leading-5 text-gray-700">{text}</Text>
  </View>
);

const Link = ({ label, url }: { label: string; url: string }) => (
  <Text
    className="text-xs font-semibold text-[#0EA5A4] underline"
    onPress={() => { void openExternalUrl(url); }}>
    {label}
  </Text>
);

export default function ConsentScreen() {
  const { role } = useLocalSearchParams<{ role: 'user' | 'professional' }>();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 32;
    if (isAtBottom && !hasScrolledToBottom) setHasScrolledToBottom(true);
  };

  const handleDecline = () => {
    router.back();
  };

  const handleAccept = () => {
    if (!agreed) return;
    if (role !== 'user' && role !== 'professional') {
      // Unexpected role param — abort rather than silently falling through
      router.back();
      return;
    }
    if (role === 'professional') {
      router.push('/(auth)/(health-professional)');
    } else {
      router.push('/(auth)/(user)');
    }
  };

  return (
    <SafeAreaView className="flex-1">
      <LinearGradient
        colors={['#0AADA2', '#043B3C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.25 }}
        style={{ flex: 1 }}>
        {/* Header */}
        <View className="flex-row items-center px-4 pb-5 pt-4">
          <Pressable onPress={() => router.back()} className="p-2">
            <Ionicons name="arrow-back" size={22} color="white" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-base font-bold text-white">Terms &amp; Conditions</Text>
            <Text className="mt-0.5 text-xs text-white/70">LifeGate by DSHub — Please read carefully</Text>
          </View>
          <View className="w-10" />
        </View>

        {/* Content card */}
        <View className="flex-1 overflow-hidden rounded-t-[32px] bg-[#F7FEFD]">
          {/* Scroll-to-read hint */}
          {!hasScrolledToBottom && (
            <View className="flex-row items-center justify-center border-b border-amber-100 bg-amber-50 px-4 py-2">
              <Ionicons name="arrow-down-circle-outline" size={15} color="#D97706" />
              <Text className="ml-1 text-xs font-medium text-amber-700">
                Scroll to read the full Terms &amp; Conditions before consenting
              </Text>
            </View>
          )}

          <ScrollView
            ref={scrollViewRef}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
            showsVerticalScrollIndicator={true}>

            {/* Badge */}
            <View className="mb-4 flex-row items-center self-start rounded-full bg-[#EDF9F9] px-3 py-1.5">
              <Ionicons name="document-text-outline" size={14} color="#0EA5A4" />
              <Text className="ml-1.5 text-xs font-semibold text-[#0EA5A4]">
                LifeGate by DSHub
              </Text>
            </View>

            <Text className="mb-1 text-lg font-bold text-gray-900">
              Terms &amp; Conditions
            </Text>
            <Text className="mb-5 text-xs leading-5 text-gray-500">
              Effective Date: January 1, 2026 · Last updated: May 1, 2026
            </Text>

            {/* ── PART A: TERMS OF USE ─────────────────────────────────── */}
            <View className="mb-4 rounded-xl bg-[#0EA5A4]/10 px-4 py-2">
              <Text className="text-sm font-extrabold tracking-wide text-[#0B7A79]">PART A — TERMS OF USE</Text>
            </View>

            {/* A1. Acceptance */}
            <Section title="A1. Acceptance of Terms">
              <Text className="text-xs leading-5 text-gray-500">
                Effective Date: January 1, 2026 · Last updated: May 26, 2026
                these Terms &amp; Conditions and all applicable laws. If you do not agree, you must
                not use the Service. These terms apply to all users — patients, health professionals,
                and administrators.
              </Text>
            </Section>

            {/* A2. The Service */}
            <Section title="A2. The LifeGate Service">
              <Text className="mb-2 text-xs leading-5 text-gray-700">
                LifeGate is a digital health platform operated by{' '}
                <Text className="font-semibold">DSHub</Text>. It provides:
              </Text>
              <Bullet text="AI-assisted symptom assessment and health guidance" />
              <Bullet text="Connection of patients with licensed Nigerian physicians" />
              <Bullet text="Human physician AI-mode workflows with clinician oversight" />
              <Bullet text="AI physician support tools for guided triage and report drafting" />
              <Bullet text="EDIS follow-up questions that continue triage until the final report is ready" />
              <Bullet text="Camera-based medical document scanning and OCR-assisted intake" />
              <Bullet text="Voice messaging and audio-assisted symptom reporting" />
              <Bullet text="Progressive Web App access with browser install support" />
              <Bullet text="Push notifications, unread badges, and return-to-app reminders" />
              <Bullet text="LifeGate public health analytics built from aggregated or de-identified data" />
              <Bullet text="Secure telemedicine consultations and diagnosis review" />
              <Bullet text="Health records management and follow-up tracking" />
              <Text className="mt-2 text-xs leading-5 text-gray-700">
                LifeGate is a support tool and does{' '}
                <Text className="font-bold">not</Text> replace in-person medical consultation,
                emergency services, or a formal doctor–patient relationship.
              </Text>
            </Section>

            {/* A3. Eligibility */}
            <Section title="A3. User Accounts &amp; Eligibility">
              <Bullet text="You must be at least 18 years old to register (or have verifiable parental/guardian consent)" />
              <Bullet text="You must provide accurate and up-to-date registration information" />
              <Bullet text="You are responsible for keeping your credentials confidential and for all activity under your account" />
              <Bullet text="One account per person; sharing accounts is prohibited" />
              <Bullet text="Health professionals must hold a valid MDCN licence and complete MDCN verification before providing consultations" />
            </Section>

            {/* A4. Patient Responsibilities */}
            <Section title="A4. Patient Responsibilities">
              <Bullet text="Provide honest, accurate symptom and health information" />
              <Bullet text="Use AI assessments as guidance, not definitive diagnosis" />
              <Bullet text="Seek emergency services (e.g. 112, nearest hospital) immediately if your condition is life-threatening" />
              <Bullet text="Comply with physician instructions and follow-up recommendations" />
              <Bullet text="Not use the platform to seek prescriptions for controlled substances without a legitimate clinical need" />
            </Section>

            {/* A5. Medical Disclaimer */}
            <Section title="A5. Medical Disclaimer">
              <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="mb-1 text-xs font-bold text-amber-800">⚠ Important</Text>
                <Text className="text-xs leading-5 text-amber-700">
                  AI-generated assessments are informational only and do not constitute a medical
                  diagnosis, prescription, or treatment plan. Always consult a qualified physician
                  for medical decisions. DSHub is not liable for actions taken solely on the basis
                  of AI-generated content.
                </Text>
              </View>
              <Text className="mt-2 text-xs leading-5 text-gray-700">
                Document scans, voice inputs, notification reminders, and follow-up prompts are
                designed to help complete your triage and support physician review. They do not
                replace emergency care or a licensed clinician’s judgement.
              </Text>
              <Text className="mt-2 text-xs leading-5 text-gray-700">
                Human physician AI-mode remains under clinician oversight, and public health
                analytics are produced from aggregated or de-identified data for service
                improvement, not for individual medical decision-making.
              </Text>
            </Section>

            {/* A6. Payments */}
            <Section title="A6. Payments &amp; Credits">
              <Bullet text="Consultation fees are charged in Nigerian Naira (₦) via Diagnosis credits" />
              <Bullet text="Payments are processed through Flutterwave; DSHub does not store card details" />
              <Bullet text="Fees are non-refundable once a physician has commenced a consultation" />
              <Bullet text="DSHub reserves the right to adjust pricing with 14 days' notice" />
            </Section>

            {/* A7. Intellectual Property */}
            <Section title="A7. Intellectual Property">
              <Text className="text-xs leading-5 text-gray-700">
                All content, branding, software, and AI models on LifeGate are the exclusive
                property of DSHub. You may not reproduce, resell, or create derivative works without
                written permission. User-generated content (e.g. symptom descriptions) remains yours,
                but you grant DSHub a licence to use it to provide and improve the Service.
              </Text>
            </Section>

            {/* A8. Termination */}
            <Section title="A8. Account Termination">
              <Text className="text-xs leading-5 text-gray-700">
                DSHub may suspend or terminate your account for violation of these terms, fraudulent
                activity, or any conduct that harms other users or the platform. You may delete your
                account at any time via Settings; data will be removed within 90 days per our
                retention policy (see §B6 below).
              </Text>
            </Section>

            {/* A9. Limitation of Liability */}
            <Section title="A9. Limitation of Liability">
              <Text className="text-xs leading-5 text-gray-700">
                To the maximum extent permitted by Nigerian law, DSHub shall not be liable for any
                indirect, incidental, or consequential damages arising from use of the Service,
                including clinical decisions based on AI outputs. Our total liability shall not
                exceed the amount paid by you in the 30 days preceding the claim.
              </Text>
            </Section>

            {/* A10. Governing Law */}
            <Section title="A10. Governing Law">
              <Text className="text-xs leading-5 text-gray-700">
                These Terms are governed by the laws of the Federal Republic of Nigeria. Any
                disputes shall be subject to the exclusive jurisdiction of the courts of Lagos State,
                Nigeria. Disputes may also be resolved via arbitration under the Lagos Court of
                Arbitration rules.
              </Text>
            </Section>

            {/* ── PART B: DATA PRIVACY NOTICE ──────────────────────────── */}
            <View className="mb-4 mt-4 rounded-xl bg-[#0EA5A4]/10 px-4 py-2">
              <Text className="text-sm font-extrabold tracking-wide text-[#0B7A79]">PART B — DATA PRIVACY NOTICE</Text>
            </View>

            <View className="mb-4 flex-row items-center self-start rounded-full bg-[#EDF9F9] px-3 py-1.5">
              <Ionicons name="shield-checkmark-outline" size={14} color="#0EA5A4" />
              <Text className="ml-1.5 text-xs font-semibold text-[#0EA5A4]">
                Nigeria Data Protection Act 2023
              </Text>
            </View>

            <Text className="mb-5 text-xs leading-5 text-gray-600">
              This Privacy Notice explains how DSHub collects, uses, and protects your personal data
              in compliance with the Nigeria Data Protection Act 2023 (NDPA).
            </Text>

            {/* B1. Data Controller */}
            <Section title="B1. Data Controller">
              <Text className="mb-1 text-xs leading-5 text-gray-700">
                <Text className="font-semibold">DSHub</Text> ("we", "us", or "our"), operating the
                LifeGate platform, is the data controller responsible for your personal data. We
                process your data in compliance with the{' '}
                <Text className="font-semibold">Nigeria Data Protection Act 2023 (NDPA)</Text> and
                the Nigeria Data Protection Regulation (NDPR) issued by the Nigeria Data Protection
                Commission (NDPC).
              </Text>
              <Text className="mt-1 text-xs text-gray-500">
                Contact:{' '}
                <Text
                  className="text-[#0EA5A4] underline"
                  onPress={() => { void openExternalUrl('mailto:privacy@dshub.com.ng'); }}>
                  privacy@dshub.com.ng
                </Text>
              </Text>
            </Section>

            {/* B2. Data Collected */}
            <Section title="B2. Personal Data We Collect">
              <Text className="mb-2 text-xs leading-5 text-gray-700">
                We collect the following categories of data when you register and use LifeGate:
              </Text>
              <Text className="mb-1 text-xs font-semibold text-gray-800">
                Standard Personal Data:
              </Text>
              <Bullet text="Full name, email address, phone number" />
              <Bullet text="Date of birth, gender, preferred language" />
              <Bullet text="Account credentials (stored in encrypted form)" />
              <Text className="mb-1 mt-3 text-xs font-semibold text-red-700">
                ⚠ Sensitive / Special Category Data (Health Data):
              </Text>
              <Bullet text="Self-reported health history, symptoms, and medical background" />
              <Bullet text="AI-generated diagnoses and urgency assessments" />
              <Bullet text="Consultation records and physician notes (professionals only)" />
              <Bullet text="Professional certifications and licence numbers (professionals only)" />
            </Section>

            {/* B3. Purpose & Legal Basis */}
            <Section title="B3. Purpose & Legal Basis for Processing">
              <Text className="mb-2 text-xs leading-5 text-gray-700">
                Under the NDPA 2023, we rely on the following legal bases:
              </Text>
              <View className="mb-2 rounded-xl border border-teal-100 bg-teal-50 p-3">
                <Text className="mb-1 text-xs font-bold text-teal-800">
                  Explicit Consent (§ 25 NDPA)
                </Text>
                <Text className="text-xs leading-5 text-teal-700">
                  Processing your health data for AI-assisted diagnosis and physician review.
                  You may withdraw this consent at any time.
                </Text>
              </View>
              <View className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <Text className="mb-1 text-xs font-bold text-gray-800">Legitimate Interest</Text>
                <Text className="text-xs leading-5 text-gray-700">
                  Providing, improving, and securing the platform and communicating important
                  service updates.
                </Text>
              </View>
            </Section>

            {/* B4. How Data is Used */}
            <Section title="B4. How We Use Your Data">
              <Bullet text="To create and manage your LifeGate account" />
              <Bullet text="To provide AI-powered health assessments and symptom analysis" />
              <Bullet text="To connect patients with licensed physicians for diagnosis review and validation" />
              <Bullet text="To send transactional notifications (OTP codes, security alerts)" />
              <Bullet text="To improve AI model accuracy (only using de-identified data)" />
              <Bullet text="To comply with applicable Nigerian health and data protection laws" />
            </Section>

            {/* B5. Data Sharing */}
            <Section title="B5. Who We Share Your Data With">
              <Text className="mb-2 text-xs leading-5 text-gray-700">
                We do <Text className="font-bold">not</Text> sell your personal data. We share
                it only with:
              </Text>
              <Bullet text="Licensed physicians on the LifeGate platform — for consultation and review of AI diagnoses" />
              <Bullet text="AI service providers (e.g. Google Gemini, OpenAI, Anthropic) — for generating health assessments; data is processed under confidentiality agreements" />
              <Bullet text="Cloud infrastructure providers — for secure hosting and data storage" />
              <Bullet text="Nigerian regulatory and law enforcement authorities — only where legally required" />
            </Section>

            {/* B6. Data Retention */}
            <Section title="B6. Data Retention">
              <Text className="text-xs leading-5 text-gray-700">
                Your data is retained for as long as your account is active. Upon account deletion,
                personal data is removed within <Text className="font-semibold">90 days</Text>,
                except where retention is required by Nigerian law (e.g. health records may be
                retained for up to <Text className="font-semibold">7 years</Text> under applicable
                health regulations). De-identified, aggregated data may be retained indefinitely for
                research purposes.
              </Text>
            </Section>

            {/* B7. Your Rights */}
            <Section title="B7. Your Rights Under the NDPA 2023">
              <Text className="mb-2 text-xs leading-5 text-gray-700">
                The NDPA 2023 grants you the following rights regarding your personal data:
              </Text>
              <Bullet text="Right of Access — obtain a copy of your personal data" />
              <Bullet text="Right to Rectification — correct inaccurate or incomplete data" />
              <Bullet text="Right to Erasure — request deletion of your data (subject to legal obligations)" />
              <Bullet text="Right to Data Portability — receive your data in a machine-readable format" />
              <Bullet text="Right to Object — object to certain processing activities" />
              <Bullet text="Right to Withdraw Consent — at any time, without affecting the lawfulness of prior processing" />
              <Bullet text="Right to Lodge a Complaint — with the Nigeria Data Protection Commission (NDPC)" />
              <Text className="mt-2 text-xs text-gray-500">
                Exercise your rights via{' '}
                <Text
                  className="text-[#0EA5A4] underline"
                  onPress={() => { void openExternalUrl('mailto:privacy@dshub.com.ng'); }}>
                  privacy@dshub.com.ng
                </Text>
                {' '}or contact the NDPC at{' '}
                <Link label="ndpc.gov.ng" url={NDPC_URL} />.
              </Text>
            </Section>

            {/* B8. Security */}
            <Section title="B8. Data Security">
              <Text className="text-xs leading-5 text-gray-700">
                We implement industry-standard security measures including encryption at rest and in
                transit (TLS), role-based access controls, and regular security audits. However, no
                system is completely secure. If you suspect a breach, contact us immediately at{' '}
                <Text
                  className="text-[#0EA5A4] underline"
                  onPress={() => { void openExternalUrl('mailto:security@dshub.com.ng'); }}>
                  security@dshub.com.ng
                </Text>
                .
              </Text>
            </Section>

            {/* B9. Cross-border */}
            <Section title="B9. International Data Transfers">
              <Text className="text-xs leading-5 text-gray-700">
                Your data may be processed on servers outside Nigeria (e.g., by AI providers). Where
                this occurs, we ensure appropriate safeguards are in place consistent with NDPA § 43
                requirements, including standard contractual clauses and adequacy decisions.
              </Text>
            </Section>

            {/* B10. Policy link */}
            <Section title="B10. Full Privacy Policy">
              <Text className="text-xs leading-5 text-gray-700">
                This notice is a summary. Our full{' '}
                <Link label="Privacy Policy" url={PRIVACY_URL} />
                {' '}and{' '}
                <Link label="Terms of Service" url={TERMS_URL} />
                {' '}contain additional details about our data practices.
              </Text>
            </Section>

            {/* Consent checkbox */}
            <View className="mt-2 rounded-2xl border border-teal-200 bg-teal-50 p-4">
              <Pressable
                onPress={() => setAgreed((v) => !v)}
                className="flex-row items-start">
                <View
                  className={`mr-3 mt-0.5 h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 ${
                    agreed ? 'border-teal-600 bg-teal-600' : 'border-gray-400 bg-white'
                  }`}>
                  {agreed && <Ionicons name="checkmark" size={13} color="white" />}
                </View>
                <Text className="flex-1 text-xs leading-5 text-gray-800">
                  I have read and understood the LifeGate by DSHub{' '}
                  <Text className="font-bold">Terms &amp; Conditions</Text>, including the{' '}
                  <Text className="font-semibold">Data Privacy Notice</Text> (Part B). I{' '}
                  <Text className="font-bold">explicitly consent</Text> to DSHub (LifeGate)
                  collecting, processing, and storing my personal data — including sensitive health
                  data — for the purposes described, in accordance with the{' '}
                  <Text className="font-semibold">Nigeria Data Protection Act 2023</Text>.
                </Text>
              </Pressable>

              {!hasScrolledToBottom && (
                <Text className="mt-2 text-center text-xs text-amber-600">
                  Please scroll to the bottom to enable agreement
                </Text>
              )}
            </View>

            <View className="mt-5 gap-3">
              <PrimaryButton
                title="I Agree — Continue"
                onPress={handleAccept}
                disabled={!agreed || !hasScrolledToBottom}
              />
              <Pressable
                onPress={handleDecline}
                className="items-center rounded-2xl border border-gray-300 py-4">
                <Text className="text-sm font-semibold text-gray-600">
                  Decline — Go Back
                </Text>
              </Pressable>
            </View>

            {/* Copyright */}
            <Text className="mt-6 text-center text-xs text-gray-400">
              © {new Date().getFullYear()} LifeGate by DSHub. All rights reserved.
            </Text>
          </ScrollView>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}
