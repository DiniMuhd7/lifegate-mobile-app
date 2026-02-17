import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton } from 'components/Button';
import { LabeledInput } from 'components/input';
import { useAuthStore } from 'stores/auth-store';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterWizardScreen() {
  const [step, setStep] = useState(1);
  const { userDraft, setField, register } = useAuthStore();

  const handleNext = () => setStep(2);

  const onFinalSubmit = async () => {
    try {
      console.log('Finalizing Registration:', userDraft);
      await register();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Registration failed', error);
    }
  };

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1"
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.4 }}
      style={{ flex: 1 }}>
      <View className="flex-1 ">
        {/* Header Section */}
        <View className="h-56 items-center justify-center pt-10  self-center">
          <View className="flex flex-row justify-between w-3/4 pr-12">
            {step > 1 && (
              <Pressable
                onPress={() => setStep(step - 1)}
                >
                <Ionicons name="arrow-back" size={24} color="white" />
              </Pressable>
            )}
            <Text className="mb-4 text-2xl font-bold text-white">
              {step === 1 ? 'Get Started Today' : 'Continue Profile Setup'}
            </Text>
          </View>

          {/* Progress Indicator */}
          <View className="flex-row items-center">
            <View
              className={`h-8 w-8 items-center justify-center rounded-full border-2 border-white ${step === 1 ? 'bg-white' : 'bg-transparent'}`}>
              <Text className={`font-bold ${step === 1 ? 'text-[#0EA5A4]' : 'text-white'}`}>1</Text>
            </View>
            <View className="mx-2 h-[2px] w-16 bg-white" />
            <View
              className={`h-8 w-8 items-center justify-center rounded-full border-2 border-white ${step === 2 ? 'bg-white' : 'bg-transparent'}`}>
              <Text className={`font-bold ${step === 2 ? 'text-[#0EA5A4]' : 'text-white'}`}>2</Text>
            </View>
          </View>
        </View>

        {/* Form Container */}
        <ScrollView
          className="flex-1 rounded-t-[40px] bg-gray-50 px-6 pt-10"
          contentContainerStyle={{ paddingBottom: 50 }}>
          {step === 1 ? (
            /* STEP 1: ACCOUNT DETAILS */
            <View>
              <LabeledInput
                label="Full Name"
                required
                placeholder="Enter your full name"
                value={userDraft.name}
                onChangeText={(v) => setField('name', v)}
              />
              <LabeledInput
                label="Email Address"
                required
                placeholder="xyz1@gmail.com"
                keyboardType="email-address"
                value={userDraft.email}
                onChangeText={(v) => setField('email', v)}
              />
              <LabeledInput
                label="Password"
                required
                placeholder="Password"
                secureToggle
                value={userDraft.password}
                onChangeText={(v) => setField('password', v)}
              />
              <LabeledInput
                label="Reconfirm Password"
                required
                placeholder="Reconfirm Password"
                secureToggle
                value={userDraft.confirm}
                onChangeText={(v) => setField('confirm', v)}
              />
              <View className="mt-8">
                <PrimaryButton title="Next" onPress={handleNext} />
              </View>
            </View>
          ) : (
            /* STEP 2: PROFILE DETAILS */
            <View>
              <LabeledInput
                label="Phone Number"
                required
                placeholder="Enter phone number"
                keyboardType="phone-pad"
                value={userDraft.phone}
                onChangeText={(v) => setField('phone', v)}
              />
              <LabeledInput
                label="Date of birth"
                required
                placeholder="Select date of birth"
                // You'd likely trigger a DatePicker modal here
                value={userDraft.dob}
              />
              <LabeledInput
                label="Gender"
                required
                placeholder="Select your gender"
                value={userDraft.gender}
              />
              <LabeledInput
                label="Language"
                required
                placeholder="Select your preferred language"
                value={userDraft.language}
              />
              <LabeledInput
                label="Health History"
                required
                placeholder="Type a brief history"
                multiline
                numberOfLines={4}
                value={userDraft.healthHistory}
                onChangeText={(v) => setField('healthHistory', v)}
              />

              {/* Privacy Policy Checkbox */}
              <View className="my-4 flex-row items-center">
                <View className="mr-2 h-5 w-5 rounded border border-[#0EA5A4]" />
                <Text className="text-xs text-gray-600">
                  I have read the <Text className="font-bold text-[#0EA5A4]">Privacy Policy</Text>{' '}
                  and I agree.
                </Text>
              </View>

              <View className="mt-4">
                <PrimaryButton title="Sign up" onPress={onFinalSubmit} />
              </View>
            </View>
          )}

          {/* Footer */}
          <View className="mt-6 flex-row justify-center">
            <Text className="text-gray-500">Already have an account? </Text>
            <Pressable onPress={() => router.replace('/(auth)/login')}>
              <Text className="font-semibold text-[#0EA5A4]">Login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </LinearGradient>
  );
}
