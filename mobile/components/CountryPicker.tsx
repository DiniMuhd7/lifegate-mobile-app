import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRIES } from 'constants/geo';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface CountryPickerProps {
  label?: string;
  required?: boolean;
  hasError?: boolean;
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
}

// ─── Web: native <select> element ─────────────────────────────────────────────
function CountryPickerWeb({
  label,
  required,
  hasError,
  value,
  onChange,
  placeholder = 'Select country…',
}: CountryPickerProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      ) : null}
      <View style={[styles.webSelectWrap, hasError && styles.triggerError]}>
        {/* @ts-ignore — select is valid on web via react-native-web */}
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          style={{
            flex: 1,
            height: 46,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 14,
            color: value ? '#111827' : '#9CA3AF',
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            paddingLeft: 4,
            paddingRight: 8,
          }}
        >
          <option value="" disabled hidden>{placeholder}</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Ionicons name="chevron-down" size={16} color="#0EA5A4" style={{ pointerEvents: 'none' } as any} />
      </View>
    </View>
  );
}

// ─── Native: bottom-sheet Modal ───────────────────────────────────────────────
function CountryPickerNative({
  label,
  required,
  hasError,
  value,
  onChange,
  placeholder = 'Select country…',
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
    }
  }, [open]);

  const select = useCallback(
    (country: string) => {
      onChange(country);
      setOpen(false);
    },
    [onChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <Pressable onPress={() => select(item)} style={styles.item}>
        <Text style={[styles.itemText, item === value && styles.itemTextSelected]}>
          {item}
        </Text>
        {item === value && <Ionicons name="checkmark-circle" size={16} color="#0EA5A4" />}
      </Pressable>
    ),
    [value, select],
  );

  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      ) : null}

      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, hasError && styles.triggerError]}>
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#0EA5A4" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Select Country</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Search country…"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
                autoCapitalize="words"
                style={styles.searchInput}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            {filtered.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No results for "{query}"</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                initialNumToRender={25}
              />
            )}
            {Platform.OS === 'ios' && <View style={{ height: 20 }} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Exported: picks web vs native automatically ──────────────────────────────
export function CountryPicker(props: CountryPickerProps) {
  if (Platform.OS === 'web') return <CountryPickerWeb {...props} />;
  return <CountryPickerNative {...props} />;
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, fontWeight: '500', color: '#374151', fontSize: 14 },
  required: { color: '#EF4444' },
  webSelectWrap: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F2F4F7',
  },
  trigger: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F2F4F7',
  },
  triggerError: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  triggerText: { flex: 1, fontSize: 14, color: '#111827' },
  triggerPlaceholder: { color: '#9CA3AF' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F2F4F7',
    borderRadius: 12,
  },
  searchInput: { flex: 1, marginLeft: 8, paddingVertical: 10, fontSize: 15, color: '#1F2937' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  itemText: { fontSize: 15, color: '#1F2937' },
  itemTextSelected: { fontWeight: '600', color: '#0EA5A4' },
  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
