import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
const token = AsyncStorage.getItem("authToken");
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
export const group_creat = async (org_id, name) => {
  const token = await AsyncStorage.getItem("authToken");
  console.log("group hit succesfully ", token);

  try {
    const response = await axios.post(
      `${BASE_URL}/svcthings/orgs/${org_id}/groups`,
      [
        {
          name: `${name}' groups`,
          description: `${name}' more info`,
          metadata: { groups: "ur group" },
        },
      ],
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

export const groupview = async () => {
  const token = await AsyncStorage.getItem("authToken");
  console.log("group view hit ", token);

  try {
    const response = await axios.get(`${BASE_URL}/groups`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    console.log(response, "view clear ");
    return response;
  } catch (e) {
    console.log(e);
  }
};
