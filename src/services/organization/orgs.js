import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const orgscreated = async (name) => {
  const token = await AsyncStorage.getItem("authToken");
  console.log("org is hitting properly", token);
  try {
    const response = await axios.post(
      `${BASE_URL}/orgs`,
      { name: `org's ${name}`, description: `description of orgs ${name}` },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    return response;
  } catch (e) {
    console.log(e);
  }
};

export const vieworgs = async () => {
  const token = await AsyncStorage.getItem("authToken");

  console.log("view hit properly", token);
  try {
    const response = await axios.get(`${BASE_URL}/orgs`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return response;
  } catch (e) {
    if (e.response?.data?.message) {
      console.log(e.response.data.message);
    }
  }
};
