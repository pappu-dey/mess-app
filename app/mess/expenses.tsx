// Expenses.tsx - Fixed and Improved Version
import { format } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/firebaseConfig";

// ==================== HELPERS ====================
const formatDateTime = (date: Date) =>
  date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

// ==================== TYPES ====================
type ExpenseItem = {
  id: string;
  amount: number;
  purpose: string;
  date: string;
  isCommon: boolean;
  edited: boolean;
  createdAt: any;
  updatedAt?: any;
};

// ==================== MAIN COMPONENT ====================
export default function Expenses() {
  /* ================= CONTEXT ================= */
  const params = useLocalSearchParams();
  const { refreshDashboard } = useApp();
  const { user, activeMessId } = useAuth();
  const isManager = user?.role === "manager";

  // Initialize selected month from URL parameter or default to current month
  const getInitialMonth = () => {
    if (params.month && typeof params.month === "string") {
      return params.month;
    }
    return format(new Date(), "yyyy-MM");
  };

  const [monthId, setMonthId] = useState(getInitialMonth());

  /* ================= STATE ================= */
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [totalExpenses, setTotalExpenses] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCommon, setIsCommon] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);

  /* ================= EARLY RETURN FOR NO MESS ================= */
  if (!activeMessId) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>No active mess selected</Text>
        <Text style={styles.errorSubtext}>Please select or join a mess first</Text>
      </View>
    );
  }

  /* ================= FIRESTORE PATH ================= */
  const monthRef = doc(db, "messes", activeMessId, "managerMoney", monthId);
  const expensesRef = collection(monthRef, "entries");

  /* ================= FETCH EXPENSES ================= */
  useEffect(() => {
    if (!activeMessId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Query for expenses
    const q = query(
      expensesRef,
      where("type", "==", "expense"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ExpenseItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              amount: data.amount || 0,
              purpose: data.purpose || "",
              date: data.date || "",
              isCommon: data.isCommon || false,
              edited: data.edited ?? false,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            };
          })
          .filter((item) => item.amount > 0); // Hide guest meal adjustments (negative values)

        setExpenses(list);

        // Calculate total from visible expenses only (Gross Expense)
        const total = list.reduce((sum, exp) => sum + exp.amount, 0);
        setTotalExpenses(total);

        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error("Error fetching expenses:", error);
        // Don't show error for empty collections
        if (error.code !== "failed-precondition") {
          Alert.alert("Error", "Failed to load expenses. Please try again.");
        }
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsub();
  }, [activeMessId, monthId]);

  /* ================= SAVE EXPENSE (MANAGER ONLY) ================= */
  const saveExpense = async () => {
    if (!isManager) {
      Alert.alert("Access Denied", "Only managers can add or edit expenses");
      return;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return Alert.alert("Invalid Amount", "Please enter a valid amount greater than 0");
    }
    if (!purpose.trim()) {
      return Alert.alert("Missing Information", "Please enter expense purpose");
    }

    setSubmitting(true);
    try {
      // Ensure month document exists with initial data
      await setDoc(
        monthRef,
        {
          month: monthId,
          totalExpense: 0,
          totalDeposit: 0,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (editingId) {
        // Update existing expense
        const old = expenses.find((e) => e.id === editingId);
        if (!old) {
          Alert.alert("Error", "Expense not found");
          setSubmitting(false);
          return;
        }

        const diff = amt - old.amount;

        await updateDoc(doc(expensesRef, editingId), {
          amount: amt,
          purpose: purpose.trim(),
          date: formatDateTime(selectedDate),
          isCommon,
          edited: true,
          updatedAt: serverTimestamp(),
        });

        await updateDoc(monthRef, {
          totalExpense: increment(diff),
          updatedAt: serverTimestamp(),
        });

        Alert.alert("Success", "Expense updated successfully");
      } else {
        // Add new expense
        await addDoc(expensesRef, {
          type: "expense",
          amount: amt,
          purpose: purpose.trim(),
          date: formatDateTime(selectedDate),
          isCommon,
          edited: false,
          createdAt: serverTimestamp(),
        });

        await updateDoc(monthRef, {
          totalExpense: increment(amt),
          updatedAt: serverTimestamp(),
        });

        Alert.alert("Success", "Expense added successfully");
      }

      closeModal();
      refreshDashboard();
    } catch (error: any) {
      console.error("Error saving expense:", error);

      let errorMsg = "Failed to save expense. Please try again.";
      if (error.code === "permission-denied") {
        errorMsg = "You don't have permission to modify expenses";
      } else if (error.code === "unavailable") {
        errorMsg = "Network error. Please check your connection";
      }

      Alert.alert("Error", errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ================= DELETE EXPENSE (MANAGER ONLY) ================= */
  const confirmDelete = (item: ExpenseItem) => {
    if (!isManager) {
      Alert.alert("Access Denied", "Only managers can delete expenses");
      return;
    }

    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete ₹${item.amount.toLocaleString("en-IN")} for ${item.purpose}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteExpense(item.id, item.amount),
        },
      ]
    );
  };

  const deleteExpense = async (id: string, amt: number) => {
    if (!isManager) {
      Alert.alert("Access Denied", "Only managers can delete expenses");
      return;
    }

    try {
      await deleteDoc(doc(expensesRef, id));
      await updateDoc(monthRef, {
        totalExpense: increment(-amt),
        updatedAt: serverTimestamp(),
      });

      setShowActionMenu(false);
      setSelectedExpense(null);
      refreshDashboard();
      Alert.alert("Success", "Expense deleted successfully");
    } catch (error: any) {
      console.error("Error deleting expense:", error);

      let errorMsg = "Failed to delete expense. Please try again.";
      if (error.code === "permission-denied") {
        errorMsg = "You don't have permission to delete expenses";
      }

      Alert.alert("Error", errorMsg);
    }
  };

  /* ================= MODAL HANDLERS ================= */
  const closeModal = () => {
    setShowModal(false);
    setAmount("");
    setPurpose("");
    setSelectedDate(new Date());
    setIsCommon(false);
    setEditingId(null);
  };

  const openEditModal = (item: ExpenseItem) => {
    if (!isManager) {
      Alert.alert("Access Denied", "Only managers can edit expenses");
      return;
    }

    setAmount(String(item.amount));
    setPurpose(item.purpose);
    setSelectedDate(item.createdAt?.toDate() || new Date());
    setIsCommon(item.isCommon);
    setEditingId(item.id);
    setShowActionMenu(false);
    setShowModal(true);
  };

  const openActionMenu = (item: ExpenseItem) => {
    if (!isManager) {
      // For members, just show the expense details without edit/delete options
      Alert.alert(
        "Expense Details",
        `Amount: ₹${item.amount.toLocaleString("en-IN")}\nPurpose: ${item.purpose}\nDate: ${item.date}${item.isCommon ? "\nType: Common Charge" : ""}`,
        [{ text: "OK" }]
      );
      return;
    }

    setSelectedExpense(item);
    setShowActionMenu(true);
  };

  /* ================= DATE NAVIGATION ================= */
  const adjustDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  /* ================= MONTH NAVIGATION ================= */
  const handleMonthChange = (direction: "prev" | "next") => {
    const [year, month] = monthId.split("-").map(Number);
    const date = new Date(year, month - 1);

    if (direction === "next") {
      date.setMonth(date.getMonth() + 1);
    } else {
      date.setMonth(date.getMonth() - 1);
    }

    const newMonthKey = format(date, "yyyy-MM");
    setMonthId(newMonthKey);
  };

  const getMonthName = () => {
    const [year, month] = monthId.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
  };

  /* ================= REFRESH ================= */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Firebase listener will automatically update the data
  }, []);

  /* ================= LOADING STATE ================= */
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading expenses...</Text>
      </View>
    );
  }

  /* ================= MAIN RENDER ================= */
  return (
    <View style={styles.container}>
      {/* Month Selector Header */}
      <View style={styles.monthSelectorContainer}>
        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("prev")}
        >
          <Text style={styles.monthNavButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.monthDisplayContainer}>
          <Text style={styles.header}>{getMonthName()}</Text>
          <Text style={styles.subHeader}>Track all your expenses</Text>
        </View>

        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("next")}
        >
          <Text style={styles.monthNavButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Total Expenses Card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Expenses</Text>
        <Text style={styles.totalAmount}>
          ₹{totalExpenses.toLocaleString("en-IN")}
        </Text>
      </View>

      {/* Expenses List */}
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No expenses for {getMonthName()}</Text>
            <Text style={styles.emptySubtext}>
              {isManager
                ? "Tap the + button to add an expense for this month"
                : "No expenses have been recorded for this month yet"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openActionMenu(item)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.amount}>
                ₹{item.amount.toLocaleString("en-IN")}
              </Text>
              <View style={styles.badges}>
                {item.isCommon && (
                  <View style={styles.commonBadge}>
                    <Text style={styles.commonText}>COMMON</Text>
                  </View>
                )}
                {item.edited && (
                  <View style={styles.editedBadge}>
                    <Text style={styles.editedText}>EDITED</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.purpose}>{item.purpose}</Text>
              <Text style={styles.dateTime}>{item.date}</Text>

              {item.edited && item.updatedAt && (
                <Text style={styles.editStamp}>
                  Edited: {formatDateTime(item.updatedAt.toDate())}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Add Expense Button (Manager Only) */}
      {isManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal (Manager Only) */}
      {isManager && (
        <Modal visible={showModal} transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              onPress={closeModal}
              activeOpacity={1}
            />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingId ? "Edit Expense" : "Add New Expense"}
              </Text>

              {/* Amount Input */}
              <Text style={styles.fieldLabel}>Amount (₹)</Text>
              <TextInput
                placeholder="Enter amount"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                style={styles.input}
                autoFocus={!editingId}
              />

              {/* Purpose Input */}
              <Text style={styles.fieldLabel}>Expense For</Text>
              <TextInput
                placeholder="e.g., Groceries, Electricity, etc."
                placeholderTextColor="#64748B"
                value={purpose}
                onChangeText={setPurpose}
                style={styles.input}
              />

              {/* Date Selector */}
              <Text style={styles.fieldLabel}>Date & Time</Text>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => adjustDate(-1)}
                >
                  <Text style={styles.dateButtonText}>◀</Text>
                </TouchableOpacity>

                <Text style={styles.dateDisplay}>
                  {formatDateTime(selectedDate)}
                </Text>

                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => adjustDate(1)}
                >
                  <Text style={styles.dateButtonText}>▶</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setSelectedDate(new Date())}>
                <Text style={styles.todayLink}>Set to Now</Text>
              </TouchableOpacity>

              {/* Common Charge Toggle */}
              <View style={styles.switchContainer}>
                <View>
                  <Text style={styles.switchLabel}>Common Charge</Text>
                  <Text style={styles.switchSubtext}>
                    Shared expense for all members
                  </Text>
                </View>
                <Switch
                  value={isCommon}
                  onValueChange={setIsCommon}
                  trackColor={{ false: "#334155", true: "#6366F1" }}
                  thumbColor={isCommon ? "#FFF" : "#94A3B8"}
                />
              </View>

              {/* Action Buttons */}
              <TouchableOpacity
                style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
                onPress={saveExpense}
                disabled={submitting}
              >
                <Text style={styles.saveBtnText}>
                  {submitting
                    ? "Saving..."
                    : editingId
                      ? "Update Expense"
                      : "Add Expense"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Action Menu Modal (Manager Only) */}
      {isManager && (
        <Modal visible={showActionMenu} transparent animationType="fade">
          <View style={styles.actionModalOverlay}>
            <TouchableOpacity
              style={styles.actionModalBackdrop}
              onPress={() => {
                setShowActionMenu(false);
                setSelectedExpense(null);
              }}
              activeOpacity={1}
            />
            <View style={styles.actionModalCard}>
              <Text style={styles.actionModalTitle}>Manage Expense</Text>

              {selectedExpense && (
                <View style={styles.actionExpenseInfo}>
                  <Text style={styles.actionExpenseAmount}>
                    ₹{selectedExpense.amount.toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.actionExpensePurpose}>
                    {selectedExpense.purpose}
                  </Text>
                  <Text style={styles.actionExpenseDate}>
                    {selectedExpense.date}
                  </Text>
                  {selectedExpense.isCommon && (
                    <View style={styles.commonBadgeLarge}>
                      <Text style={styles.commonTextLarge}>Common Charge</Text>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => selectedExpense && openEditModal(selectedExpense)}
              >
                <Text style={styles.actionButtonIcon}>✏️</Text>
                <Text style={styles.actionButtonText}>Edit Expense</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={() => selectedExpense && confirmDelete(selectedExpense)}
              >
                <Text style={styles.actionButtonIcon}>🗑️</Text>
                <Text
                  style={[styles.actionButtonText, styles.actionButtonTextDanger]}
                >
                  Delete Expense
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButtonCancel}
                onPress={() => {
                  setShowActionMenu(false);
                  setSelectedExpense(null);
                }}
              >
                <Text style={styles.actionButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A", padding: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#E2E8F0",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorSubtext: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  loadingText: {
    color: "#94A3B8",
    marginTop: 12,
    fontSize: 16,
  },

  header: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 4,
  },
  subHeader: { fontSize: 14, color: "#94A3B8", marginBottom: 20 },
  monthSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 20,
    marginBottom: 8,
  },
  monthNavButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  monthNavButtonText: {
    fontSize: 28,
    color: "#6366F1",
    fontWeight: "700",
  },
  monthDisplayContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },

  totalCard: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  totalLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 4,
    fontWeight: "600",
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#EF4444",
  },

  listContent: { paddingBottom: 100 },

  card: {
    backgroundColor: "#1E293B",
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  amount: {
    fontSize: 20,
    fontWeight: "800",
    color: "#EF4444",
  },
  badges: {
    flexDirection: "row",
    gap: 6,
  },
  commonBadge: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  commonText: {
    fontSize: 8,
    color: "#FFF",
    fontWeight: "700",
  },
  editedBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editedText: {
    fontSize: 8,
    color: "#FFF",
    fontWeight: "700",
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 6,
  },
  purpose: {
    fontSize: 13,
    color: "#E2E8F0",
    fontWeight: "600",
    marginBottom: 2,
  },
  dateTime: {
    fontSize: 11,
    color: "#64748B",
  },
  editStamp: {
    fontSize: 10,
    color: "#F59E0B",
    fontStyle: "italic",
    marginTop: 2,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#E2E8F0",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
  },

  fab: {
    position: "absolute",
    bottom: 50,
    right: 24,
    backgroundColor: "#6366F1",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  fabText: { color: "#FFF", fontSize: 32, fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalCard: {
    backgroundColor: "#1E293B",
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    marginBottom: Platform.OS === "ios" ? 0 : 48,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 24,
    textAlign: "center",
  },

  fieldLabel: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 8,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#0F172A",
    color: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#334155",
    fontWeight: "600",
  },

  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  dateButton: {
    padding: 8,
  },
  dateButtonText: {
    color: "#6366F1",
    fontSize: 20,
    fontWeight: "700",
  },
  dateDisplay: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  todayLink: {
    color: "#6366F1",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },

  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  switchLabel: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  switchSubtext: {
    color: "#94A3B8",
    fontSize: 12,
  },

  saveBtn: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  cancelBtn: {
    alignItems: "center",
    padding: 12,
  },
  cancelText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },

  actionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  actionModalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  actionModalCard: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#334155",
  },
  actionModalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
  },
  actionExpenseInfo: {
    backgroundColor: "#0F172A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  actionExpenseAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#EF4444",
    marginBottom: 4,
  },
  actionExpensePurpose: {
    fontSize: 15,
    color: "#E2E8F0",
    fontWeight: "600",
    marginBottom: 2,
    textAlign: "center",
  },
  actionExpenseDate: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
  },
  commonBadgeLarge: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  commonTextLarge: {
    fontSize: 11,
    color: "#FFF",
    fontWeight: "700",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtonDanger: {
    backgroundColor: "#991B1B",
  },
  actionButtonIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  actionButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  actionButtonTextDanger: {
    color: "#FEE2E2",
  },
  actionButtonCancel: {
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  actionButtonCancelText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "600",
  },
});