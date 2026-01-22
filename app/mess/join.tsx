// app/mess/join.tsx
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion } from "firebase/firestore";
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

export default function JoinMess() {
  const router = useRouter();
  const [messId, setMessId] = useState("");
  const [focusedInput, setFocusedInput] = useState(false);
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

  const handleJoin = async () => {
    Keyboard.dismiss();
    hideError();

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

    const trimmedMessId = messId.trim();

    if (!trimmedMessId) {
      shakeAnimation();
      showError("Please enter a Mess ID");
      return;
    }

    if (trimmedMessId.length < 6) {
      shakeAnimation();
      showError("Mess ID must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        shakeAnimation();
        showError("You must be logged in to join a mess");
        setIsLoading(false);
        return;
      }

      // Convert to uppercase for consistency
      const messIdUpper = trimmedMessId.toUpperCase();

      // Check if mess exists
      const messRef = doc(db, "messes", messIdUpper);
      const messDoc = await getDoc(messRef);

      if (!messDoc.exists()) {
        shakeAnimation();
        showError("Invalid Mess ID. Please check and try again.");
        setIsLoading(false);
        return;
      }

      const messData = messDoc.data();

      // Check if user is already a member
      if (messData.members && messData.members.includes(user.uid)) {
        // User is already a member, just update their user doc and redirect
        const userRef = doc(db, "users", user.uid);
        await setDoc(
          userRef,
          {
            messId: messIdUpper,
            role: "member",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        router.replace("/mess/dashboard");
        return;
      }

      // Add user to mess members
      await updateDoc(messRef, {
        members: arrayUnion(user.uid),
        memberCount: (messData.memberCount || 0) + 1,
      });

      // Update user document with mess info
      const userRef = doc(db, "users", user.uid);
      await setDoc(
        userRef,
        {
          messId: messIdUpper,
          role: "member",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Success - redirect to dashboard
      router.replace("/mess/dashboard");
    } catch (error: any) {
      console.error("Error joining mess:", error);
      shakeAnimation();
      showError(error.message || "Failed to join mess. Please try again.");
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
              <Text style={styles.iconEmoji}>👥</Text>
            </View>
            <Text style={styles.title}>Join a Mess</Text>
            <Text style={styles.subtitle}>
              Enter the Mess ID shared by your group admin
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
                focusedInput && styles.inputFocused,
                errorMessage && styles.inputError,
              ]}
            >
              <Text style={styles.inputLabel}>MESS ID</Text>
              <TextInput
                placeholder="Enter 6-digit Mess ID"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={messId}
                onChangeText={(text) => setMessId(text.toUpperCase())}
                onFocus={() => setFocusedInput(true)}
                onBlur={() => setFocusedInput(false)}
                autoCapitalize="characters"
                editable={!isLoading}
                autoFocus
                returnKeyType="join"
                onSubmitEditing={handleJoin}
                maxLength={20}
              />
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonLoading]}
                onPress={handleJoin}
                activeOpacity={0.8}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "JOINING..." : "JOIN MESS"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>DON'T HAVE A MESS ID?</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push("/mess/create")}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>
                Create Your Own Mess
              </Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>💡 HOW TO GET MESS ID</Text>
              <Text style={styles.infoText}>
                • Ask your mess admin for the Mess ID{"\n"}• It's a unique code
                for your group{"\n"}• Usually 6 characters long{"\n"}•
                Case-sensitive, so enter it exactly as shared
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
  iconEmoji: {
    fontSize: 40,
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
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(71, 85, 105, 0.3)",
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.8,
  },
  secondaryButton: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  secondaryButtonText: {
    color: "#818CF8",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  infoBox: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    padding: 18,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  infoTitle: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoText: {
    color: "#BFDBFE",
    fontSize: 13,
    lineHeight: 22,
  },
});
