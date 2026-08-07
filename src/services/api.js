// src/services/api.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add token to all requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============ AUTHENTICATION API ============

// Register user - NO TOKEN REQUIRED
export const Register = async (email, password) => { 
  try {
    console.log(`📝 Registering user: ${email}`);

    const response = await axios.post(
      `${BASE_URL}/users`,
      {
        email: email,
        password: password,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Registration successful:", response.status);
    return {
      success: true,
      data: response.data,
      status: response.status,
    };
  } catch (error) {
    console.error("❌ Registration error:", error.response?.data || error.message);

    let errorMessage = "Registration failed. Please try again.";

    if (error.response?.status === 409) {
      errorMessage = "User already exists. Please login instead.";
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    return {
      success: false,
      error: errorMessage,
      status: error.response?.status,
      data: error.response?.data,
    };
  }
};

// Login user - ONLY RETURNS TOKEN
export const loginUser = async (email, password) => {
  // Only basic validation - check if fields are empty
  if (!email || !password) {
    return {
      success: false,
      error: "Email and password are required",
      errorType: "validation",
    };
  }

  // Only validate email format (this is a UX thing, not security)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      error: "Please enter a valid email address",
      errorType: "validation",
    };
  }

  try {
    console.log(`🔐 Logging in to: ${BASE_URL}/tokens`);

    const response = await axios.post(
      `${BASE_URL}/tokens`,
      {
        email: email.trim().toLowerCase(),
        password: password,
      },
      {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Login successful, token received");

    const token = response.data.token || response.data.access_token || response.data;

    if (!token) {
      return {
        success: false,
        error: "No authentication token received",
        errorType: "server",
      };
    }

    // Store token
    await AsyncStorage.setItem("authToken", token);
    await AsyncStorage.setItem("isAuthenticated", "true");

    return {
      success: true,
      token: token,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Login error:", error.response?.data || error.message);

    let errorMessage = "Login failed. Please check your credentials.";
    let errorType = "general";

    // Network errors
    if (error.code === "ECONNABORTED") {
      errorMessage = "Connection timeout. Please try again.";
      errorType = "timeout";
    } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
      errorMessage = "Network error. Please check your internet connection.";
      errorType = "network";
    }
    // Server response errors - Let server tell us what's wrong
    else if (error.response) {
      const { status, data } = error.response;

      // Use server's error message directly
      const serverMessage =
        data?.message ||
        data?.error ||
        data?.detail ||
        data?.error_description ||
        data?.errors?.password?.[0] || // If server returns field-specific errors
        data?.errors?.email?.[0] ||
        null;

      // Handle different status codes
      switch (status) {
        case 400:
          errorMessage = serverMessage || "Invalid request. Please check your input.";
          errorType = "bad_request";
          break;
        case 401:
          errorMessage = serverMessage || "Invalid email or password";
          errorType = "unauthorized";
          break;
        case 403:
          errorMessage = serverMessage || "Access denied. Please contact support.";
          errorType = "forbidden";
          break;
        case 404:
          errorMessage = serverMessage || "Account not found. Please sign up.";
          errorType = "not_found";
          break;
        case 422:
          // Unprocessable Entity - Server validation failed
          errorMessage = serverMessage || "Validation error. Please check your input.";
          errorType = "validation";
          break;
        case 429:
          errorMessage = "Too many attempts. Please try again later.";
          errorType = "rate_limit";
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = serverMessage || "Server error. Please try again later.";
          errorType = "server_error";
          break;
        default:
          errorMessage = serverMessage || `Error ${status}: Please try again.`;
          errorType = "server_error";
      }
    } else if (error.request) {
      errorMessage = "No response from server. Please check your connection.";
      errorType = "no_response";
    }

    return {
      success: false,
      error: errorMessage,
      errorType: errorType,
      status: error.response?.status,
    };
  }
};

// Update user - requires token
export const updateUser = async (name, email, mobile, password) => {
  try {
    console.log("📝 updateUser called with:", {
      name,
      email,
      mobile,
      password: password ? "***" : undefined,
    });

    const token = await AsyncStorage.getItem("authToken");

    if (!token) {
      console.error("❌ No auth token found");
      throw new Error("No auth token found");
    }

    // Build the metadata object with only provided fields
    const metadata = {};

    if (name) {
      metadata.name = name;
      console.log("   ✅ Adding name:", name);
    }
    if (email) {
      metadata.email = email;
      console.log("   ✅ Adding email:", email);
    }
    if (mobile) {
      metadata.mobile = mobile;
      console.log("   ✅ Adding mobile:", mobile);
    }
    if (password) {
      metadata.password = password;
      console.log("   ✅ Adding password: ***");
    }

    // Check if there's anything to update
    if (Object.keys(metadata).length === 0) {
      console.warn("⚠️ No fields provided to update");
      return {
        success: false,
        error: "No fields provided to update",
      };
    }

    console.log("📤 Sending update request with metadata:", JSON.stringify(metadata, null, 2));

    // Send data in the required format
    const response = await axios.put(
      `${BASE_URL}/users`,
      { metadata },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ User updated successfully!");
    console.log("   Status:", response.status);
    console.log("   Response:", JSON.stringify(response.data, null, 2));

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("❌ Update user error:");
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", error.response.data);
      console.error("   Headers:", error.response.headers);
    } else if (error.request) {
      console.error("   No response received:", error.request);
    } else {
      console.error("   Error message:", error.message);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || "Failed to update user",
    };
  }
};

// Export the api instance for other uses
export default api;