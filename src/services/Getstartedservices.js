import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const getstarted = async () => {
  console.log("checkidr");
  const response = await axios.post(`${BASE_URL}/tokens`, {
    email: "admin@example.com",
    password: "12345678",
  });

  console.log(response.data.token, "fdchecktoken");
  if (response.data.token) {
    let tokens = response.data.token;
    await AsyncStorage.setItem("authToken", tokens);
    await AsyncStorage.setItem("cropsAdmin", tokens);
  }
};

export const Register = async (email, password) => {
  const token = await AsyncStorage.getItem("authToken");

  try {
    const response = await axios.post(
      `${BASE_URL}/users`,
      { email: email, password: password },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("Success:", response.status);
    return response;
  } catch (e) {
    // THIS IS WHAT YOU NEED TO SEE
    console.log("=== FULL ERROR ===");
    console.log("Status:", e.response?.status);
    console.log("Response data:", e.response?.data);
    console.log("Response message:", e.response?.data?.message);
    console.log("=================");

    // Also log the error object itself
    console.log("Error object:", JSON.stringify(e, null, 2));
  }
};
export const userupdate = async (name, mobilenumber, email,password) => {
  const token = AsyncStorage.getItem("authToken");
  console.log("it is taking from getstarted for user update")
  try {
    const response = await axios.put(
      `${BASE_URL}/users`,
      {
        name: name,
        mobilenumber: mobilenumber,
        Email: email,
        password:password
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    return response.status;
  } catch (e) {
    console.log(e);
  }
};
