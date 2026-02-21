// app/auth/register.tsx
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "../../firebase/firebaseConfig";

import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleRegister = async () => {
    if (isLoading) return;

    Keyboard.dismiss();

    // ✅ Trim inputs safely
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    // ✅ Validation
    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      shakeAnimation();
      Alert.alert("Missing Information", "Please fill in all fields");
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      shakeAnimation();
      Alert.alert("Invalid Email", "Enter a valid email");
      return;
    }

    if (password.length < 6) {
      shakeAnimation();
      Alert.alert("Weak Password", "Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      shakeAnimation();
      Alert.alert("Password Mismatch", "Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      // ✅ Create user (Firebase auto-signs in)
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        password,
      );

      const uid = userCredential.user.uid;

      // ✅ Save profile
      await setDoc(doc(db, "users", uid), {
        uid,
        name: trimmedName,
        email: trimmedEmail,
        messId: null,
        role: null,
        createdAt: serverTimestamp(),
      });

      // ✅ NO AsyncStorage
      // ✅ Firebase session persists automatically

      router.replace("/mess/select");
    } catch (error: any) {
      let message = "Something went wrong!";

      if (error.code === "auth/email-already-in-use") {
        message = "Email is already registered!";
      } else if (error.code === "auth/invalid-email") {
        message = "Email is invalid!";
      } else if (error.code === "auth/weak-password") {
        message = "Password is too weak!";
      } else if (error.code === "auth/network-request-failed") {
        message = "Network error. Please check your internet connection.";
      }

      Alert.alert("Registration Error", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                  Join us to manage your mess efficiently
                </Text>
              </View>

              <View style={styles.form}>
                <View
                  style={[
                    styles.inputContainer,
                    focusedInput === "name" && styles.inputFocused,
                  ]}
                >
                  <Text style={styles.inputLabel}>FULL NAME</Text>
                  <TextInput
                    placeholder="Enter your full name"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setFocusedInput("name")}
                    onBlur={() => setFocusedInput(null)}
                    autoCapitalize="words"
                    editable={!isLoading}
                    returnKeyType="next"
                  />
                </View>

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
                    placeholder="Create a strong password"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                    editable={!isLoading}
                    returnKeyType="next"
                  />
                </View>

                <View
                  style={[
                    styles.inputContainer,
                    focusedInput === "confirmPassword" && styles.inputFocused,
                  ]}
                >
                  <View style={styles.inputHeader}>
                    <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
                    <TouchableOpacity
                      onPress={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.togglePassword}>
                        {showConfirmPassword ? "HIDE" : "SHOW"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    placeholder="Re-enter your password"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedInput("confirmPassword")}
                    onBlur={() => setFocusedInput(null)}
                    editable={!isLoading}
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                  />
                </View>

                <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                  <TouchableOpacity
                    style={[styles.button, isLoading && styles.buttonLoading]}
                    onPress={handleRegister}
                    activeOpacity={0.8}
                    disabled={isLoading}
                  >
                    <Text style={styles.buttonText}>
                      {isLoading ? "CREATING ACCOUNT..." : "REGISTER & LOGIN"}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    Already have an account?{" "}
                  </Text>
                  <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.link}>Sign In</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.termsContainer}>
                  <Text style={styles.termsText}>
                    By creating an account, you agree to our{" "}
                    <Text
                      style={styles.termsLink}
                      onPress={() => router.push("/auth/terms")}
                    >
                      Terms of Service
                    </Text>
                    {" "}and{" "}
                    <Text
                      style={styles.termsLink}
                      onPress={() => router.push("/auth/privacy")}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  scrollContent: {
    flexGrow: 1,
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
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
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
    width: 30,
    height: 30,
    backgroundColor: "#6366F1",
    borderRadius: 6,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
  },
  logoShape2: {
    width: 18,
    height: 18,
    backgroundColor: "#818CF8",
    borderRadius: 4,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 19,
  },
  form: {
    gap: 14,
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
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
  termsContainer: {
    marginTop: 16,
    paddingHorizontal: 8,
  },
  termsText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  termsLink: {
    color: "#6366F1",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
