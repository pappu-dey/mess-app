// app/mess/join.tsx - Redesigned to Match Create Mess Theme
import { useRouter } from "expo-router";
import {
  arrayUnion,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { auth, db } from "../../firebase/firebaseConfig";

// ==================== CONSTANTS ====================
const MIN_MESS_ID_LENGTH = 6;
const MAX_MESS_ID_LENGTH = 20;
const ERROR_DISPLAY_DURATION = 3500;

// ==================== TYPES ====================
type MessData = {
  name: string;
  createdAt: any;
  memberCount: number;
  members: string[];
};

type UserData = {
  name?: string;
  email?: string;
  messId?: string;
  role?: string;
};

// ==================== MAIN COMPONENT ====================
export default function JoinMess() {
  const router = useRouter();

  // State
  const [messId, setMessId] = useState("");
  const [focusedInput, setFocusedInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const errorFade = useRef(new Animated.Value(0)).current;

  // ==================== EFFECTS ====================

  // Initial animations
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Keyboard listeners
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // ==================== ANIMATION HELPERS ====================

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    Animated.timing(errorFade, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.timing(errorFade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setErrorMessage(""));
    }, ERROR_DISPLAY_DURATION);
  };

  // ==================== VALIDATION ====================

  const validateMessId = (id: string): { valid: boolean; error?: string } => {
    const trimmedId = id.trim();

    if (!trimmedId) {
      return { valid: false, error: "Please enter a Mess ID" };
    }

    if (trimmedId.length < MIN_MESS_ID_LENGTH) {
      return {
        valid: false,
        error: `Mess ID must be at least ${MIN_MESS_ID_LENGTH} characters`,
      };
    }

    if (trimmedId.length > MAX_MESS_ID_LENGTH) {
      return {
        valid: false,
        error: `Mess ID cannot exceed ${MAX_MESS_ID_LENGTH} characters`,
      };
    }

    // Check for valid characters (alphanumeric and hyphens)
    const validPattern = /^[A-Z0-9-]+$/;
    if (!validPattern.test(trimmedId)) {
      return {
        valid: false,
        error: "Mess ID can only contain letters, numbers, and hyphens",
      };
    }

    return { valid: true };
  };

  // ==================== MAIN JOIN HANDLER ====================

  const handleJoin = async () => {
    if (isLoading) return;

    Keyboard.dismiss();
    setErrorMessage("");
    animateButton();

    // Validate Mess ID
    const messCode = messId.trim().toUpperCase();
    const validation = validateMessId(messCode);

    if (!validation.valid) {
      shake();
      showError(validation.error!);
      return;
    }

    // Check authentication
    const user = auth.currentUser;
    if (!user) {
      shake();
      showError("You must be logged in to join a mess");
      setTimeout(() => {
        router.replace("/auth/login");
      }, 2000);
      return;
    }

    setIsLoading(true);

    try {
      // 1. Check if mess exists
      const messRef = doc(db, "messes", messCode);
      const messSnap = await getDoc(messRef);

      if (!messSnap.exists()) {
        shake();
        showError("Invalid Mess ID. Please check and try again.");
        setIsLoading(false);
        return;
      }

      const messData = messSnap.data() as MessData;

      // 2. Check if already a member via subcollection
      const memberRef = doc(db, "messes", messCode, "members", user.uid);
      const memberSnap = await getDoc(memberRef);

      if (memberSnap.exists()) {
        // User is already a member - just update their user doc
        await setDoc(
          doc(db, "users", user.uid),
          {
            messId: messCode,
            role: memberSnap.data()?.role || "member",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        showError(`Welcome back to ${messData.name || "your mess"}!`);
        setTimeout(() => {
          setIsLoading(false);
          router.replace("/mess/dashboard");
        }, 1000);
        return;
      }

      // 3. Get user information
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userSnap.exists() ? (userSnap.data() as UserData) : {};
      const userName = userData?.name || user.displayName || user.email?.split("@")[0] || "Member";

      // 4. Check for EXISTING PENDING MEMBER by email
      // This prevents duplicates if the manager added them by email previously
      let pendingMemberId = null;
      let pendingMemberData = null;

      if (user.email) {
        const { collection, query, where, getDocs } = await import("firebase/firestore");
        const membersRef = collection(db, "messes", messCode, "members");
        const q = query(membersRef, where("email", "==", user.email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Found a pending member with this email!
          const doc = querySnapshot.docs[0];
          if (doc.id !== user.uid) {
            console.log("Found pending member with different ID:", doc.id);
            pendingMemberId = doc.id;
            pendingMemberData = doc.data();
          }
        }
      }

      // 5. Check if user is already in another mess
      if (userData?.messId && userData.messId !== messCode) {
        Alert.alert(
          "Already in a Mess",
          `You are currently a member of another mess. Would you like to leave it and join ${messData.name || "this mess"}?`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => setIsLoading(false),
            },
            {
              text: "Switch Mess",
              style: "destructive",
              onPress: () => proceedWithJoin(messCode, messRef, memberRef, userName, pendingMemberId),
            },
          ]
        );
        return;
      }

      // 6. Proceed with joining
      await proceedWithJoin(messCode, messRef, memberRef, userName, pendingMemberId);
    } catch (err: any) {
      console.error("Join mess error:", err);
      shake();

      let errorMsg = "Failed to join mess. Please try again.";

      // Handle specific error cases
      if (err.code === "permission-denied") {
        errorMsg = "You don't have permission to join this mess";
      } else if (err.code === "unavailable") {
        errorMsg = "Network error. Please check your connection";
      } else if (err.code === "not-found") {
        errorMsg = "Mess not found. Please verify the ID";
      }

      showError(errorMsg);
      setIsLoading(false);
    }
  };

  // ==================== JOIN PROCESS ====================

  const proceedWithJoin = async (
    messCode: string,
    messRef: any,
    memberRef: any,
    userName: string,
    pendingMemberId: string | null = null
  ) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      const { deleteDoc } = await import("firebase/firestore");

      // 0. If there's a pending member entry, delete it first (migration)
      if (pendingMemberId) {
        console.log("Migrating pending member:", pendingMemberId);
        const pendingRef = doc(db, "messes", messCode, "members", pendingMemberId);
        await deleteDoc(pendingRef);
      }

      // 1. Create member document in subcollection (using REAL uid)
      // We use the User's own name property, overwriting whatever the manager set.
      await setDoc(memberRef, {
        uid: user.uid,
        name: userName, // <--- Using the name from User Profile
        email: user.email || "",
        role: "member",
        joinedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        isActive: true,
      });

      // 2. Update mess document
      // If we migrated, the count is already correct. If new, increment.
      const updatePayload: any = {
        members: arrayUnion(user.uid),
        updatedAt: serverTimestamp(),
      };

      if (!pendingMemberId) {
        updatePayload.memberCount = increment(1);
      }

      await updateDoc(messRef, updatePayload);

      // 3. Update user document
      await setDoc(
        doc(db, "users", user.uid),
        {
          messId: messCode,
          role: "member",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Success - navigate to dashboard
      setIsLoading(false);
      router.replace("/mess/dashboard");
    } catch (err: any) {
      console.error("Error in proceedWithJoin:", err);
      throw err; // Re-throw to be caught by parent handler
    }
  };

  // ==================== RENDER ====================

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
              {/* Icon - smaller when keyboard is visible */}
              {!keyboardVisible && (
                <View style={styles.iconContainer}>
                  <Text style={styles.icon}>✨</Text>
                </View>
              )}

              {/* Header - compact when keyboard is visible */}
              <View style={[styles.header, keyboardVisible && styles.headerCompact]}>
                <Text style={[styles.title, keyboardVisible && styles.titleCompact]}>
                  Join Existing Mess
                </Text>
                <Text style={[styles.subtitle, keyboardVisible && styles.subtitleCompact]}>
                  Enter the Mess ID shared by your mess admin
                </Text>
              </View>

              {/* Error Message */}
              {errorMessage && (
                <Animated.View style={[styles.errorContainer, { opacity: errorFade }]}>
                  <Text style={styles.error}>⚠️ {errorMessage}</Text>
                </Animated.View>
              )}

              {/* Input Field */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>MESS ID</Text>
                <View
                  style={[
                    styles.inputBox,
                    focusedInput && styles.inputFocused,
                    errorMessage && styles.inputError,
                  ]}
                >
                  <TextInput
                    placeholder="e.g., SZRHYU"
                    placeholderTextColor="#6B7994"
                    value={messId}
                    onChangeText={(text) => {
                      setMessId(text.toUpperCase().trim());
                      setErrorMessage("");
                    }}
                    onFocus={() => setFocusedInput(true)}
                    onBlur={() => setFocusedInput(false)}
                    style={styles.input}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    editable={!isLoading}
                    onSubmitEditing={handleJoin}
                    returnKeyType="join"
                    maxLength={MAX_MESS_ID_LENGTH}
                  />
                </View>
              </View>

              {/* Join Button */}
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <TouchableOpacity
                  style={[
                    styles.button,
                    isLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleJoin}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <View style={styles.buttonContent}>
                      <ActivityIndicator color="#FFF" size="small" />
                      <Text style={styles.buttonText}>JOINING...</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>JOIN MESS</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Divider - hide when keyboard is visible */}
              {!keyboardVisible && (
                <View style={styles.divider}>
                  <Text style={styles.dividerText}>DON'T HAVE AN INVITE?</Text>
                </View>
              )}

              {/* Create Mess Link - hide when keyboard is visible */}
              {!keyboardVisible && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    if (!isLoading) {
                      router.push("/mess/create");
                    }
                  }}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Create New Mess</Text>
                </TouchableOpacity>
              )}

              {/* Help Card - hide when keyboard is visible */}
              {!keyboardVisible && (
                <View style={styles.helpCard}>
                  <Text style={styles.helpTitle}>✅ WHAT HAPPENS NEXT</Text>
                  <Text style={styles.helpItem}>• You'll join the mess instantly</Text>
                  <Text style={styles.helpItem}>• Access shared meals and expenses</Text>
                  <Text style={styles.helpItem}>• Connect with your mess members</Text>
                  <Text style={styles.helpItem}>• Start tracking your mess activities</Text>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backButton: {
    marginTop: 50,
    marginLeft: 20,
    marginBottom: 10,
  },
  backButtonText: {
    color: "#7B8CDE",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    backgroundColor: "#1A2847",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2A3B5F",
  },
  icon: {
    fontSize: 24,
  },
  header: {
    marginBottom: 22,
  },
  headerCompact: {
    marginBottom: 15,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  titleCompact: {
    fontSize: 15,
    marginBottom: 8,
  },
  subtitle: {
    color: "#8B95B0",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  subtitleCompact: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  errorContainer: {
    backgroundColor: "#991B1B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#B91C1C",
  },
  error: {
    color: "#FEE2E2",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    color: "#8B95B0",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 5,
    marginLeft: 4,
  },
  inputBox: {
    backgroundColor: "#1A2847",
    borderWidth: 2,
    borderColor: "#2A3B5F",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  inputFocused: {
    borderColor: "#5B6EE1",
    backgroundColor: "#1E2D4D",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  input: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: "#5B6EE1",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#5B6EE1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 1.5,
  },
  divider: {
    alignItems: "center",
    marginVertical: 24,
  },
  dividerText: {
    color: "#6B7994",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2A3B5F",
    marginBottom: 24,
  },
  secondaryButtonText: {
    color: "#7B8CDE",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  helpCard: {
    backgroundColor: "#0F1C33",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1E3A5F",
  },
  helpTitle: {
    color: "#6EE7B7",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 16,
  },
  helpItem: {
    color: "#8B95B0",
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 4,
  },
});