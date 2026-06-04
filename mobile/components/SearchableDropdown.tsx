import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Option {
  label: string;
  value: string;
}

interface SearchableDropdownProps {
  label: string;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  hasError?: boolean;
  selectedValue?: string;
  onChange?: (value: string) => void;
  searchPlaceholder?: string;
  triggerClassName?: string;
}

export const SearchableDropdown = ({
  label,
  options,
  placeholder = 'Select an option',
  required,
  hasError,
  selectedValue,
  onChange,
  searchPlaceholder = 'Search…',
  triggerClassName = '',
}: SearchableDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === selectedValue);
  const selectedLabel = selected?.label ?? placeholder;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options]);

  const handleSelect = (value: string) => {
    onChange?.(value);
    setOpen(false);
    setQuery('');
  };

  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-medium text-gray-700">
        {label} {required && <Text className="text-red-500">*</Text>}
      </Text>

      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        } ${triggerClassName}`}>
        <Text className={`flex-1 text-sm ${selectedValue ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedLabel}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#0EA5A4" />
      </Pressable>

      {open && (
        <View
          className="mt-1 overflow-hidden rounded-2xl border border-gray-100 bg-white"
          style={{
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
          }}>
          {/* Search bar */}
          <View className="flex-row items-center border-b border-gray-100 px-3 py-2">
            <Ionicons name="search-outline" size={15} color="#9CA3AF" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#9CA3AF"
              autoCorrect={false}
              autoCapitalize="none"
              className="ml-2 flex-1 text-sm text-gray-800"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={15} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.length === 0 ? (
              <View className="px-4 py-3">
                <Text className="text-sm text-gray-400">No results for "{query}"</Text>
              </View>
            ) : (
              filtered.map((option, index) => (
                <Pressable
                  key={option.value + index}
                  onPress={() => handleSelect(option.value)}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    index < filtered.length - 1 ? 'border-b border-gray-50' : ''
                  }`}>
                  <Text
                    className={`text-base ${
                      option.value === selectedValue ? 'font-semibold text-[#0EA5A4]' : 'text-gray-800'
                    }`}>
                    {option.label}
                  </Text>
                  {option.value === selectedValue && (
                    <Ionicons name="checkmark-circle" size={18} color="#0EA5A4" />
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
