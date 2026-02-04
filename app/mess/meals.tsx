// MealScreen.tsx - Fixed and Improved Version
import { useLocalSearchParams } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Edit2, Eye, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
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
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/firebaseConfig";

/* ==================== HELPERS ==================== */

// Returns "YYYY-MM" for a given year + month (0-indexed)
const buildMonthKey = (year: number, month: number): string =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

// Current month key (used only as the initial default)
const getCurrentMonthKey = () => {
  const d = new Date();
  return buildMonthKey(d.getFullYear(), d.getMonth());
};

// Parse a "YYYY-MM" key into { year, month (0-indexed) }
const parseMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m - 1 };
};

// How many days in a given year/month (0-indexed month)
const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

// Build "YYYY-MM-DD" using the SELECTED month, not today
const getDateKey = (monthKey: string, day: number): string => {
  const { year, month } = parseMonthKey(monthKey);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// Human-readable date string using the SELECTED month
const formatDate = (monthKey: string, day: number): string => {
  const { year, month } = parseMonthKey(monthKey);
  const d = new Date(year, month, day);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Truncate long names for display
const truncateName = (name: string, maxLength: number = 12): string => {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + "…";
};

/* ==================== TYPES ==================== */
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type MealEntry = {
  memberId: string;
  memberName: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  date: string;
  createdAt: any;
};

/* ==================== MAIN COMPONENT ==================== */
export default function MealScreen() {
  const params = useLocalSearchParams();
  const { refreshDashboard } = useApp();
  const { user } = useAuth();
  const messId = user?.messId;
  const isManager = user?.role === "manager";

  // ── Month state ─────────────────────────────────────────────────
  const [monthKey, setMonthKey] = useState<string>(() => {
    if (params.month && typeof params.month === "string") {
      // If param is ISO string (from Dashboard), convert to YYYY-MM
      if (params.month.includes("T")) {
        const d = new Date(params.month);
        if (!isNaN(d.getTime())) {
          return buildMonthKey(d.getFullYear(), d.getMonth());
        }
      }
      return params.month;
    }
    return getCurrentMonthKey();
  });

  // Derived: parsed year / month and total days
  const { year: selYear, month: selMonth } = parseMonthKey(monthKey);
  const totalDays = daysInMonth(selYear, selMonth);

  // ── Data ────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([]);
  const [meals, setMeals] = useState<Record<string, MealEntry>>({});
  const [loading, setLoading] = useState(true);

  // ── Modal ───────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [breakfast, setBreakfast] = useState(false);
  const [lunch, setLunch] = useState(false);
  const [dinner, setDinner] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Cell edit modal ─────────────────────────────────────────────
  const [showCellEditModal, setShowCellEditModal] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    memberId: string;
    memberName: string;
    day: number;
  } | null>(null);

  /* ==================== DATA LOADING ==================== */

  // Load members (runs once)
  useEffect(() => {
    if (messId) loadMembers();
  }, [messId]);

  // Load meals whenever month changes
  useEffect(() => {
    if (messId) loadMeals();
  }, [messId, monthKey]);

  const loadMembers = async () => {
    if (!messId) return;
    try {
      const snap = await getDocs(collection(db, "messes", messId, "members"));
      const list = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        email: d.data().email,
        role: d.data().role,
      }));
      setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("loadMembers:", err);
      Alert.alert("Error", "Failed to load members. Please try again.");
    }
  };

  const loadMeals = async () => {
    if (!messId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        collection(db, "messes", messId, "meals", monthKey, "entries"),
      );
      const data: Record<string, MealEntry> = {};
      snap.docs.forEach((d) => (data[d.id] = d.data() as MealEntry));
      setMeals(data);
    } catch (err) {
      console.error("loadMeals:", err);
      // Don't show error for empty collections
      if ((err as any).code !== "failed-precondition") {
        Alert.alert("Error", "Failed to load meals. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ==================== SAVE/EDIT OPERATIONS ==================== */

  const saveMeal = async () => {
    // Only managers can write
    if (!isManager) {
      Alert.alert("Access Denied", "Only managers can add or edit meal entries.");
      return;
    }

    if (!selectedMember || !messId) {
      Alert.alert("Missing Information", "Please select a member before saving.");
      return;
    }

    if (!breakfast && !lunch && !dinner) {
      Alert.alert("Missing Information", "Please select at least one meal.");
      return;
    }

    setSaving(true);
    const dateKey = getDateKey(monthKey, selectedDay);
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
          date: formatDate(monthKey, selectedDay),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      closeModal();
      await loadMeals(); // refresh grid
      refreshDashboard();
      Alert.alert("Success", "Meal entry saved successfully");
    } catch (err: any) {
      console.error("saveMeal:", err);

      let errorMsg = "Failed to save meal entry. Please try again.";
      if (err.code === "permission-denied") {
        errorMsg = "You don't have permission to modify meal entries";
      }

      Alert.alert("Error", errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const saveCellEdit = async () => {
    if (!isManager || !editingCell || !messId) return;

    if (!breakfast && !lunch && !dinner) {
      // If all meals are unchecked, delete the entry
      const dateKey = getDateKey(monthKey, editingCell.day);
      const entryId = `${editingCell.memberId}_${dateKey}`;

      try {
        await deleteDoc(
          doc(db, "messes", messId, "meals", monthKey, "entries", entryId)
        );
        closeCellEditModal();
        await loadMeals();
        refreshDashboard();
        Alert.alert("Success", "Meal entry deleted successfully");
      } catch (err) {
        console.error("deleteMeal:", err);
        Alert.alert("Error", "Failed to delete meal entry.");
      }
      return;
    }

    setSaving(true);
    const dateKey = getDateKey(monthKey, editingCell.day);
    const entryId = `${editingCell.memberId}_${dateKey}`;

    try {
      await setDoc(
        doc(db, "messes", messId, "meals", monthKey, "entries", entryId),
        {
          memberId: editingCell.memberId,
          memberName: editingCell.memberName,
          breakfast: breakfast ? 1 : 0,
          lunch: lunch ? 1 : 0,
          dinner: dinner ? 1 : 0,
          date: formatDate(monthKey, editingCell.day),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      closeCellEditModal();
      await loadMeals();
      refreshDashboard();
      Alert.alert("Success", "Meal entry updated successfully");
    } catch (err) {
      console.error("saveCellEdit:", err);
      Alert.alert("Error", "Failed to save meal entry.");
    } finally {
      setSaving(false);
    }
  };

  /* ==================== MODAL HANDLERS ==================== */

  const closeModal = () => {
    setShowModal(false);
    setIsEditMode(false);
    setBreakfast(false);
    setLunch(false);
    setDinner(false);
    setSelectedMember(null);
    setSaving(false);
  };

  const closeCellEditModal = () => {
    setShowCellEditModal(false);
    setEditingCell(null);
    setBreakfast(false);
    setLunch(false);
    setDinner(false);
    setSaving(false);
  };

  const openAddModal = () => {
    if (!isManager) {
      Alert.alert("Access Denied", "Only managers can add meal entries.");
      return;
    }

    // Default the day to today IF we're viewing the current month
    const now = new Date();
    const currentMonthKey = getCurrentMonthKey();
    const defaultDay = monthKey === currentMonthKey ? now.getDate() : 1;

    setSelectedDay(defaultDay);
    setBreakfast(false);
    setLunch(false);
    setDinner(false);
    setSelectedMember(null);
    setIsEditMode(false);
    setShowModal(true);
  };

  const openCellEditModal = (memberId: string, memberName: string, day: number) => {
    if (!isManager) {
      // For members, show read-only details
      const dateKey = getDateKey(monthKey, day);
      const entryId = `${memberId}_${dateKey}`;
      const entry = meals[entryId];

      if (entry) {
        const mealsList = [
          entry.breakfast === 1 && "Breakfast",
          entry.lunch === 1 && "Lunch",
          entry.dinner === 1 && "Dinner",
        ].filter(Boolean).join(", ");

        Alert.alert(
          "Meal Details",
          `Member: ${memberName}\nDate: ${formatDate(monthKey, day)}\nMeals: ${mealsList || "None"}`,
          [{ text: "OK" }]
        );
      }
      return;
    }

    const dateKey = getDateKey(monthKey, day);
    const entryId = `${memberId}_${dateKey}`;
    const entry = meals[entryId];

    setEditingCell({ memberId, memberName, day });
    setBreakfast(entry?.breakfast === 1);
    setLunch(entry?.lunch === 1);
    setDinner(entry?.dinner === 1);
    setShowCellEditModal(true);
  };

  /* ==================== NAVIGATION ==================== */

  const adjustDate = (offset: number) => {
    const newDay = selectedDay + offset;
    if (newDay >= 1 && newDay <= totalDays) {
      setSelectedDay(newDay);
    }
  };

  const handleMonthChange = useCallback(
    (direction: "prev" | "next") => {
      let newYear = selYear;
      let newMonth = selMonth + (direction === "next" ? 1 : -1);

      // Wrap year boundaries
      if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      } else if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      }

      setMonthKey(buildMonthKey(newYear, newMonth));
      // Close modals if open to avoid stale day state
      if (showModal) closeModal();
      if (showCellEditModal) closeCellEditModal();
    },
    [selYear, selMonth, showModal, showCellEditModal],
  );

  const getMonthName = () => {
    const d = new Date(selYear, selMonth);
    return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
  };

  /* ==================== RENDER HELPERS ==================== */

  const renderMeal = (memberId: string, day: number, type: string) => {
    const dateKey = getDateKey(monthKey, day);
    const entryId = `${memberId}_${dateKey}`;
    return meals?.[entryId]?.[type as keyof MealEntry] ? "✓" : "";
  };

  const hasAnyMeal = (memberId: string, day: number): boolean => {
    const dateKey = getDateKey(monthKey, day);
    const entryId = `${memberId}_${dateKey}`;
    const entry = meals?.[entryId];
    return entry ? (entry.breakfast === 1 || entry.lunch === 1 || entry.dinner === 1) : false;
  };

  /* ==================== TOTALS ==================== */

  const getMemberTotal = useCallback(
    (memberId: string) => {
      let total = 0;
      for (let day = 1; day <= totalDays; day++) {
        const dateKey = getDateKey(monthKey, day);
        const entryId = `${memberId}_${dateKey}`;
        const entry = meals?.[entryId];
        if (entry) {
          total += (entry.breakfast || 0) + (entry.lunch || 0) + (entry.dinner || 0);
        }
      }
      return total;
    },
    [meals, monthKey, totalDays],
  );

  const getGrandTotal = useCallback(() => {
    let total = 0;
    members.forEach((m) => (total += getMemberTotal(m.id)));
    return total;
  }, [members, getMemberTotal]);

  /* ==================== LOADING STATE ==================== */

  if (!messId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No active mess selected</Text>
        <Text style={styles.errorSubtext}>Please select or join a mess first</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading meal data...</Text>
      </View>
    );
  }

  /* ==================== MAIN RENDER ==================== */

  return (
    <View style={styles.container}>
      {/* Month Navigation Header */}
      <View style={styles.monthSelectorContainer}>
        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("prev")}
        >
          <Text style={styles.monthNavButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.monthDisplayContainer}>
          <Text style={styles.header}>Meal Entry</Text>
          <Text style={styles.subHeader}>{getMonthName()}</Text>

          {!isManager && (
            <View style={styles.viewOnlyBadge}>
              <Eye size={14} color="#F59E0B" />
              <Text style={styles.viewOnlyText}>View Only</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.monthNavButton}
          onPress={() => handleMonthChange("next")}
        >
          <Text style={styles.monthNavButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Grand Total Badge */}
      <View style={styles.totalBadge}>
        <Text style={styles.totalLabel}>Total Meals</Text>
        <Text style={styles.totalValue}>{getGrandTotal()}</Text>
      </View>

      {/* Scrollable Meal Grid */}
      <ScrollView horizontal style={styles.scrollOuter} showsHorizontalScrollIndicator={true}>
        <ScrollView style={styles.scrollInner} showsVerticalScrollIndicator={true}>
          <View style={styles.table}>
            {/* Header Row */}
            <View style={styles.row}>
              <View style={styles.dateCell}>
                <Text style={styles.headerText}>Date</Text>
              </View>
              {members.map((m) => (
                <View key={m.id} style={styles.memberCol}>
                  <View style={styles.memberNameContainer}>
                    <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                      {truncateName(m.name, 12)}
                    </Text>
                  </View>
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

            {/* Day Rows */}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => (
              <View key={day} style={styles.row}>
                <View style={styles.dateCell}>
                  <Text style={styles.dateText}>{day}</Text>
                </View>

                {members.map((m) => {
                  const hasMeal = hasAnyMeal(m.id, day);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.subRow}
                      onPress={() => openCellEditModal(m.id, m.name, day)}
                      activeOpacity={0.6}
                    >
                      <View
                        style={[
                          styles.subCell,
                          hasMeal && isManager && styles.editableCell,
                        ]}
                      >
                        <Text style={styles.checkmark}>
                          {renderMeal(m.id, day, "breakfast")}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.subCell,
                          hasMeal && isManager && styles.editableCell,
                        ]}
                      >
                        <Text style={styles.checkmark}>
                          {renderMeal(m.id, day, "lunch")}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.subCell,
                          hasMeal && isManager && styles.editableCell,
                        ]}
                      >
                        <Text style={styles.checkmark}>
                          {renderMeal(m.id, day, "dinner")}
                        </Text>
                      </View>
                      {hasMeal && isManager && (
                        <View style={styles.editIndicator}>
                          <Edit2 size={10} color="#6366F1" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Totals Row */}
            <View style={[styles.row, styles.totalRow]}>
              <View style={styles.dateCell}>
                <Text style={styles.totalText}>Total</Text>
              </View>
              {members.map((m) => (
                <View key={m.id} style={styles.memberTotalCell}>
                  <Text style={styles.memberTotalText}>{getMemberTotal(m.id)}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {/* FAB - Manager Only */}
      {isManager && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.75}>
          <Plus size={32} color="#FFF" strokeWidth={3} />
        </TouchableOpacity>
      )}

      {/* ==================== ADD MEAL MODAL ==================== */}
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
              <Text style={styles.modalTitle}>Add Meal Entry</Text>

              {/* Date Picker */}
              <Text style={styles.fieldLabel}>Date</Text>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => adjustDate(-1)}
                  disabled={selectedDay <= 1}
                >
                  <Text
                    style={[
                      styles.dateButtonText,
                      selectedDay <= 1 && styles.dateButtonDisabled,
                    ]}
                  >
                    ◀
                  </Text>
                </TouchableOpacity>

                <Text style={styles.dateDisplay}>
                  {formatDate(monthKey, selectedDay)}
                </Text>

                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => adjustDate(1)}
                  disabled={selectedDay >= totalDays}
                >
                  <Text
                    style={[
                      styles.dateButtonText,
                      selectedDay >= totalDays && styles.dateButtonDisabled,
                    ]}
                  >
                    ▶
                  </Text>
                </TouchableOpacity>
              </View>

              {/* "Set to Today" only shown when viewing current month */}
              {monthKey === getCurrentMonthKey() && (
                <TouchableOpacity
                  onPress={() => setSelectedDay(new Date().getDate())}
                >
                  <Text style={styles.todayLink}>Set to Today</Text>
                </TouchableOpacity>
              )}

              {/* Member Selector */}
              <Text style={styles.fieldLabel}>Member</Text>
              <TouchableOpacity
                style={[
                  styles.memberSelector,
                  !selectedMember && styles.memberSelectorEmpty,
                ]}
                onPress={() => setShowMemberPicker(true)}
              >
                <Text
                  style={[
                    styles.memberSelectorText,
                    !selectedMember && styles.placeholderText,
                  ]}
                  numberOfLines={1}
                >
                  {selectedMember ? selectedMember.name : "Select Member"}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>

              {/* Meal Toggles */}
              <Text style={styles.fieldLabel}>Meals</Text>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>🌅 Breakfast</Text>
                <Switch
                  value={breakfast}
                  onValueChange={setBreakfast}
                  trackColor={{ false: "#334155", true: "#6366F1" }}
                  thumbColor={breakfast ? "#FFF" : "#94A3B8"}
                  disabled={saving}
                />
              </View>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>☀️ Lunch</Text>
                <Switch
                  value={lunch}
                  onValueChange={setLunch}
                  trackColor={{ false: "#334155", true: "#6366F1" }}
                  thumbColor={lunch ? "#FFF" : "#94A3B8"}
                  disabled={saving}
                />
              </View>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>🌙 Dinner</Text>
                <Switch
                  value={dinner}
                  onValueChange={setDinner}
                  trackColor={{ false: "#334155", true: "#6366F1" }}
                  thumbColor={dinner ? "#FFF" : "#94A3B8"}
                  disabled={saving}
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!selectedMember || (!breakfast && !lunch && !dinner) || saving) &&
                  styles.saveBtnDisabled,
                ]}
                onPress={saveMeal}
                disabled={
                  !selectedMember || (!breakfast && !lunch && !dinner) || saving
                }
                activeOpacity={0.75}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Meal Entry</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ==================== EDIT CELL MODAL ==================== */}
      {isManager && (
        <Modal visible={showCellEditModal} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              onPress={closeCellEditModal}
              activeOpacity={1}
            />

            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Meal Entry</Text>

              {editingCell && (
                <>
                  <View style={styles.editInfoCard}>
                    <Text style={styles.editInfoLabel}>Member</Text>
                    <Text style={styles.editInfoValue} numberOfLines={1}>
                      {editingCell.memberName}
                    </Text>
                  </View>

                  <View style={styles.editInfoCard}>
                    <Text style={styles.editInfoLabel}>Date</Text>
                    <Text style={styles.editInfoValue}>
                      {formatDate(monthKey, editingCell.day)}
                    </Text>
                  </View>

                  {/* Meal Toggles */}
                  <Text style={styles.fieldLabel}>Meals</Text>

                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>🌅 Breakfast</Text>
                    <Switch
                      value={breakfast}
                      onValueChange={setBreakfast}
                      trackColor={{ false: "#334155", true: "#6366F1" }}
                      thumbColor={breakfast ? "#FFF" : "#94A3B8"}
                      disabled={saving}
                    />
                  </View>

                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>☀️ Lunch</Text>
                    <Switch
                      value={lunch}
                      onValueChange={setLunch}
                      trackColor={{ false: "#334155", true: "#6366F1" }}
                      thumbColor={lunch ? "#FFF" : "#94A3B8"}
                      disabled={saving}
                    />
                  </View>

                  <View style={styles.switchContainer}>
                    <Text style={styles.switchLabel}>🌙 Dinner</Text>
                    <Switch
                      value={dinner}
                      onValueChange={setDinner}
                      trackColor={{ false: "#334155", true: "#6366F1" }}
                      thumbColor={dinner ? "#FFF" : "#94A3B8"}
                      disabled={saving}
                    />
                  </View>

                  {/* Save / Delete */}
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                    onPress={saveCellEdit}
                    disabled={saving}
                    activeOpacity={0.75}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>
                        {!breakfast && !lunch && !dinner ? "Delete Entry" : "Update Entry"}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cancelBtn} onPress={closeCellEditModal}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ==================== MEMBER PICKER MODAL ==================== */}
      <Modal visible={showMemberPicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            onPress={() => setShowMemberPicker(false)}
            activeOpacity={1}
          />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Member</Text>

            {members.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>No members found</Text>
                <Text style={styles.pickerEmptySubtext}>
                  Please add members to your mess first
                </Text>
              </View>
            ) : (
              <FlatList
                data={members}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
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
                      <Text style={styles.memberOptionName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.memberOptionEmail} numberOfLines={1}>
                        {item.email}
                      </Text>
                    </View>
                    {selectedMember?.id === item.id && (
                      <Text style={styles.checkmarkLarge}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
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
    </View>
  );
}

/* ==================== STYLES ==================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
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

  // Month Navigation
  monthSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 8,
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
    paddingHorizontal: 12,
  },
  header: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 2,
  },
  subHeader: {
    fontSize: 14,
    color: "#94A3B8",
    marginBottom: 4,
  },

  // View-Only Badge
  viewOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
  },
  viewOnlyText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // Total Badge
  totalBadge: {
    backgroundColor: "#6366F1",
    marginHorizontal: 16,
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

  // Scrollable Table - FIXED LAYOUT
  scrollOuter: { flex: 1 },
  scrollInner: { flex: 1 },

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

  // FIXED: Member Column - Constrained Width
  memberCol: {
    width: 120, // Fixed width to prevent expansion
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  memberNameContainer: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: 120, // Match parent width
  },
  memberName: {
    textAlign: "center",
    fontWeight: "700",
    color: "#E2E8F0",
    fontSize: 13,
    // Text will be truncated with ellipsis via numberOfLines
  },

  subRow: { flexDirection: "row", position: "relative" },
  subCell: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  editableCell: {
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  editIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    borderRadius: 8,
    padding: 2,
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

  // Totals Row
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

  // FAB
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

  // Modals
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  modalCard: {
    backgroundColor: "#1E293B",
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    marginBottom: Platform.OS === "ios" ? 0 : 48,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
    textAlign: "center",
  },

  fieldLabel: {
    color: "#94A3B8",
    fontSize: 10,
    marginBottom: 6,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Date Selector
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  dateButton: { padding: 8 },
  dateButtonText: {
    color: "#6366F1",
    fontSize: 14,
    fontWeight: "700",
  },
  dateButtonDisabled: {
    color: "#334155",
  },
  dateDisplay: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  todayLink: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },

  // Edit Info Cards
  editInfoCard: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  editInfoLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editInfoValue: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },

  // Member Selector
  memberSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  memberSelectorEmpty: {
    borderColor: "#475569",
    borderStyle: "dashed",
  },
  memberSelectorText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  placeholderText: {
    color: "#64748B",
    fontWeight: "400",
  },
  chevron: {
    color: "#64748B",
    fontSize: 12,
  },

  // Meal Switches
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  switchLabel: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },

  // Save / Cancel Buttons
  saveBtn: {
    backgroundColor: "#6366F1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 6,
  },
  saveBtnDisabled: {
    backgroundColor: "#334155",
  },
  saveBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelBtn: { alignItems: "center", padding: 10 },
  cancelText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },

  // Member Picker Modal
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
  pickerEmpty: {
    paddingVertical: 40,
    alignItems: "center",
  },
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
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderWidth: 1,
  },
  memberOptionContent: {
    flex: 1,
    marginRight: 12,
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
    fontSize: 22,
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
});