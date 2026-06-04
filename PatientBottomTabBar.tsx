import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

const PatientBottomTabBar = () => {
    return (
        <Tab.Navigator>
            <Tab.Screen 
                name="Timeline"
                component={TimelineScreen}
                options={{
                    tabBarLabel: 'Profile',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="ios-person" color={color} size={size} />
                    ),
                }}
            />
            <Tab.Screen 
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarLabel: 'Settings',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="ios-settings" color={color} size={size} />
                    ),
                }}
            />
        </Tab.Navigator>
    );
};

export default PatientBottomTabBar;