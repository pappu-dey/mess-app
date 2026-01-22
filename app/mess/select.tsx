// app/mess/select.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import LogoutModal from "../../components/LogoutModal";
import { auth, db } from "../../firebase/firebaseConfig";

export default function MessSelect() {
  const router = useRouter();
  

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim1 = useRef(new Animated.Value(0.9)).current;
  const scaleAnim2 = useRef(new Animated.Value(0.9)).current;
  const menuFadeAnim = useRef(new Animated.Value(0)).current;
  const menuSlideAnim = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    checkUserMess();
    fetchUserData();

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
    ]).start();

    // Stagger the card animations
    Animated.stagger(150, [
      Animated.spring(scaleAnim1, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim2, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const checkUserMess = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.messId) {
            // User already has a mess, redirect to dashboard
            router.replace("/mess/dashboard");
          }
        }
      }
    } catch (error) {
      console.error("Error checking user mess:", error);
    }
  };

  const fetchUserData = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        setUserEmail(user.email || "");

        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserName(userData.name || userData.displayName || "User");
        } else {
          // Fallback to displayName from auth
          setUserName(user.displayName || "User");
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUserName("User");
    }
  };

  const toggleProfileMenu = () => {
    if (!showProfileMenu) {
      setShowProfileMenu(true);
      Animated.parallel([
        Animated.timing(menuFadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuSlideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(menuFadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(menuSlideAnim, {
          toValue: -10,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => setShowProfileMenu(false));
    }
  };

  const handleLogout = async () => {
    try {
      // Close the profile menu first
      setShowProfileMenu(false);
      
      // Sign out from Firebase
      await signOut(auth);
      
      // Clear AsyncStorage manually to ensure clean logout
      await AsyncStorage.multiRemove([
        "@firebase_user_id",
        "@firebase_user_email",
        "@firebase_auth_token",
      ]);
      
      // Navigate to login screen
      router.replace("/auth/login");
    } catch (error: any) {
      console.error("Logout error:", error);
      Alert.alert("Error", "Failed to logout. Please try again.");
    }
  };

  const handleJoinPress = () => {
    router.push("/mess/join");
  };

  const handleCreatePress = () => {
    router.push("/mess/create");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={styles.container}>
      {/* Animated Background */}
      <View style={styles.gradientBackground}>
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.circle3} />
      </View>

      {/* Profile Menu Modal */}
      <Modal
        visible={showProfileMenu}
        transparent
        animationType="none"
        onRequestClose={toggleProfileMenu}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={toggleProfileMenu}
        >
          <Animated.View
            style={[
              styles.profileMenu,
              {
                opacity: menuFadeAnim,
                transform: [{ translateY: menuSlideAnim }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatarContainer}>
                <Text style={styles.menuAvatarText}>
                  {getInitials(userName)}
                </Text>
              </View>
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUserName}>{userName}</Text>
                <Text style={styles.menuUserEmail}>{userEmail}</Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowProfileMenu(false);
                setShowLogoutModal(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemIcon}>🚪</Text>
              <Text style={styles.menuItemText}>Logout</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          {/* Profile Section */}
          <TouchableOpacity
            style={styles.profileButton}
            onPress={toggleProfileMenu}
            activeOpacity={0.8}
          >
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{getInitials(userName)}</Text>
            </View>
            <Text style={styles.profileName}>{userName}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Welcome to Mess Manager</Text>
          <Text style={styles.subtitle}>
            Join an existing mess or create your own to get started
          </Text>
        </View>

        {/* Options Cards */}
        <View style={styles.optionsContainer}>
          {/* Join Mess Card */}
          <Animated.View
            style={[styles.cardWrapper, { transform: [{ scale: scaleAnim1 }] }]}
          >
            <TouchableOpacity
              style={styles.card}
              onPress={handleJoinPress}
              activeOpacity={0.9}
            >
              <View style={styles.cardIconContainer}>
                <Text style={styles.cardIcon}>👥</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Join Existing Mess</Text>
                <Text style={styles.cardDescription}>
                  Have an invite code? Join your friends' mess group
                </Text>
              </View>
              <View style={styles.cardArrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Create Mess Card */}
          <Animated.View
            style={[styles.cardWrapper, { transform: [{ scale: scaleAnim2 }] }]}
          >
            <TouchableOpacity
              style={[styles.card, styles.cardHighlight]}
              onPress={handleCreatePress}
              activeOpacity={0.9}
            >
              <View style={[styles.cardIconContainer, styles.iconHighlight]}>
                <Text style={styles.cardIcon}>✨</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Create New Mess</Text>
                <Text style={styles.cardDescription}>
                  Start fresh and invite others to join your mess
                </Text>
              </View>
              <View style={styles.cardArrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💡 You can switch between messes anytime from settings
          </Text>
        </View>
      </Animated.View>

      {/* Logout Confirmation Modal */}
      <LogoutModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onLogout={handleLogout}
        showExitMess={false}
      />
    </View>
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
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: "rgba(99, 102, 241, 0.06)",
    top: -100,
    right: -80,
  },
  circle2: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    bottom: -80,
    left: -60,
  },
  circle3: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(59, 130, 246, 0.07)",
    top: "50%",
    right: -40,
  },
  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.5)",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 32,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(99, 102, 241, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#6366F1",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  profileName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    maxWidth: 120,
    letterSpacing: -0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  profileMenu: {
    position: "absolute",
    top: 60,
    right: 24,
    left: 24,
    backgroundColor: "rgba(15, 23, 42, 0.98)",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.4)",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    gap: 14,
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  menuAvatarContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(99, 102, 241, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#6366F1",
  },
  menuAvatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  menuUserInfo: {
    flex: 1,
  },
  menuUserName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  menuUserEmail: {
    fontSize: 13,
    color: "#94A3B8",
    letterSpacing: -0.1,
  },
  menuDivider: {
    height: 1.5,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    marginHorizontal: 0,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  menuItemIcon: {
    fontSize: 22,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EF4444",
    letterSpacing: -0.2,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  iconContainer: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.2)",
  },
  iconEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 12,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  optionsContainer: {
    gap: 20,
  },
  cardWrapper: {
    width: "100%",
  },
  card: {
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(71, 85, 105, 0.3)",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cardHighlight: {
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderWidth: 2,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(71, 85, 105, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconHighlight: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  cardIcon: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardDescription: {
    fontSize: 13,
    color: "#94A3B8",
    lineHeight: 18,
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  arrowText: {
    fontSize: 18,
    color: "#6366F1",
    fontWeight: "600",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(71, 85, 105, 0.3)",
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 1,
  },
  footer: {
    marginTop: 40,
    padding: 16,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  footerText: {
    fontSize: 13,
    color: "#93C5FD",
    textAlign: "center",
    lineHeight: 20,
  },
});
