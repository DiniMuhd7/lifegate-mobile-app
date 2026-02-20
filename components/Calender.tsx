import { useState as useStateReact } from 'react';
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  Modal as RNModal,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
export const PrimaryCalendar = ({ label = 'Date of Birth', value, onChange }: any) => {
  const [open, setOpen] = useStateReact(false);
  const today = new Date();
  const maxDate = today.toISOString().split('T')[0]; // cannot pick future dates
  return (
    <RNView className="mb-5">
      <RNText className="mb-1 font-medium text-gray-600">
        {label} <RNText className="text-red-500">*</RNText>
      </RNText>
      {/* Trigger field */}
      <RNPressable
        onPress={() => setOpen(true)}
        className="rounded-xl border border-gray-300 bg-white px-3 py-3">
        <RNText className={`${value ? 'text-black' : 'text-gray-400'}`}>
          {value || 'Select your date of birth'}
        </RNText>
      </RNPressable>
      {/* Modal calendar */}
      <RNModal transparent visible={open} animationType="fade">
        <RNPressable
          className="flex-1 justify-center bg-black/30 px-4"
          onPress={() => setOpen(false)}>
          <RNView className="overflow-hidden rounded-2xl bg-white">
            <Calendar
              maxDate={maxDate}
              onDayPress={(day: DateData) => {
                onChange(day.dateString); // YYYY-MM-DD
                setOpen(false);
              }}
              markedDates={value ? { [value]: { selected: true, selectedColor: '#0EA5A4' } } : {}}
              theme={{
                todayTextColor: '#0EA5A4',
                selectedDayBackgroundColor: '#0EA5A4',
                arrowColor: '#0EA5A4',
              }}
            />
            <Ionicons
              name="chevron-down"
              size={16}
              color="#0EA5A4"
              className="absolute right-3 top-3"
            />

            <RNPressable className="items-center p-4" onPress={() => setOpen(false)}>
              <RNText className="font-semibold text-[#0EA5A4]">Close</RNText>
            </RNPressable>
          </RNView>
        </RNPressable>
      </RNModal>
    </RNView>
  );
};
