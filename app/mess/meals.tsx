// MealScreen.tsx
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { Eye } from "lucide-react-native";
import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/firebaseConfig";

/* ---------- helpers ---------- */
const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getDateKey = (day: number) => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
};

const formatDate = (day: number) => {
  const d = new Date();
  d.setDate(day);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/* ---------- types ---------- */
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/* ---------- component ---------- */
export default function MealScreen() {
  const { user } = useAuth();
  const messId = user?.messId;
  const monthKey = getMonthKey();
  const isManager = user?.role === "manager";

  const [members, setMembers] = useState<Member[]>([]);
  const [meals, setMeals] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const [breakfast, setBreakfast] = useState(false);
  const [lunch, setLunch] = useState(false);
  const [dinner, setDinner] = useState(false);

  /* ---------- load data ---------- */
  useEffect(() => {
    if (!messId) return;
    loadMembers();
    loadMeals();
  }, [messId]);

  const loadMembers = async () => {
    if (!messId) return;
    try {
      // Fetch members from users collection where messId matches
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
      console.error(error);
    }
  };

  const loadMeals = async () => {
    if (!messId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        collection(db, "messes", messId, "meals", monthKey, "entries"),
      );

      const data: any = {};
      snap.docs.forEach((d) => (data[d.id] = d.data()));
      setMeals(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  /* ---------- save meal ---------- */
  const saveMeal = async () => {
    if (!selectedMember || !messId) {
      alert("Please select a member");
      return;
    }

    const dateKey = getDateKey(selectedDay);
    const entryId = `${selectedMember.id}_${dateKey}`;

    try {
      await setDoc(
        doc(db, "messes", messId, "meals", monthKey, "entries", entryId),
        {
          memberId: selectedMember.id,
          memberName: selectedMember.name,
          breakfast: breakfast ? 1 : 0,
          lunch: lunch ? 1 : 0,
          dinner: dinner ? 1 : 0,
          date: formatDate(selectedDay),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      closeModal();
      loadMeals();
    } catch (error) {
      console.error(error);
      alert("Failed to save meal entry");
    }
  };

  /* ---------- modal handlers ---------- */
  const closeModal = () => {
    setShowModal(false);
    setBreakfast(false);
    setLunch(false);
    setDinner(false);
    setSelectedMember(null);
  };

  const openAddModal = () => {
    // Only allow managers to open the modal
    if (!isManager) {
      alert("Only managers can add or edit meal entries");
      return;
    }

    setSelectedDay(new Date().getDate());
    setBreakfast(false);
    setLunch(false);
    setDinner(false);
    setSelectedMember(null);
    setShowModal(true);
  };

  /* ---------- date navigation ---------- */
  const adjustDate = (offset: number) => {
    const newDay = selectedDay + offset;
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
    ).getDate();

    if (newDay >= 1 && newDay <= daysInMonth) {
      setSelectedDay(newDay);
    }
  };

  /* ---------- render helpers ---------- */
  const renderMeal = (memberId: string, day: number, type: string) => {
    const dateKey = getDateKey(day);
    const entryId = `${memberId}_${dateKey}`;
    return meals?.[entryId]?.[type] ? "✓" : "";
  };

  /* ---------- calculate totals ---------- */
  const getMemberTotal = (memberId: string) => {
    let total = 0;
    for (let day = 1; day <= 31; day++) {
      const dateKey = getDateKey(day);
      const entryId = `${memberId}_${dateKey}`;
      const entry = meals?.[entryId];
      if (entry) {
        total +=
          (entry.breakfast || 0) + (entry.lunch || 0) + (entry.dinner || 0);
      }
    }
    return total;
  };

  const getGrandTotal = () => {
    let total = 0;
    members.forEach((m) => {
      total += getMemberTotal(m.id);
    });
    return total;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  /* ---------- UI ---------- */
  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.header}>Meal Entry</Text>
          <Text style={styles.subHeader}>{monthKey}</Text>

          {!isManager && (
            <View style={styles.viewOnlyContainer}>
              <Eye size={14} color="#6B7280" />
              <Text style={styles.viewOnlyText}>View Only</Text>
            </View>
          )}
        </View>

        <View style={styles.totalBadge}>
          <Text style={styles.totalLabel}>Total Meals</Text>
          <Text style={styles.totalValue}>{getGrandTotal()}</Text>
        </View>
      </View>

      <ScrollView horizontal>
        <ScrollView>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.row}>
              <View style={styles.dateCell}>
                <Text style={styles.headerText}>Date</Text>
              </View>
              {members.map((m) => (
                <View key={m.id} style={styles.memberCol}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <View style={styles.subRow}>
                    <View style={styles.subCell}>
                      <Text style={styles.mealType}>B</Text>
                    </View>
                    <View style={styles.subCell}>
                      <Text style={styles.mealType}>L</Text>
                    </View>
                    <View style={styles.subCell}>
                      <Text style={styles.mealType}>D</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Days */}
            {Array.from({ length: 31 }).map((_, i) => (
              <View key={i} style={styles.row}>
                <View style={styles.dateCell}>
                  <Text style={styles.dateText}>{i + 1}</Text>
                </View>

                {members.map((m) => (
                  <View key={m.id} style={styles.subRow}>
                    <View style={styles.subCell}>
                      <Text style={styles.checkmark}>
                        {renderMeal(m.id, i + 1, "breakfast")}
                      </Text>
                    </View>
                    <View style={styles.subCell}>
                      <Text style={styles.checkmark}>
                        {renderMeal(m.id, i + 1, "lunch")}
                      </Text>
                    </View>
                    <View style={styles.subCell}>
                      <Text style={styles.checkmark}>
                        {renderMeal(m.id, i + 1, "dinner")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {/* Totals Row */}
            <View style={[styles.row, styles.totalRow]}>
              <View style={styles.dateCell}>
                <Text style={styles.totalText}>Total</Text>
              </View>
              {members.map((m) => (
                <View key={m.id} style={styles.memberTotalCell}>
                  <Text style={styles.memberTotalText}>
                    {getMemberTotal(m.id)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {/* Floating Add Button - Only visible for managers */}
      {isManager && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal}>
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* ---------- Add Meal Modal ---------- */}
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
            <Text style={styles.modalTitle}>Add Meal Entry</Text>

            {/* Date Selector */}
            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.dateSelector}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => adjustDate(-1)}
              >
                <Text style={styles.dateButtonText}>◀</Text>
              </TouchableOpacity>

              <Text style={styles.dateDisplay}>{formatDate(selectedDay)}</Text>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => adjustDate(1)}
              >
                <Text style={styles.dateButtonText}>▶</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setSelectedDay(new Date().getDate())}
            >
              <Text style={styles.todayLink}>Set to Today</Text>
            </TouchableOpacity>

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

            {/* Meal Type Switches */}
            <Text style={styles.fieldLabel}>Meals</Text>

            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Breakfast</Text>
              <Switch
                value={breakfast}
                onValueChange={setBreakfast}
                trackColor={{ false: "#334155", true: "#6366F1" }}
                thumbColor={breakfast ? "#FFF" : "#94A3B8"}
              />
            </View>

            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Lunch</Text>
              <Switch
                value={lunch}
                onValueChange={setLunch}
                trackColor={{ false: "#334155", true: "#6366F1" }}
                thumbColor={lunch ? "#FFF" : "#94A3B8"}
              />
            </View>

            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Dinner</Text>
              <Switch
                value={dinner}
                onValueChange={setDinner}
                trackColor={{ false: "#334155", true: "#6366F1" }}
                thumbColor={dinner ? "#FFF" : "#94A3B8"}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={saveMeal}>
              <Text style={styles.saveBtnText}>Save Meal Entry</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---------- Member Picker Modal ---------- */}
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
                    <Text style={styles.checkmarkLarge}>✓</Text>
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
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },

  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 8,
  },

  header: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 14,
    color: "#94A3B8",
    marginBottom: 4,
  },
  viewOnlyBadge: {
    fontSize: 12,
    color: "#F59E0B",
    fontWeight: "600",
    marginTop: 4,
  },

  totalBadge: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  totalLabel: {
    color: "#C7D2FE",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  totalValue: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "800",
  },

  table: {
    backgroundColor: "#1E293B",
    margin: 10,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  dateCell: {
    width: 60,
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  headerText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dateText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600",
  },
  memberCol: {
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  memberName: {
    textAlign: "center",
    fontWeight: "700",
    color: "#E2E8F0",
    fontSize: 13,
    padding: 8,
    backgroundColor: "#0F172A",
  },
  subRow: {
    flexDirection: "row",
  },
  subCell: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  mealType: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  checkmark: {
    color: "#10B981",
    fontSize: 16,
    fontWeight: "700",
  },

  totalRow: {
    backgroundColor: "#6366F1",
    borderBottomWidth: 0,
  },
  totalText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  memberTotalCell: {
    width: 120,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#818CF8",
  },
  memberTotalText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
  },

  fab: {
    position: "absolute",
    bottom: 24,
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
    maxHeight: "85%",
    zIndex: 10,
  },

  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },

  fieldLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginBottom: 5,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    fontSize: 10,
    fontWeight: "700",
  },
  dateDisplay: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
  },
  todayLink: {
    color: "#6366F1",
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },

  memberSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  memberSelectorText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  placeholderText: {
    color: "#64748B",
    fontWeight: "400",
  },
  chevron: {
    color: "#64748B",
    fontSize: 10,
  },

  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 10,
    borderRadius: 12,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "#334155",
  },
  switchLabel: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
  },

  saveBtn: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 5,
    marginBottom: 5,
  },
  saveBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },

  cancelBtn: {
    alignItems: "center",
    padding: 10,
  },
  cancelText: {
    color: "#94A3B8",
    fontSize: 12,
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
  checkmarkLarge: {
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
  viewOnlyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },

  viewOnlyText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
});
