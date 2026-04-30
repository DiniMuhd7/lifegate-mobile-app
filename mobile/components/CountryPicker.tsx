import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRIES } from 'constants/geo';

interface CountryPickerProps {
  label?: string;
  required?: boolean;
  hasError?: boolean;
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
}

export function CountryPicker({
  label = 'Country',
  required,
  hasError,
  value,
  onChange,
  placeholder = 'Search country…',
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  const select = useCallback(
    (country: string) => {
      onChange(country);
      setQuery('');
      setOpen(false);
    },
    [onChange],
  );

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 font-medium text-gray-700">
          {label}
          {required && <Text className="text-red-500"> *</Text>}
        </Text>
      ) : null}

      {/* Trigger */}
      <Pressable
        onPress={toggleOpen}
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        }`}>
        <Text className={`flex-1 text-sm ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value || placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#0EA5A4" />
      </Pressable>

      {/* Inline dropdown */}
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
          {/* Search box */}
          <View className="flex-row items-center border-b border-gray-100 px-3 py-2">
            <Ionicons name="search-outline" size={15} color="#9CA3AF" />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search country…"
              placeholderTextColor="#9CA3AF"
              autoCorrect={false}
              autoCapitalize="words"
              className="ml-2 flex-1 text-sm text-gray-800"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={15} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.length === 0 ? (
              <Text className="px-4 py-3 text-sm text-gray-400">No results</Text>
            ) : (
              filtered.map((country) => (
                <Pressable
                  key={country}
                  onPress={() => select(country)}
                  className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50">
                  <Text
                    className={`text-sm ${
                      country === value ? 'font-semibold text-[#0EA5A4]' : 'text-gray-800'
                    }`}>
                    {country}
                  </Text>
                  {country === value && (
                    <Ionicons name="checkmark-circle" size={16} color="#0EA5A4" />
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
