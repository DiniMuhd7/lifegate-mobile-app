import React from 'react'
import { View, Text } from 'react-native'
import { useAuthStore } from 'stores/auth-store'
import { router } from 'expo-router'
import { PrimaryButton } from 'components/Button'

const handlelogout =  () =>{
  handlelogout()
  router.push('/(auth)/login')
}

const homescreen = () => {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-gray-800">Welcome to the Home Screen</Text>
      <PrimaryButton title="Logout" onPress={() => handlelogout()} />

    </View>
  )
}

export default homescreen