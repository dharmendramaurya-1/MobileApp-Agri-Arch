// app/(auth)/login.jsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import AppStatusBar from "../../components/AppStatusBar";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemContext";

const { height } = Dimensions.get("window");
const GREEN = "#4CAF50";
const GREEN_DARK = "#2E7D32";

export default function LoginScreen() {
  const { theme } = useTheme();
  const { login } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  
  const passwordRef = useRef(null);

  // ✅ Only validate email format (UX only)
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError("Email is required");
      return false;
    } else if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      return false;
    } else {
      setEmailError("");
      return true;
    }
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    if (emailError) validateEmail(text);
  };

  // ✅ Show error alert based on error type
  const showErrorAlert = (result) => {
    switch (result.errorType) {
      case "network":
      case "timeout":
      case "no_response":
        Alert.alert(
          "Connection Error",
          result.error,
          [
            { text: "Retry", onPress: handleLogin },
            { text: "Cancel", style: "cancel" }
          ]
        );
        break;

      case "unauthorized":
        Alert.alert(
          "Login Failed",
          result.error,
          [
            { 
              text: "Try Again", 
              onPress: () => passwordRef.current?.focus() 
            },
            { 
              text: "Forgot Password?", 
              onPress: () => handleForgotPassword() 
            }
          ]
        );
        break;

      case "not_found":
        Alert.alert(
          "Account Not Found",
          result.error,
          [
            { 
              text: "Sign Up", 
              onPress: () => router.push("/(auth)/signup") 
            },
            { text: "Try Again", style: "cancel" }
          ]
        );
        break;

      case "validation":
        Alert.alert("Validation Error", result.error, [{ text: "OK" }]);
        break;

      case "rate_limit":
        Alert.alert("Too Many Attempts", result.error, [{ text: "OK" }]);
        break;

      case "server_error":
        Alert.alert(
          "Server Error",
          result.error,
          [
            { text: "Retry", onPress: handleLogin },
            { 
              text: "Contact Support", 
              onPress: () => {
                Linking.openURL("mailto:support@agriarch.io?subject=Login%20Issue");
              }
            }
          ]
        );
        break;

      default:
        Alert.alert("Login Failed", result.error || "An unexpected error occurred", [{ text: "OK" }]);
    }
  };

  // ✅ Forgot password — no backend endpoint yet, route users to support
  const handleForgotPassword = () => {
    Alert.alert(
      "Forgot Password?",
      "Password reset is coming soon. Please contact support to regain access to your account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Contact Support",
          onPress: () =>
            Linking.openURL(
              "mailto:support@agriarch.io?subject=Forgot%20Password"
            ),
        },
      ]
    );
  };

  const handleLogin = async () => {
    // ✅ Validate email format and empty fields
    const isEmailValid = validateEmail(email);
    
    if (!isEmailValid) {
      return;
    }
    
    if (!password.trim()) {
      Alert.alert("Validation", "Password is required");
      return;
    }

    setIsLoading(true);
    try {
      console.log("🔐 Attempting login with email:", email);
      
      const result = await login(email, password);
      console.log("📦 Login result:", result);
      
      if (result && result.success) {
        console.log("✅ Login successful, navigating to dashboard...");
        
        // ✅ Wait for auth state to update, then navigate
        setTimeout(() => {
          router.replace("/(main)/dashboard");
        }, 500);
      } else {
        // ✅ Show error from server
        showErrorAlert(result || { errorType: "general", error: "Login failed" });
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      Alert.alert("Error", error.message || "An unexpected error occurred", [{ text: "OK" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Light status bar over the dark hero image — same component as the root layout */}
            <AppStatusBar style="light" translucent />

            <View style={styles.heroContainer}>
              <Image
                source={require("../../assets/images/login.jpg")}
                style={styles.heroImage}
                resizeMode="cover"
              />
              <View style={styles.heroOverlay} />
              <View style={styles.brandBadge}>
                <Text style={styles.brandText}>
                  Agri<Text style={styles.brandSense}>Arch</Text>
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.colors.background }]}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Welcome Back 👋
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                Sign in to manage your farm
              </Text>

              <View style={styles.inputWrapper}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                  Email address
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: emailError ? "#FF3B30" : theme.colors.border,
                      backgroundColor: theme.colors.inputBackground,
                      color: theme.colors.text,
                    },
                  ]}
                  placeholder="farmer@agriarch.io"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={email}
                  onChangeText={handleEmailChange}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
                ) : null}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                  Password
                </Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    ref={passwordRef}
                    style={[
                      styles.passwordInput,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.inputBackground,
                        color: theme.colors.text,
                      },
                    ]}
                    placeholder="Enter your password"
                    placeholderTextColor={theme.colors.textSecondary}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.forgotPassword}
                onPress={handleForgotPassword}
              >
                <Text style={[styles.forgotPasswordText, { color: GREEN }]}>
                  Forgot password?
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.loginButton, 
                  { 
                    backgroundColor: isLoading ? "#A5D6A7" : GREEN,
                    opacity: isLoading ? 0.8 : 1,
                  }
                ]}
                onPress={handleLogin}
                activeOpacity={0.85}
                disabled={isLoading}
              >
                {isLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.loginButtonText}> Signing in...</Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>Sign in to farm</Text>
                )}
              </TouchableOpacity>

              <View style={styles.signUpContainer}>
                <Text style={[styles.signUpText, { color: theme.colors.textSecondary }]}>
                  Don't have an account? 
                </Text>
                <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
                  <Text style={[styles.signUpLink, { color: GREEN }]}>
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  heroContainer: {
    width: "100%",
    height: height * 0.4,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  brandBadge: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  brandText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  brandSense: { color: GREEN },
  card: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    opacity: 0.7,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginLeft: 4,
    marginTop: 4,
  },
  inputWrapper: {
    marginBottom: 16,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    paddingRight: 50,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 14,
    padding: 4,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 20,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loginButton: {
    paddingVertical: 16,
    borderRadius: 50,
    marginBottom: 16,
    marginTop: 8,
    shadowColor: GREEN_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonText: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  signUpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  signUpText: {
    fontSize: 14,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
});