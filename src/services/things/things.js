import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const thing_creat = async (thingId, thingName, thingType) => {
  const authToken = await AsyncStorage.getItem("authToken");
  const profileId = await AsyncStorage.getItem("profile_id");

  const response = await axios.post(
    `${BASE_URL}/profiles/${profileId}/things`,
    [
      {
        id: thingId,
        name: thingName,
        metadata: {},
        type: thingType,
      },
    ],
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    },
  );
    if(response.status=201){
      console.log("this is we have check now")
    }
  return response;
};
