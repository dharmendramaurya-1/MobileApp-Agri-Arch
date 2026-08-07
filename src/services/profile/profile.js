// src/services/profile/profile.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const profile_creat = async (group_id, name) => {
  const authToken = await AsyncStorage.getItem("authToken");

  if (!authToken) {
    throw new Error("No auth token found");
  }

  if (!group_id) {
    throw new Error("No group ID found");
  }

  const profileData = [
    {
      name: `profile ${name}`,
      metadata: {
        username: name,
      },
      config: {
        content_type: "application/senml+json",
        write_enabled: true,
        webhook_enabled: true,
        rule_enabled: true,
        transformer: {
          data_filters: [
            "temp", "humidity", "water_temp", "co2", "ec",
            "ph", "level", "lux", "device_status",
            "water_pump", "water_ILvalve", "water_OLvalve",
            "nutrient_pump", "reboot_ack"
          ],
          data_field: "",
          // ✅ IMPORTANT: Use "created" for individual timestamps
          time_field: "created",
          time_format: "rfc3339",  // RFC3339 format (ISO 8601)
          time_location: "UTC"
        }
      }
    }
  ];

  console.log("📤 Sending profile data:", JSON.stringify(profileData, null, 2));

  try {
    const response = await axios.post(
      `${BASE_URL}/groups/${group_id}/profiles`,
      profileData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Response status:", response.status);
    console.log("📦 Response data:", JSON.stringify(response.data, null, 2));

    if (response.status === 201 || response.status === 200) {
      console.log("✅ Profile created successfully");
      
      // Store the profile_id from response
      const profileId = response.data?.profiles?.[0]?.id || response.data?.id;
      if (profileId) {
        await AsyncStorage.setItem("profile_id", profileId);
        console.log("✅ Profile ID stored:", profileId);
      }
    }
    return response;
  } catch (error) {
    console.error("❌ Error creating profile:");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("Message:", error.message);
    throw error;
  }
};

export const user_profile = async () => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    if (!authToken) {
      throw new Error("No auth token found");
    }

    const response = await axios.get(`${BASE_URL}/profiles`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("📦 Profiles response:", JSON.stringify(response.data, null, 2));

    if (response.data?.profiles && response.data.profiles.length > 0) {
      const username = response.data.profiles[0]?.metadata?.username || "User";
      console.log("👤 Username:", username);
      return username;
    }
    
    return "User";
  } catch (error) {
    console.error("❌ Error fetching profile:", error.message);
    return "User";
  }
};

// Function to get profile ID
export const getProfileId = async () => {
  try {
    const profileId = await AsyncStorage.getItem("profile_id");
    console.log("📦 Profile ID from storage:", profileId);
    return profileId;
  } catch (error) {
    console.error("❌ Error getting profile ID:", error);
    return null;
  }
};

// Function to check if profile exists
export const profileExists = async () => {
  try {
    const profileId = await AsyncStorage.getItem("profile_id");
    return !!profileId;
  } catch (error) {
    return false;
  }
};