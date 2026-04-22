module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)', '**/*.test.(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/app/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Respect tsconfig "baseUrl": "." — allows bare imports like 'services/...', 'stores/...'
  moduleDirectories: ['node_modules', '<rootDir>'],
};
