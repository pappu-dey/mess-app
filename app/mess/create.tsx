// app/mess/create.tsx
import { useRouter } from "expo-router";
import { collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { auth, db } from "../../firebase/firebaseConfig";

export default function CreateMess() {
  const router = useRouter();
  const [messName, setMessName] = useState("");
  const [focusedInput, setFocusedInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [generatedMessId, setGeneratedMessId] = useState("");

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const backButtonScale = useRef(new Animated.Value(1)).current;
  const errorFadeAnim = useRef(new Animated.Value(0)).current;
  const errorSlideAnim = useRef(new Animated.Value(-10)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;
  const modalFade = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (showSuccessModal) {
      Animated.parallel([
        Animated.spring(modalScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(modalFade, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      modalScale.setValue(0.8);
      modalFade.setValue(0);
    }
  }, [showSuccessModal]);

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

  const generateMessId = () => {
    // Generate a 6-character alphanumeric ID
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  const checkMessIdExists = async (messId: string): Promise<boolean> => {
    try {
      const messDoc = await getDoc(doc(db, "messes", messId));
      return messDoc.exists();
    } catch (error) {
      console.error("Error checking mess ID:", error);
      return false;
    }
  };

  const handleCreate = async () => {
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

    const trimmedMessName = messName.trim();

    if (!trimmedMessName) {
      shakeAnimation();
      showError("Please enter a mess name");
      return;
    }

    if (trimmedMessName.length < 3) {
      shakeAnimation();
      showError("Mess name must be at least 3 characters");
      return;
    }

    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        shakeAnimation();
        showError("You must be logged in to create a mess");
        setIsLoading(false);
        return;
      }

      // Generate unique mess ID
      let newMessId = generateMessId();
      let attempts = 0;
      // Ensure mess ID is unique (max 10 attempts)
      while (await checkMessIdExists(newMessId) && attempts < 10) {
        newMessId = generateMessId();
        attempts++;
      }

      if (attempts >= 10) {
        throw new Error("Failed to generate unique mess ID");
      }

      // Create mess document in Firestore
      const messRef = doc(db, "messes", newMessId);
      await setDoc(messRef, {
        messId: newMessId,
        name: trimmedMessName,
        managerId: user.uid,
        managerName: user.displayName || "Manager",
        createdAt: serverTimestamp(),
        members: [user.uid],
        memberCount: 1,
      });

      // Update user document with mess info
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      
      await setDoc(
        userRef,
        {
          messId: newMessId,
          role: "manager",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Create member document in mess subcollection for statistics
      const memberRef = doc(db, "messes", newMessId, "members", user.uid);
      await setDoc(memberRef, {
        name: userData?.name || user.displayName || "Manager",
        email: userData?.email || user.email || "",
        role: "manager",
        joinedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true });

      setGeneratedMessId(newMessId);
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error("Error creating mess:", error);
      shakeAnimation();
      showError(error.message || "Failed to create mess. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyId = async () => {
    try {
      // Use Share API as fallback since clipboard might not be available
      await Share.share({
        message: generatedMessId,
        title: "Mess ID",
      });
    } catch (error) {
      Alert.alert("Mess ID", generatedMessId);
    }
  };

  const handleShareId = async () => {
    try {
      await Share.share({
        message: `Join my mess "${messName}"! Use this Mess ID: ${generatedMessId}`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleContinue = () => {
    setShowSuccessModal(false);
    router.replace("/mess/dashboard");
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
              <Text style={styles.iconEmoji}>✨</Text>
            </View>
            <Text style={styles.title}>Create New Mess</Text>
            <Text style={styles.subtitle}>
              Set up your mess and invite others to join
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
              <Text style={styles.inputLabel}>MESS NAME</Text>
              <TextInput
                placeholder="e.g., Sunrise Hostel Mess"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={messName}
                onChangeText={setMessName}
                onFocus={() => setFocusedInput(true)}
                onBlur={() => setFocusedInput(false)}
                autoCapitalize="words"
                editable={!isLoading}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                maxLength={50}
              />
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonLoading]}
                onPress={handleCreate}
                activeOpacity={0.8}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "CREATING..." : "CREATE MESS"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ALREADY HAVE AN INVITE?</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push("/mess/join")}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Join Existing Mess</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>✅ WHAT HAPPENS NEXT</Text>
              <Text style={styles.infoText}>
                • Your mess will be created instantly{"\n"}• You'll get a unique
                Mess ID{"\n"}• Share the ID with your group members{"\n"}• Start
                managing meals and expenses together
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Success Modal */}
        <Modal
          visible={showSuccessModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.modalContent,
                {
                  opacity: modalFade,
                  transform: [{ scale: modalScale }],
                },
              ]}
            >
              <View style={styles.successIcon}>
                <Text style={styles.successEmoji}>🎉</Text>
              </View>

              <Text style={styles.modalTitle}>Mess Created!</Text>
              <Text style={styles.modalSubtitle}>
                Your mess "{messName}" has been created successfully
              </Text>

              <View style={styles.messIdContainer}>
                <Text style={styles.messIdLabel}>YOUR MESS ID</Text>
                <View style={styles.messIdBox}>
                  <Text style={styles.messIdText}>{generatedMessId}</Text>
                </View>
                <Text style={styles.messIdHint}>
                  Share this ID with members to invite them
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleCopyId}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionButtonText}>📋 Copy ID</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleShareId}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionButtonText}>📤 Share</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
                activeOpacity={0.8}
              >
                <Text style={styles.continueButtonText}>
                  CONTINUE TO DASHBOARD
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
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
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    padding: 18,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  infoTitle: {
    color: "#86EFAC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoText: {
    color: "#BBF7D0",
    fontSize: 13,
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  successEmoji: {
    fontSize: 40,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  messIdContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  messIdLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 1,
    marginBottom: 12,
  },
  messIdBox: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.4)",
    marginBottom: 8,
  },
  messIdText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#818CF8",
    letterSpacing: 4,
  },
  messIdHint: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  actionButtonText: {
    color: "#818CF8",
    fontSize: 14,
    fontWeight: "700",
  },
  continueButton: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
