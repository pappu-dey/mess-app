// GuestMeal.tsx - Enhanced with Emoji Icons and Full Date Range
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
    collection,
    doc,
    increment,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    where,
} from "firebase/firestore";
import {
    Calendar,
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Edit3,
    Layers,
    Plus,
    Trash2,
    XCircle,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useApp } from "../../context/AppContext";
import { db } from "../../firebase";

// ==================== MEAL TYPE ICONS (EMOJI) ====================
const MealIcon = ({ type, size = 24 }: { type: string; size?: number }) => {
    const getEmoji = () => {
        switch (type.toLowerCase()) {
            case "veg":
                return "🥗";
            case "egg":
                return "🥚";
            case "chicken":
                return "🍗";
            case "fish":
                return "🐟";
            case "paneer":
                return "🧈";
            case "mutton":
                return "🍖";
            default:
                return "🍽️";
        }
    };

    const getBackgroundColor = () => {
        switch (type.toLowerCase()) {
            case "veg":
                return "rgba(76, 175, 80, 0.15)";
            case "egg":
                return "rgba(245, 158, 11, 0.15)";
            case "chicken":
                return "rgba(255, 167, 38, 0.15)";
            case "fish":
                return "rgba(66, 165, 245, 0.15)";
            case "paneer":
                return "rgba(251, 192, 45, 0.15)";
            case "mutton":
                return "rgba(239, 83, 80, 0.15)";
            default:
                return C.purpleDim;
        }
    };

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: getBackgroundColor(),
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <Text style={{ fontSize: size * 0.6 }}>{getEmoji()}</Text>
        </View>
    );
};

// ==================== SNACKBAR COMPONENT ====================
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
                S.snackbar,
                { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <Icon size={20} color="#FFF" strokeWidth={2.5} />
            <Text style={S.snackbarText}>{message}</Text>
        </Animated.View>
    );
};

// ==================== CONSTANTS ====================
const MEAL_TYPES = ["Veg", "Egg", "Chicken", "Paneer", "Mutton", "Fish"];
const MEAL_TIMES = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const QUANTITY_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);
const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

// Color Palette
const C = {
    bg: "#0f1923",
    card: "#162230",
    cardBorder: "#1e2f3f",
    green: "#2ecc71",
    greenDim: "rgba(46,204,113,0.13)",
    purple: "#6c63ff",
    purpleDim: "rgba(108,99,255,0.18)",
    text: "#e2e8f0",
    textMuted: "#7a8fa3",
    textLabel: "#94a3b8",
    chipBorder: "#2a3a4a",
    inputBg: "#162230",
    inputBorder: "#2a3a4a",
    error: "#e74c3c",
    errorBg: "rgba(231,76,60,0.12)",
    overlay: "rgba(0,0,0,0.6)",
    modal: "#1a2736",
    divider: "#1e2f3f",
    editedBadge: "#F59E0B",
    editedBg: "rgba(245,158,11,0.12)",
};

// ==================== TYPES ====================
type Member = { id: string; name: string };

type GuestMealDoc = {
    id: string;
    memberId: string;
    memberName: string;
    mealType: string;
    mealTime: string;
    price: number;
    quantity: number;
    totalAmount: number;
    date: string;
    createdAt?: any;
    updatedAt?: any;
};

type ModalMode = "add" | "edit";

// ==================== UTILITY FUNCTIONS ====================
const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

const formatDateOnly = (date: Date): string => {
    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const isEdited = (doc: GuestMealDoc): boolean => {
    if (!doc.updatedAt || !doc.createdAt) return false;
    const created = doc.createdAt?.toMillis?.() || 0;
    const updated = doc.updatedAt?.toMillis?.() || 0;
    return updated > created + 1000; // 1 second threshold
};

// ==================== MAIN COMPONENT ====================
export default function GuestMeal() {
    const router = useRouter();
    const { mess, members, refreshDashboard } = useApp();
    const messId = mess?.id;

    // Snackbar state
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

    // Month navigation
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth()); // 0-based

    // Data
    const [transactions, setTransactions] = useState<GuestMealDoc[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>("add");
    const [editDoc, setEditDoc] = useState<GuestMealDoc | null>(null);

    // ==================== DATA FETCHING ====================
    useEffect(() => {
        if (!messId) {
            setLoading(false);
            return;
        }

        const mm = `${year}-${String(month + 1).padStart(2, "0")}`;
        const q = query(
            collection(db, "messes", messId, "guest_meal"),
            where("date", ">=", mm + "-01"),
            where("date", "<=", mm + "-31"),
            orderBy("date", "desc")
        );

        const unsub = onSnapshot(q, (snap) => {
            setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GuestMealDoc)));
            setLoading(false);
        }, (error) => {
            const code = error?.code || '';
            const msg = (error?.message || '').toLowerCase();
            if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
                console.log("Guest meal listener detached (user signed out)");
                return;
            }
            console.error("Error fetching guest meals:", error);
            setLoading(false);
        });

        return unsub;
    }, [messId, year, month]);

    // ==================== DERIVED DATA ====================
    const { totalMeals, totalPrice } = useMemo(() => {
        let m = 0,
            p = 0;
        transactions.forEach((t) => {
            m += t.quantity;
            p += t.totalAmount;
        });
        return { totalMeals: m, totalPrice: p };
    }, [transactions]);

    // ==================== NAVIGATION ====================
    const prev = () => {
        if (month === 0) {
            setMonth(11);
            setYear((y) => y - 1);
        } else setMonth((m) => m - 1);
    };

    const next = () => {
        if (month === 11) {
            setMonth(0);
            setYear((y) => y + 1);
        } else setMonth((m) => m + 1);
    };

    // ==================== DELETE ====================
    const deleteTransaction = async (t: GuestMealDoc) => {
        if (!messId) return;

        Alert.alert("Delete", `Remove this ₹${t.totalAmount} guest meal?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await runTransaction(db, async (tx) => {
                            const mRef = doc(db, "messes", messId, "members", t.memberId);
                            const moRef = doc(db, "messes", messId, "managerMoney", t.date.substring(0, 7));
                            tx.update(mRef, {
                                guestMealTotal: increment(-t.totalAmount),
                                totalPayable: increment(-t.totalAmount),
                                updatedAt: serverTimestamp(),
                            });
                            tx.delete(doc(db, "messes", messId, "guest_meal", t.id));
                            tx.update(moRef, {
                                totalExpense: increment(t.totalAmount),
                                updatedAt: serverTimestamp(),
                            });
                        });
                        refreshDashboard();
                        showSnackbar("Guest meal deleted successfully");
                    } catch (e) {
                        console.error("Delete error:", e);
                        showSnackbar("Failed to delete guest meal", "error");
                    }
                },
            },
        ]);
    };

    // ==================== RENDER ====================
    return (
        <View style={S.container}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: "Guest Meals",
                    headerStyle: { backgroundColor: C.bg },
                    headerTintColor: C.text,
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8 }}>
                            <Ionicons name="arrow-back-outline" size={24} color={C.text} />
                        </TouchableOpacity>
                    ),
                }}
            />

            {/* Month Selector */}
            <View style={S.monthBar}>
                <TouchableOpacity onPress={prev} style={S.navBtn}>
                    <ChevronLeft size={20} color={C.purple} />
                </TouchableOpacity>
                <Text style={S.monthTitle}>
                    {MONTHS[month]} {year}
                </Text>
                <TouchableOpacity onPress={next} style={S.navBtn}>
                    <ChevronRight size={20} color={C.purple} />
                </TouchableOpacity>
            </View>

            {/* Summary Cards */}
            <View style={S.summaryRow}>
                <View style={[S.summaryCard, { borderColor: C.green }]}>
                    <Layers size={20} color={C.green} />
                    <Text style={S.summaryVal}>{totalMeals}</Text>
                    <Text style={S.summaryLbl}>Total Meals</Text>
                </View>
                <View style={[S.summaryCard, { borderColor: C.purple }]}>
                    <CreditCard size={20} color={C.purple} />
                    <Text style={[S.summaryVal, { color: C.purple }]}>₹{totalPrice}</Text>
                    <Text style={S.summaryLbl}>Total Price</Text>
                </View>
            </View>

            {/* Transaction List */}
            <ScrollView style={S.scroll} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <ActivityIndicator color={C.green} style={{ marginTop: 50 }} />
                ) : transactions.length === 0 ? (
                    <View style={S.emptyWrap}>
                        <Ionicons name="restaurant-outline" size={48} color={C.chipBorder} />
                        <Text style={S.emptyTitle}>No guest meals</Text>
                        <Text style={S.emptyHint}>Tap + to add one</Text>
                    </View>
                ) : (
                    transactions.map((t) => (
                        <TouchableOpacity
                            key={t.id}
                            style={S.txCard}
                            onPress={() => {
                                setEditDoc(t);
                                setModalMode("edit");
                                setModalVisible(true);
                            }}
                            activeOpacity={0.72}
                        >
                            <View style={S.txIcon}>
                                <MealIcon type={t.mealType} size={32} />
                            </View>
                            <View style={S.txBody}>
                                <View style={S.txRow1}>
                                    <View style={S.txNameRow}>
                                        <Text style={S.txName}>{t.memberName}</Text>
                                        {isEdited(t) && (
                                            <View style={S.editedBadge}>
                                                <Edit3 size={10} color={C.editedBadge} />
                                                <Text style={S.editedText}>Edited</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={S.txAmt}>₹{t.totalAmount}</Text>
                                </View>
                                <View style={S.txRow2}>
                                    <Text style={S.txSub}>
                                        {t.quantity}× {capitalize(t.mealType)} · {capitalize(t.mealTime)}
                                    </Text>
                                    <Text style={S.txDate}>{formatDate(t.date)}</Text>
                                </View>
                            </View>
                            <ChevronRight size={18} color={C.chipBorder} />
                        </TouchableOpacity>
                    ))
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={S.fab}
                onPress={() => {
                    setEditDoc(null);
                    setModalMode("add");
                    setModalVisible(true);
                }}
                activeOpacity={0.78}
            >
                <Plus size={28} color="#fff" strokeWidth={3} />
            </TouchableOpacity>

            {/* Modal */}
            {modalVisible && (
                <MealModal
                    mode={modalMode}
                    initial={editDoc}
                    members={members}
                    messId={messId!}
                    onClose={() => setModalVisible(false)}
                    onDelete={
                        modalMode === "edit" && editDoc
                            ? () => {
                                setModalVisible(false);
                                deleteTransaction(editDoc);
                            }
                            : undefined
                    }
                    showSnackbar={showSnackbar}
                    currentMonth={month}
                    currentYear={year}
                />
            )}

            {/* Snackbar */}
            <Snackbar
                visible={snackbar.visible}
                message={snackbar.message}
                type={snackbar.type}
                onDismiss={hideSnackbar}
            />
        </View>
    );
}

// ==================== MEAL MODAL ====================
function MealModal({
    mode,
    initial,
    members,
    messId,
    onClose,
    onDelete,
    showSnackbar,
    currentMonth,
    currentYear,
}: {
    mode: ModalMode;
    initial: GuestMealDoc | null;
    members: Member[];
    messId: string;
    onClose: () => void;
    onDelete?: () => void;
    showSnackbar: (message: string, type?: SnackbarType) => void;
    currentMonth: number;
    currentYear: number;
}) {
    const [member, setMember] = useState<Member | null>(
        initial ? members.find((m) => m.id === initial.memberId) ?? null : null
    );
    const [mealType, setMealType] = useState(initial ? capitalize(initial.mealType) : "Veg");
    const [mealTime, setMealTime] = useState(initial ? capitalize(initial.mealTime) : "Lunch");
    const [price, setPrice] = useState(initial ? String(initial.price) : "");
    const [quantity, setQuantity] = useState(initial ? initial.quantity : 1);
    const [date, setDate] = useState(initial ? new Date(initial.date + "T00:00:00") : new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showMemberPicker, setShowMemberPicker] = useState(false);
    const [showMealTypePicker, setShowMealTypePicker] = useState(false);
    const [showMealTimePicker, setShowMealTimePicker] = useState(false);
    const [showQuantityPicker, setShowQuantityPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const totalAmount = useMemo(() => {
        const p = parseFloat(price);
        return (isNaN(p) ? 0 : p) * quantity;
    }, [price, quantity]);

    // Validation
    const validate = () => {
        const e: Record<string, string> = {};
        if (!member) e.member = "Please select a member";
        const p = parseFloat(price);
        if (!price || isNaN(p) || p <= 0) e.price = "Enter a valid price > 0";
        else if (p > 10000) e.price = "Price seems unusually high";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // Generate date options from 1st of current month to today
    const generateDateOptions = () => {
        const options = [];
        const today = new Date();

        // Start from the 1st of the current month being viewed
        const firstDay = new Date(currentYear, currentMonth, 1);

        // End at today
        const endDate = today;

        // Today
        options.push({ label: "Today", date: new Date(today) });

        // Yesterday
        if (today.getDate() > 1 || today.getMonth() !== currentMonth || today.getFullYear() !== currentYear) {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (yesterday >= firstDay) {
                options.push({ label: "Yesterday", date: yesterday });
            }
        }

        // Generate all dates from today backwards to the 1st of current month
        let currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() - 2); // Start from 2 days ago

        while (currentDate >= firstDay) {
            options.push({
                label: formatDateOnly(currentDate),
                date: new Date(currentDate),
            });
            currentDate.setDate(currentDate.getDate() - 1);
        }

        return options;
    };

    const selectDate = (d: Date) => {
        setDate(d);
        setShowDatePicker(false);
    };

    // Add meal
    const doAdd = async () => {
        if (!validate() || !member) return;
        setSaving(true);

        try {
            await runTransaction(db, async (tx) => {
                const dateStr = date.toISOString().split("T")[0];
                const monthKey = dateStr.substring(0, 7);
                const mRef = doc(db, "messes", messId, "members", member.id);
                const moRef = doc(db, "messes", messId, "managerMoney", monthKey);

                if (!(await tx.get(mRef)).exists()) throw new Error("Member not found");

                tx.set(doc(collection(db, "messes", messId, "guest_meal")), {
                    messId,
                    memberId: member.id,
                    memberName: member.name,
                    mealType: mealType.toLowerCase(),
                    mealTime: mealTime.toLowerCase(),
                    price: parseFloat(price),
                    quantity,
                    totalAmount,
                    date: dateStr,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                tx.update(mRef, {
                    guestMealTotal: increment(totalAmount),
                    totalPayable: increment(totalAmount),
                    updatedAt: serverTimestamp(),
                });
                tx.set(moRef, { month: monthKey }, { merge: true });
                tx.set(doc(collection(moRef, "entries")), {
                    type: "expense",
                    amount: -totalAmount,
                    purpose: `Guest meal adjustment for ${member.name}`,
                    description: `Guest meal: ${quantity}x ${mealType} ${mealTime}`,
                    date: dateStr,
                    isCommon: false,
                    edited: false,
                    createdAt: serverTimestamp(),
                });
                tx.update(moRef, {
                    totalExpense: increment(-totalAmount),
                    updatedAt: serverTimestamp(),
                });
            });

            onClose();
            showSnackbar("Guest meal added successfully");
        } catch (e) {
            console.error("Add error:", e);
            showSnackbar("Failed to add guest meal", "error");
        } finally {
            setSaving(false);
        }
    };

    // Edit meal
    const doEdit = async () => {
        if (!validate() || !member || !initial) return;
        setSaving(true);

        try {
            await runTransaction(db, async (tx) => {
                const diff = totalAmount - initial.totalAmount;
                const dateStr = date.toISOString().split("T")[0];
                const monthKey = dateStr.substring(0, 7);
                const mRef = doc(db, "messes", messId, "members", member.id);
                const moRef = doc(db, "messes", messId, "managerMoney", monthKey);
                const gRef = doc(db, "messes", messId, "guest_meal", initial.id);

                tx.update(gRef, {
                    memberId: member.id,
                    memberName: member.name,
                    mealType: mealType.toLowerCase(),
                    mealTime: mealTime.toLowerCase(),
                    price: parseFloat(price),
                    quantity,
                    totalAmount,
                    date: dateStr,
                    updatedAt: serverTimestamp(),
                });

                if (diff !== 0) {
                    tx.update(mRef, {
                        guestMealTotal: increment(diff),
                        totalPayable: increment(diff),
                        updatedAt: serverTimestamp(),
                    });
                    tx.set(moRef, { month: monthKey }, { merge: true });
                    tx.update(moRef, {
                        totalExpense: increment(-diff),
                        updatedAt: serverTimestamp(),
                    });
                }
            });

            onClose();
            showSnackbar("Guest meal updated successfully");
        } catch (e) {
            console.error("Edit error:", e);
            showSnackbar("Failed to update guest meal", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => (mode === "add" ? doAdd : doEdit)();

    return (
        <View style={S.overlay}>
            <View style={S.sheet}>
                <View style={S.handle} />

                {/* Header */}
                <View style={S.sheetHeader}>
                    <Text style={S.sheetTitle}>{mode === "add" ? "Add Guest Meal" : "Edit Guest Meal"}</Text>
                    <TouchableOpacity onPress={!saving ? onClose : undefined} disabled={saving}>
                        <Ionicons name="close" size={22} color={C.textMuted} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={S.sheetBody} showsVerticalScrollIndicator={false}>
                    {/* Member */}
                    <Text style={S.lbl}>
                        Guest of Member <Text style={S.req}>*</Text>
                    </Text>
                    <TouchableOpacity
                        style={[S.select, errors.member && S.inputErr]}
                        onPress={() => !saving && setShowMemberPicker(true)}
                        disabled={saving}
                    >
                        <View style={S.selectRow}>
                            <Text style={[S.selText, !member && S.placeholder]}>
                                {member ? member.name : "Select Member"}
                            </Text>
                            <ChevronDown size={18} color={C.textMuted} />
                        </View>
                    </TouchableOpacity>
                    {errors.member && <Text style={S.errText}>{errors.member}</Text>}

                    {/* Meal Type */}
                    <Text style={S.lbl}>Meal Type</Text>
                    <TouchableOpacity
                        style={S.select}
                        onPress={() => !saving && setShowMealTypePicker(true)}
                        disabled={saving}
                    >
                        <View style={S.selectRow}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <MealIcon type={mealType} size={24} />
                                <Text style={S.selText}>{mealType}</Text>
                            </View>
                            <ChevronDown size={18} color={C.textMuted} />
                        </View>
                    </TouchableOpacity>

                    {/* Meal Time */}
                    <Text style={S.lbl}>Meal Time</Text>
                    <TouchableOpacity
                        style={S.select}
                        onPress={() => !saving && setShowMealTimePicker(true)}
                        disabled={saving}
                    >
                        <View style={S.selectRow}>
                            <Text style={S.selText}>{mealTime}</Text>
                            <ChevronDown size={18} color={C.textMuted} />
                        </View>
                    </TouchableOpacity>

                    {/* Price */}
                    <Text style={S.lbl}>
                        Price per item (₹) <Text style={S.req}>*</Text>
                    </Text>
                    <TextInput
                        style={[S.input, errors.price && S.inputErr]}
                        keyboardType="numeric"
                        placeholder="Enter price"
                        placeholderTextColor={C.textMuted}
                        value={price}
                        onChangeText={(t) => {
                            setPrice(t.replace(/[^0-9.]/g, ""));
                            setErrors((e) => ({ ...e, price: "" }));
                        }}
                        editable={!saving}
                        selectionColor={C.green}
                    />
                    {errors.price && <Text style={S.errText}>{errors.price}</Text>}

                    {/* Quantity */}
                    <Text style={S.lbl}>Quantity</Text>
                    <TouchableOpacity
                        style={S.select}
                        onPress={() => !saving && setShowQuantityPicker(true)}
                        disabled={saving}
                    >
                        <View style={S.selectRow}>
                            <Text style={S.selText}>{quantity}</Text>
                            <ChevronDown size={18} color={C.textMuted} />
                        </View>
                    </TouchableOpacity>

                    {/* Date */}
                    <Text style={S.lbl}>Date</Text>
                    <TouchableOpacity
                        style={S.select}
                        onPress={() => !saving && setShowDatePicker(true)}
                        disabled={saving}
                    >
                        <View style={S.selectRow}>
                            <Calendar size={18} color={C.textMuted} style={{ marginRight: 10 }} />
                            <Text style={S.selText}>
                                {date.toLocaleDateString("en-IN", {
                                    weekday: "short",
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                })}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {/* Total */}
                    <View style={S.totalRow}>
                        <View>
                            <Text style={S.totalLbl}>Total Amount</Text>
                            {quantity > 1 && (
                                <Text style={S.totalBreak}>
                                    {quantity} × ₹{price || 0}
                                </Text>
                            )}
                        </View>
                        <Text style={S.totalVal}>₹{totalAmount}</Text>
                    </View>

                    {/* Actions */}
                    <TouchableOpacity
                        style={[S.saveBtn, saving && S.saveBtnDim]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={S.saveBtnTxt}>{mode === "add" ? "Add Meal" : "Save Changes"}</Text>
                        )}
                    </TouchableOpacity>

                    {mode === "edit" && onDelete && (
                        <TouchableOpacity style={S.deleteBtn} onPress={onDelete} disabled={saving}>
                            <Trash2 size={18} color={C.error} />
                            <Text style={S.deleteBtnTxt}>Delete Entry</Text>
                        </TouchableOpacity>
                    )}

                    <View style={{ height: 24 }} />
                </ScrollView>
            </View>

            {/* Date Picker Modal */}
            {showDatePicker && (
                <View style={S.overlay}>
                    <View style={[S.sheet, { maxHeight: "60%" }]}>
                        <View style={S.handle} />
                        <View style={S.sheetHeader}>
                            <Text style={S.sheetTitle}>Select Date</Text>
                            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ paddingHorizontal: 20, paddingBottom: 24 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {generateDateOptions().map((option, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        S.dateOption,
                                        formatDateOnly(date) === formatDateOnly(option.date) && S.dateOptionSelected,
                                    ]}
                                    onPress={() => selectDate(option.date)}
                                >
                                    <Calendar size={16} color={C.purple} />
                                    <Text style={S.dateOptionText}>{option.label}</Text>
                                    {formatDateOnly(date) === formatDateOnly(option.date) && (
                                        <CheckCircle size={18} color={C.green} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* Member Picker Modal */}
            {showMemberPicker && (
                <View style={S.overlay}>
                    <View style={[S.sheet, { maxHeight: "50%" }]}>
                        <View style={S.handle} />
                        <View style={S.sheetHeader}>
                            <Text style={S.sheetTitle}>Select Member</Text>
                            <TouchableOpacity onPress={() => setShowMemberPicker(false)}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ paddingHorizontal: 20, paddingBottom: 24 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {members.map((m) => (
                                <TouchableOpacity
                                    key={m.id}
                                    style={[S.pickerRow, member?.id === m.id && S.pickerRowActive]}
                                    onPress={() => {
                                        setMember(m);
                                        setShowMemberPicker(false);
                                        setErrors((e) => ({ ...e, member: "" }));
                                    }}
                                >
                                    <View style={[S.avatar, member?.id === m.id && S.avatarActive]}>
                                        <Text style={S.avatarTxt}>{m.name[0].toUpperCase()}</Text>
                                    </View>
                                    <Text style={[S.pickerName, member?.id === m.id && S.pickerNameActive]}>
                                        {m.name}
                                    </Text>
                                    {member?.id === m.id && <CheckCircle size={18} color={C.green} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* Meal Type Picker Modal */}
            {showMealTypePicker && (
                <View style={S.overlay}>
                    <View style={[S.sheet, { maxHeight: "50%" }]}>
                        <View style={S.handle} />
                        <View style={S.sheetHeader}>
                            <Text style={S.sheetTitle}>Select Meal Type</Text>
                            <TouchableOpacity onPress={() => setShowMealTypePicker(false)}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ paddingHorizontal: 20, paddingBottom: 24 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {MEAL_TYPES.map((type) => (
                                <TouchableOpacity
                                    key={type}
                                    style={[S.optionRow, mealType === type && S.optionRowActive]}
                                    onPress={() => {
                                        setMealType(type);
                                        setShowMealTypePicker(false);
                                    }}
                                >
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                                        <MealIcon type={type} size={28} />
                                        <Text style={[S.optionText, mealType === type && S.optionTextActive]}>
                                            {type}
                                        </Text>
                                    </View>
                                    {mealType === type && <CheckCircle size={18} color={C.green} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* Meal Time Picker Modal */}
            {showMealTimePicker && (
                <View style={S.overlay}>
                    <View style={[S.sheet, { maxHeight: "50%" }]}>
                        <View style={S.handle} />
                        <View style={S.sheetHeader}>
                            <Text style={S.sheetTitle}>Select Meal Time</Text>
                            <TouchableOpacity onPress={() => setShowMealTimePicker(false)}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ paddingHorizontal: 20, paddingBottom: 24 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {MEAL_TIMES.map((time) => (
                                <TouchableOpacity
                                    key={time}
                                    style={[S.optionRow, mealTime === time && S.optionRowActive]}
                                    onPress={() => {
                                        setMealTime(time);
                                        setShowMealTimePicker(false);
                                    }}
                                >
                                    <Text style={[S.optionText, mealTime === time && S.optionTextActive]}>
                                        {time}
                                    </Text>
                                    {mealTime === time && <CheckCircle size={18} color={C.green} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* Quantity Picker Modal */}
            {showQuantityPicker && (
                <View style={S.overlay}>
                    <View style={[S.sheet, { maxHeight: "50%" }]}>
                        <View style={S.handle} />
                        <View style={S.sheetHeader}>
                            <Text style={S.sheetTitle}>Select Quantity</Text>
                            <TouchableOpacity onPress={() => setShowQuantityPicker(false)}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ paddingHorizontal: 20, paddingBottom: 24 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={S.quantityGrid}>
                                {QUANTITY_OPTIONS.map((q) => (
                                    <TouchableOpacity
                                        key={q}
                                        style={[S.quantityChip, quantity === q && S.quantityChipActive]}
                                        onPress={() => {
                                            setQuantity(q);
                                            setShowQuantityPicker(false);
                                        }}
                                    >
                                        <Text style={[S.quantityText, quantity === q && S.quantityTextActive]}>
                                            {q}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            )}
        </View>
    );
}

// ==================== STYLES ====================
const S = StyleSheet.create({
    /* root */
    container: { flex: 1, backgroundColor: C.bg },

    /* month bar */
    monthBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    navBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.cardBorder,
        justifyContent: "center",
        alignItems: "center",
    },
    monthTitle: { fontSize: 18, fontWeight: "700", color: C.text },

    /* summary */
    summaryRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12 },
    summaryCard: {
        flex: 1,
        backgroundColor: C.card,
        borderWidth: 1.5,
        borderRadius: 14,
        padding: 16,
        alignItems: "center",
    },
    summaryVal: { fontSize: 24, fontWeight: "700", color: C.green, marginTop: 6 },
    summaryLbl: { fontSize: 12, color: C.textMuted, marginTop: 4, textAlign: "center" },

    /* list */
    scroll: { flex: 1, marginTop: 16, paddingHorizontal: 20 },
    txCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.cardBorder,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
    },
    txIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "rgba(108,99,255,0.1)",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
    },
    txBody: { flex: 1 },
    txRow1: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    txNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    txName: { fontSize: 15, fontWeight: "600", color: C.text },
    editedBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.editedBg,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "rgba(245,158,11,0.3)",
    },
    editedText: { fontSize: 10, fontWeight: "600", color: C.editedBadge },
    txAmt: { fontSize: 16, fontWeight: "700", color: C.green },
    txRow2: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    txSub: { fontSize: 13, color: C.textMuted },
    txDate: { fontSize: 12, color: C.chipBorder },

    /* empty */
    emptyWrap: { alignItems: "center", marginTop: 80 },
    emptyTitle: { color: C.textMuted, fontSize: 16, marginTop: 14, fontWeight: "600" },
    emptyHint: { color: C.chipBorder, fontSize: 13, marginTop: 4 },

    /* FAB */
    fab: {
        position: "absolute",
        bottom: 80,
        right: 28,
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: C.purple,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: C.purple,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
        elevation: 8,
    },

    // Snackbar
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
    snackbarText: { color: "#FFF", fontSize: 15, fontWeight: "600", flex: 1 },

    /* overlay + sheet */
    overlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.overlay,
        justifyContent: "flex-end",
        zIndex: 1000,
        elevation: 1000,
    },
    sheet: {
        backgroundColor: C.modal,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        maxHeight: "85%",
        paddingTop: 8,
        paddingBottom: 30,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.cardBorder,
        alignSelf: "center",
        marginBottom: 12,
    },
    sheetHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    sheetTitle: { fontSize: 18, fontWeight: "700", color: C.text },
    sheetBody: { paddingHorizontal: 20 },

    /* form */
    lbl: {
        marginTop: 14,
        marginBottom: 6,
        fontWeight: "600",
        fontSize: 12,
        color: C.textLabel,
        textTransform: "uppercase",
        letterSpacing: 0.8,
    },
    req: { color: C.error },
    input: {
        borderWidth: 1,
        borderColor: C.inputBorder,
        borderRadius: 10,
        padding: 13,
        fontSize: 16,
        backgroundColor: C.inputBg,
        color: C.text,
    },
    inputErr: { borderColor: C.error, backgroundColor: C.errorBg },
    errText: { color: C.error, fontSize: 12, marginTop: 4 },
    select: {
        borderWidth: 1,
        borderColor: C.inputBorder,
        borderRadius: 10,
        padding: 13,
        backgroundColor: C.inputBg,
    },
    selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    selText: { color: C.text, fontSize: 15, flex: 1 },
    placeholder: { color: C.textMuted },

    /* date picker */
    dateOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
        borderRadius: 8,
        marginBottom: 4,
    },
    dateOptionSelected: {
        backgroundColor: "rgba(108, 99, 255, 0.15)",
        borderWidth: 1,
        borderColor: "rgba(108, 99, 255, 0.3)",
    },
    dateOptionText: { color: C.text, fontSize: 16, fontWeight: "600", flex: 1 },

    /* total row */
    totalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 18,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: C.divider,
    },
    totalLbl: { fontSize: 14, color: C.textMuted },
    totalBreak: { fontSize: 12, color: C.chipBorder, marginTop: 2 },
    totalVal: { fontSize: 26, fontWeight: "700", color: C.green },

    /* buttons */
    saveBtn: {
        marginTop: 18,
        backgroundColor: C.purple,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
    },
    saveBtnDim: { backgroundColor: C.chipBorder },
    saveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
    deleteBtn: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: C.error,
        borderRadius: 12,
        paddingVertical: 11,
        gap: 6,
    },
    deleteBtnTxt: { color: C.error, fontSize: 15, fontWeight: "600" },

    /* member picker */
    pickerRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
    },
    pickerRowActive: {
        backgroundColor: "rgba(46,204,113,0.08)",
        borderRadius: 8,
        paddingHorizontal: 6,
    },
    avatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: C.card,
        borderWidth: 1.5,
        borderColor: C.cardBorder,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    avatarActive: { borderColor: C.green, backgroundColor: "rgba(46,204,113,0.15)" },
    avatarTxt: { color: C.text, fontWeight: "700", fontSize: 16 },
    pickerName: { flex: 1, color: C.text, fontSize: 15 },
    pickerNameActive: { color: C.green, fontWeight: "600" },

    /* option picker */
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
        borderRadius: 8,
        marginBottom: 4,
    },
    optionRowActive: {
        backgroundColor: "rgba(108, 99, 255, 0.15)",
        borderWidth: 1,
        borderColor: "rgba(108, 99, 255, 0.3)",
    },
    optionText: { color: C.text, fontSize: 16, fontWeight: "600" },
    optionTextActive: { color: C.purple },

    /* quantity picker */
    quantityGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        paddingVertical: 10,
    },
    quantityChip: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: C.card,
        borderWidth: 1.5,
        borderColor: C.cardBorder,
        justifyContent: "center",
        alignItems: "center",
    },
    quantityChipActive: {
        backgroundColor: C.purple,
        borderColor: C.purple,
    },
    quantityText: {
        fontSize: 18,
        fontWeight: "700",
        color: C.text,
    },
    quantityTextActive: {
        color: "#fff",
    },
});