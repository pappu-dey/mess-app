// app/auth/forgot.tsx
import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";
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
import { auth, db } from "../../firebase/firebaseConfig";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const backButtonScale = useRef(new Animated.Value(1)).current;
  const errorFadeAnim = useRef(new Animated.Value(0)).current;
  const errorSlideAnim = useRef(new Animated.Value(-10)).current;

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

  const showError = (message: string) => {
    setErrorMessage(message);
    Animated.parallel([
      Animated.timing(errorFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(errorSlideAnim, {
        toValue: 0,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto hide after 4 seconds
    setTimeout(() => {
      hideError();
    }, 4000);
  };

  const hideError = () => {
    Animated.parallel([
      Animated.timing(errorFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(errorSlideAnim, {
        toValue: -10,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setErrorMessage("");
    });
  };

  const handleBackPress = () => {
    Animated.sequence([
      Animated.timing(backButtonScale, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(backButtonScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.back();
    });
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleReset = async () => {
    Keyboard.dismiss();
    hideError(); // Clear any previous errors

    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (!email) {
      shakeAnimation();
      showError("Please enter your email address");
      return;
    }

    if (!validateEmail(email)) {
      shakeAnimation();
      showError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      // 1️⃣ Check if email exists in Firestore users collection
      const q = query(
        collection(db, "users"),
        where("email", "==", email.trim().toLowerCase()),
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        shakeAnimation();
        showError("This email is not registered");
        setIsLoading(false);
        return;
      }

      // 2️⃣ Send Firebase password reset email
      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        "Reset Link Sent",
        `A password reset link has been sent to ${email}. Please check your inbox and spam/junk folder.`,
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error: any) {
      shakeAnimation();
      let message = "Something went wrong. Please try again.";

      if (error.code === "auth/invalid-email") {
        message = "Invalid email address";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many requests. Please try again later";
      } else if (error.code === "auth/network-request-failed") {
        message = "Network error. Check your connection";
      }

      showError(message);
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
          <Animated.View
            style={[
              styles.backButton,
              { transform: [{ scale: backButtonScale }] },
            ]}
          >
            <TouchableOpacity
              onPress={handleBackPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <View style={styles.lockIcon}>
                <View style={styles.lockBody} />
                <View style={styles.lockShackle} />
              </View>
            </View>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              No worries! Enter your email and we'll send you a reset link
            </Text>
          </View>

          <View style={styles.form}>
            {errorMessage ? (
              <Animated.View
                style={[
                  styles.errorContainer,
                  {
                    opacity: errorFadeAnim,
                    transform: [{ translateY: errorSlideAnim }],
                  },
                ]}
              >
                <View style={styles.errorContent}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                  <TouchableOpacity
                    onPress={hideError}
                    style={styles.errorClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.errorCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ) : null}

            <View
              style={[
                styles.inputContainer,
                focusedInput === "email" && styles.inputFocused,
                errorMessage && styles.inputError,
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
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleReset}
              />
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonLoading]}
                onPress={handleReset}
                activeOpacity={0.8}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "SENDING..." : "SEND RESET LINK"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Remember your password? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.link}>Sign In</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>
                ⚠️ IMPORTANT - CHECK SPAM FOLDER
              </Text>
              <Text style={styles.infoText}>
                • Check your email inbox{"\n"}• If not in inbox, check your
                spam/junk folder{"\n"}• Mark our email as "Not Spam" if found
                there{"\n"}• Click the reset link in the email{"\n"}• Create a
                new password{"\n"}• Sign in with your new credentials
              </Text>
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
  backButton: {
    position: "absolute",
    top: 60,
    left: 24,
    zIndex: 10,
  },
  backButtonText: {
    color: "#6366F1",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.2)",
  },
  lockIcon: {
    position: "relative",
    width: 40,
    height: 45,
    justifyContent: "flex-end",
  },
  lockBody: {
    width: 40,
    height: 28,
    backgroundColor: "#6366F1",
    borderRadius: 6,
  },
  lockShackle: {
    position: "absolute",
    top: 0,
    left: 8,
    width: 24,
    height: 20,
    borderWidth: 4,
    borderColor: "#818CF8",
    borderRadius: 12,
    borderBottomWidth: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 22,
  },
  form: {
    gap: 16,
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
  inputError: {
    borderColor: "#EF4444",
    borderWidth: 2,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 8,
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
  infoBox: {
    backgroundColor: "rgba(251, 146, 60, 0.12)",
    padding: 18,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(251, 146, 60, 0.3)",
  },
  infoTitle: {
    color: "#FDB97C",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoText: {
    color: "#FED7AA",
    fontSize: 13,
    lineHeight: 22,
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderLeftColor: "#EF4444",
    marginBottom: 8,
    overflow: "hidden",
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    paddingRight: 12,
  },
  errorIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  errorText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  errorClose: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  errorCloseText: {
    color: "#FCA5A5",
    fontSize: 18,
    fontWeight: "600",
  },
});
