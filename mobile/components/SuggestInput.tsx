import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';

interface SuggestInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  /** List of suggestion strings to filter from */
  suggestions: string[];
  /** Extra className applied to the TextInput */
  inputClassName?: string;
  /** Maximum suggestions shown at once (default 6) */
  maxSuggestions?: number;
}

/**
 * TextInput with an inline suggestion dropdown.
 * Shows matching suggestions as the user types; selecting one
 * fills the input and closes the list. Works inside any ScrollView
 * with keyboardShouldPersistTaps="handled".
 */
export function SuggestInput({
  value,
  onChangeText,
  suggestions,
  inputClassName = '',
  maxSuggestions = 6,
  style,
  ...rest
}: SuggestInputProps) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter(s => s.toLowerCase().includes(q))
      .slice(0, maxSuggestions);
  }, [value, suggestions, maxSuggestions]);

  const select = useCallback(
    (s: string) => {
      onChangeText(s);
      setOpen(false);
    },
    [onChangeText],
  );

  const handleChangeText = useCallback(
    (t: string) => {
      onChangeText(t);
      setOpen(true);
    },
    [onChangeText],
  );

  const handleFocus = useCallback(() => setOpen(true), []);

  // Small delay so the TouchableOpacity onPress fires before the blur closes the list
  const handleBlur = useCallback(() => {
    setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <View>
      <TextInput
        className={inputClassName}
        style={style}
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoCorrect={false}
        autoCapitalize="words"
        {...rest}
      />
      {open && filtered.length > 0 && (
        <View
          className="border border-blue-200 rounded-xl bg-white mb-1 overflow-hidden"
          style={{ elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
        >
          {filtered.map((s, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => select(s)}
              className="px-3 py-2.5"
              style={i < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' } : undefined}
            >
              <Text className="text-sm text-gray-700">{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
