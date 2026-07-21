import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AdminService } from '../../services/admin-service';
import type { BulkPatientEmailDraft, BulkPatientEmailResult } from '../../types/admin-types';

const templates = [
  {
    id: 'checkup',
    title: 'Health check reminder',
    subject: 'Your LifeGate health check-in is waiting',
    preheader: 'Complete your quick health check-in and keep your profile up to date.',
    body: 'We hope you are doing well. This is a friendly reminder to complete your LifeGate health check-in so your care profile stays current.\n\nRegular updates help our clinical team provide safer, more timely guidance when you need support.',
    cta: 'Open LifeGate',
    ctaUrl: 'https://lifegate.dshub.com.ng/download',
  },
  {
    id: 'promo',
    title: 'Promotional update',
    subject: 'New LifeGate features to support your health journey',
    preheader: 'Discover tools that make your health support faster and easier.',
    body: 'LifeGate continues to improve your access to digital health support. Explore your dashboard for symptom checks, wellness insights, and physician-supported care pathways.\n\nThank you for trusting LifeGate as your health companion.',
    cta: 'Explore LifeGate',
    ctaUrl: 'https://lifegate.dshub.com.ng/download',
  },
];

export default function PatientMessagingScreen() {
  const router = useRouter();
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BulkPatientEmailResult | null>(null);
  const [batchSize, setBatchSize] = useState('100');
  const [draft, setDraft] = useState<BulkPatientEmailDraft>({
    subject: templates[0].subject,
    preheader: templates[0].preheader,
    body: templates[0].body,
    cta: templates[0].cta,
    ctaUrl: templates[0].ctaUrl,
  });

  useEffect(() => {
    AdminService.getPatientEmailRecipientCount()
      .then(setRecipientCount)
      .catch(() => setRecipientCount(null))
      .finally(() => setLoadingCount(false));
  }, []);

  const bodyWords = useMemo(() => draft.body.trim().split(/\s+/).filter(Boolean).length, [draft.body]);
  const parsedBatchSize = Math.max(1, Math.min(100, Number.parseInt(batchSize, 10) || 100));
  const canSend = draft.subject.trim().length > 0 && draft.body.trim().length > 0 && !sending;

  const applyTemplate = (template: typeof templates[number]) => {
    setDraft({
      subject: template.subject,
      preheader: template.preheader,
      body: template.body,
      cta: template.cta,
      ctaUrl: template.ctaUrl,
    });
    setResult(null);
  };

  const confirmSend = () => {
    const message = `Send the next batch of up to ${parsedBatchSize} patient emails? Already-sent patients for this exact message will be skipped.`;
    const doSend = async () => {
      setSending(true);
      setResult(null);
      try {
        const response = await AdminService.sendBulkPatientEmail({ ...draft, batchSize: parsedBatchSize });
        setResult(response);
        const summary = `Sent this batch: ${response.sent}\nFailed: ${response.failed}\nAlready completed before this batch: ${response.alreadySent ?? 0}\nRemaining for this message: ${response.pending}\nAudience: ${response.recipientCount}`;
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(summary);
        } else {
          Alert.alert('Broadcast complete', summary);
        }
      } catch {
        const errorMessage = 'Could not send the patient email broadcast. Confirm email delivery is configured and try again.';
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(errorMessage);
        } else {
          Alert.alert('Send failed', errorMessage);
        }
      } finally {
        setSending(false);
      }
    };

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) void doSend();
    } else {
      Alert.alert('Confirm patient broadcast', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'default', onPress: () => { void doSend(); } },
      ]);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Ionicons name="arrow-back" size={20} color="#0f172a" />
        <Text style={{ color: '#0f172a', fontWeight: '700' }}>Back to admin dashboard</Text>
      </TouchableOpacity>

      <View style={{ backgroundColor: '#0f766e', borderRadius: 28, padding: 24, marginBottom: 18 }}>
        <Text style={{ color: '#ccfbf1', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>Patient Messaging</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 8 }}>Bulk email composer</Text>
        <Text style={{ color: '#d1fae5', fontSize: 14, lineHeight: 22, marginTop: 8 }}>
          Draft professional reminders or promotional updates and send them to every patient with a valid email address.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>
        <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 16 }}>
          <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>Reachable audience</Text>
          <Text style={{ color: '#0f172a', fontSize: 26, fontWeight: '800', marginTop: 4 }}>
            {loadingCount ? '…' : (recipientCount ?? 0).toLocaleString()}
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 16 }}>
          <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>Message length</Text>
          <Text style={{ color: '#0f172a', fontSize: 26, fontWeight: '800', marginTop: 4 }}>{bodyWords} words</Text>
        </View>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 22, padding: 18, marginBottom: 18 }}>
        <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>Start with a template</Text>
        <View style={{ gap: 10 }}>
          {templates.map((template) => (
            <TouchableOpacity key={template.id} onPress={() => applyTemplate(template)} style={{ borderWidth: 1, borderColor: '#dbeafe', borderRadius: 16, padding: 14, backgroundColor: '#eff6ff' }}>
              <Text style={{ color: '#1d4ed8', fontWeight: '800' }}>{template.title}</Text>
              <Text style={{ color: '#475569', marginTop: 4, fontSize: 12 }}>{template.subject}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 22, padding: 18, marginBottom: 18 }}>
        <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>Compose message</Text>

        <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 6 }}>Batch size (Resend free plan safe limit)</Text>
        <TextInput value={batchSize} onChangeText={setBatchSize} keyboardType="number-pad" placeholder="100" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, marginBottom: 12, color: '#0f172a' }} />
        <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
          Send one batch per day until Remaining reaches 0. LifeGate records each successful delivery by patient and message so the same patient is not emailed twice for the same campaign.
        </Text>
        <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 6 }}>Subject</Text>
        <TextInput value={draft.subject} onChangeText={(subject) => setDraft((d) => ({ ...d, subject }))} maxLength={140} placeholder="Email subject" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, marginBottom: 12, color: '#0f172a' }} />
        <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 6 }}>Preheader</Text>
        <TextInput value={draft.preheader} onChangeText={(preheader) => setDraft((d) => ({ ...d, preheader }))} placeholder="Short inbox preview text" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, marginBottom: 12, color: '#0f172a' }} />
        <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 6 }}>Body</Text>
        <TextInput value={draft.body} onChangeText={(body) => setDraft((d) => ({ ...d, body }))} multiline textAlignVertical="top" placeholder="Write a warm, professional message…" style={{ minHeight: 180, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, marginBottom: 12, color: '#0f172a' }} />
        <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 6 }}>Optional call to action</Text>
        <TextInput value={draft.cta} onChangeText={(cta) => setDraft((d) => ({ ...d, cta }))} placeholder="Button label" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, marginBottom: 10, color: '#0f172a' }} />
        <TextInput value={draft.ctaUrl} onChangeText={(ctaUrl) => setDraft((d) => ({ ...d, ctaUrl }))} placeholder="https://…" autoCapitalize="none" style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, color: '#0f172a' }} />
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 22, padding: 18, marginBottom: 18 }}>
        <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 8 }}>Preview</Text>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>{draft.subject || 'Subject preview'}</Text>
        {!!draft.preheader && <Text style={{ color: '#64748b', marginBottom: 14 }}>{draft.preheader}</Text>}
        <Text style={{ color: '#334155', lineHeight: 22 }}>{draft.body || 'Message body preview'}</Text>
        {!!draft.cta && !!draft.ctaUrl && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: '#0AADA2', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, marginTop: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{draft.cta}</Text>
          </View>
        )}
      </View>

      {result && (
        <View style={{ backgroundColor: '#ecfdf5', borderRadius: 18, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: '#bbf7d0' }}>
          <Text style={{ color: '#047857', fontWeight: '800' }}>Last batch: {result.sent} sent, {result.failed} failed, {result.alreadySent ?? 0} already completed, {result.pending} remaining</Text>
          {!!result.errors?.length && <Text style={{ color: '#64748b', marginTop: 6 }}>{result.errors.join('\n')}</Text>}
        </View>
      )}

      <TouchableOpacity disabled={!canSend} onPress={confirmSend} style={{ backgroundColor: canSend ? '#0AADA2' : '#94a3b8', borderRadius: 18, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        <Ionicons name="send" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{sending ? 'Sending…' : `Send next batch (${parsedBatchSize})`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
