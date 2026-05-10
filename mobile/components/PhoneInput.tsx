import React, { useState } from 'react';
import { View, Text } from 'react-native';
import PhoneInput, {
  ICountry,
} from 'react-native-international-phone-number';

interface PhoneInputProps {
  value: string;
  onChangePhoneNumber: (phoneNumber: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
}

export const PhoneNumberInput: React.FC<PhoneInputProps> = ({
  value,
  onChangePhoneNumber,
  label = 'Phone Number',
  required = false,
  error,
}: PhoneInputProps) => {
  const [selectedCountry, setSelectedCountry] = useState<null | ICountry>(null);

  function handleInputValue(phoneNumber: string) {
    // Remove all non-digit characters to store only the phone number
    const cleanedNumber = phoneNumber.replace(/\D/g, '');
    onChangePhoneNumber(cleanedNumber);
  }

  function handleSelectedCountry(country: ICountry) {
    setSelectedCountry(country);
  }

  return (
    <View className="mb-3 w-full">
      {/* Label — matches LabeledInput */}
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>
      <View style={{ width: '100%' }}>
        <PhoneInput
          value={value}
          onChangePhoneNumber={handleInputValue}
          selectedCountry={selectedCountry}
          onChangeSelectedCountry={handleSelectedCountry}
          defaultCountry="NG"
          defaultValue=""
          className='bg-[#F2F4F7] border-none'
        />
      </View>
      {error && <Text className="text-red-500 text-xs mt-1">{error}</Text>}
    </View>
  );
}