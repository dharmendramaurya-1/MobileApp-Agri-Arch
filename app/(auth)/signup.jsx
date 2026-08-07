// app/(auth)/signup.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemContext";
import { updateUser } from "../../src/services/api";
import { Register } from "../../src/services/Getstartedservices";
import { group_creat, groupview } from "../../src/services/groups/groups";
import { orgscreated, vieworgs } from "../../src/services/organization/orgs";
import { profile_creat } from "../../src/services/profile/profile";
import { TwilioService } from "../../src/services/TwilioService";

export default function SignupScreen() {
  const { theme } = useTheme();
  const { signupLogin } = useAuth(); // ✅ Use signupLogin instead of login
  
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [phoneNumberWithCode, setPhoneNumberWithCode] = useState("");
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [otpStatus, setOtpStatus] = useState("");

  const inputRefs = useRef([]);
  const scrollViewRef = useRef(null);

  const COUNTRY_CODE = "91";
  const MAX_OTP_ATTEMPTS = 3;

  let mobileInputRef = null;
  let emailInputRef = null;
  let passwordInputRef = null;
  let confirmPasswordInputRef = null;

  const handleSendOtp = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }
    if (!mobileNumber.trim() || mobileNumber.length < 10) {
      Alert.alert("Error", "Please enter a valid 10-digit mobile number");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    if (!password) {
      Alert.alert("Error", "Please enter a password");
      return;
    }
    const passwordRegex =
      /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

    if (!passwordRegex.test(password)) {
      Alert.alert(
        "Invalid Password",
        "Password must contain:\n\n• Minimum 8 characters\n• At least 1 uppercase letter\n• At least 1 number\n• At least 1 special character (!@#$%^&*)",
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    // 🚧 TEMP-BYPASS: OTP disabled for testing
    setIsLoading(true);
    setPhoneNumberWithCode(`${COUNTRY_CODE}${mobileNumber}`);
    setOtpStatus("verified");
    setIsLoading(false);

    await completeRegistration();
  };

  const handleOtpChange = (text, index) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (text && index === 5 && newOtp.every((digit) => digit !== "")) {
      handleVerifyOtp();
    }
  };

  const handleVerifyOtp = async () => {
    const enteredOtp = otp.join("");
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    if (enteredOtp.length !== 6) {
      Alert.alert("Error", "Please enter complete 6-digit OTP");
      return;
    }

    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
      Alert.alert(
        "Too Many Attempts",
        "Maximum attempts exceeded. Please request a new OTP.",
      );
      return;
    }

    setIsLoading(true);
    setOtpStatus("verifying");

    try {
      const response = await TwilioService.verifyOTP(
        phoneNumberWithCode,
        enteredOtp,
      );

      if (response.success) {
        setOtpStatus("verified");
        Alert.alert("Success", "Mobile number verified successfully!");
        setShowOtpModal(false);

        await completeRegistration();
      } else {
        const newAttempts = otpAttempts + 1;
        setOtpAttempts(newAttempts);
        setOtpStatus("invalid");

        const remainingAttempts = MAX_OTP_ATTEMPTS - newAttempts;
        Alert.alert(
          "Invalid OTP",
          `Incorrect code. ${remainingAttempts} attempt(s) remaining.`,
        );

        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (error) {
      console.error("Verify OTP Error:", error);
      setOtpStatus("error");

      let errorMessage = error.message || "OTP verification failed.";

      if (error.message?.includes("expired")) {
        errorMessage = "OTP has expired. Please request a new code.";
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = async () => {
    setIsResending(true);
    setOtpStatus("resending");

    try {
      const response = await TwilioService.resendOTP(phoneNumberWithCode);

      if (response.success) {
        setOtpStatus("resent");
        Alert.alert("OTP Resent", `New OTP sent to ${phoneNumberWithCode}`);
        setOtp(["", "", "", "", "", ""]);
        setOtpAttempts(0);
        inputRefs.current[0]?.focus();
      }
    } catch (error) {
      console.error("Resend OTP Error:", error);
      setOtpStatus("error");
      Alert.alert("Error", error.message || "Failed to resend OTP");
    } finally {
      setIsResending(false);
    }
  };

  const completeRegistration = async () => {
    console.log("📝 Starting registration process...");
    
    try {
      // 1. Register user
      console.log("📝 Step 1: Registering user...");
      const response = await Register(email, password);
      if (response?.status === 201) {
        console.log("✅ User registered successfully");
      } else {
        throw new Error("User registration failed");
      }

      // ✅ Step 2: Use signupLogin (sets isSignupFlow flag to prevent auto-redirect)
      console.log("📝 Step 2: Signup login via AuthContext...");
      const loginResult = await signupLogin(email, password);
      
      if (!loginResult || !loginResult.success) {
        throw new Error("Login failed: " + (loginResult?.error || "Unknown error"));
      }
      console.log("✅ Signup login successful, isSignupFlow set to true");
      
      // ✅ Step 3: Update user profile
      console.log("📝 Step 3: Updating user profile...");
      await updateUser(name, email, mobileNumber, password);
      console.log("✅ User profile updated");

      // 4. Create Organization
      console.log("📝 Step 4: Creating organization...");
      const orgResponse = await orgscreated(name);
      if (!orgResponse) {
        throw new Error("Organization creation failed");
      }
      console.log("✅ Organization created successfully");

      // 5. Get Organization ID
      console.log("📝 Step 5: Fetching organization...");
      const viewOrgsResponse = await vieworgs();
      if (!viewOrgsResponse || !viewOrgsResponse.data?.orgs?.[0]?.id) {
        throw new Error("Failed to get organization ID");
      }
      const orgId = viewOrgsResponse.data.orgs[0].id;
      await AsyncStorage.setItem("org_id", orgId);
      console.log("✅ Organization ID stored:", orgId);

      // 6. Create Group
      console.log("📝 Step 6: Creating group...");
      const groupResponse = await group_creat(orgId, name);
      if (groupResponse?.status !== 201 && groupResponse?.status !== 200) {
        throw new Error("Group creation failed");
      }
      console.log("✅ Group created successfully");

      // 7. Get Group ID
      console.log("📝 Step 7: Fetching group...");
      const viewGroupResponse = await groupview();
      if (!viewGroupResponse || viewGroupResponse.status !== 200) {
        throw new Error("Failed to get group ID");
      }
      const groupId = viewGroupResponse?.data?.groups?.[0]?.id;
      if (!groupId) {
        throw new Error("No group ID found");
      }
      await AsyncStorage.setItem("group_id", groupId);
      console.log("✅ Group ID stored:", groupId);

      // 8. Create Profile
      console.log("📝 Step 8: Creating profile...");
      const profileResponse = await profile_creat(groupId, name);
      console.log("📦 Profile response status:", profileResponse.status);
      console.log("📦 Profile response data:", JSON.stringify(profileResponse.data, null, 2));
      
      if (profileResponse.status !== 201 && profileResponse.status !== 200) {
        throw new Error("Profile creation failed");
      }
      
      // 9. Get Profile ID
      const profileId = profileResponse?.data?.profiles?.[0]?.id || profileResponse?.data?.id;
      if (profileId) {
        await AsyncStorage.setItem("profile_id", profileId);
        console.log("✅ Profile ID stored:", profileId);
      } else {
        throw new Error("Failed to get profile ID");
      }

      // 10. Verify Profile ID is stored
      const storedProfileId = await AsyncStorage.getItem("profile_id");
      console.log("📦 Stored Profile ID:", storedProfileId);
      
      console.log("✅ Registration completed successfully!");
      
      // ✅ Step 11: Navigate to add device
      // The isSignupFlow flag will prevent auto-redirect to dashboard
      router.replace("/(auth)/add_device");
      
    } catch (error) {
      console.error("❌ Registration Error:", error);
      Alert.alert(
        "Registration Failed",
        error.message || "Failed to complete registration. Please try again.",
      );
    }
  };

  const focusInput = (ref) => {
    ref?.focus();
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          ref={scrollViewRef}
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text
              style={[styles.backButtonText, { color: theme.colors.primary }]}
            >
              ← Back
            </Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: theme.colors.primary }]}>
            Create Account
          </Text>

          <Text
            style={[styles.subtitle, { color: theme.colors.textSecondary }]}
          >
            Sign up to start managing your farm
          </Text>

          <View style={styles.form}>
            <View style={styles.inputWrapper}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Full Name
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBackground,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Enter your full name"
                placeholderTextColor={theme.colors.textSecondary}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                onSubmitEditing={() => focusInput(mobileInputRef)}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Mobile Number
              </Text>
              <TextInput
                ref={(ref) => (mobileInputRef = ref)}
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBackground,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor={theme.colors.textSecondary}
                value={mobileNumber}
                onChangeText={setMobileNumber}
                keyboardType="phone-pad"
                maxLength={10}
                returnKeyType="next"
                onSubmitEditing={() => focusInput(emailInputRef)}
              />
              <Text
                style={[
                  styles.helperText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {COUNTRY_CODE} - {mobileNumber || "Enter 10-digit number"}
              </Text>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Email Address
              </Text>
              <TextInput
                ref={(ref) => (emailInputRef = ref)}
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBackground,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Enter your email"
                placeholderTextColor={theme.colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => focusInput(passwordInputRef)}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Password
              </Text>
              <TextInput
                ref={(ref) => (passwordInputRef = ref)}
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBackground,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Create a password (min 6 characters)"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                returnKeyType="next"
                onSubmitEditing={() => focusInput(confirmPasswordInputRef)}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={[styles.label, { color: theme.colors.text }]}>
                Confirm Password
              </Text>
              <TextInput
                ref={(ref) => (confirmPasswordInputRef = ref)}
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.inputBackground,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Confirm your password"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.signupButton,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={handleSendOtp}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textOnPrimary} />
              ) : (
                <Text
                  style={[
                    styles.signupButtonText,
                    { color: theme.colors.textOnPrimary },
                  ]}
                >
                  Send OTP & Sign Up
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
              <Text style={[styles.loginText, { color: theme.colors.primary }]}>
                Already have an account?{" "}
                <Text style={styles.loginLink}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* OTP Verification Modal */}
      <Modal
        visible={showOtpModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowOtpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              Verify Mobile Number
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: theme.colors.textSecondary },
              ]}
            >
              Enter the 6-digit OTP sent to
            </Text>
            <Text style={[styles.mobileText, { color: theme.colors.primary }]}>
              {phoneNumberWithCode || mobileNumber}
            </Text>

            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  style={[
                    styles.otpInput,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.inputBackground,
                      color: theme.colors.text,
                    },
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                />
              ))}
            </View>

            {otpAttempts > 0 && (
              <Text
                style={[styles.attemptsText, { color: theme.colors.error }]}
              >
                Attempts: {otpAttempts}/{MAX_OTP_ATTEMPTS}
              </Text>
            )}

            {otpStatus === "verifying" && (
              <Text
                style={[styles.statusText, { color: theme.colors.primary }]}
              >
                Verifying...
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.verifyButton,
                {
                  backgroundColor:
                    otpAttempts >= MAX_OTP_ATTEMPTS
                      ? theme.colors.border
                      : theme.colors.primary,
                },
              ]}
              onPress={handleVerifyOtp}
              activeOpacity={0.8}
              disabled={isLoading || otpAttempts >= MAX_OTP_ATTEMPTS}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textOnPrimary} />
              ) : (
                <Text
                  style={[
                    styles.verifyButtonText,
                    { color: theme.colors.textOnPrimary },
                  ]}
                >
                  Verify OTP
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resendOtp}
              style={styles.resendButton}
              disabled={isResending}
            >
              {isResending ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text
                  style={[styles.resendText, { color: theme.colors.primary }]}
                >
                  Resend OTP
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowOtpModal(false)}
              style={styles.cancelButton}
            >
              <Text style={[styles.cancelText, { color: theme.colors.error }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  backButton: {
    marginTop: 12,
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 32,
  },
  form: {
    gap: 20,
  },
  inputWrapper: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  signupButton: {
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  signupButtonText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
  },
  loginText: {
    textAlign: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  loginLink: {
    fontWeight: "bold",
  },
  bottomPadding: {
    height: Platform.OS === "ios" ? 40 : 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  mobileText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 24,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  otpInput: {
    width: 45,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  attemptsText: {
    fontSize: 14,
    marginBottom: 12,
    fontWeight: "500",
  },
  statusText: {
    fontSize: 14,
    marginBottom: 12,
    fontWeight: "500",
  },
  verifyButton: {
    width: "100%",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  verifyButtonText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  resendButton: {
    marginBottom: 12,
  },
  resendText: {
    fontSize: 14,
    fontWeight: "500",
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    fontSize: 14,
  },
});