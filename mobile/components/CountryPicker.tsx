import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRY_OPTIONS } from 'constants/geo';

interface CountryPickerProps {
  label?: string;
  required?: boolean;
  hasError?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CountryPicker({
  label = 'Country',
  required,
  hasError,
  value,
  onChange,
  placeholder = 'Select your country',
}: CountryPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setModalVisible(false);
      setQuery('');
    },
    [onChange],
  );

  const handleOpen = () => {
    setQuery('');
    setModalVisible(true);
  };

  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 font-medium text-gray-700">
          {label} {required && <Text className="text-red-500">*</Text>}
        </Text>
      ) : null}

      <Pressable
        onPress={handleOpen}
        className={`h-12 flex-row items-center rounded-xl px-3 ${
          hasError ? 'border border-red-300 bg-red-50' : 'bg-[#F2F4F7]'
        }`}>
        <Text className={`flex-1 text-sm ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#0EA5A4" />
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '80%',
              paddingBottom: 24,
            }}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#F1F5F9',
              }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#1E293B' }}>
                Select Country
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View
              style={{
                marginHorizontal: 16,
                marginVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F2F4F7',
                borderRadius: 12,
                paddingHorizontal: 12,
              }}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#1E293B', paddingVertical: 10 }}
                placeholder="Search country..."
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="words"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            <ScrollView keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#94A3B8', paddingVertical: 24, fontSize: 14 }}>
                  No countries found
                </Text>
              ) : (
                filtered.map((c, i) => (
                  <Pressable
                    key={c.value}
                    onPress={() => handleSelect(c.value)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      backgroundColor: pressed ? '#F0FAFA' : '#fff',
                      borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                      borderBottomColor: '#F1F5F9',
                    })}>
                    <Text
                      style={{
                        fontSize: 15,
                        color: c.value === value ? '#0EA5A4' : '#1E293B',
                        fontWeight: c.value === value ? '600' : '400',
                      }}>
                      {c.label}
                    </Text>
                    {c.value === value && (
                      <Ionicons name="checkmark-circle" size={18} color="#0EA5A4" />
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
