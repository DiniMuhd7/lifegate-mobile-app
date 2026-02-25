import React, { useDeferredValue, useState } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { PrimaryButton } from "components/Button";
import { useAuthStore } from "stores/auth-store";
import { router } from "expo-router";

export default function UserReviewStep() {
  const { userDraft, UserRegister } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFinalSubmit =  async () => {
    // console.log(userDraft)
    await UserRegister();
    // setLoading(true);
    // try {
    //   await UserRegister();
    //   console.log(userDraft)
    //   setModalVisible(true);
    // } catch (error) {
    //   console.error("Registration failed", error);
    // } finally {
    //   setLoading(false);
    //   handleModalConfirm()
    // }
  };

  const handleModalConfirm = () => {
    setModalVisible(false);
    router.replace("/(auth)/login");
  };

  return (
    <View className="px-6 flex-1 justify-center">
      <Text className="text-lg font-semibold mb-6">
        Review your information before submitting.
      </Text>

      <View className="mb-6 p-4 bg-gray-100 rounded-lg">
        <Text>Name: {userDraft.name}</Text>
        <Text>Email: {userDraft.email}</Text>
        <Text>Phone: {userDraft.phone}</Text>
        <Text>Gender: {userDraft.gender}</Text>
        <Text>DOB: {userDraft.dob}</Text>
      </View>

      <PrimaryButton
        title={loading ? "Submitting..." : "Submit Application"}
        onPress={handleFinalSubmit}
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white w-80 p-6 rounded-lg items-center">
            <Text className="text-center text-lg font-bold mb-4">
              Application Submitted
            </Text>
            <Text className="text-center mb-6">
              We’ve received your application. We’ll get back to you soon!
            </Text>
            <Pressable
              onPress={handleFinalSubmit}
              className="bg-[#0EA5A4] px-6 py-2 rounded"
            >
              <Text className="text-white font-semibold text-center">OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
