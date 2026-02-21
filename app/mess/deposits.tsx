// Deposits.tsx - Enhanced with Export Functionality
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/firebase/firebaseConfig";
import { generateDepositExcel, generateDepositPDF } from "@/utils/exportUtils";
import { saveFile } from "@/utils/fileSaver";
import { Deposit, Member, SnackbarType } from "@/utils/types";
import { useLocalSearchParams } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Calendar,
  CheckCircle,
  Download,
  Edit3,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ==================== SNACKBAR COMPONENT ====================
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
      }, 2500);

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

  const bgColor = type === "success" ? "#10B981" : "#EF4444";
  const Icon = type === "success" ? CheckCircle : XCircle;

  return (
    <Animated.View
      style={[
        styles.snackbar,
        { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Icon size={20} color="#FFF" />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
};

// ==================== UTILITY FUNCTIONS ====================
const formatDateTime = (date: Date): string => {
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDateOnly = (date: Date): string => {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getCurrentYearMonth = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const getMonthName = (yearMonth: string): string => {
  const [year, month] = yearMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

// ==================== MAIN COMPONENT ====================
export default function Deposits() {
  const params = useLocalSearchParams();
  const { refreshDashboard } = useApp();
  const { user, activeMessId } = useAuth();

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

  const showSnackbar = (message: string, type: SnackbarType = "success") => {
    setSnackbar({ visible: true, message, type });
  };

  const hideSnackbar = () => {
    setSnackbar({ ...snackbar, visible: false });
  };

  // State Management
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);

  const getInitialMonth = (): string => {
    if (params.month && typeof params.month === "string") {
      return params.month;
    }
    return getCurrentYearMonth();
  };

  const [currentYearMonth, setCurrentYearMonth] = useState(getInitialMonth());
  const messId = activeMessId;
  const isManager = user?.role === "manager";

  // ==================== DATA FETCHING ====================
  useEffect(() => {
    if (!messId) return;

    const membersRef = collection(db, `messes/${messId}/members`);
    const q = query(membersRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedMembers: Member[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || "Unknown",
          email: doc.data().email || "",
          role: doc.data().role || "member",
        }));

        fetchedMembers.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(fetchedMembers);
      },
      (error) => {
        const code = error?.code || '';
        const msg = (error?.message || '').toLowerCase();
        if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
          console.log("Deposits members listener detached (user signed out)");
          return;
        }
        console.error("Error fetching members:", error);
        showSnackbar("Failed to load members", "error");
      }
    );

    return () => unsubscribe();
  }, [messId]);

  useEffect(() => {
    if (!messId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const depositsRef = collection(
      db,
      `messes/${messId}/managerMoney/${currentYearMonth}/entries`
    );
    const q = query(depositsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedDeposits: Deposit[] = [];
        let total = 0;

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.type === "deposit") {
            const deposit: Deposit = {
              id: docSnap.id,
              amount: data.amount || 0,
              memberId: data.memberId || "",
              memberName: data.memberName || "Unknown",
              date: data.date || "",
              edited: data.edited || false,
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate(),
              type: data.type,
            };
            fetchedDeposits.push(deposit);
            total += deposit.amount;
          }
        });

        setDeposits(fetchedDeposits);
        setMonthlyTotal(total);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        const code = error?.code || '';
        const msg = (error?.message || '').toLowerCase();
        if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
          console.log("Deposits entries listener detached (user signed out)");
          return;
        }
        console.error("Error fetching deposits:", error);
        showSnackbar("Failed to load deposits", "error");
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [messId, currentYearMonth]);

  // ==================== EXPORT FUNCTIONS ====================
  const handleExport = async (format: "pdf" | "excel") => {
    if (deposits.length === 0) {
      showSnackbar("No deposits to export", "error");
      return;
    }

    setExporting(true);
    setShowExportModal(false);

    try {
      const monthName = getMonthName(currentYearMonth).replace(/\s/g, "_");
      let fileUri: string;
      let fileName: string;

      if (format === "pdf") {
        fileUri = await generateDepositPDF(deposits, currentYearMonth, monthlyTotal);
        fileName = `Deposit_Report_${monthName}.pdf`;

        const success = await saveFile(fileUri, fileName, "pdf");
        if (success) {
          showSnackbar("PDF report exported successfully");
        }
      } else {
        fileUri = await generateDepositExcel(deposits, currentYearMonth, monthlyTotal);
        fileName = `Deposit_Report_${monthName}.csv`;

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

  // ==================== CRUD OPERATIONS ====================
  const saveDeposit = async () => {
    const amt = parseFloat(amount);

    if (isNaN(amt) || amt <= 0) {
      showSnackbar("Please enter a valid amount", "error");
      return;
    }

    if (!selectedMember) {
      showSnackbar("Please select a member", "error");
      return;
    }

    setSubmitting(true);

    try {
      const depositsRef = collection(
        db,
        `messes/${messId}/managerMoney/${currentYearMonth}/entries`
      );

      if (editingId) {
        const depositDoc = doc(
          db,
          `messes/${messId}/managerMoney/${currentYearMonth}/entries`,
          editingId
        );
        await updateDoc(depositDoc, {
          amount: amt,
          memberId: selectedMember.id,
          memberName: selectedMember.name,
          date: formatDateTime(selectedDate),
          edited: true,
          updatedAt: Timestamp.now(),
        });
        showSnackbar("Deposit updated successfully");
      } else {
        await addDoc(depositsRef, {
          amount: amt,
          memberId: selectedMember.id,
          memberName: selectedMember.name,
          date: formatDateTime(selectedDate),
          edited: false,
          createdAt: Timestamp.now(),
          type: "deposit",
        });
        showSnackbar("Deposit added successfully");
      }

      closeModal();
      refreshDashboard();
    } catch (error) {
      console.error("Error saving deposit:", error);
      showSnackbar("Failed to save deposit", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDeposit = async (id: string) => {
    try {
      const depositDoc = doc(
        db,
        `messes/${messId}/managerMoney/${currentYearMonth}/entries`,
        id
      );
      await deleteDoc(depositDoc);
      setShowActionMenu(false);
      setSelectedDeposit(null);
      refreshDashboard();
      showSnackbar("Deposit deleted successfully");
    } catch (error) {
      console.error("Error deleting deposit:", error);
      showSnackbar("Failed to delete deposit", "error");
    }
  };

  const confirmDelete = (item: Deposit) => {
    Alert.alert(
      "Delete Deposit",
      `Are you sure you want to delete ₹${item.amount.toLocaleString("en-IN")} deposit by ${item.memberName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteDeposit(item.id),
        },
      ]
    );
  };

  // ==================== MODAL HANDLERS ====================
  const closeModal = () => {
    setShowModal(false);
    setAmount("");
    setSelectedDate(new Date());
    setSelectedMember(null);
    setEditingId(null);
    setSubmitting(false);
  };

  const openEditModal = (item: Deposit) => {
    setAmount(String(item.amount));
    const member = members.find((m) => m.id === item.memberId);
    setSelectedMember(member || null);
    setSelectedDate(item.createdAt);
    setEditingId(item.id);
    setShowActionMenu(false);
    setShowModal(true);
  };

  const openActionMenu = (item: Deposit) => {
    setSelectedDeposit(item);
    setShowActionMenu(true);
  };

  // ==================== DATE PICKER ====================
  const generateDateOptions = () => {
    const options = [];
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    options.push({ label: "Today", date: new Date(today) });

    if (today.getDate() > 1) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      options.push({ label: "Yesterday", date: yesterday });
    }

    let currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() - 2);

    while (currentDate >= firstDayOfMonth) {
      options.push({
        label: formatDateOnly(currentDate),
        date: new Date(currentDate),
      });
      currentDate.setDate(currentDate.getDate() - 1);
    }

    return options;
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    setShowDatePicker(false);
  };

  // ==================== NAVIGATION ====================
  const handleMonthChange = (direction: "prev" | "next") => {
    const [year, month] = currentYearMonth.split("-").map(Number);
    const date = new Date(year, month - 1);

    if (direction === "next") {
      date.setMonth(date.getMonth() + 1);
    } else {
      date.setMonth(date.getMonth() - 1);
    }

    const newMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setCurrentYearMonth(newMonthKey);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  // ==================== RENDER CONDITIONS ====================
  if (!messId) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>No active mess selected</Text>
        <Text style={styles.errorSubtext}>Please select or join a mess first</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading deposits...</Text>
      </View>
    );
  }

  // ==================== MAIN RENDER ====================
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Month Selector Header */}
      <View style={styles.monthSelectorContainer}>
        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("prev")}
        >
          <Text style={styles.monthNavButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.monthDisplayContainer}>
          <Text style={styles.header}>{getMonthName(currentYearMonth)}</Text>
          <Text style={styles.subHeader}>Manager Money Deposits</Text>
        </View>

        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("next")}
        >
          <Text style={styles.monthNavButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Monthly Total Card with Export Button */}
      <View style={styles.totalCard}>
        <View style={styles.totalCardHeader}>
          <View style={styles.totalCardLeft}>
            <Text style={styles.totalLabel}>Monthly Total</Text>
            <Text style={styles.totalAmount}>
              ₹{monthlyTotal.toLocaleString("en-IN")}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => setShowExportModal(true)}
            disabled={deposits.length === 0}
          >
            <Download size={20} color={deposits.length === 0 ? "#64748B" : "#FFF"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Deposits List */}
      <FlatList
        data={deposits}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
            colors={["#6366F1"]}
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No deposits for {getMonthName(currentYearMonth)}
            </Text>
            <Text style={styles.emptySubtext}>
              {isManager
                ? "Tap the + button to add a deposit for this month"
                : "No deposits have been recorded for this month yet"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onLongPress={() => isManager && openActionMenu(item)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.amount}>
                ₹{item.amount.toLocaleString("en-IN")}
              </Text>
              {item.edited && (
                <View style={styles.editedBadge}>
                  <Text style={styles.editedText}>EDITED</Text>
                </View>
              )}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.depositBy}>
                Deposit by <Text style={styles.memberName}>{item.memberName}</Text>
              </Text>
              <Text style={styles.dateTime}>{item.date}</Text>
              {item.edited && item.updatedAt && (
                <Text style={styles.editStamp}>
                  Edited: {formatDateTime(item.updatedAt)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Add Button (FAB) */}
      {isManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Plus size={28} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* ==================== EXPORT MODAL ==================== */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowExportModal(false)}
          />
          <View style={styles.exportModalCard}>
            <Text style={styles.modalTitle}>Export Report</Text>
            <Text style={styles.exportSubtitle}>
              Choose format to download deposit report
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

      {/* ==================== ADD/EDIT DEPOSIT MODAL ==================== */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeModal}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingId ? "Edit Deposit" : "Add New Deposit"}
            </Text>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter amount"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              editable={!submitting}
            />

            <Text style={styles.fieldLabel}>Select Member</Text>
            <TouchableOpacity
              style={styles.memberSelector}
              onPress={() => {
                if (submitting) return;
                if (members.length === 0) {
                  showSnackbar("Please add members first", "error");
                  return;
                }
                setShowMemberPicker(true);
              }}
              disabled={submitting}
            >
              <Text
                style={[
                  styles.memberSelectorText,
                  !selectedMember && styles.placeholderText,
                ]}
              >
                {selectedMember
                  ? selectedMember.name
                  : members.length === 0
                    ? "No members available"
                    : "Tap to select member"}
              </Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>

            {members.length === 0 && (
              <Text style={styles.warningText}>
                ⚠️ No members found. Please add members first.
              </Text>
            )}

            <Text style={styles.fieldLabel}>Date & Time</Text>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => !submitting && setShowDatePicker(true)}
              disabled={submitting}
            >
              <Calendar size={18} color="#6366F1" />
              <Text style={styles.dateDisplay}>{formatDateTime(selectedDate)}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
              onPress={saveDeposit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingId ? "Update Deposit" : "Add Deposit"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================== DATE PICKER MODAL ==================== */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          />
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
              {generateDateOptions().map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dateOption,
                    formatDateOnly(selectedDate) === formatDateOnly(option.date) &&
                    styles.dateOptionSelected,
                  ]}
                  onPress={() => selectDate(option.date)}
                >
                  <Text style={styles.dateOptionText}>{option.label}</Text>
                  {formatDateOnly(selectedDate) === formatDateOnly(option.date) && (
                    <CheckCircle size={20} color="#6366F1" />
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
        </View>
      </Modal>

      {/* ==================== MEMBER PICKER MODAL ==================== */}
      <Modal
        visible={showMemberPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMemberPicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowMemberPicker(false)}
          />
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Member</Text>
              <TouchableOpacity
                onPress={() => setShowMemberPicker(false)}
                style={styles.pickerCloseIcon}
              >
                <Text style={styles.pickerCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            {members.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>No members found</Text>
                <Text style={styles.pickerEmptySubtext}>
                  Please add members to your mess first
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.membersList}>
                {members.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.memberOption,
                      selectedMember?.id === item.id && styles.memberOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedMember(item);
                      setShowMemberPicker(false);
                    }}
                  >
                    <View style={styles.memberOptionContent}>
                      <Text style={styles.memberOptionName}>{item.name}</Text>
                      <Text style={styles.memberOptionEmail}>{item.email}</Text>
                    </View>
                    {selectedMember?.id === item.id && (
                      <CheckCircle size={20} color="#6366F1" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.pickerCloseBtn}
              onPress={() => setShowMemberPicker(false)}
            >
              <Text style={styles.pickerCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================== ACTION MENU MODAL ==================== */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowActionMenu(false);
          setSelectedDeposit(null);
        }}
      >
        <View style={styles.actionModalOverlay}>
          <TouchableOpacity
            style={styles.actionModalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowActionMenu(false);
              setSelectedDeposit(null);
            }}
          />
          <View style={styles.actionModalCard}>
            <Text style={styles.actionModalTitle}>Manage Deposit</Text>

            {selectedDeposit && (
              <View style={styles.actionDepositInfo}>
                <Text style={styles.actionDepositAmount}>
                  ₹{selectedDeposit.amount.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.actionDepositMember}>
                  by {selectedDeposit.memberName}
                </Text>
                <Text style={styles.actionDepositDate}>{selectedDeposit.date}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => selectedDeposit && openEditModal(selectedDeposit)}
            >
              <Edit3 size={20} color="#FFF" />
              <Text style={styles.actionButtonText}>Edit Deposit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDanger]}
              onPress={() => selectedDeposit && confirmDelete(selectedDeposit)}
            >
              <Trash2 size={20} color="#FEE2E2" />
              <Text style={styles.actionButtonTextDanger}>Delete Deposit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonCancel}
              onPress={() => {
                setShowActionMenu(false);
                setSelectedDeposit(null);
              }}
            >
              <Text style={styles.actionButtonCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================== SNACKBAR ==================== */}
      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        type={snackbar.type}
        onDismiss={hideSnackbar}
      />
    </KeyboardAvoidingView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A", padding: 16 },
  centerContent: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#94A3B8", marginTop: 12, fontSize: 16 },
  errorText: {
    color: "#E2E8F0",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  errorSubtext: { color: "#94A3B8", fontSize: 14, textAlign: "center" },
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
  monthNavButtonText: { fontSize: 28, color: "#6366F1", fontWeight: "700" },
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
  totalAmount: { fontSize: 32, fontWeight: "800", color: "#10B981" },
  exportButton: {
    backgroundColor: "#10B981",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10B981",
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
  amount: { fontSize: 20, fontWeight: "800", color: "#10B981" },
  editedBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editedText: { fontSize: 8, color: "#FFF", fontWeight: "700" },
  cardBody: { borderTopWidth: 1, borderTopColor: "#334155", paddingTop: 6 },
  depositBy: { fontSize: 12, color: "#94A3B8", marginBottom: 2 },
  memberName: { color: "#E2E8F0", fontWeight: "600" },
  dateTime: { fontSize: 11, color: "#64748B" },
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
    bottom: 80,
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
  memberSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  memberSelectorText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  placeholderText: { color: "#64748B", fontWeight: "400" },
  chevron: { color: "#64748B", fontSize: 12, marginLeft: 8 },
  warningText: {
    color: "#F59E0B",
    fontSize: 12,
    marginBottom: 16,
    fontStyle: "italic",
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
  dateDisplay: { color: "#FFF", fontSize: 15, fontWeight: "600", flex: 1 },
  saveBtn: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnDisabled: { backgroundColor: "#334155" },
  saveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  cancelBtn: { alignItems: "center", padding: 12 },
  cancelText: { color: "#94A3B8", fontSize: 15, fontWeight: "600" },
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
  pickerEmpty: { paddingVertical: 40, alignItems: "center" },
  pickerEmptyText: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  pickerEmptySubtext: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
  },
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
    marginBottom: 4,
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
  membersList: { maxHeight: 300 },
  memberOption: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 8,
    marginBottom: 4,
  },
  memberOptionSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  memberOptionContent: { flex: 1 },
  memberOptionName: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  memberOptionEmail: { color: "#94A3B8", fontSize: 13 },
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
  actionDepositInfo: {
    backgroundColor: "#0F172A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  actionDepositAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#10B981",
    marginBottom: 4,
  },
  actionDepositMember: { fontSize: 14, color: "#94A3B8", marginBottom: 2 },
  actionDepositDate: { fontSize: 12, color: "#64748B" },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#334155",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtonDanger: { backgroundColor: "#991B1B" },
  actionButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  actionButtonTextDanger: { color: "#FEE2E2" },
  actionButtonCancel: { padding: 14, alignItems: "center", marginTop: 8 },
  actionButtonCancelText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "600",
  },
});