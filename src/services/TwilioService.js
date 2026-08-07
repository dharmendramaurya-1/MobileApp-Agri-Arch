// src/services/TwilioService.js
import axios from "axios";

// ⚠️ FOR TESTING ONLY - Never expose credentials in production!
// Replace these with your actual credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

// Base64 encode credentials for Basic Auth
const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

// Create axios instance
const twilioClient = axios.create({
  baseURL: "https://verify.twilio.com/v2",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Basic ${credentials}`,
  },
  timeout: 30000,
});

export const TwilioService = {
  /**
   * Send OTP via Twilio Verify API
   * ⚠️ FOR TESTING ONLY - Never expose credentials in production!
   */
  sendOTP: async (phoneNumber) => {
    try {
      // Ensure phone number has + prefix
      const formattedNumber = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+${phoneNumber}`;

      console.log("📱 Sending OTP to:", formattedNumber);
      console.log("🔑 Using Service SID:", TWILIO_VERIFY_SERVICE_SID);

      const response = await twilioClient.post(
        `/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`,
        new URLSearchParams({
          To: formattedNumber,
          Channel: "sms",
        }).toString(),
      );

      console.log("✅ Twilio Response:", response.data);

      return {
        success: true,
        status: response.data.status,
        sid: response.data.sid,
        to: response.data.to,
        channel: response.data.channel,
        data: response.data,
      };
    } catch (error) {
      console.error("❌ Send OTP Error Details:");

      // Log detailed error information for debugging
      if (error.response) {
        console.error("📊 Response Status:", error.response.status);
        console.error(
          "📊 Response Data:",
          JSON.stringify(error.response.data, null, 2),
        );
        console.error("📊 Response Headers:", error.response.headers);

        // Twilio error codes
        const errorCode = error.response.data?.code;
        const errorMessage = error.response.data?.message || "Unknown error";

        // Handle specific Twilio error codes
        if (errorCode === 21608) {
          throw new Error(
            "UNVERIFIED_NUMBER: This phone number is not verified in Twilio Console. Add it as a Verified Caller ID first.",
          );
        } else if (errorCode === 20404) {
          throw new Error(
            "INVALID_SERVICE: The Verify Service SID is invalid. Please check your Service SID.",
          );
        } else if (errorCode === 20003) {
          throw new Error(
            "AUTH_ERROR: Authentication failed. Check your Account SID and Auth Token.",
          );
        } else if (errorCode === 60363) {
          throw new Error(
            "INVALID_NUMBER: The phone number format is invalid. Use E.164 format (e.g., +911234567890).",
          );
        } else if (errorCode === 60200) {
          throw new Error(
            "RATE_LIMIT: Too many requests. Please wait a moment.",
          );
        } else {
          throw new Error(`${errorMessage} (Code: ${errorCode || "Unknown"})`);
        }
      } else if (error.request) {
        console.error("📊 No response received:", error.request);
        throw new Error(
          "NO_RESPONSE: No response from Twilio server. Check your internet connection.",
        );
      } else {
        console.error("📊 Request setup error:", error.message);
        throw new Error(error.message || "REQUEST_ERROR: Failed to send OTP.");
      }
    }
  },

  /**
   * Verify OTP with Twilio
   */
  verifyOTP: async (phoneNumber, code) => {
    try {
      const formattedNumber = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+${phoneNumber}`;

      const response = await twilioClient.post(
        `/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
        new URLSearchParams({
          To: formattedNumber,
          Code: code,
        }).toString(),
      );

      console.log("✅ Verify Response:", response.data);

      return {
        success: response.data.status === "approved",
        status: response.data.status,
        to: response.data.to,
        valid: response.data.status === "approved",
        data: response.data,
      };
    } catch (error) {
      console.error(
        "❌ Verify OTP Error:",
        error.response?.data || error.message,
      );

      if (error.response) {
        const errorMessage = error.response.data?.message || "Invalid OTP";
        throw new Error(errorMessage);
      } else {
        throw new Error("Failed to verify OTP. Please try again.");
      }
    }
  },

  /**
   * Resend OTP
   */
  resendOTP: async (phoneNumber) => {
    return await TwilioService.sendOTP(phoneNumber);
  },

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber: (number, countryCode = "91") => {
    // Remove all non-numeric characters
    const cleaned = number.replace(/\D/g, "");
    // Remove leading zero if present
    const withoutLeadingZero = cleaned.replace(/^0+/, "");
    // Format with country code
    return `+${countryCode}${withoutLeadingZero}`;
  },

  /**
   * Validate phone number format
   */
  validatePhoneNumber: (number, countryCode = "91") => {
    const cleaned = number.replace(/\D/g, "");
    if (cleaned.length < 10 || cleaned.length > 15) return false;
    const formatted = TwilioService.formatPhoneNumber(number, countryCode);
    return formatted.length >= 12 && formatted.length <= 16;
  },
};
