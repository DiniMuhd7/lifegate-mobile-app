import React, { useState } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { PrimaryButton } from "components/Button";
import { useAuthStore } from "stores/auth-store";
import { router } from "expo-router";

export default function ReviewScreen() {
  const { healthProfessionalDraft, HealthProfessionalRegister } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      console.log("Final submission data:", healthProfessionalDraft);
      await HealthProfessionalRegister(); // call your store's register function with healthProfessionalDraft
      setModalVisible(true); // show confirmation modal
    } catch (error) {
      console.error("Registration failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleModalConfirm = () => {
    setModalVisible(false);
    router.replace("/(auth)/login");
  };

  return (
    <View className="flex-1 justify-start items-center pt-10">
      <Text className="text-lg font-semibold mb-6">
        Review your information and submit your application.
      </Text>

      {/* Optional: summary of filled details */}
      <View className="mb-6 px-3 w-full bg-gray-100 rounded-lg">
        <Text>Name: {healthProfessionalDraft.name}</Text>
        <Text>Email: {healthProfessionalDraft.email}</Text>
        <Text>Phone: {healthProfessionalDraft.phone}</Text>
        <Text>Specialization: {healthProfessionalDraft.specialization}</Text>
        <Text>Language: {healthProfessionalDraft.language}</Text>
      </View>

      <PrimaryButton
        title={loading ? "Submitting..." : "Submit Application"}
        onPress={handleFinalSubmit}
        disabled={loading}
      />

      {/* Confirmation Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleModalConfirm}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white w-80 p-6 rounded-lg items-center">
            <Text className="text-center text-lg font-bold mb-4">
              Application Submitted
            </Text>
            <Text className="text-center mb-6">
              We’ve received your application. We’ll get back to you soon!
            </Text>
            <Pressable
              onPress={handleModalConfirm}
              className="bg-[#0EA5A4] px-6 py-2 rounded"
            >
              <Text className="text-white font-semibold text-center">
                OK
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
