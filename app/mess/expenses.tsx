// Expenses.tsx - Performance Optimized
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { Calendar, CheckCircle, ClipboardList, Download, Edit3, Plus, Trash2, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
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
import { generateExpenseExcel, generateExpensePDF } from "../../utils/exportUtils";
import { saveFile } from "../../utils/fileSaver";

// ==================== SNACKBAR COMPONENT ====================
type SnackbarType = "success" | "error" | "info";

interface SnackbarProps {
  visible: boolean;
  message: string;
  type: SnackbarType;
  onDismiss: () => void;
}

const Snackbar: React.FC<SnackbarProps> = ({ visible, message, type, onDismiss }) => {
  const [slideAnim] = useState(new Animated.Value(100));

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 8,
      }).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const bgColor = type === "success" ? "#10B981" : type === "error" ? "#EF4444" : "#3B82F6";
  const Icon = type === "success" ? CheckCircle : type === "error" ? XCircle : CheckCircle;

  return (
    <Animated.View
      style={[
        styles.snackbar,
        { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Icon size={20} color="#FFF" strokeWidth={2.5} />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
};

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

const formatDateOnly = (date: Date): string => {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getMonthName = (yearMonth: string): string => {
  const [year, month] = yearMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

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

// ==================== MEMOIZED EXPENSE CARD ====================
const ExpenseCard = React.memo<{
  item: ExpenseItem;
  onPress: (item: ExpenseItem) => void;
}>(({ item, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
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
  );
});

// ==================== MAIN COMPONENT ====================
export default function Expenses() {
  /* ================= CONTEXT ================= */
  const params = useLocalSearchParams();
  const router = useRouter();
  const { refreshDashboard } = useApp();
  const { user, activeMessId } = useAuth();
  const isManager = user?.role === "manager";

  // ── Refs to prevent stale closures ──────────────────────────────
  const unsubscribeExpensesRef = useRef<(() => void) | null>(null);
  const unsubscribeRequestsRef = useRef<(() => void) | null>(null);

  // ── Snackbar state ──────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    type: SnackbarType;
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  const showSnackbar = useCallback((message: string, type: SnackbarType = "success") => {
    setSnackbar({ visible: true, message, type });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, visible: false }));
  }, []);

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCommon, setIsCommon] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  /* ================= MEMOIZED CALCULATIONS ================= */
  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses]);

  const monthRef = useMemo(() =>
    activeMessId ? doc(db, "messes", activeMessId, "managerMoney", monthId) : null,
    [activeMessId, monthId]
  );

  const expensesRef = useMemo(() =>
    monthRef ? collection(monthRef, "entries") : null,
    [monthRef]
  );

  /* ================= EARLY RETURN FOR NO MESS ================= */
  if (!activeMessId) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>No active mess selected</Text>
        <Text style={styles.errorSubtext}>Please select or join a mess first</Text>
      </View>
    );
  }

  /* ================= FETCH PENDING REQUESTS COUNT (MANAGER ONLY) ================= */
  useEffect(() => {
    if (!activeMessId || !isManager) {
      setPendingRequestsCount(0);
      return;
    }

    const requestsRef = collection(
      db,
      "messes",
      activeMessId,
      "managerMoney",
      monthId,
      "expense_requests"
    );

    const q = query(requestsRef, where("status", "==", "pending"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingRequestsCount(snap.size);
      },
      (error) => {
        const code = error?.code || '';
        const msg = (error?.message || '').toLowerCase();
        if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
          console.log("Expense requests count listener detached (user signed out)");
          return;
        }
        console.error("Error fetching pending requests count:", error);
      }
    );

    unsubscribeRequestsRef.current = unsub;

    return () => {
      if (unsubscribeRequestsRef.current) {
        unsubscribeRequestsRef.current();
        unsubscribeRequestsRef.current = null;
      }
    };
  }, [activeMessId, monthId, isManager]);

  /* ================= FETCH EXPENSES ================= */
  useEffect(() => {
    if (!activeMessId || !expensesRef) {
      setInitialLoading(false);
      return;
    }

    setInitialLoading(true);

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
          .filter((item) => item.amount > 0);

        setExpenses(list);
        setInitialLoading(false);
        setRefreshing(false);
      },
      (error) => {
        const code = error?.code || '';
        const msg = (error?.message || '').toLowerCase();
        if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
          console.log("Expenses listener detached (user signed out)");
          return;
        }
        console.error("Error fetching expenses:", error);
        if (error.code !== "failed-precondition") {
          showSnackbar("Failed to load expenses", "error");
        }
        setInitialLoading(false);
        setRefreshing(false);
      }
    );

    unsubscribeExpensesRef.current = unsub;

    return () => {
      if (unsubscribeExpensesRef.current) {
        unsubscribeExpensesRef.current();
        unsubscribeExpensesRef.current = null;
      }
    };
  }, [activeMessId, monthId, expensesRef, showSnackbar]);

  /* ================= EXPORT FUNCTIONS ================= */
  const handleExport = async (format: "pdf" | "excel") => {
    if (expenses.length === 0) {
      showSnackbar("No expenses to export", "error");
      return;
    }

    setExporting(true);
    setShowExportModal(false);

    try {
      const monthName = getMonthName(monthId).replace(/\s/g, "_");
      let fileUri: string;
      let fileName: string;

      if (format === "pdf") {
        fileUri = await generateExpensePDF(expenses, monthId, totalExpenses);
        fileName = `Expense_Report_${monthName}.pdf`;

        const success = await saveFile(fileUri, fileName, "pdf");
        if (success) {
          showSnackbar("PDF report exported successfully");
        }
      } else {
        fileUri = await generateExpenseExcel(expenses, monthId, totalExpenses);
        fileName = `Expense_Report_${monthName}.csv`;

        const success = await saveFile(fileUri, fileName, "excel");
        if (success) {
          showSnackbar("Excel report exported successfully");
        }
      }
    } catch (error) {
      console.error("Export error:", error);
      showSnackbar("Failed to export report", "error");
    } finally {
      setExporting(false);
    }
  };

  /* ================= SAVE EXPENSE (MANAGER ONLY) ================= */
  const saveExpense = useCallback(async () => {
    if (!isManager) {
      showSnackbar("Only managers can add expenses", "error");
      return;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      showSnackbar("Please enter a valid amount", "error");
      return;
    }
    if (!purpose.trim()) {
      showSnackbar("Please enter expense purpose", "error");
      return;
    }

    if (!monthRef || !expensesRef) {
      showSnackbar("Unable to save expense", "error");
      return;
    }

    setSubmitting(true);

    try {
      // Batch operations to reduce lag
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
        const old = expenses.find((e) => e.id === editingId);
        if (!old) {
          showSnackbar("Expense not found", "error");
          setSubmitting(false);
          return;
        }

        const diff = amt - old.amount;

        // Update both document and total in parallel
        await Promise.all([
          updateDoc(doc(expensesRef, editingId), {
            amount: amt,
            purpose: purpose.trim(),
            date: formatDateTime(selectedDate),
            isCommon,
            edited: true,
            updatedAt: serverTimestamp(),
          }),
          updateDoc(monthRef, {
            totalExpense: increment(diff),
            updatedAt: serverTimestamp(),
          })
        ]);

        showSnackbar("Expense updated successfully");
      } else {
        // Add both document and update total in parallel
        const docRef = await addDoc(expensesRef, {
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

        showSnackbar("Expense added successfully");
      }

      // Close modal immediately for better UX
      closeModal();

      // Refresh dashboard in background
      refreshDashboard();
    } catch (error: any) {
      console.error("Error saving expense:", error);

      let errorMsg = "Failed to save expense";
      if (error.code === "permission-denied") {
        errorMsg = "Permission denied";
      } else if (error.code === "unavailable") {
        errorMsg = "Network error";
      }

      showSnackbar(errorMsg, "error");
    } finally {
      setSubmitting(false);
    }
  }, [isManager, amount, purpose, selectedDate, isCommon, editingId, monthRef, expensesRef, monthId, expenses, showSnackbar, refreshDashboard]);

  /* ================= DELETE EXPENSE (MANAGER ONLY) ================= */
  const confirmDelete = useCallback((item: ExpenseItem) => {
    if (!isManager) {
      showSnackbar("Only managers can delete expenses", "error");
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
  }, [isManager, showSnackbar]);

  const deleteExpense = async (id: string, amt: number) => {
    if (!isManager || !expensesRef || !monthRef) {
      showSnackbar("Only managers can delete expenses", "error");
      return;
    }

    try {
      // Delete both document and update total in parallel
      await Promise.all([
        deleteDoc(doc(expensesRef, id)),
        updateDoc(monthRef, {
          totalExpense: increment(-amt),
          updatedAt: serverTimestamp(),
        })
      ]);

      setShowActionMenu(false);
      setSelectedExpense(null);
      refreshDashboard();
      showSnackbar("Expense deleted successfully");
    } catch (error: any) {
      console.error("Error deleting expense:", error);

      let errorMsg = "Failed to delete expense";
      if (error.code === "permission-denied") {
        errorMsg = "Permission denied";
      }

      showSnackbar(errorMsg, "error");
    }
  };

  /* ================= MODAL HANDLERS ================= */
  const closeModal = useCallback(() => {
    setShowModal(false);
    setAmount("");
    setPurpose("");
    setSelectedDate(new Date());
    setIsCommon(false);
    setEditingId(null);
    setSubmitting(false);
  }, []);

  const openEditModal = useCallback((item: ExpenseItem) => {
    if (!isManager) {
      showSnackbar("Only managers can edit expenses", "error");
      return;
    }

    setAmount(String(item.amount));
    setPurpose(item.purpose);
    setSelectedDate(item.createdAt?.toDate() || new Date());
    setIsCommon(item.isCommon);
    setEditingId(item.id);
    setShowActionMenu(false);
    setShowModal(true);
  }, [isManager, showSnackbar]);

  const openActionMenu = useCallback((item: ExpenseItem) => {
    if (!isManager) {
      Alert.alert(
        "Expense Details",
        `Amount: ₹${item.amount.toLocaleString("en-IN")}\nPurpose: ${item.purpose}\nDate: ${item.date}${item.isCommon ? "\nType: Common Charge" : ""}`,
        [{ text: "OK" }]
      );
      return;
    }

    setSelectedExpense(item);
    setShowActionMenu(true);
  }, [isManager]);

  /* ================= NAVIGATION ================= */
  const navigateToExpenseRequests = useCallback(() => {
    router.push({
      pathname: "/mess/expense_requests",
      params: { messId: activeMessId, monthId },
    });
  }, [router, activeMessId, monthId]);

  /* ================= DATE PICKER - FROM 1ST OF MONTH TO TODAY ================= */
  const dateOptions = useMemo(() => {
    const options = [];
    const today = new Date();

    const [year, month] = monthId.split("-").map(Number);
    const firstDayOfMonth = new Date(year, month - 1, 1);

    const currentDate = new Date(firstDayOfMonth);

    while (currentDate <= today) {
      const dateOption = new Date(currentDate);

      let label = "";
      const diffDays = Math.floor((today.getTime() - dateOption.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        label = "Today";
      } else if (diffDays === 1) {
        label = "Yesterday";
      } else {
        label = formatDateOnly(dateOption);
      }

      options.push({ label, date: new Date(dateOption) });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return options.reverse();
  }, [monthId]);

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setShowDatePicker(false);
  }, []);

  /* ================= MONTH NAVIGATION ================= */
  const handleMonthChange = useCallback((direction: "prev" | "next") => {
    const [year, month] = monthId.split("-").map(Number);
    const date = new Date(year, month - 1);

    if (direction === "next") {
      date.setMonth(date.getMonth() + 1);
    } else {
      date.setMonth(date.getMonth() - 1);
    }

    const newMonthKey = format(date, "yyyy-MM");
    setMonthId(newMonthKey);
  }, [monthId]);

  /* ================= REFRESH ================= */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  /* ================= RENDER CALLBACKS ================= */
  const renderExpenseItem = useCallback(({ item }: { item: ExpenseItem }) => {
    return <ExpenseCard item={item} onPress={openActionMenu} />;
  }, [openActionMenu]);

  const keyExtractor = useCallback((item: ExpenseItem) => item.id, []);

  const ListEmptyComponent = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No expenses for {getMonthName(monthId)}</Text>
      <Text style={styles.emptySubtext}>
        {isManager
          ? "Tap the + button to add an expense for this month"
          : "No expenses have been recorded for this month yet"}
      </Text>
    </View>
  ), [monthId, isManager]);

  /* ================= LOADING STATE ================= */
  if (initialLoading) {
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
          <Text style={styles.header}>{getMonthName(monthId)}</Text>
          <Text style={styles.subHeader}>Track all your expenses</Text>
        </View>

        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("next")}
        >
          <Text style={styles.monthNavButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Total Expenses Card with Export Button */}
      <View style={styles.totalCard}>
        <View style={styles.totalCardHeader}>
          <View style={styles.totalCardLeft}>
            <Text style={styles.totalLabel}>Total Expenses</Text>
            <Text style={styles.totalAmount}>
              ₹{totalExpenses.toLocaleString("en-IN")}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.exportButton,
              expenses.length === 0 && styles.exportButtonDisabled
            ]}
            onPress={() => setShowExportModal(true)}
            disabled={expenses.length === 0}
          >
            <Download size={20} color={expenses.length === 0 ? "#64748B" : "#FFF"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expenses List */}
      <FlatList
        data={expenses}
        keyExtractor={keyExtractor}
        renderItem={renderExpenseItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
            colors={["#6366F1"]}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={ListEmptyComponent}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        initialNumToRender={10}
      />

      {/* Floating Action Buttons (Manager Only) */}
      {isManager && (
        <View style={styles.fabContainer}>
          {/* Approve Requests Button */}
          <TouchableOpacity
            style={styles.approveRequestsFab}
            onPress={navigateToExpenseRequests}
            activeOpacity={0.8}
          >
            {pendingRequestsCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingRequestsCount}</Text>
              </View>
            )}

            <ClipboardList size={22} color="#fff" strokeWidth={2} />
            <Text style={styles.approveRequestsLabel}>Requests</Text>
          </TouchableOpacity>

          {/* Add Expense Button */}
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowModal(true)}
            activeOpacity={0.8}
          >
            <Plus size={32} color="#FFF" strokeWidth={3} />
          </TouchableOpacity>
        </View>
      )}

      {/* ==================== EXPORT MODAL ==================== */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => !exporting && setShowExportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => !exporting && setShowExportModal(false)}
          />
          <View style={styles.exportModalCard}>
            <Text style={styles.modalTitle}>Export Report</Text>
            <Text style={styles.exportSubtitle}>
              Choose format to download expense report for {getMonthName(monthId)}
            </Text>

            <TouchableOpacity
              style={styles.exportOptionButton}
              onPress={() => handleExport("pdf")}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Download size={20} color="#FFF" />
                  <Text style={styles.exportOptionText}>Download as PDF</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportOptionButton, styles.exportOptionButtonSecondary]}
              onPress={() => handleExport("excel")}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Download size={20} color="#FFF" />
                  <Text style={styles.exportOptionText}>Download as Excel</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowExportModal(false)}
              disabled={exporting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Modal (Manager Only) */}
      {isManager && (
        <Modal visible={showModal} transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              onPress={!submitting ? closeModal : undefined}
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
                editable={!submitting}
              />

              {/* Purpose Input */}
              <Text style={styles.fieldLabel}>Expense For</Text>
              <TextInput
                placeholder="e.g., Groceries, Electricity, etc."
                placeholderTextColor="#64748B"
                value={purpose}
                onChangeText={setPurpose}
                style={styles.input}
                editable={!submitting}
              />

              {/* Date Selector */}
              <Text style={styles.fieldLabel}>Date & Time</Text>
              <TouchableOpacity
                style={styles.dateSelector}
                onPress={() => !submitting && setShowDatePicker(true)}
                disabled={submitting}
              >
                <Calendar size={18} color="#6366F1" />
                <Text style={styles.dateDisplay}>
                  {formatDateTime(selectedDate)}
                </Text>
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
                  disabled={submitting}
                />
              </View>

              {/* Action Buttons */}
              <TouchableOpacity
                style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
                onPress={saveExpense}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingId ? "Update Expense" : "Add Expense"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeModal}
                disabled={submitting}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} />
        </TouchableOpacity>
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(false)}
              style={styles.pickerCloseIcon}
            >
              <Text style={styles.pickerCloseIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.dateList}>
            {dateOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dateOption,
                  formatDateOnly(selectedDate) === formatDateOnly(option.date) &&
                  styles.dateOptionSelected,
                ]}
                onPress={() => selectDate(option.date)}
              >
                <Calendar size={16} color="#6366F1" />
                <Text style={styles.dateOptionText}>{option.label}</Text>
                {formatDateOnly(selectedDate) === formatDateOnly(option.date) && (
                  <CheckCircle size={18} color="#10B981" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.pickerCloseBtn}
            onPress={() => setShowDatePicker(false)}
          >
            <Text style={styles.pickerCloseText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
                <Edit3 size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Edit Expense</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={() => selectedExpense && confirmDelete(selectedExpense)}
              >
                <Trash2 size={20} color="#FEE2E2" />
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

      {/* ==================== SNACKBAR ==================== */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        type={snackbar.type}
        onDismiss={hideSnackbar}
      />
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
    fontSize: 18,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 4,
    marginTop: 20,
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
  totalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalCardLeft: { flex: 1 },
  totalLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 4,
    fontWeight: "600",
  },
  totalAmount: { fontSize: 32, fontWeight: "800", color: "#EF4444" },
  exportButton: {
    backgroundColor: "#EF4444",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F87171",
  },
  exportButtonDisabled: {
    backgroundColor: "#334155",
    borderColor: "#475569",
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

  snackbar: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  snackbarText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },

  fabContainer: {
    position: "absolute",
    bottom: 80,
    right: 24,
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 16,
  },
  approveRequestsFab: {
    backgroundColor: "#F59E0B",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    position: "relative",
  },
  approveRequestsLabel: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "700",
    marginTop: -2,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F172A",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  fab: {
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

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
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

  exportModalCard: {
    backgroundColor: "#1E293B",
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  exportSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  exportOptionButton: {
    backgroundColor: "#6366F1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  exportOptionButtonSecondary: {
    backgroundColor: "#10B981",
  },
  exportOptionText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
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
    gap: 12,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  dateDisplay: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
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
    backgroundColor: "#334155",
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

  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 24,
  },
  pickerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  pickerCard: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    maxHeight: "70%",
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  pickerTitle: { fontSize: 20, fontWeight: "800", color: "#FFF" },
  pickerCloseIcon: { padding: 4 },
  pickerCloseIconText: { fontSize: 24, color: "#94A3B8", fontWeight: "300" },
  dateList: { maxHeight: 300 },
  dateOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    borderRadius: 8,
  },
  dateOptionSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  dateOptionText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  pickerCloseBtn: {
    marginTop: 16,
    backgroundColor: "#6366F1",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  pickerCloseText: { color: "#FFF", fontWeight: "700", fontSize: 16 },

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
    gap: 12,
    backgroundColor: "#334155",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtonDanger: {
    backgroundColor: "#991B1B",
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