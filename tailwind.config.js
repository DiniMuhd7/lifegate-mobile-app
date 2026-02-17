/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",       // Expo Router screens
    "./components/**/*.{js,jsx,ts,tsx}",// reusable components
    "./src/**/*.{js,jsx,ts,tsx}",       // optional (good practice)
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
