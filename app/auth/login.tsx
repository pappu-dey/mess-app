import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { auth } from "../../firebase/firebaseConfig";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const shakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleLogin = async () => {
    if (isLoading) return;

    Keyboard.dismiss();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      shakeAnimation();
      Alert.alert(
        "Missing Information",
        "Please enter both email and password",
      );
      return;
    }

    setIsLoading(true);

    // 🔍 Debug logs
    console.log("=== LOGIN ATTEMPT ===");
    console.log("Email:", trimmedEmail);
    console.log("Password length:", password.length);
    console.log("Auth object:", auth);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        password,
      );

      console.log("✅ LOGIN SUCCESS:", userCredential.user.email);
      // _layout.tsx will handle navigation
    } catch (error: any) {
      shakeAnimation();

      // 🔍 Detailed error logging
      console.error("=== LOGIN ERROR ===");
      console.error("Full error:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);

      let message = "Login failed. Please try again.";

      switch (error.code) {
        case "auth/user-not-found":
          message = "No account found with this email!";
          break;
        case "auth/wrong-password":
          message = "Incorrect password!";
          break;
        case "auth/invalid-email":
          message = "Invalid email address!";
          break;
        case "auth/invalid-credential":
          message = "Invalid email or password!";
          break;
        case "auth/too-many-requests":
          message = "Too many attempts. Please try again later.";
          break;
        case "auth/network-request-failed":
          message = "Network error. Check your internet connection.";
          break;
        default:
          message = `Error (${error.code}): ${error.message}`;
      }

      Alert.alert("Login Failed", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
        keyboardVerticalOffset={0}
      >
        <View style={styles.gradientBackground}>
          <View style={styles.circle1} />
          <View style={styles.circle2} />
          <View style={styles.circle3} />
        </View>

        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
                { translateX: shakeAnim },
              ],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logoInner}>
                <View style={styles.logoShape1} />
                <View style={styles.logoShape2} />
              </View>
            </View>
            <Text style={styles.title}>Mess Manager</Text>
            <Text style={styles.subtitle}>
              Streamline your mess operations with ease
            </Text>
          </View>

          <View style={styles.form}>
            <View
              style={[
                styles.inputContainer,
                focusedInput === "email" && styles.inputFocused,
              ]}
            >
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TextInput
                placeholder="Enter your email"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput("email")}
                onBlur={() => setFocusedInput(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLoading}
                returnKeyType="next"
              />
            </View>

            <View
              style={[
                styles.inputContainer,
                focusedInput === "password" && styles.inputFocused,
              ]}
            >
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.togglePassword}>
                    {showPassword ? "HIDE" : "SHOW"}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor="#64748B"
                style={styles.input}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput("password")}
                onBlur={() => setFocusedInput(null)}
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push("/auth/forgot")}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonLoading]}
                onPress={handleLogin}
                activeOpacity={0.8}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "SIGNING IN..." : "SIGN IN"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/auth/register")}>
                <Text style={styles.link}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  gradientBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  circle1: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(99, 102, 241, 0.06)",
    top: -150,
    right: -120,
  },
  circle2: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    bottom: -100,
    left: -100,
  },
  circle3: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(59, 130, 246, 0.07)",
    top: "45%",
    right: -60,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  logoContainer: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.2)",
    overflow: "hidden",
  },
  logoInner: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  logoShape1: {
    width: 40,
    height: 40,
    backgroundColor: "#6366F1",
    borderRadius: 8,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
  },
  logoShape2: {
    width: 24,
    height: 24,
    backgroundColor: "#818CF8",
    borderRadius: 6,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },
  form: {
    gap: 13,
  },
  inputContainer: {
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(71, 85, 105, 0.3)",
  },
  inputFocused: {
    borderColor: "#6366F1",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderWidth: 2,
  },
  inputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  togglePassword: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    color: "#FFFFFF",
    padding: 0,
    height: 24,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginTop: -8,
  },
  forgotPasswordText: {
    color: "#6366F1",
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#6366F1",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonLoading: {
    backgroundColor: "#4F46E5",
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(71, 85, 105, 0.3)",
  },
  dividerText: {
    color: "#64748B",
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: "#94A3B8",
    fontSize: 15,
  },
  link: {
    color: "#6366F1",
    fontSize: 15,
    fontWeight: "700",
  },
});
