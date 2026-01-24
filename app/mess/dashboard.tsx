import { useRouter } from "expo-router";

import * as Clipboard from "expo-clipboard";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import {
  Calendar,
  Clock,
  Copy,
  Crown,
  LogOut,
  Mail,
  Receipt,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Trash2,
  User,
  UserPlus,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import LogoutModal from "../../components/LogoutModal";
import { auth, db } from "../../firebase/firebaseConfig";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: string;
    uid: string;
    joinedDate: string;
  } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteMessIdInput, setDeleteMessIdInput] = useState("");
  const [messName, setMessName] = useState("");
  const [messId, setMessId] = useState("");
  const [messCreatedDate, setMessCreatedDate] = useState("");

  const [houseStats, setHouseStats] = useState({
    currentMonth: "January, 2026",
    totalMeal: 0.0,
    totalBazar: 0.0,
    costPerMeal: 0.0,
    remainingMoney: 0.0,
  });
  const [members, setMembers] = useState<any[]>([]);
  const [notifications] = useState([
    {
      id: 1,
      message: "New expense added: ₹2,450 for groceries",
      timestamp: "2026-01-21 10:30 AM",
    },
    {
      id: 2,
      message: "Member deposited ₹5,000",
      timestamp: "2026-01-20 04:15 PM",
    },
    {
      id: 3,
      message: "Monthly calculation completed",
      timestamp: "2026-01-19 11:00 AM",
    },
    {
      id: 4,
      message: "New meal entry added",
      timestamp: "2026-01-18 08:45 PM",
    },
  ]);
  const [loading, setLoading] = useState(true);
  const [calculatingStats, setCalculatingStats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Prevent race conditions
  const calculationInProgress = useRef(false);
  const lastCalculationTime = useRef(0);

  const calculateMonthlyStats = useCallback(
    async (messId: string, date: Date) => {
      // Debounce rapid calculations
      const now = Date.now();
      if (
        calculationInProgress.current ||
        now - lastCalculationTime.current < 500
      ) {
        console.log("Skipping duplicate calculation");
        return;
      }

      calculationInProgress.current = true;
      lastCalculationTime.current = now;
      setCalculatingStats(true);

      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;

      try {
        console.log("=== STARTING CALCULATION ===");
        console.log("Month Key:", monthKey);
        console.log("Mess ID:", messId);

        // Parallel fetch for better performance
        const [mealsSnap, transactionsSnap, membersSnap] = await Promise.all([
          getDocs(
            collection(db, "messes", messId, "meals", monthKey, "entries"),
          ),
          getDocs(
            collection(
              db,
              "messes",
              messId,
              "managerMoney",
              monthKey,
              "entries",
            ),
          ),
          // Fetch members from users collection where messId matches
          getDocs(query(collection(db, "users"), where("messId", "==", messId))),
        ]);

        console.log("=== DOCUMENTS FETCHED ===");
        console.log("Meals docs:", mealsSnap.size);
        console.log("Transactions docs:", transactionsSnap.size);
        console.log("Members docs:", membersSnap.size);

        const totalMembers = membersSnap.size;

        // Calculate total meals per member
        const memberMeals: Record<string, { name: string; count: number }> = {};

        console.log("\n=== PROCESSING MEALS ===");
        mealsSnap.forEach((d) => {
          const data = d.data();
          console.log("Meal entry:", {
            id: d.id,
            memberId: data.memberId,
            memberName: data.memberName,
            breakfast: data.breakfast,
            lunch: data.lunch,
            dinner: data.dinner,
          });

          const mealCount =
            (Number(data.breakfast) || 0) +
            (Number(data.lunch) || 0) +
            (Number(data.dinner) || 0);

          if (!memberMeals[data.memberId]) {
            memberMeals[data.memberId] = { name: data.memberName, count: 0 };
          }
          memberMeals[data.memberId].count += mealCount;
        });

        console.log("Member meals summary:", memberMeals);

        // Calculate total meals
        const totalMeal = Object.values(memberMeals).reduce(
          (sum, m) => sum + m.count,
          0,
        );

        console.log("Total meals calculated:", totalMeal);

        // Process transactions - separate deposits and expenses
        let totalCommonExpense = 0;
        let totalIndividualExpense = 0;
        const memberDeposits: Record<string, number> = {};

        console.log("\n=== PROCESSING TRANSACTIONS ===");
        transactionsSnap.forEach((d) => {
          const data = d.data();
          const amount = Number(data.amount || 0);
          const type = data.type;

          console.log("Transaction entry:", {
            id: d.id,
            type: type,
            amount: amount,
            isCommon: data.isCommon,
            memberId: data.memberId,
            memberName: data.memberName,
            description: data.description || data.item || data.purpose,
          });

          if (type === "deposit") {
            // Handle deposits
            memberDeposits[data.memberId] =
              (memberDeposits[data.memberId] || 0) + amount;
          } else if (type === "expense") {
            // Handle expenses
            if (data.isCommon === true) {
              totalCommonExpense += amount;
            } else {
              totalIndividualExpense += amount;
            }
          }
        });

        console.log("\n=== EXPENSE BREAKDOWN ===");
        console.log("Total Common Expense:", totalCommonExpense);
        console.log("Total Individual Expense:", totalIndividualExpense);

        const grandTotalExpense = totalCommonExpense + totalIndividualExpense;
        console.log("Grand Total Expense:", grandTotalExpense);

        // Calculate deposits
        console.log("\n=== DEPOSIT BREAKDOWN ===");
        console.log("Member deposits summary:", memberDeposits);

        const totalDeposit = Object.values(memberDeposits).reduce(
          (sum, amount) => sum + amount,
          0,
        );

        console.log("Total deposits calculated:", totalDeposit);

        // Calculate common charge per member
        const commonChargePerMember =
          totalMembers > 0 ? totalCommonExpense / totalMembers : 0;

        console.log("\n=== PER-MEMBER CALCULATIONS ===");
        console.log("Common charge per member:", commonChargePerMember);

        // Calculate cost per meal (only from individual expenses)
        const costPerMeal =
          totalMeal > 0 ? totalIndividualExpense / totalMeal : 0;

        console.log("Cost per meal:", costPerMeal);
        console.log("Remaining money:", totalDeposit - grandTotalExpense);

        // Build member statistics
        const membersArray: any[] = [];

        console.log("\n=== BUILDING MEMBER STATS ===");
        membersSnap.forEach((memberDoc) => {
          const memberId = memberDoc.id;
          const memberData = memberDoc.data();

          const mealCount = memberMeals[memberId]?.count || 0;
          const deposit = memberDeposits[memberId] || 0;
          const mealCost = mealCount * costPerMeal;
          const totalCost = commonChargePerMember + mealCost;
          const balance = deposit - totalCost;

          console.log(`Member: ${memberData.name}`, {
            mealCount,
            deposit,
            commonCharge: commonChargePerMember,
            mealCost,
            totalCost,
            balance,
          });

          membersArray.push({
            id: memberId,
            name: memberData.name || "Unknown",
            meal: mealCount,
            deposit: deposit,
            commonCharge: commonChargePerMember,
            mealCost: mealCost,
            totalCost: totalCost,
            balance: balance,
          });
        });

        // Sort members by name
        membersArray.sort((a, b) => a.name.localeCompare(b.name));

        const finalStats = {
          currentMonth: date.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          totalMeal,
          totalBazar: grandTotalExpense,
          costPerMeal,
          remainingMoney: totalDeposit - grandTotalExpense,
        };

        console.log("\n=== FINAL STATS TO DISPLAY ===");
        console.log(finalStats);
        console.log("=== CALCULATION COMPLETE ===\n");

        setHouseStats(finalStats);
        setMembers(membersArray);
      } catch (error) {
        console.error("❌ ERROR in calculation:", error);
        Alert.alert(
          "Error",
          "Failed to calculate statistics. Please try again.",
        );
      } finally {
        calculationInProgress.current = false;
        setCalculatingStats(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchDashboardData();

    // Animate dashboard entrance
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
  }, []);

  // Real-time listener for data changes
  useEffect(() => {
    if (!messId) return;

    const monthKey = `${selectedMonth.getFullYear()}-${(
      selectedMonth.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}`;

    console.log("Setting up real-time listeners for:", monthKey);

    // Debounced recalculation function
    let recalculateTimeout: ReturnType<typeof setTimeout>;
    const debouncedRecalculate = () => {
      clearTimeout(recalculateTimeout);
      recalculateTimeout = setTimeout(() => {
        calculateMonthlyStats(messId, selectedMonth);
      }, 300);
    };

    // Listen to meals changes
    const unsubscribeMeals = onSnapshot(
      collection(db, "messes", messId, "meals", monthKey, "entries"),
      () => {
        console.log("Meals data changed");
        debouncedRecalculate();
      },
      (error) => console.error("Meals listener error:", error),
    );

    // Listen to transactions (deposits + expenses) changes
    const unsubscribeTransactions = onSnapshot(
      collection(db, "messes", messId, "managerMoney", monthKey, "entries"),
      () => {
        console.log("Transactions data changed (deposits/expenses)");
        debouncedRecalculate();
      },
      (error) => console.error("Transactions listener error:", error),
    );

    // Listen to members changes in users collection
    const unsubscribeMembers = onSnapshot(
      query(collection(db, "users"), where("messId", "==", messId)),
      () => {
        console.log("Members data changed (users collection)");
        debouncedRecalculate();
      },
      (error) => console.error("Members listener error:", error),
    );

    // Cleanup listeners when component unmounts or dependencies change
    return () => {
      clearTimeout(recalculateTimeout);
      unsubscribeMeals();
      unsubscribeTransactions();
      unsubscribeMembers();
      console.log("Cleaned up listeners");
    };
  }, [messId, selectedMonth, calculateMonthlyStats]);

  const fetchDashboardData = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.replace("/auth/login");
        return;
      }

      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUser({
          name: userData.name || "User",
          email: userData.email || currentUser.email || "",
          role: userData.role || "member",
          uid: currentUser.uid,
          joinedDate:
            userData.createdAt?.toDate().toISOString() ||
            new Date().toISOString(),
        });

        if (userData.messId) {
          setMessId(userData.messId);
          const messDoc = await getDoc(doc(db, "messes", userData.messId));
          if (messDoc.exists()) {
            const messData = messDoc.data();
            setMessName(messData.name || "Mess");
            setMessCreatedDate(
              messData.createdAt?.toDate().toISOString() ||
                new Date().toISOString(),
            );

            // Load current month stats
            await calculateMonthlyStats(userData.messId, selectedMonth);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      Alert.alert("Error", "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboardData();
    } finally {
      setRefreshing(false);
    }
  }, [messId, selectedMonth]);

  const handleMonthChange = useCallback(
    (direction: "prev" | "next") => {
      const newMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() + (direction === "next" ? 1 : -1),
      );
      setSelectedMonth(newMonth);
      if (messId) {
        calculateMonthlyStats(messId, newMonth);
      }
    },
    [selectedMonth, messId, calculateMonthlyStats],
  );

  const handleLogout = async () => {
    try {
      const { signOut } = await import("firebase/auth");
      const AsyncStorage =
        await import("@react-native-async-storage/async-storage");

      await signOut(auth);
      await AsyncStorage.default.multiRemove([
        "@firebase_user_id",
        "@firebase_user_email",
        "@firebase_auth_token",
      ]);
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Error", "Failed to logout");
    }
  };

  const handleExitMess = async () => {
    Alert.alert("Leave Mess", "Are you sure you want to leave this mess?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            const currentUser = auth.currentUser;
            if (!currentUser) return;

            const { updateDoc, serverTimestamp, deleteDoc } =
              await import("firebase/firestore");
            const userRef = doc(db, "users", currentUser.uid);
            const userDoc = await getDoc(userRef);

            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData.messId) {
                const messRef = doc(db, "messes", userData.messId);
                const messDoc = await getDoc(messRef);

                if (messDoc.exists()) {
                  const messData = messDoc.data();
                  const updatedMembers = (messData.members || []).filter(
                    (uid: string) => uid !== currentUser.uid,
                  );

                  await updateDoc(messRef, {
                    members: updatedMembers,
                    memberCount: updatedMembers.length,
                  });

                  // Delete member document
                  const memberRef = doc(
                    db,
                    "messes",
                    userData.messId,
                    "members",
                    currentUser.uid,
                  );
                  await deleteDoc(memberRef);
                }

                await updateDoc(userRef, {
                  messId: null,
                  role: null,
                  updatedAt: serverTimestamp(),
                });

                router.replace("/mess/select");
              }
            }
          } catch (error) {
            console.error("Error exiting mess:", error);
            Alert.alert("Error", "Failed to exit mess");
          }
        },
      },
    ]);
  };

  const handleAction = (action: string) => {
    setShowActionMenu(false);

    if (action === "Add Member") {
      router.push("/mess/members");
      return;
    }

    if (action === "Add Deposit") {
      router.push("/mess/deposits");
      return;
    }

    if (action === "Add Expense") {
      router.push("/mess/expenses");
      return;
    }

    if (action === "Meal Entry") {
      router.push("/mess/meals");
      return;
    }
  };

  const handleViewTransactions = (type: "deposit" | "expense" | "meal") => {
    Alert.alert("Coming Soon", `View ${type} transactions feature coming soon`);
  };

  const handleMealRoutine = () => {
    setShowSettings(false);
    setTimeout(() => {
      Alert.alert(
        "Coming Soon",
        "Meal routine management feature is coming soon! You'll be able to set breakfast, lunch, and dinner timings for your mess.",
      );
    }, 300);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const handleDeleteMess = async () => {
    if (!user || user.role !== "manager") {
      Alert.alert("Permission Denied", "Only managers can delete the mess.");
      return;
    }

    setShowSettings(false);

    Alert.alert(
      "⚠️ Delete Mess - First Warning",
      "This action is PERMANENT and will delete ALL data including:\n\n• All member information\n• All meal entries\n• All expenses and deposits\n• All transaction history\n\nAre you absolutely sure?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            setTimeout(() => {
              Alert.alert(
                "⚠️ Delete Mess - Final Warning",
                "This is your LAST chance to cancel.\n\nOnce deleted, this mess CANNOT be recovered.\n\nDo you want to proceed?",
                [
                  {
                    text: "Cancel",
                    style: "cancel",
                  },
                  {
                    text: "Yes, Delete",
                    style: "destructive",
                    onPress: () => {
                      setTimeout(() => setShowDeleteConfirm(true), 300);
                    },
                  },
                ],
              );
            }, 300);
          },
        },
      ],
    );
  };

  const confirmDeleteMess = async () => {
    if (deleteMessIdInput.trim() !== messId) {
      Alert.alert(
        "Invalid Mess ID",
        "The Mess ID you entered does not match. Please try again.",
      );
      return;
    }

    setShowDeleteConfirm(false);
    setDeleteMessIdInput("");

    try {
      const batch = writeBatch(db);

      // Delete all member documents
      const membersSnap = await getDocs(
        collection(db, "messes", messId, "members"),
      );
      membersSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Update all users to remove messId
      const usersSnap = await getDocs(collection(db, "users"));
      usersSnap.forEach((userDoc) => {
        const userData = userDoc.data();
        if (userData.messId === messId) {
          batch.update(userDoc.ref, { messId: null, role: null });
        }
      });

      // Delete the mess document
      batch.delete(doc(db, "messes", messId));

      await batch.commit();

      Alert.alert("Mess Deleted", "The mess has been permanently deleted.", [
        {
          text: "OK",
          onPress: () => router.replace("/mess/select"),
        },
      ]);
    } catch (error) {
      console.error("Error deleting mess:", error);
      Alert.alert("Error", "Failed to delete mess. Please try again.");
    }
  };

  const handleShareMess = () => {
    setShowSettings(false);
    setTimeout(() => {
      Alert.alert(
        "Share Mess Invitation",
        `Share this information with others to invite them to your mess:\n\n📋 Mess ID: ${messId}\n🏠 Mess Name: ${messName}\n\nThey can use this ID to join your mess from the app.`,
        [
          {
            text: "Copy Mess ID",
            onPress: () => {
              Clipboard.setString(messId);
              Alert.alert("Copied!", "Mess ID has been copied to clipboard");
            },
          },
          { text: "Close" },
        ],
      );
    }, 300);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Failed to load user data</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/auth/login")}
        >
          <Text style={styles.buttonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Animated Background */}
      <View style={styles.gradientBackground}>
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.circle3} />
      </View>

      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Mess Manager</Text>
            <TouchableOpacity onPress={() => setShowProfile(true)}>
              <Text style={styles.headerSubtitle}>Welcome, {user.name}</Text>
            </TouchableOpacity>
            <View style={styles.roleContainer}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowNotifications(true)}
            >
              <Text style={styles.headerButtonText}>🔔</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Profile Modal */}
      {/* Profile Modal */}
      <Modal
        visible={showProfile}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowProfile(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowProfile(false)}
          />
          <View style={styles.modalContainer}>
            {/* Header with Avatar and Close Button */}
            <View style={styles.modalHeader}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatar}>
                  <User size={40} color="#FFFFFF" strokeWidth={2.5} />
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowProfile(false)}
              >
                <X size={24} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>My Profile</Text>
            <Text style={styles.modalSubtitle}>Account Information</Text>

            {/* Profile Information */}
            <View style={styles.profileContent}>
              {/* Name */}
              <View style={styles.profileSection}>
                <View style={styles.profileIconContainer}>
                  <User size={20} color="#6366F1" strokeWidth={2} />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileLabel}>Name</Text>
                  <Text style={styles.profileValue}>{user.name}</Text>
                </View>
              </View>

              {/* Email */}
              <View style={styles.profileSection}>
                <View style={styles.profileIconContainer}>
                  <Mail size={20} color="#6366F1" strokeWidth={2} />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileLabel}>Email</Text>
                  <Text style={styles.profileValue}>{user.email}</Text>
                </View>
              </View>

              {/* Role */}
              <View style={styles.profileSection}>
                <View style={styles.profileIconContainer}>
                  <Shield size={20} color="#6366F1" strokeWidth={2} />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileLabel}>Role</Text>
                  <View style={styles.roleBadge}>
                    {user.role === "manager" ? (
                      <View style={styles.roleBadgeContent}>
                        <Crown size={14} color="#FACC15" strokeWidth={2} />
                        <Text style={styles.roleBadgeText}>Manager</Text>
                      </View>
                    ) : (
                      <Text style={styles.roleBadgeText}>Member</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Joined Date */}
              <View style={styles.profileSection}>
                <View style={styles.profileIconContainer}>
                  <Calendar size={20} color="#6366F1" strokeWidth={2} />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileLabel}>Joined Date</Text>
                  <Text style={styles.profileValue}>
                    {formatDate(user.joinedDate)}
                  </Text>
                </View>
              </View>

              {/* User ID with Copy Button */}
              <View style={styles.profileSection}>
                <View style={styles.profileIconContainer}>
                  <Copy size={20} color="#6366F1" strokeWidth={2} />
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileLabel}>User ID</Text>
                  <Text style={styles.profileValueSmall} numberOfLines={1}>
                    {user.uid}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.copyButton}
                  activeOpacity={0.7}
                  onPress={async () => {
                    try {
                      await Clipboard.setStringAsync(user.uid);
                      Alert.alert("Copied!", "User ID copied to clipboard");
                    } catch (error) {
                      console.error("Clipboard error:", error);
                      Alert.alert("Error", "Failed to copy User ID");
                    }
                  }}
                >
                  <Copy size={16} color="#6366F1" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={() => {
                  Alert.alert(
                    "Logout",
                    "Are you sure you want to logout?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Logout",
                        style: "destructive",
                        onPress: () => {
                          setShowProfile(false);
                          setTimeout(handleLogout, 300); // slight delay for modal to close
                        },
                      },
                    ],
                    { cancelable: true },
                  );
                }}
              >
                <LogOut size={18} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.modalButtonText}>Logout</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowProfile(false)}
              >
                <X size={18} color="#94A3B8" strokeWidth={2} />
                <Text style={styles.modalButtonTextSecondary}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop to close modal when tapped */}
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowNotifications(false)}
          />

          {/* Modal content */}
          <View style={[styles.modalContainer, styles.notificationsModal]}>
            {/* Header */}
            <View style={styles.notificationsHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
            </View>

            {/* Notifications list */}
            <ScrollView style={styles.notificationsList}>
              {notifications
                .slice(-4) // get last 4 notifications
                .reverse() // show newest first
                .map((notif) => (
                  <View key={notif.id} style={styles.notificationItem}>
                    <Text style={styles.notificationMessage}>
                      {notif.message}
                    </Text>
                    <Text style={styles.notificationTime}>
                      {notif.timestamp}
                    </Text>
                  </View>
                ))}
            </ScrollView>

            {/* View More button */}
            <TouchableOpacity
              style={styles.viewMoreButton}
              onPress={() => {
                setShowNotifications(false);
                router.push("/mess/notifications");
              }}
            >
              <Text style={styles.viewMoreButtonText}>
                View More Notifications
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop */}
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowSettings(false)}
          />

          <View style={[styles.modalContainer, styles.settingsModal]}>
            {/* Header */}
            <View style={styles.settingsHeader}>
              <Text style={styles.modalTitle}>Mess Settings</Text>
            </View>

            {/* Menu Items */}
            <View style={styles.settingsMenuItems}>
              {/* Meal Routine */}
              <TouchableOpacity
                style={styles.settingsMenuItem}
                onPress={handleMealRoutine}
              >
                <View style={styles.settingsMenuIcon}>
                  <Clock size={20} color="#000" />
                </View>
                <View style={styles.settingsMenuTextContainer}>
                  <Text style={styles.settingsMenuText}>Meal Routine</Text>
                  <Text style={styles.settingsMenuSubtext}>
                    Set meal timings
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Share Mess */}
              <TouchableOpacity
                style={styles.settingsMenuItem}
                onPress={handleShareMess}
              >
                <View style={styles.settingsMenuIcon}>
                  <Share2 size={20} color="#000" />
                </View>
                <View style={styles.settingsMenuTextContainer}>
                  <Text style={styles.settingsMenuText}>Share Mess</Text>
                  <Text style={styles.settingsMenuSubtext}>
                    Invite others to join
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Leave Mess */}
              <TouchableOpacity
                style={styles.settingsMenuItem}
                onPress={() => {
                  setShowSettings(false);
                  setTimeout(handleExitMess, 300);
                }}
              >
                <View
                  style={[
                    styles.settingsMenuIcon,
                    styles.settingsMenuIconWarning,
                  ]}
                >
                  <LogOut size={20} color="#000" />
                </View>
                <View style={styles.settingsMenuTextContainer}>
                  <Text style={styles.settingsMenuText}>Leave Mess</Text>
                  <Text style={styles.settingsMenuSubtext}>Exit this mess</Text>
                </View>
              </TouchableOpacity>

              {/* Delete Mess (Manager Only) */}
              {user?.role === "manager" && (
                <TouchableOpacity
                  style={styles.settingsMenuItem}
                  onPress={handleDeleteMess}
                >
                  <View
                    style={[
                      styles.settingsMenuIcon,
                      styles.settingsMenuIconDanger,
                    ]}
                  >
                    <Trash2 size={20} color="#000" />
                  </View>
                  <View style={styles.settingsMenuTextContainer}>
                    <Text style={styles.settingsMenuText}>Delete Mess</Text>
                    <Text style={styles.settingsMenuSubtext}>
                      Permanently remove
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Mess Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowDeleteConfirm(false);
              setDeleteMessIdInput("");
            }}
          />
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>⚠️ Confirm Deletion</Text>

            <Text style={styles.deleteWarningText}>
              To confirm deletion, please type the Mess ID below:
            </Text>

            <View style={styles.messIdDisplayBox}>
              <Text style={styles.messIdDisplayText}>{messId}</Text>
            </View>

            <TextInput
              style={styles.deleteInput}
              placeholder="Type Mess ID here"
              placeholderTextColor="#64748B"
              value={deleteMessIdInput}
              onChangeText={setDeleteMessIdInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setDeleteMessIdInput("");
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonDanger,
                  deleteMessIdInput.trim() !== messId &&
                    styles.modalButtonDisabled,
                ]}
                onPress={confirmDeleteMess}
                disabled={deleteMessIdInput.trim() !== messId}
              >
                <Text style={styles.modalButtonText}>Delete Forever</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View
        style={[
          styles.scrollViewContainer,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6366F1"
              colors={["#6366F1"]}
            />
          }
        >
          {/* Mess Info Card */}
          <View style={styles.messInfoCard}>
            <View style={styles.messInfoHeader}>
              <View style={styles.messInfoLeft}>
                <Text style={styles.messInfoTitle}>
                  {messName || "Your Mess"}
                </Text>
                <Text style={styles.messInfoId}>ID: {messId || "N/A"}</Text>
                <Text style={styles.messInfoDate}>
                  Created:{" "}
                  {messCreatedDate ? formatDate(messCreatedDate) : "N/A"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.settingsIconButton}
                onPress={() => setShowSettings(true)}
              >
                <Settings size={28} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Month Selector */}
          <View style={styles.monthSelector}>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => handleMonthChange("prev")}
              disabled={calculatingStats}
            >
              <Text style={styles.monthButtonText}>‹</Text>
            </TouchableOpacity>

            <View style={styles.monthTextContainer}>
              <Text style={styles.monthText}>
                {selectedMonth.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              {calculatingStats && (
                <ActivityIndicator
                  size="small"
                  color="#6366F1"
                  style={styles.monthLoader}
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => handleMonthChange("next")}
              disabled={calculatingStats}
            >
              <Text style={styles.monthButtonText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            {/* Total Meals (NO TAP) */}
            <View style={[styles.statCard, styles.statCardBlue]}>
              <Text style={styles.statLabel}>Total Meals</Text>
              <Text style={styles.statValue}>{houseStats.totalMeal}</Text>
            </View>

            {/* Total Expenses (NO TAP) */}
            <View style={[styles.statCard, styles.statCardGreen]}>
              <Text style={styles.statLabel}>Total Expenses</Text>
              <Text style={styles.statValue}>
                ₹{houseStats.totalBazar.toFixed(2)}
              </Text>
            </View>

            {/* Cost Per Meal */}
            <View style={[styles.statCard, styles.statCardPurple]}>
              <Text style={styles.statLabel}>Cost Per Meal</Text>
              <Text style={styles.statValue}>
                ₹{houseStats.costPerMeal.toFixed(2)}
              </Text>
            </View>

            {/* Remaining Money */}
            <View style={[styles.statCard, styles.statCardAmber]}>
              <Text style={styles.statLabel}>Remaining Money</Text>
              <Text
                style={[
                  styles.statValue,
                  houseStats.remainingMoney < 0 && styles.negativeValue,
                ]}
              >
                ₹{houseStats.remainingMoney.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Member Transaction Buttons (Members Only) */}
          {user.role === "member" && (
            <View style={styles.actionButtonsContainer}>
              {/* Deposit History */}
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonGreen]}
                onPress={() => router.push("/mess/deposits")} // view only
                activeOpacity={0.75}
              >
                <Wallet size={22} color="#fff" />
                <View style={styles.actionButtonTextContainer}>
                  <Text style={styles.actionButtonLabel}>View</Text>
                  <Text style={styles.actionButtonTitle}>Deposit History</Text>
                </View>
              </TouchableOpacity>

              {/* Expense History */}
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonRed]}
                onPress={() => router.push("/mess/expenses")} // view only
                activeOpacity={0.75}
              >
                <Receipt size={22} color="#fff" />
                <View style={styles.actionButtonTextContainer}>
                  <Text style={styles.actionButtonLabel}>View</Text>
                  <Text style={styles.actionButtonTitle}>Expense History</Text>
                </View>
              </TouchableOpacity>

              {/* Meal History */}
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonBlue]}
                onPress={() => router.push("/mess/meals")} // view only
                activeOpacity={0.75}
              >
                <UtensilsCrossed size={22} color="#fff" />
                <View style={styles.actionButtonTextContainer}>
                  <Text style={styles.actionButtonLabel}>View</Text>
                  <Text style={styles.actionButtonTitle}>Meal History</Text>
                </View>
              </TouchableOpacity>

              {/* Member List */}
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonPurple]}
                onPress={() => router.push("/mess/members")} // view only
                activeOpacity={0.75}
              >
                <Users size={22} color="#fff" />
                <View style={styles.actionButtonTextContainer}>
                  <Text style={styles.actionButtonLabel}>View</Text>
                  <Text style={styles.actionButtonTitle}>Member List</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Members Table */}
          <View style={styles.membersCard}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersHeaderTitle}>Member Statistics</Text>
              <Text style={styles.membersCount}>
                Total: {members.length || 0}
              </Text>
            </View>

            {members.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No members yet. Start adding entries to see statistics!
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, { width: 120 }]}>
                      Name
                    </Text>
                    <Text style={[styles.tableHeaderText, { width: 60 }]}>
                      Meal
                    </Text>
                    <Text style={[styles.tableHeaderText, { width: 90 }]}>
                      Deposit
                    </Text>
                    <Text style={[styles.tableHeaderText, { width: 90 }]}>
                      Common
                    </Text>
                    <Text style={[styles.tableHeaderText, { width: 90 }]}>
                      Meal Cost
                    </Text>
                    <Text style={[styles.tableHeaderText, { width: 90 }]}>
                      Total Cost
                    </Text>
                    <Text style={[styles.tableHeaderText, { width: 90 }]}>
                      Balance
                    </Text>
                  </View>
                  {members.map((member) => (
                    <View key={member.id} style={styles.tableRow}>
                      <Text
                        style={[styles.tableCell, { width: 120 }]}
                        numberOfLines={1}
                      >
                        {member.name}
                      </Text>
                      <Text style={[styles.tableCell, { width: 60 }]}>
                        {member.meal}
                      </Text>
                      <Text style={[styles.tableCell, { width: 90 }]}>
                        ₹{member.deposit.toFixed(1)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 90 }]}>
                        ₹{member.commonCharge.toFixed(1)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 90 }]}>
                        ₹{member.mealCost.toFixed(1)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 90 }]}>
                        ₹{member.totalCost.toFixed(1)}
                      </Text>
                      <Text
                        style={[
                          styles.tableCell,
                          { width: 90 },
                          member.balance >= 0
                            ? styles.balancePositive
                            : styles.balanceNegative,
                        ]}
                      >
                        ₹{member.balance.toFixed(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Manager Action Menu */}
      {user.role === "manager" && showActionMenu && (
        <View style={styles.actionMenuOverlay}>
          <TouchableOpacity
            style={styles.actionMenuBackdrop}
            activeOpacity={1}
            onPress={() => setShowActionMenu(false)}
          />

          <View style={styles.actionMenuContainer}>
            {/* Add Member */}
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleAction("Add Member")}
            >
              <View style={styles.actionMenuIcon}>
                <UserPlus size={18} color="#2563EB" />
              </View>
              <Text style={styles.actionMenuText}>Add Member</Text>
            </TouchableOpacity>

            {/* Add Deposit */}
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleAction("Add Deposit")}
            >
              <View style={styles.actionMenuIcon}>
                <Wallet size={18} color="#16A34A" />
              </View>
              <Text style={styles.actionMenuText}>Add Deposit</Text>
            </TouchableOpacity>

            {/* Add Expense */}
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleAction("Add Expense")}
            >
              <View style={styles.actionMenuIcon}>
                <ShoppingCart size={18} color="#DC2626" />
              </View>
              <Text style={styles.actionMenuText}>Add Expense</Text>
            </TouchableOpacity>

            {/* Meal Entry */}
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleAction("Meal Entry")}
            >
              <View style={styles.actionMenuIcon}>
                <UtensilsCrossed size={18} color="#2563EB" />
              </View>
              <Text style={styles.actionMenuText}>Meal Entry</Text>
            </TouchableOpacity>

            {/* Add Guest Meal – Coming Soon */}
            <TouchableOpacity
              style={styles.actionMenuItem}
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  "Coming Soon",
                  "Guest meal feature is under development and will be available soon.",
                )
              }
            >
              <View style={styles.actionMenuIcon}>
                <UsersRound size={18} color="#9CA3AF" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuText}>Add Guest Meal</Text>
                <View style={styles.comingSoonBadge}>
                  <Clock size={10} color="#9CA3AF" />
                  <Text style={styles.comingSoonText}>Coming Soon</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Floating Action Button (Manager Only) */}
      {user.role === "manager" && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowActionMenu(!showActionMenu)}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Logout Confirmation Modal */}
      <LogoutModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onLogout={handleLogout}
        onExitMess={handleExitMess}
        showExitMess={true}
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
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    top: -100,
    right: -80,
  },
  circle2: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(139, 92, 246, 0.06)",
    bottom: -60,
    left: -60,
  },
  circle3: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(59, 130, 246, 0.05)",
    top: "40%",
    right: -40,
  },
  scrollViewContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  loadingText: {
    color: "#94A3B8",
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 16,
    marginBottom: 16,
  },
  header: {
    backgroundColor: "#6366F1",
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: "#E0E7FF",
    fontWeight: "500",
  },
  roleContainer: {
    flexDirection: "row",
    marginTop: 4,
  },

  roleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  headerButtonText: {
    fontSize: 20,
  },
  notificationBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
  },
  messInfoCard: {
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  messInfoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  messInfoLeft: {
    flex: 1,
  },
  messInfoTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  messInfoId: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "500",
  },
  messInfoDate: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  settingsIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  monthSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  monthButtonText: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  monthTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  monthLoader: {
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 16,
    padding: 18,
    borderLeftWidth: 4,
  },
  statCardBlue: {
    borderLeftColor: "#3B82F6",
  },
  statCardGreen: {
    borderLeftColor: "#10B981",
  },
  statCardPurple: {
    borderLeftColor: "#8B5CF6",
  },
  statCardAmber: {
    borderLeftColor: "#F59E0B",
  },
  statLabel: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  statHint: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 4,
    fontStyle: "italic",
  },
  negativeValue: {
    color: "#EF4444",
  },
  actionButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    minWidth: "47%",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  actionButtonGreen: {
    backgroundColor: "#10B981",
  },
  actionButtonRed: {
    backgroundColor: "#EF4444",
  },
  actionButtonBlue: {
    backgroundColor: "#3B82F6",
  },
  actionButtonIcon: {
    fontSize: 24,
  },
  actionButtonTextContainer: {
    flex: 1,
  },
  actionButtonLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 2,
  },
  actionButtonTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  membersCard: {
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  membersHeader: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(99, 102, 241, 0.3)",
  },
  membersHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  membersCount: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyStateText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  tableContainer: {
    padding: 16,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(99, 102, 241, 0.3)",
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(71, 85, 105, 0.2)",
  },
  tableCell: {
    fontSize: 14,
    color: "#E2E8F0",
  },
  balancePositive: {
    color: "#10B981",
    fontWeight: "700",
  },
  balanceNegative: {
    color: "#EF4444",
    fontWeight: "700",
  },
  actionMenuOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  actionMenuBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  actionMenuContainer: {
    backgroundColor: "rgba(30, 41, 59, 0.98)",
    borderRadius: 20,
    padding: 8,
    width: 280,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  actionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
  actionMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  actionMenuIconText: {
    fontSize: 20,
  },
  actionMenuText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  fab: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  fabText: {
    fontSize: 32,
    color: "#FFFFFF",
    fontWeight: "300",
  },
  button: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  modalButtonPrimary: {
    backgroundColor: "#6366F1",
  },

  notificationsModal: {
    maxHeight: "70%",
  },
  notificationsHeader: {
    backgroundColor: "#6366F1",
    marginHorizontal: -20,
    marginTop: -20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: 16,
  },
  notificationsList: {
    maxHeight: 300,
  },
  notificationItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(71, 85, 105, 0.3)",
  },
  notificationMessage: {
    color: "#E2E8F0",
    fontSize: 13,
    marginBottom: 4,
  },
  notificationTime: {
    color: "#94A3B8",
    fontSize: 11,
  },
  viewMoreButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  viewMoreButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  settingsModal: {
    paddingVertical: 0,
  },
  settingsHeader: {
    backgroundColor: "#6366F1",
    marginHorizontal: -20,
    marginTop: -20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: 0,
  },
  settingsMenuItems: {
    paddingVertical: 8,
  },
  settingsMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
  settingsMenuIcon: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E0E0E0",
    borderRadius: 10,
    marginRight: 16,
  },
  settingsMenuIconDanger: {
    backgroundColor: "#EF4444",
  },
  settingsMenuIconWarning: {
    backgroundColor: "#F59E0B",
  },
  settingsMenuIconText: {
    fontSize: 20,
  },
  settingsMenuTextContainer: {
    flex: 1,
  },
  settingsMenuText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  settingsMenuSubtext: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  deleteWarningText: {
    fontSize: 14,
    color: "#E2E8F0",
    marginBottom: 16,
    textAlign: "center",
  },
  messIdDisplayBox: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  messIdDisplayText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  deleteInput: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderRadius: 12,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 20,
  },

  modalButtonDisabled: {
    backgroundColor: "#475569",
    opacity: 0.5,
  },
  actionButtonPurple: {
    backgroundColor: "#6D28D9", // violet / indigo tone
  },
  actionMenuItemDisabled: {
    opacity: 0.6,
  },

  disabledText: {
    color: "#9CA3AF",
  },

  comingSoonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },

  comingSoonText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 16,
    position: "relative",
  },
  avatarContainer: {
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#818CF8",
  },
  closeButton: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 24,
  },
  profileContent: {
    gap: 12,
    marginBottom: 24,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  profileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
  },
  profileLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  profileValue: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  profileValueSmall: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
    fontFamily: "monospace",
  },

  roleBadgeManager: {
    backgroundColor: "#F59E0B",
  },
  roleBadgeMember: {
    backgroundColor: "#6366F1",
  },

  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalButtonDanger: {
    backgroundColor: "#EF4444",
  },
  modalButtonSecondary: {
    backgroundColor: "#334155",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  modalButtonTextSecondary: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "700",
  },
  roleBadge: {
    backgroundColor: "#F59E0B20", // slightly transparent background
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  roleBadgeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  roleBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
