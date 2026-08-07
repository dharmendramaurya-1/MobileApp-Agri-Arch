// src/services/identify/identify.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Get all things for the current user ──────────────────────────────────
export const getAllThings = async () => {
    try {
        const authToken = await AsyncStorage.getItem("authToken");

        if (!authToken) {
            console.error("❌ No auth token found");
            return [];
        }

        console.log("🔍 Fetching all things...");

        const response = await axios.post(
            `${BASE_URL}/things/search`,
            {
                limit: 100,
                offset: 0
            },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                }
            }
        );

        console.log("📡 Search response status:", response.status);
        
        // ✅ Extract things array from response
        const things = response.data?.things || [];
        console.log("📦 Found things:", things.length);

        if (things.length > 0) {
            // Process each thing to get external key from details API
            const thingsWithKeys = await Promise.all(
                things.map(async (thing) => {
                    // ✅ Get external_key from thing details API
                    const externalKey = await getThingExternalKey(thing.id);
                    
                    return {
                        ...thing,
                        external_key: externalKey,
                        displayName: thing.name || `Device ${thing.id.substring(0, 8)}`,
                        status: 'disconnected', // Initial status
                    };
                })
            );

            console.log("✅ Processed", thingsWithKeys.length, "things with external keys");
            return thingsWithKeys;
        }

        return [];
    } catch (error) {
        console.error("❌ Error fetching things:", error);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        }
        return [];
    }
};

// ─── Get a single thing by ID ──────────────────────────────────────────────
export const getThingById = async (thingId) => {
    try {
        const authToken = await AsyncStorage.getItem("authToken");

        if (!authToken) {
            console.error("❌ No auth token found");
            return null;
        }

        console.log(`🔍 Getting thing details for ID: ${thingId}`);

        const response = await axios.get(
            `${BASE_URL}/things/${thingId}`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                }
            }
        );

        console.log("📡 Thing details response:", response.status);

        if (response.data) {
            const thing = response.data;
            
            // ✅ Get external_key from the details response
            const externalKey = thing.external_key || null;
            
            console.log(`✅ Thing details - Name: ${thing.name}, External Key: ${externalKey}`);
            
            return {
                ...thing,
                external_key: externalKey,
                displayName: thing.name || `Device ${thing.id.substring(0, 8)}`,
            };
        }
        return null;
    } catch (error) {
        console.error("❌ Error getting thing:", error);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
};

// ─── Get external_key using thing ID ──────────────────────────────────────
export const getThingExternalKey = async (thingId) => {
    try {
        const authToken = await AsyncStorage.getItem("authToken");

        if (!authToken) {
            console.error("❌ No auth token found");
            return null;
        }

        console.log(`🔍 Getting external_key for thing ID: ${thingId}`);

        const response = await axios.get(
            `${BASE_URL}/things/${thingId}`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                }
            }
        );

        console.log(`📡 Thing details response for ${thingId}:`, response.status);

        if (response.data) {
            // ✅ Only use external_key, not the 'key' field
            const externalKey = response.data.external_key || null;
            
            if (externalKey) {
                console.log(`✅ External key for thing ${thingId}:`, externalKey);
                return externalKey;
            }
            
            console.error(`❌ No external_key in response for thing ${thingId}:`, response.data);
            return null;
        }
        return null;

    } catch (error) {
        console.error(`❌ Error getting thing external_key for ${thingId}:`, error);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
};

// ─── Set active device (store in AsyncStorage) ────────────────────────────
export const setActiveDevice = async (thingId, externalKey) => {
    try {
        await AsyncStorage.setItem("publisher_id", String(thingId));
        await AsyncStorage.setItem("external_key", externalKey);
        console.log("✅ Active device set:", { thingId, externalKey });
        return true;
    } catch (error) {
        console.error("❌ Error setting active device:", error);
        return false;
    }
};

// ─── Get active device ──────────────────────────────────────────────────────
export const getActiveDevice = async () => {
    try {
        const publisherId = await AsyncStorage.getItem("publisher_id");
        const externalKey = await AsyncStorage.getItem("external_key");
        return { publisherId, externalKey };
    } catch (error) {
        console.error("❌ Error getting active device:", error);
        return null;
    }
};

// ─── Get stored external key ──────────────────────────────────────────────
export const getStoredExternalKey = async () => {
    try {
        return await AsyncStorage.getItem("external_key");
    } catch (error) {
        console.error("Error getting stored external key:", error);
        return null;
    }
};

// ─── Get stored publisher ID ──────────────────────────────────────────────
export const getStoredPublisherId = async () => {
    try {
        return await AsyncStorage.getItem("publisher_id");
    } catch (error) {
        console.error("Error getting stored publisher ID:", error);
        return null;
    }
};

// ─── Check if device is configured ──────────────────────────────────────────
export const isDeviceConfigured = async () => {
    try {
        const externalKey = await AsyncStorage.getItem("external_key");
        const publisherId = await AsyncStorage.getItem("publisher_id");
        return !!(externalKey && publisherId);
    } catch (error) {
        console.error("Error checking device configuration:", error);
        return false;
    }
};

// ─── Clear device data (for logout/reset) ──────────────────────────────────
export const clearDeviceData = async () => {
    try {
        await AsyncStorage.removeItem("external_key");
        await AsyncStorage.removeItem("publisher_id");
        console.log("✅ Device data cleared");
    } catch (error) {
        console.error("Error clearing device data:", error);
    }
};

// ─── Debug stored data ──────────────────────────────────────────────────────
export const debugStoredData = async () => {
    try {
        console.log("=== DEBUG STORED DATA ===");
        const externalKey = await AsyncStorage.getItem("external_key");
        const publisherId = await AsyncStorage.getItem("publisher_id");
        const authToken = await AsyncStorage.getItem("authToken");
        const profileId = await AsyncStorage.getItem("profile_id");
        
        console.log("Auth Token:", authToken ? "✅ Present" : "❌ Missing");
        console.log("Profile ID:", profileId || "❌ Missing");
        console.log("Publisher ID:", publisherId || "❌ Missing");
        console.log("External Key:", externalKey || "❌ Missing");
        console.log("=== END DEBUG ===");
        
        return { authToken, profileId, publisherId, externalKey };
    } catch (error) {
        console.error("Error debugging stored data:", error);
        return null;
    }
};

// ─── Combined function: Identify and get external_key ──────────────────────
export const identifyAndGetExternalKey = async () => {
    try {
        // Check if we already have everything stored
        const existingExternalKey = await AsyncStorage.getItem("external_key");
        const existingPublisherId = await AsyncStorage.getItem("publisher_id");
        
        if (existingExternalKey && existingPublisherId) {
            console.log("✅ Using cached thing data");
            console.log("   Publisher ID:", existingPublisherId);
            console.log("   External Key:", existingExternalKey);
            return {
                id: existingPublisherId,
                externalKey: existingExternalKey,
                cached: true
            };
        }

        // Get all things
        const allThings = await getAllThings();
        
        if (allThings && allThings.length > 0) {
            const firstThing = allThings[0];
            
            // ✅ Get the external_key from the thing
            const externalKey = firstThing.external_key;
            
            if (externalKey) {
                await setActiveDevice(firstThing.id, externalKey);
                console.log("✅ Full identification complete:");
                console.log("   Publisher ID:", firstThing.id);
                console.log("   External Key:", externalKey);
                return {
                    id: firstThing.id,
                    externalKey: externalKey,
                    cached: false,
                    name: firstThing.name,
                    type: firstThing.type,
                };
            }
        }

        console.error("❌ No things found or no external key available");
        return null;
    } catch (error) {
        console.error("❌ Error in identifyAndGetExternalKey:", error);
        return null;
    }
};

// ─── Search things with custom filters ─────────────────────────────────────
export const searchThings = async (filters = {}) => {
    try {
        const authToken = await AsyncStorage.getItem("authToken");

        if (!authToken) {
            console.error("❌ No auth token found");
            return [];
        }

        const { limit = 100, offset = 0, name = null, type = null } = filters;

        const requestBody = {
            limit: limit,
            offset: offset
        };

        if (name) requestBody.name = name;
        if (type) requestBody.type = type;

        console.log("🔍 Searching things with filters:", requestBody);

        const response = await axios.post(
            `${BASE_URL}/things/search`,
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    "Content-Type": "application/json",
                }
            }
        );

        if (response.status === 200) {
            const things = response.data?.things || [];
            
            // ✅ Process each thing to get external_key from details API
            const processedThings = await Promise.all(
                things.map(async (thing) => {
                    // ✅ Always get external_key from thing details
                    const externalKey = await getThingExternalKey(thing.id);
                    
                    return {
                        ...thing,
                        external_key: externalKey,
                        displayName: thing.name || `Device ${thing.id.substring(0, 8)}`,
                    };
                })
            );
            
            return processedThings;
        }

        return [];
    } catch (error) {
        console.error("❌ Error searching things:", error);
        return [];
    }
};