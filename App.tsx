import { ScreenContent } from 'components/ScreenContent';
import { StatusBar } from 'expo-status-bar';
import { View , Text } from 'react-native';

import './global.css';

export default function App() {
  return (
    <>
      <ScreenContent title="Home" path="App.tsx"></ScreenContent>
      <StatusBar style="auto" />
      <Text className="text-2xl text-center mt-4 mb-4">Hello, World!</Text>
    </>
  );
}
