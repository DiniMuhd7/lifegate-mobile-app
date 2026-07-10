import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { ErrorMessage } from 'components/ErrorMessage';
import { GENDER_OPTIONS, LANGUAGE_OPTIONS, FREE_HEALTH_SCREENING_OPTIONS } from 'constants/constants';
import { NIGERIA_STATES, PHONE_CODES, COUNTRIES } from 'constants/geo';
import { useRegistrationStore } from 'stores/auth-store';
import { router, useFocusEffect } from 'expo-router';
import { DOBInput } from 'components/DobPicker';
import { validateSingleField } from 'utils/validation';
import { getFeatureFlags } from 'services/auth-service';
import { SearchableDropdown } from 'components/SearchableDropdown';
import { SuggestInput } from 'components/SuggestInput';

const VALID_FIELDS = {
  phone: true,
  dob: true,
  gender: true,
  language: true,
  referredByCode: true,
  state: true,
  country: true,
  freeHealthScreening: true,
} as const;

type ValidFieldName = keyof typeof VALID_FIELDS;

const isValidField = (fieldName: string): fieldName is ValidFieldName => {
  return fieldName in VALID_FIELDS;
};

export default function UserProfileStep() {
  const { userDraft, setUserField } = useRegistrationStore();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dialCode, setDialCode] = useState('+234');
  const [phoneNum, setPhoneNum] = useState('');
  const [screeningOpen, setScreeningOpen] = useState(false);
  const [screeningEnabled, setScreeningEnabled] = useState(false);

  // Fetch feature flag once on mount — determines whether the screening
  // dropdown is shown at all. Defaults to false (hidden) until the flag loads.
  useEffect(() => {
    getFeatureFlags().then((flags) => {
      setScreeningEnabled(flags['feature.free_health_screening'] === true);
    });
  }, []);

  // Parse the comma-separated freeHealthScreening string into a Set for easy toggle
  const selectedScreenings = new Set(
    (userDraft.freeHealthScreening || '').split(',').filter(Boolean)
  );

  const toggleScreening = (value: string) => {
    const next = new Set(selectedScreenings);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    setUserField('freeHealthScreening', Array.from(next).join(','));
  };

  useFocusEffect(
    useCallback(() => {
      if (!userDraft.name || !userDraft.email || !userDraft.password) {
        router.replace('/(auth)/(user)');
      }
    }, [userDraft.name, userDraft.email, userDraft.password])
  );

  const handleFieldChange = (fieldName: string, value: string) => {
    if (!isValidField(fieldName)) return;
    setUserField(fieldName, value);
    const error = validateSingleField(fieldName, value, false);
    setFieldErrors((prev) => ({ ...prev, [fieldName]: error || '' }));
  };

  const handleDateChange = (fieldName: string, date: Date) => {
    if (!isValidField(fieldName)) return;
    // Format as YYYY-MM-DD using local date getters to avoid UTC timezone offset
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const new_date = `${year}-${month}-${day}`;
    setUserField(fieldName, new_date);
    const error = validateSingleField(fieldName, new_date, false);
    setFieldErrors((prev) => ({ ...prev, [fieldName]: error || '' }));
  };

  const canProceed = () =>
    !!userDraft.phone && !!userDraft.dob && !!userDraft.gender &&
    !fieldErrors.phone && !fieldErrors.dob && !fieldErrors.gender;

  const updatePhone = (code: string, num: string) => {
    const digits = num.replace(/\D/g, '');
    const full = digits ? code + digits : '';
    handleFieldChange('phone', full);
  };

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <View className="py-2">
        <SearchableDropdown
          label="Phone Country Code"
          required
          options={PHONE_CODES}
          selectedValue={dialCode}
          onChange={(code) => {
            setDialCode(code);
            updatePhone(code, phoneNum);
          }}
          searchPlaceholder="Search country or code…"
          hasError={!!fieldErrors.phone}
        />

        <LabeledInput
          label="Phone Number"
          required
          placeholder="Enter phone number"
          keyboardType="phone-pad"
          value={phoneNum}
          hasError={!!fieldErrors.phone}
          onChangeText={(v) => {
            setPhoneNum(v);
            updatePhone(dialCode, v);
          }}
        />
        <ErrorMessage fieldName="phone" fieldErrors={fieldErrors} />

        <DOBInput
          label="Date of Birth"
          required
          hasError={!!fieldErrors.dob}
          value={userDraft.dob ? (() => { const [y, m, d] = userDraft.dob.split('-').map(Number); return new Date(y, m - 1, d); })() : null}
          onChange={(date: Date) => handleDateChange('dob', date)}
        />
        <ErrorMessage fieldName="dob" fieldErrors={fieldErrors} />

        <Dropdown
          label="Gender"
          required
          hasError={!!fieldErrors.gender}
          selectedValue={userDraft.gender || ''}
          onChange={(value: string) => handleFieldChange('gender', value)}
          options={GENDER_OPTIONS}
          placeholder="Select your gender"
        />
        <ErrorMessage fieldName="gender" fieldErrors={fieldErrors} />

        <Dropdown
          label="Preferred Language"
          selectedValue={userDraft.language || ''}
          onChange={(value: string) => handleFieldChange('language', value)}
          options={LANGUAGE_OPTIONS}
          placeholder="Select preferred language"
        />
        <ErrorMessage fieldName="language" fieldErrors={fieldErrors} />

        <SearchableDropdown
          label="Country"
          options={COUNTRIES.map((c) => ({ label: c, value: c }))}
          selectedValue={userDraft.country || ''}
          onChange={(v) => handleFieldChange('country', v)}
          hasError={!!fieldErrors.country}
          searchPlaceholder="Search country…"
        />
        <ErrorMessage fieldName="country" fieldErrors={fieldErrors} />

        <View className="mb-3">
          <Text className="mb-1.5 font-medium text-gray-700">State / Province</Text>
          <SuggestInput
            value={userDraft.state || ''}
            onChangeText={(v) => handleFieldChange('state', v)}
            suggestions={userDraft.country === 'Nigeria' ? NIGERIA_STATES : []}
            placeholder={userDraft.country === 'Nigeria' ? 'Search state…' : 'Enter your state or province'}
            placeholderTextColor="#9CA3AF"
            inputClassName={`rounded-xl p-3 text-sm text-gray-800 h-12 ${
              fieldErrors.state ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
            }`}
          />
        </View>
        <ErrorMessage fieldName="state" fieldErrors={fieldErrors} />

        <View className="mb-2 mt-1">
          <Text className="mb-1.5 font-medium text-gray-700">
            Referral Code{' '}
            <Text className="text-xs font-normal text-gray-400">(optional)</Text>
          </Text>
          <TextInput
            value={userDraft.referredByCode || ''}
            onChangeText={(value: string) => setUserField('referredByCode', value.trim().toUpperCase())}
            placeholder="Enter referral code"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            className="rounded-xl p-3 text-sm text-gray-800 bg-[#F2F4F7]"
          />
        </View>

        {/* ── Free Health Screening (shown only when enabled by admin) ── */}
        {screeningEnabled && (
        <View className="mb-3">
          <Text className="mb-1.5 font-medium text-gray-700">
            Free Health Screening{' '}
            <Text className="text-xs font-normal text-gray-400">(optional)</Text>
          </Text>

          {/* Trigger row */}
          <Pressable
            onPress={() => setScreeningOpen((o) => !o)}
            style={{
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: '#F2F4F7',
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: selectedScreenings.size > 0 ? '#111827' : '#9CA3AF',
              }}
              numberOfLines={1}
            >
              {selectedScreenings.size === 0
                ? 'Select screening services…'
                : selectedScreenings.size === 1
                  ? FREE_HEALTH_SCREENING_OPTIONS.find(
                      (o) => o.value === Array.from(selectedScreenings)[0]
                    )?.label ?? ''
                  : `${selectedScreenings.size} services selected`}
            </Text>
            <View style={{ marginLeft: 8 }}>
              {/* Ionicons chevron */}
              <Text style={{ color: '#0EA5A4', fontSize: 16 }}>
                {screeningOpen ? '▲' : '▼'}
              </Text>
            </View>
          </Pressable>

          {/* Expanding checklist */}
          {screeningOpen && (
            <View
              style={{
                marginTop: 4,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#FFFFFF',
                overflow: 'hidden',
                elevation: 4,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
              }}
            >
              {FREE_HEALTH_SCREENING_OPTIONS.map((option, index) => {
                const checked = selectedScreenings.has(option.value);
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => toggleScreening(option.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 13,
                      borderBottomWidth: index < FREE_HEALTH_SCREENING_OPTIONS.length - 1 ? 1 : 0,
                      borderBottomColor: '#F3F4F6',
                      backgroundColor: checked ? '#F0FDFB' : '#FFFFFF',
                    }}
                  >
                    {/* Checkbox circle */}
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: checked ? '#0EA5A4' : '#D1D5DB',
                        backgroundColor: checked ? '#0EA5A4' : '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      {checked && (
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>✓</Text>
                      )}
                    </View>

                    <Text
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: checked ? '#0EA5A4' : '#374151',
                        fontWeight: checked ? '600' : '400',
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Done button inside the list */}
              <Pressable
                onPress={() => setScreeningOpen(false)}
                style={{
                  alignItems: 'center',
                  paddingVertical: 12,
                  backgroundColor: '#F0FDFB',
                  borderTopWidth: 1,
                  borderTopColor: '#CCFBF1',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0EA5A4' }}>
                  Done {selectedScreenings.size > 0 ? `(${selectedScreenings.size} selected)` : ''}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
        )}

        <View className="mt-6 mb-4">
          <PrimaryButton
            title="Continue"
            onPress={() => router.push('/(auth)/(user)/review')}
            disabled={!canProceed()}
          />
        </View>
      </View>
    </ScrollView>
  );
}
