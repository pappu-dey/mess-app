// MealScreen.tsx - Enhanced with Export Functionality
import { useLocalSearchParams } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Calendar, CheckCircle, Download, Edit2, Eye, Plus, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { generateMealExcel, generateMealPDF } from "../../utils/exportUtils";
import { saveFile } from "../../utils/fileSaver";

/* ==================== SNACKBAR COMPONENT ==================== */
type SnackbarType = "success" | "error";

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
      <Icon size={20} color="#FFF" strokeWidth={2.5} />
      <Text style={styles.snackbarText}>{message}</Text>
    </Animated.View>
  );
};

/* ==================== HELPERS ==================== */

const buildMonthKey = (year: number, month: number): string =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

const getCurrentMonthKey = () => {
  const d = new Date();
  return buildMonthKey(d.getFullYear(), d.getMonth());
};

const parseMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m - 1 };
};

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

const getDateKey = (monthKey: string, day: number): string => {
  const { year, month } = parseMonthKey(monthKey);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const formatDate = (monthKey: string, day: number): string => {
  const { year, month } = parseMonthKey(monthKey);
  const d = new Date(year, month, day);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateOnly = (date: Date): string => {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const truncateName = (name: string, maxLength: number = 12): string => {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + "…";
};

const getMonthName = (yearMonth: string): string => {
  const [year, month] = yearMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
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

  // ── Month state ─────────────────────────────────────────────────
  const [monthKey, setMonthKey] = useState<string>(() => {
    if (params.month && typeof params.month === "string") {
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

  const { year: selYear, month: selMonth } = parseMonthKey(monthKey);
  const totalDays = daysInMonth(selYear, selMonth);

  // ── Data ────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([]);
  const [meals, setMeals] = useState<Record<string, MealEntry>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // ── Modal ───────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
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

  useEffect(() => {
    if (messId) loadMembers();
  }, [messId]);

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
      showSnackbar("Failed to load members", "error");
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
      if ((err as any).code !== "failed-precondition") {
        showSnackbar("Failed to load meals", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ==================== EXPORT FUNCTIONS ==================== */
  const handleExport = async (format: "pdf" | "excel") => {
    if (Object.keys(meals).length === 0) {
      showSnackbar("No meal entries to export", "error");
      return;
    }

    setExporting(true);
    setShowExportModal(false);

    try {
      const monthName = getMonthName(monthKey).replace(/\s/g, "_");
      let fileUri: string;
      let fileName: string;

      if (format === "pdf") {
        fileUri = await generateMealPDF(meals, members, monthKey, totalDays);
        fileName = `Meal_Report_${monthName}.pdf`;

        const success = await saveFile(fileUri, fileName, "pdf");
        if (success) {
          showSnackbar("PDF report exported successfully");
        }
      } else {
        fileUri = await generateMealExcel(meals, members, monthKey, totalDays);
        fileName = `Meal_Report_${monthName}.csv`;

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

  /* ==================== DATE PICKER - FROM 1ST OF MONTH TO TODAY ==================== */
  const generateDateOptions = () => {
    const options = [];
    const today = new Date();
    const { year, month } = parseMonthKey(monthKey);

    const firstDayOfMonth = new Date(year, month, 1);

    const currentMonthKey = getCurrentMonthKey();
    const lastDay = monthKey === currentMonthKey
      ? today
      : new Date(year, month, totalDays);

    const currentDate = new Date(firstDayOfMonth);

    while (currentDate <= lastDay) {
      const dateOption = new Date(currentDate);
      const day = dateOption.getDate();

      let label = "";

      if (monthKey === currentMonthKey) {
        const diffDays = Math.floor((today.getTime() - dateOption.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          label = "Today";
        } else if (diffDays === 1) {
          label = "Yesterday";
        } else {
          label = formatDateOnly(dateOption);
        }
      } else {
        label = formatDateOnly(dateOption);
      }

      options.push({ label, day, date: new Date(dateOption) });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return options.reverse();
  };

  const selectDateFromPicker = (day: number) => {
    setSelectedDay(day);
    setShowDatePicker(false);
  };

  /* ==================== SAVE/EDIT OPERATIONS ==================== */

  const saveMeal = async () => {
    if (!isManager) {
      showSnackbar("Only managers can add entries", "error");
      return;
    }

    if (!selectedMember || !messId) {
      showSnackbar("Please select a member", "error");
      return;
    }

    if (!breakfast && !lunch && !dinner) {
      showSnackbar("Please select at least one meal", "error");
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
      await loadMeals();
      refreshDashboard();
      showSnackbar("Meal entry saved successfully");
    } catch (err: any) {
      console.error("saveMeal:", err);

      let errorMsg = "Failed to save meal entry";
      if (err.code === "permission-denied") {
        errorMsg = "Permission denied";
      }

      showSnackbar(errorMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveCellEdit = async () => {
    if (!isManager || !editingCell || !messId) return;

    if (!breakfast && !lunch && !dinner) {
      const dateKey = getDateKey(monthKey, editingCell.day);
      const entryId = `${editingCell.memberId}_${dateKey}`;

      setSaving(true);
      try {
        await deleteDoc(
          doc(db, "messes", messId, "meals", monthKey, "entries", entryId)
        );
        closeCellEditModal();
        await loadMeals();
        refreshDashboard();
        showSnackbar("Meal entry deleted");
      } catch (err) {
        console.error("deleteMeal:", err);
        showSnackbar("Failed to delete entry", "error");
      } finally {
        setSaving(false);
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
      showSnackbar("Meal entry updated");
    } catch (err) {
      console.error("saveCellEdit:", err);
      showSnackbar("Failed to update entry", "error");
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
      showSnackbar("Only managers can add entries", "error");
      return;
    }

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

  const handleMonthChange = useCallback(
    (direction: "prev" | "next") => {
      let newYear = selYear;
      let newMonth = selMonth + (direction === "next" ? 1 : -1);

      if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      } else if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      }

      setMonthKey(buildMonthKey(newYear, newMonth));
      if (showModal) closeModal();
      if (showCellEditModal) closeCellEditModal();
    },
    [selYear, selMonth, showModal, showCellEditModal],
  );

  const getMonthNameDisplay = () => {
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
          <Text style={styles.subHeader}>{getMonthNameDisplay()}</Text>

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

      {/* Total Meals Card with Export Button */}
      <View style={styles.totalBadge}>
        <View style={styles.totalBadgeContent}>
          <View style={styles.totalBadgeLeft}>
            <Text style={styles.totalLabel}>Total Meals</Text>
            <Text style={styles.totalValue}>{getGrandTotal()}</Text>
          </View>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => setShowExportModal(true)}
            disabled={Object.keys(meals).length === 0}
          >
            <Download size={20} color={Object.keys(meals).length === 0 ? "#64748B" : "#FFF"} />
          </TouchableOpacity>
        </View>
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
              Choose format to download meal report
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

              {/* Date Selector */}
              <Text style={styles.fieldLabel}>Date</Text>
              <TouchableOpacity
                style={styles.dateSelector}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={18} color="#6366F1" />
                <Text style={styles.dateDisplay}>
                  {formatDate(monthKey, selectedDay)}
                </Text>
              </TouchableOpacity>

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

              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} disabled={saving}>
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

                  <TouchableOpacity style={styles.cancelBtn} onPress={closeCellEditModal} disabled={saving}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ==================== DATE PICKER MODAL ==================== */}
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
            {generateDateOptions().map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dateOption,
                  selectedDay === option.day && styles.dateOptionSelected,
                ]}
                onPress={() => selectDateFromPicker(option.day)}
              >
                <Calendar size={16} color="#6366F1" />
                <Text style={styles.dateOptionText}>{option.label}</Text>
                {selectedDay === option.day && (
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

      {/* ==================== MEMBER PICKER MODAL ==================== */}
      <Modal visible={showMemberPicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            onPress={() => setShowMemberPicker(false)}
            activeOpacity={1}
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
              <FlatList
                data={members}
                keyExtractor={(m) => m.id}
                style={styles.memberList}
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
                      <CheckCircle size={20} color="#10B981" />
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

  // Snackbar Styles
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

  // Total Badge with Export Button
  totalBadge: {
    backgroundColor: "#6366F1",
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  totalBadgeContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalBadgeLeft: {
    flex: 1,
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
  exportButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  // Scrollable Table
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

  // Member Column
  memberCol: {
    width: 120,
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  memberNameContainer: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: 120,
  },
  memberName: {
    textAlign: "center",
    fontWeight: "700",
    color: "#E2E8F0",
    fontSize: 13,
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

  // Export Modal
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

  // Date Selector
  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  dateDisplay: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
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

  // Picker Modals
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
  pickerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
  },
  pickerCloseIcon: { padding: 4 },
  pickerCloseIconText: { fontSize: 24, color: "#94A3B8", fontWeight: "300" },

  // Date List
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

  // Member List
  memberList: {
    maxHeight: 300,
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