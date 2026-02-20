import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { PrimaryButton } from 'components/Button';
import { GENDER_OPTIONS, SPECIALTY_OPTIONS } from 'constants/constants';
import { PrimaryCalendar } from 'components/Calender';
import { DOBInput } from 'components/DobPicker';

export default function ProfessionalScreen() {
  const { healthProfessionalDraft, setHealthProfessionalField } = useAuthStore();

  const next = () => {
    if (
      !healthProfessionalDraft.phone ||
      !healthProfessionalDraft.gender ||
      !healthProfessionalDraft.specialization
    )
      return alert('Fill all required fields');
    router.push('/(auth)/(health-professional)/license');
  };

  return (
    <View className="flex-1 justify-start bg-white p-3">
      <LabeledInput
        label="Phone"
        value={healthProfessionalDraft.phone}
        onChangeText={(v) => setHealthProfessionalField('phone', v)}
      />

      <DOBInput
        label="Date of Birth"
        value={healthProfessionalDraft.dob ? new Date(healthProfessionalDraft.dob) : null}
        onChange={(date: Date) => {
          const new_date = date.toISOString().split('T')[0];
          setHealthProfessionalField('dob', new_date);
          console.log('New Date set:', new_date);
        }}
      />

      <Dropdown
        label="Gender"
        value={healthProfessionalDraft.gender}
        onChange={(v) => setHealthProfessionalField('gender', v)}
        placeholder="Select Gender"
        options={GENDER_OPTIONS}
      />

      <LabeledInput
        label="Years of Practice"
        value={healthProfessionalDraft.yearsOfExperience || ''}
        placeholder="Years of Experience"
        onChangeText={(v) => setHealthProfessionalField('yearsOfExperience', v)}
      />

      <Dropdown
        label="Specialization"
        value={healthProfessionalDraft.specialization || ''}
        onChange={(v) => setHealthProfessionalField('specialization', v)}
        placeholder="Select Specialization"
        options={SPECIALTY_OPTIONS}
      />

      <PrimaryButton title="Next" onPress={next} type="secondary" />
    </View>
  );
}
