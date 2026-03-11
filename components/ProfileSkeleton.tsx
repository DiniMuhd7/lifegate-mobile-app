import React, { useEffect, useState } from 'react';
import { View, SafeAreaView, ScrollView } from 'react-native';

/**
 * ProfileSkeleton - Animated skeleton loader for profile screen
 * Shows placeholder boxes while user profile data is loading
 */
export const ProfileSkeleton: React.FC = () => {
  const [opacity, setOpacity] = useState(0.6);

  // Shimmer animation
  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity((prev) => (prev === 0.6 ? 0.9 : 0.6));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Gradient Header Skeleton */}
        <View className="bg-gradient-to-b from-teal-600 to-teal-900 pb-8 pt-4">
          <View className="items-center">
            {/* Avatar Skeleton */}
            <View
              className="h-20 w-20 rounded-full bg-white/30 border-4 border-white"
              style={{ opacity }}
            />

            {/* Name Skeleton */}
            <View
              className="mt-4 h-6 w-32 rounded-md bg-white/30"
              style={{ opacity }}
            />

            {/* Patient ID Skeleton */}
            <View
              className="mt-2 h-4 w-24 rounded-md bg-white/20"
              style={{ opacity }}
            />
          </View>
        </View>

        {/* Content Section */}
        <View className="px-6 py-6">
          {/* Personal Information Section */}
          <View className="mb-8">
            {/* Section Header Skeleton */}
            <View className="mb-4 flex-row items-center justify-between">
              <View
                className="h-5 w-40 rounded-md bg-gray-300"
                style={{ opacity }}
              />
              <View
                className="h-8 w-8 rounded-lg bg-gray-200"
                style={{ opacity }}
              />
            </View>

            {/* Info Card Skeleton */}
            <View className="space-y-4 rounded-lg bg-gray-50 p-4">
              {/* Full Name Row */}
              <View className="border-b border-gray-200 pb-3">
                <View
                  className="mb-1 h-3 w-16 rounded-md bg-gray-300"
                  style={{ opacity }}
                />
                <View
                  className="h-4 w-32 rounded-md bg-gray-200"
                  style={{ opacity }}
                />
              </View>

              {/* Email Row */}
              <View className="border-b border-gray-200 pb-3">
                <View
                  className="mb-1 h-3 w-12 rounded-md bg-gray-300"
                  style={{ opacity }}
                />
                <View
                  className="h-4 w-48 rounded-md bg-gray-200"
                  style={{ opacity }}
                />
              </View>

              {/* Phone Row */}
              <View className="border-b border-gray-200 pb-3">
                <View
                  className="mb-1 h-3 w-24 rounded-md bg-gray-300"
                  style={{ opacity }}
                />
                <View
                  className="h-4 w-40 rounded-md bg-gray-200"
                  style={{ opacity }}
                />
              </View>

              {/* Gender Row */}
              <View className="border-b border-gray-200 pb-3">
                <View
                  className="mb-1 h-3 w-16 rounded-md bg-gray-300"
                  style={{ opacity }}
                />
                <View
                  className="h-4 w-20 rounded-md bg-gray-200"
                  style={{ opacity }}
                />
              </View>

              {/* DOB Row */}
              <View className="pb-3">
                <View
                  className="mb-1 h-3 w-24 rounded-md bg-gray-300"
                  style={{ opacity }}
                />
                <View
                  className="h-4 w-32 rounded-md bg-gray-200"
                  style={{ opacity }}
                />
              </View>
            </View>
          </View>

          {/* Password & Security Section */}
          <View className="mb-8">
            {/* Section Header Skeleton */}
            <View className="mb-4 flex-row items-center justify-between">
              <View
                className="h-5 w-40 rounded-md bg-gray-300"
                style={{ opacity }}
              />
              <View
                className="h-6 w-32 rounded-md bg-gray-200"
                style={{ opacity }}
              />
            </View>

            {/* Info Card Skeleton */}
            <View className="rounded-lg bg-gray-50 p-4">
              <View
                className="h-4 w-56 rounded-md bg-gray-200"
                style={{ opacity }}
              />
            </View>
          </View>

          {/* Language Section */}
          <View>
            {/* Section Header Skeleton */}
            <View
              className="mb-3 h-5 w-24 rounded-md bg-gray-300"
              style={{ opacity }}
            />

            {/* Language Dropdown Skeleton */}
            <View
              className="h-12 rounded-lg border border-gray-200 bg-gray-50"
              style={{ opacity }}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
