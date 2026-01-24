// Deposits.tsx
import { useLocalSearchParams } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/firebaseConfig";

// ---------- helpers ----------
const getMonthKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const getMonthLabel = (date = new Date()) =>
  date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatDateTime = (date: Date) =>
  date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

// ---------- types ----------
type Deposit = {
  id: string;
  amount: number;
  memberId: string;
  memberName: string;
  date: string;
  edited: boolean;
  createdAt: any;
  updatedAt?: any;
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
};

// ---------- component ----------
export default function Deposits() {
  const { user, loading: authLoading } = useAuth();
  const params = useLocalSearchParams();
  const messId = user?.messId ?? null;
  const isManager = user?.role === "manager";

  const monthKey = getMonthKey();
  const monthLabel = getMonthLabel();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);

  // ---------- Init ----------
  useEffect(() => {
    if (!authLoading && messId) init();
  }, [authLoading, messId]);

  const init = async () => {
    await Promise.all([fetchMembers(), fetchDeposits()]);
  };

  // ---------- Fetch Members ----------
  const fetchMembers = async () => {
    if (!messId) return;
    try {
      // Fetch all users who have this messId
      const q = query(collection(db, "users"), where("messId", "==", messId));
      const snap = await getDocs(q);
      const membersList = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        email: d.data().email,
        role: d.data().role,
      }));
      setMembers(membersList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Error fetching members:", error);
      Alert.alert("Error", "Failed to load members");
    }
  };

  // ---------- Fetch Deposits ----------
  const fetchDeposits = async () => {
    if (!messId) return;
    setLoading(true);
    try {
      const monthRef = doc(db, "messes", messId, "managerMoney", monthKey);
      const entriesRef = collection(monthRef, "entries");

      const q = query(
        entriesRef,
        where("type", "==", "deposit"),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);

      setDeposits(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Deposit, "id">),
        })),
      );

      const monthSnap = await getDoc(monthRef);
      setMonthlyTotal(
        monthSnap.exists() ? monthSnap.data().totalDeposit || 0 : 0,
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Save Deposit ----------
  const saveDeposit = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0)
      return Alert.alert("Error", "Enter valid amount");
    if (!selectedMember) return Alert.alert("Error", "Select a member");
    if (!user || !messId) return;

    setSubmitting(true);
    try {
      const monthRef = doc(db, "messes", messId, "managerMoney", monthKey);
      const entriesRef = collection(monthRef, "entries");

      await setDoc(monthRef, { month: monthKey }, { merge: true });

      if (editingId) {
        // Update existing deposit
        const old = deposits.find((d) => d.id === editingId);
        if (!old) return;
        const diff = amt - old.amount;

        await updateDoc(doc(entriesRef, editingId), {
          amount: amt,
          memberName: selectedMember.name,
          memberId: selectedMember.id,
          date: formatDateTime(selectedDate),
          edited: true,
          updatedAt: serverTimestamp(),
        });

        await updateDoc(monthRef, { totalDeposit: increment(diff) });
      } else {
        // Add new deposit
        await addDoc(entriesRef, {
          type: "deposit",
          amount: amt,
          memberName: selectedMember.name,
          memberId: selectedMember.id,
          date: formatDateTime(selectedDate),
          edited: false,
          createdAt: serverTimestamp(),
        });

        await updateDoc(monthRef, { totalDeposit: increment(amt) });
      }

      closeModal();
      fetchDeposits();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to save deposit");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Delete Deposit ----------
  const confirmDelete = (item: Deposit) => {
    Alert.alert(
      "Delete Deposit",
      `Are you sure you want to delete ₹${item.amount} deposit by ${item.memberName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteDeposit(item.id),
        },
      ],
    );
  };

  const deleteDeposit = async (id: string) => {
    if (!messId) return;
    const item = deposits.find((d) => d.id === id);
    if (!item) return;

    try {
      const monthRef = doc(db, "messes", messId, "managerMoney", monthKey);
      await deleteDoc(doc(monthRef, "entries", id));
      await updateDoc(monthRef, { totalDeposit: increment(-item.amount) });
      setShowActionMenu(false);
      setSelectedDeposit(null);
      fetchDeposits();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to delete deposit");
    }
  };

  // ---------- Modal Handlers ----------
  const closeModal = () => {
    setShowModal(false);
    setAmount("");
    setSelectedDate(new Date());
    setSelectedMember(null);
    setEditingId(null);
  };

  const openEditModal = (item: Deposit) => {
    setAmount(String(item.amount));
    const member = members.find((m) => m.id === item.memberId);
    setSelectedMember(member || null);
    setSelectedDate(new Date());
    setEditingId(item.id);
    setShowActionMenu(false);
    setShowModal(true);
  };

  const openActionMenu = (item: Deposit) => {
    setSelectedDeposit(item);
    setShowActionMenu(true);
  };

  // ---------- Date Navigation ----------
  const adjustDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  // ---------- Refresh ----------
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDeposits();
    setRefreshing(false);
  }, [messId]);

  if (authLoading || loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{monthLabel}</Text>
      <Text style={styles.subHeader}>Manager Money Deposits</Text>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Monthly Total</Text>
        <Text style={styles.totalAmount}>
          ₹{monthlyTotal.toLocaleString("en-IN")}
        </Text>
      </View>

      <FlatList
        data={deposits}
        keyExtractor={(d) => d.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No deposits yet</Text>
            {isManager && (
              <Text style={styles.emptySubtext}>
                Tap the + button to add your first deposit
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => isManager && openActionMenu(item)}
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
                Deposit by{" "}
                <Text style={styles.memberName}>{item.memberName}</Text>
              </Text>
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

      {isManager && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal */}
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
              {editingId ? "Edit Deposit" : "Add New Deposit"}
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

            {/* Member Selector */}
            <Text style={styles.fieldLabel}>Member</Text>
            <TouchableOpacity
              style={styles.memberSelector}
              onPress={() => setShowMemberPicker(true)}
            >
              <Text
                style={[
                  styles.memberSelectorText,
                  !selectedMember && styles.placeholderText,
                ]}
              >
                {selectedMember ? selectedMember.name : "Select Member"}
              </Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>

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

            <TouchableOpacity
              style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
              onPress={saveDeposit}
              disabled={submitting}
            >
              <Text style={styles.saveBtnText}>
                {submitting
                  ? "Saving..."
                  : editingId
                    ? "Update Deposit"
                    : "Add Deposit"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Member Picker Modal */}
      <Modal visible={showMemberPicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            onPress={() => setShowMemberPicker(false)}
            activeOpacity={1}
          />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Member</Text>
            <FlatList
              data={members}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.memberOption,
                    selectedMember?.id === item.id &&
                      styles.memberOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedMember(item);
                    setShowMemberPicker(false);
                  }}
                >
                  <View>
                    <Text style={styles.memberOptionName}>{item.name}</Text>
                    <Text style={styles.memberOptionEmail}>{item.email}</Text>
                  </View>
                  {selectedMember?.id === item.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.pickerCloseBtn}
              onPress={() => setShowMemberPicker(false)}
            >
              <Text style={styles.pickerCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Action Menu Modal */}
      <Modal visible={showActionMenu} transparent animationType="fade">
        <View style={styles.actionModalOverlay}>
          <TouchableOpacity
            style={styles.actionModalBackdrop}
            onPress={() => {
              setShowActionMenu(false);
              setSelectedDeposit(null);
            }}
            activeOpacity={1}
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
                <Text style={styles.actionDepositDate}>
                  {selectedDeposit.date}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => selectedDeposit && openEditModal(selectedDeposit)}
            >
              <Text style={styles.actionButtonIcon}>✏️</Text>
              <Text style={styles.actionButtonText}>Edit Deposit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDanger]}
              onPress={() => selectedDeposit && confirmDelete(selectedDeposit)}
            >
              <Text style={styles.actionButtonIcon}>🗑️</Text>
              <Text
                style={[styles.actionButtonText, styles.actionButtonTextDanger]}
              >
                Delete Deposit
              </Text>
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
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A", padding: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },

  header: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFF",
    marginTop: 20,
    marginBottom: 4,
  },
  subHeader: { fontSize: 14, color: "#94A3B8", marginBottom: 20 },

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
    color: "#10B981",
  },

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
    color: "#10B981",
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
  depositBy: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 2,
  },
  memberName: {
    color: "#E2E8F0",
    fontWeight: "600",
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
    bottom: 64,
    right: 24,
    backgroundColor: "#6366F1",
    width: 74,
    height: 74,
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
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  memberSelectorText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  placeholderText: {
    color: "#64748B",
    fontWeight: "400",
  },
  chevron: {
    color: "#64748B",
    fontSize: 12,
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

  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
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
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 20,
    textAlign: "center",
  },
  memberOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 8,
  },
  memberOptionSelected: {
    backgroundColor: "#334155",
  },
  memberOptionName: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  memberOptionEmail: {
    color: "#94A3B8",
    fontSize: 13,
  },
  checkmark: {
    color: "#10B981",
    fontSize: 24,
    fontWeight: "700",
  },
  pickerCloseBtn: {
    marginTop: 16,
    backgroundColor: "#6366F1",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  pickerCloseText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
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
  actionDepositMember: {
    fontSize: 14,
    color: "#94A3B8",
    marginBottom: 2,
  },
  actionDepositDate: {
    fontSize: 12,
    color: "#64748B",
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
