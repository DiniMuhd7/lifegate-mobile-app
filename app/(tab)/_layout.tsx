/**
 * Tab Layout with Drawer Navigation
 * - ChatScreen as primary (first screen after login)
 * - HomeScreen as secondary
 * - ConversationDrawer as side drawer for conversation history
 */

import React from 'react';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConversationDrawer } from 'components/ConversationDrawer';
import { Ionicons } from '@expo/vector-icons';

/**
 * Custom drawer content showing conversation history
 */
const CustomDrawerContent = (props: any) => {
  return <ConversationDrawer onClose={() => props.navigation.closeDrawer()} />;
};

export default function TabLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        screenOptions={{
          headerShown: false,
          drawerActiveTintColor: '#0AADA2',
          drawerInactiveTintColor: '#999',
          drawerLabelStyle: { marginLeft: -20, fontSize: 16 },
          drawerStyle: {
            backgroundColor: '#fff',
            width: 280,
          },
          overlayColor: 'rgba(0, 0, 0, 0.5)',
        }}
        drawerContent={CustomDrawerContent}
      >
        {/* ChatScreen - Primary screen (first shown after login) */}
        <Drawer.Screen
          name="chatScreen"
          options={{
            title: 'Chat',
            drawerLabel: 'Chat',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="chatbubble" size={size} color={color} />
            ),
          }}
        />

        {/* HomeScreen - Secondary screen (symptom dashboard) */}
        <Drawer.Screen
          name="homescreen"
          options={{
            title: 'Health Dashboard',
            drawerLabel: 'Dashboard',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="pulse" size={size} color={color} />
            ),
          }}
        />

        {/* Patient Profile Screen */}
        <Drawer.Screen
          name="profile"
          options={{
            title: 'Patient Profile',
            drawerLabel: 'Profile',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="person-circle" size={size} color={color} />
            ),
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}
