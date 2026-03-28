import { View, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

export const SearchBar = ({
  placeholder = 'Search...',
  value,
  onChangeText,
  onClear,
}: SearchBarProps) => {
  return (
    <View
      className="mx-5 my-3 flex-row items-center bg-white rounded-xl px-4 py-2.5 border border-gray-100"
      style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}
    >
      <Ionicons name="search-outline" size={18} color="#9CA3AF" />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={onChangeText}
        className="flex-1 ml-2.5 text-gray-800 text-sm"
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 && (
        <Pressable onPress={onClear} className="p-1 rounded-full bg-gray-100">
          <Ionicons name="close" size={14} color="#6B7280" />
        </Pressable>
      )}
    </View>
  );
};
