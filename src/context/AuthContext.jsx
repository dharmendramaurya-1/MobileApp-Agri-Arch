// src/context/AuthContext.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";
import { loginUser } from "../services/api";

// ✅ Create context without TypeScript types
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignupFlow, setIsSignupFlow] = useState(false);

  useEffect(() => {
    loadAuth();
  }, []);

  const loadAuth = async () => {
    try {
      console.log("🔐 Loading auth from storage...");
      
      const savedToken = await AsyncStorage.getItem("authToken");
      const isAuthenticated = await AsyncStorage.getItem("isAuthenticated");
      const signupFlowFlag = await AsyncStorage.getItem("isSignupFlow");
      
      console.log("📦 Auth storage check:");
      console.log("   Token:", savedToken ? "✅ Present" : "❌ Missing");
      console.log("   isAuthenticated:", isAuthenticated);
      console.log("   isSignupFlow from storage:", signupFlowFlag);
      
      if (savedToken && isAuthenticated === "true") {
        setToken(savedToken);
        if (signupFlowFlag === "true") {
          setIsSignupFlow(true);
          console.log("✅ Restored signup flow flag from storage");
        }
        console.log("✅ Auth loaded successfully - Token present");
      } else {
        console.log("⚠️ No token found - User is NOT authenticated");
        setToken(null);
        await clearAuth();
      }
    } catch (e) {
      console.error("❌ Error loading auth:", e);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const setAuthData = async (newToken) => {
    try {
      console.log("🔐 Setting auth data...");
      setToken(newToken);
      await AsyncStorage.setItem("authToken", newToken);
      await AsyncStorage.setItem("isAuthenticated", "true");
      console.log("✅ Auth data set successfully");
    } catch (error) {
      console.error("❌ Error setting auth data:", error);
      throw error;
    }
  };

  // ✅ Normal login - for existing users
  const login = async (email, password) => {
    try {
      setIsLoading(true);
      console.log("🔐 Attempting login for:", email);
      
      const result = await loginUser(email, password);
      console.log("📦 Login result from API:", result);
      
      if (result && result.success && result.token) {
        setToken(result.token);
        await AsyncStorage.setItem("authToken", result.token);
        await AsyncStorage.setItem("isAuthenticated", "true");
        await AsyncStorage.removeItem("isSignupFlow");
        setIsSignupFlow(false);
        
        console.log("✅ Login successful, token stored");
        console.log("🔐 isAuthenticated updated to:", true);
        console.log("🔐 isSignupFlow reset to:", false);
        
        return { 
          success: true, 
          token: result.token,
          data: result.data 
        };
      } else {
        console.log("❌ Login failed:", result?.error || "Unknown error");
        return { 
          success: false, 
          error: result?.error || "Login failed" 
        };
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      return { 
        success: false, 
        error: error.message || "An unexpected error occurred" 
      };
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Special login for signup flow - sets flag to prevent auto-redirect
  const signupLogin = async (email, password) => {
    try {
      setIsLoading(true);
      console.log("🔐 Signup flow login for:", email);
      
      setIsSignupFlow(true);
      await AsyncStorage.setItem("isSignupFlow", "true");
      console.log("✅ isSignupFlow set to true and saved to storage");
      
      const result = await loginUser(email, password);
      console.log("📦 Login result from API:", result);
      
      if (result && result.success && result.token) {
        setToken(result.token);
        await AsyncStorage.setItem("authToken", result.token);
        await AsyncStorage.setItem("isAuthenticated", "true");
        await AsyncStorage.setItem("isSignupFlow", "true");
        
        console.log("✅ Signup login successful, token stored");
        console.log("🔐 isAuthenticated updated to:", true);
        console.log("🔐 isSignupFlow set to:", true);
        
        return { 
          success: true, 
          token: result.token,
          data: result.data 
        };
      } else {
        setIsSignupFlow(false);
        await AsyncStorage.removeItem("isSignupFlow");
        console.log("❌ Signup login failed:", result?.error || "Unknown error");
        return { 
          success: false, 
          error: result?.error || "Login failed" 
        };
      }
    } catch (error) {
      console.error("❌ Signup login error:", error);
      setIsSignupFlow(false);
      await AsyncStorage.removeItem("isSignupFlow");
      return { 
        success: false, 
        error: error.message || "An unexpected error occurred" 
      };
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Reset signup flow flag
  const resetSignupFlow = async () => {
    console.log("🔄 Resetting signup flow flag");
    setIsSignupFlow(false);
    await AsyncStorage.removeItem("isSignupFlow");
    console.log("✅ isSignupFlow reset to false and removed from storage");
  };

  const logout = async () => {
    try {
      console.log("🚪 Logging out...");
      setIsSignupFlow(false);
      await AsyncStorage.removeItem("isSignupFlow");
      await clearAuth();
      router.replace("/(auth)/login");
      console.log("✅ Logged out successfully");
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  const updateToken = async (newToken) => {
    try {
      setToken(newToken);
      await AsyncStorage.setItem("authToken", newToken);
      await AsyncStorage.setItem("isAuthenticated", "true");
      console.log("✅ Token updated successfully");
    } catch (error) {
      console.error("Error updating token:", error);
    }
  };

  const clearAuth = async () => {
    try {
      setToken(null);
      setIsSignupFlow(false);
      
      const keysToRemove = [
        "authToken",
        "isAuthenticated",
        "isSignupFlow",
        "user",
        "userEmail",
        "external_key",
        "publisher_id",
        "Username",
        "profile_id",
        "org_id",
        "group_id"
      ];
      
      await AsyncStorage.multiRemove(keysToRemove);
      console.log("✅ All auth data cleared");
    } catch (error) {
      console.error("Error clearing auth:", error);
    }
  };

  // ── GET API URL ──────────────────────────────────────────────────────────
  const getApiUrl = () => {
    // Use environment variable or default
    return process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.18:3000';
  };

  // ── DELETE THING ──────────────────────────────────────────────────────────
  const deleteThing = async (thingId) => {
    try {
      if (!token) {
        console.error("❌ No auth token available");
        return { success: false, error: "Not authenticated" };
      }

      const apiUrl = getApiUrl();
      const url = `${apiUrl}/things/${thingId}`;
      
      console.log(`🗑️ Deleting thing: ${thingId}`);
      console.log(`📍 URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      console.log(`📡 Response status: ${response.status}`);
      
      if (response.status === 200 || response.status === 204) {
        console.log(`✅ Thing ${thingId} deleted successfully`);
        
        // ✅ Remove from local storage things list
        try {
          const thingsJson = await AsyncStorage.getItem('things');
          if (thingsJson) {
            const things = JSON.parse(thingsJson);
            const updatedThings = things.filter(t => t.id !== thingId);
            await AsyncStorage.setItem('things', JSON.stringify(updatedThings));
          }
        } catch (storageError) {
          console.error("Error updating things storage:", storageError);
        }
        
        // ✅ If active device was deleted, clear it
        try {
          const publisherId = await AsyncStorage.getItem('publisher_id');
          if (publisherId === thingId) {
            await AsyncStorage.removeItem('publisher_id');
            await AsyncStorage.removeItem('external_key');
            console.log("✅ Active device cleared from storage");
          }
        } catch (activeError) {
          console.error("Error clearing active device:", activeError);
        }
        
        return { success: true };
      } else {
        let errorMessage = `Delete failed with status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // Ignore JSON parse error
        }
        console.error(`❌ Delete failed: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('❌ Error deleting thing:', error);
      return { success: false, error: error.message || "Network error occurred" };
    }
  };

  // ── GET ALL THINGS ─────────────────────────────────────────────────────────
  const getAllThingsFromApi = async () => {
    try {
      if (!token) {
        console.error("❌ No auth token available");
        return { success: false, error: "Not authenticated", data: [] };
      }

      const apiUrl = getApiUrl();
      const url = `${apiUrl}/things`;
      
      console.log(`📡 Fetching things from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      console.log(`📡 Response status: ${response.status}`);
      
      if (response.status === 200) {
        const data = await response.json();
        console.log(`✅ Fetched ${data.length || 0} things`);
        return { success: true, data: data };
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to fetch things: ${response.status} - ${errorText}`);
        return { success: false, error: errorText, data: [] };
      }
    } catch (error) {
      console.error('❌ Error fetching things:', error);
      return { success: false, error: error.message, data: [] };
    }
  };

  // ✅ isAuthenticated is derived from token
  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        token,
        isLoading,
        isAuthenticated,
        isSignupFlow,
        login,
        signupLogin,
        resetSignupFlow,
        logout,
        updateToken,
        clearAuth,
        setAuthData,
        // ✅ NEW FUNCTIONS
        deleteThing,
        getAllThingsFromApi,
        getApiUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}