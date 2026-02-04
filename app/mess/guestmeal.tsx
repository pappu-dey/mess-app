import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
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
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useApp } from "../../context/AppContext";
import { db } from "../../firebase";

// ---------------- CONSTANTS ----------------
const MEAL_TYPES = ["Veg", "Egg", "Chicken", "Paneer", "Mutton"];
const MEAL_TIMES = ["Breakfast", "Lunch", "Dinner"];
const QUANTITY_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

// ---------------- PALETTE ----------------
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
};

// ---------------- TYPES -----------------
type Member = { id: string; name: string };
type GuestMealDoc = {
    id: string; memberId: string; memberName: string;
    mealType: string; mealTime: string;
    price: number; quantity: number; totalAmount: number; date: string;
};
type ModalMode = "add" | "edit";

// ---------------- HELPERS ----------------
const formatDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-IN",
        { day: "numeric", month: "short", year: "numeric" });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const mealEmoji = (type: string) =>
    ({ veg: "🥬", egg: "🥚", chicken: "🍗", paneer: "🧀", mutton: "🍖" })[type.toLowerCase()] ?? "🍽️";

// ============================================================
//  SCREEN  –  transaction list
// ============================================================
export default function GuestMeal() {
    const router = useRouter();
    const { mess, members, refreshDashboard } = useApp();
    const messId = mess?.id;

    /* month nav */
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());          // 0-based

    /* data */
    const [transactions, setTransactions] = useState<GuestMealDoc[]>([]);
    const [loading, setLoading] = useState(true);

    /* modal */
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>("add");
    const [editDoc, setEditDoc] = useState<GuestMealDoc | null>(null);

    /* ── listen ── */
    useEffect(() => {
        if (!messId) { setLoading(false); return; }
        const mm = `${year}-${String(month + 1).padStart(2, "0")}`;
        const q = query(
            collection(db, "messes", messId, "guest_meal"),
            where("date", ">=", mm + "-01"),
            where("date", "<=", mm + "-31"),
            orderBy("date", "desc")
        );
        const unsub = onSnapshot(q, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }) as GuestMealDoc));
            setLoading(false);
        });
        return unsub;
    }, [messId, year, month]);

    /* ── derived ── */
    const { totalMeals, totalPrice } = useMemo(() => {
        let m = 0, p = 0;
        transactions.forEach(t => { m += t.quantity; p += t.totalAmount; });
        return { totalMeals: m, totalPrice: p };
    }, [transactions]);

    /* ── nav helpers ── */
    const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
    const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

    /* ── delete helper ── */
    const deleteTransaction = async (t: GuestMealDoc) => {
        if (!messId) return;
        Alert.alert("Delete", `Remove this ₹${t.totalAmount} guest meal?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try {
                        await runTransaction(db, async (tx) => {
                            const mRef = doc(db, "messes", messId, "members", t.memberId);
                            const moRef = doc(db, "messes", messId, "managerMoney", t.date.substring(0, 7));
                            tx.update(mRef, { guestMealTotal: increment(-t.totalAmount), totalPayable: increment(-t.totalAmount), updatedAt: serverTimestamp() });
                            tx.delete(doc(db, "messes", messId, "guest_meal", t.id));
                            tx.update(moRef, { totalExpense: increment(t.totalAmount), updatedAt: serverTimestamp() });
                        });
                        // Refresh dashboard to show updated cost per meal
                        refreshDashboard();
                    } catch (e) { Alert.alert("Error", (e as Error).message); }
                }
            },
        ]);
    };

    /* ── render ── */
    return (
        <View style={S.container}>
            <Stack.Screen options={{
                headerShown: true, title: "Guest Meals",
                headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text,
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8 }}>
                        <Ionicons name="arrow-back-outline" size={24} color={C.text} />
                    </TouchableOpacity>
                ),
            }} />

            {/* ── month selector ── */}
            <View style={S.monthBar}>
                <TouchableOpacity onPress={prev} style={S.navBtn}>
                    <Ionicons name="chevron-back" size={22} color={C.purple} />
                </TouchableOpacity>
                <Text style={S.monthTitle}>{MONTHS[month]}  {year}</Text>
                <TouchableOpacity onPress={next} style={S.navBtn}>
                    <Ionicons name="chevron-forward" size={22} color={C.purple} />
                </TouchableOpacity>
            </View>

            {/* ── summary cards ── */}
            <View style={S.summaryRow}>
                <View style={[S.summaryCard, { borderColor: C.green }]}>
                    <Ionicons name="layers-outline" size={20} color={C.green} />
                    <Text style={S.summaryVal}>{totalMeals}</Text>
                    <Text style={S.summaryLbl}>Total Meals</Text>
                </View>
                <View style={[S.summaryCard, { borderColor: C.purple }]}>
                    <Ionicons name="cash-outline" size={20} color={C.purple} />
                    <Text style={[S.summaryVal, { color: C.purple }]}>₹{totalPrice}</Text>
                    <Text style={S.summaryLbl}>Total Price</Text>
                </View>
            </View>

            {/* ── transaction list ── */}
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
                    transactions.map(t => (
                        <TouchableOpacity key={t.id} style={S.txCard}
                            onPress={() => { setEditDoc(t); setModalMode("edit"); setModalVisible(true); }}
                            activeOpacity={0.72}
                        >
                            <View style={S.txEmoji}>
                                <Text style={S.txEmojiText}>{mealEmoji(t.mealType)}</Text>
                            </View>
                            <View style={S.txBody}>
                                <View style={S.txRow1}>
                                    <Text style={S.txName}>{t.memberName}</Text>
                                    <Text style={S.txAmt}>₹{t.totalAmount}</Text>
                                </View>
                                <View style={S.txRow2}>
                                    <Text style={S.txSub}>
                                        {t.quantity}× {capitalize(t.mealType)} · {capitalize(t.mealTime)}
                                    </Text>
                                    <Text style={S.txDate}>{formatDate(t.date)}</Text>
                                </View>
                            </View>
                            {/* tiny edit arrow */}
                            <Ionicons name="chevron-forward" size={18} color={C.chipBorder} />
                        </TouchableOpacity>
                    ))
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── FAB ── */}
            <TouchableOpacity style={S.fab}
                onPress={() => { setEditDoc(null); setModalMode("add"); setModalVisible(true); }}
                activeOpacity={0.78}
            >
                <Ionicons name="add" size={32} color="#fff" />
            </TouchableOpacity>

            {/* ── modal ── */}
            {modalVisible && (
                <MealModal
                    mode={modalMode}
                    initial={editDoc}
                    members={members}
                    messId={messId!}
                    onClose={() => setModalVisible(false)}
                    onDelete={modalMode === "edit" && editDoc
                        ? () => { setModalVisible(false); deleteTransaction(editDoc); }
                        : undefined
                    }
                />
            )}
        </View>
    );
}

// ============================================================
//  MODAL  –  add / edit form (bottom sheet style)
// ============================================================
function MealModal({
    mode, initial, members, messId, onClose, onDelete,
}: {
    mode: ModalMode; initial: GuestMealDoc | null; members: Member[];
    messId: string; onClose: () => void; onDelete?: () => void;
}) {
    const [member, setMember] = useState<Member | null>(
        initial ? members.find(m => m.id === initial.memberId) ?? null : null);
    const [mealType, setMealType] = useState(initial ? capitalize(initial.mealType) : "Veg");
    const [mealTime, setMealTime] = useState(initial ? capitalize(initial.mealTime) : "Lunch");
    const [price, setPrice] = useState(initial ? String(initial.price) : "");
    const [quantity, setQuantity] = useState(initial ? initial.quantity : 1);
    const [date, setDate] = useState(initial ? new Date(initial.date + "T00:00:00") : new Date());
    const [showDate, setShowDate] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const totalAmount = useMemo(() => {
        const p = parseFloat(price);
        return (isNaN(p) ? 0 : p) * quantity;
    }, [price, quantity]);

    /* validation */
    const validate = () => {
        const e: Record<string, string> = {};
        if (!member) e.member = "Please select a member";
        const p = parseFloat(price);
        if (!price || isNaN(p) || p <= 0) e.price = "Enter a valid price > 0";
        else if (p > 10000) e.price = "Price seems unusually high";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    /* ── ADD ── */
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
                    messId, memberId: member.id, memberName: member.name,
                    mealType: mealType.toLowerCase(), mealTime: mealTime.toLowerCase(),
                    price: parseFloat(price), quantity, totalAmount, date: dateStr,
                    createdAt: serverTimestamp(),
                });
                tx.update(mRef, { guestMealTotal: increment(totalAmount), totalPayable: increment(totalAmount), updatedAt: serverTimestamp() });
                tx.set(moRef, { month: monthKey }, { merge: true });
                tx.set(doc(collection(moRef, "entries")), {
                    type: "expense", amount: -totalAmount,
                    purpose: `Guest meal adjustment for ${member.name}`,
                    description: `Guest meal: ${quantity}x ${mealType} ${mealTime}`,
                    date: dateStr, isCommon: false, edited: false, createdAt: serverTimestamp(),
                });
                tx.update(moRef, { totalExpense: increment(-totalAmount), updatedAt: serverTimestamp() });
            });
            onClose();
        } catch (e) { Alert.alert("Error", (e as Error).message || "Failed"); }
        finally { setSaving(false); }
    };

    /* ── EDIT ── */
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
                    memberId: member.id, memberName: member.name,
                    mealType: mealType.toLowerCase(), mealTime: mealTime.toLowerCase(),
                    price: parseFloat(price), quantity, totalAmount, date: dateStr,
                    updatedAt: serverTimestamp(),
                });
                if (diff !== 0) {
                    tx.update(mRef, { guestMealTotal: increment(diff), totalPayable: increment(diff), updatedAt: serverTimestamp() });
                    tx.set(moRef, { month: monthKey }, { merge: true });
                    tx.update(moRef, { totalExpense: increment(-diff), updatedAt: serverTimestamp() });
                }
            });
            onClose();
        } catch (e) { Alert.alert("Error", (e as Error).message || "Failed"); }
        finally { setSaving(false); }
    };

    const handleSave = () => (mode === "add" ? doAdd : doEdit)();

    /* ── render ── */
    return (
        <View style={S.overlay}>
            <View style={S.sheet}>
                <View style={S.handle} />

                {/* header */}
                <View style={S.sheetHeader}>
                    <Text style={S.sheetTitle}>{mode === "add" ? "Add Guest Meal" : "Edit Guest Meal"}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close" size={22} color={C.textMuted} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={S.sheetBody} showsVerticalScrollIndicator={false}>
                    {/* member */}
                    <Text style={S.lbl}>Guest of Member <Text style={S.req}>*</Text></Text>
                    <TouchableOpacity style={[S.select, errors.member && S.inputErr]}
                        onPress={() => setShowPicker(true)} disabled={saving}>
                        <View style={S.selectRow}>
                            <Text style={[S.selText, !member && S.placeholder]}>
                                {member ? member.name : "Select Member"}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color={C.textMuted} />
                        </View>
                    </TouchableOpacity>
                    {errors.member && <Text style={S.errText}>{errors.member}</Text>}

                    {/* meal type */}
                    <Text style={S.lbl}>Meal Type</Text>
                    <View style={S.chipRow}>
                        {MEAL_TYPES.map(m => <Chip key={m} label={m} active={mealType === m}
                            onPress={() => setMealType(m)} disabled={saving} />)}
                    </View>

                    {/* meal time */}
                    <Text style={S.lbl}>Meal Time</Text>
                    <View style={S.chipRow}>
                        {MEAL_TIMES.map(t => <Chip key={t} label={t} active={mealTime === t}
                            onPress={() => setMealTime(t)} disabled={saving} />)}
                    </View>

                    {/* price */}
                    <Text style={S.lbl}>Price per item (₹) <Text style={S.req}>*</Text></Text>
                    <TextInput style={[S.input, errors.price && S.inputErr]}
                        keyboardType="numeric" placeholder="Enter price"
                        placeholderTextColor={C.textMuted} value={price}
                        onChangeText={t => { setPrice(t.replace(/[^0-9.]/g, "")); setErrors(e => ({ ...e, price: "" })); }}
                        editable={!saving} selectionColor={C.green} />
                    {errors.price && <Text style={S.errText}>{errors.price}</Text>}

                    {/* quantity */}
                    <Text style={S.lbl}>Quantity</Text>
                    <View style={S.chipRow}>
                        {QUANTITY_OPTIONS.map(q => <Chip key={q} label={String(q)} active={quantity === q}
                            onPress={() => setQuantity(q)} disabled={saving} />)}
                    </View>

                    {/* date */}
                    <Text style={S.lbl}>Date</Text>
                    <TouchableOpacity style={S.select} onPress={() => setShowDate(true)} disabled={saving}>
                        <View style={S.selectRow}>
                            <Ionicons name="calendar-outline" size={18} color={C.textMuted} style={{ marginRight: 10 }} />
                            <Text style={S.selText}>
                                {date.toLocaleDateString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                            </Text>
                        </View>
                    </TouchableOpacity>
                    {showDate && (
                        <DateTimePicker value={date} mode="date" maximumDate={new Date()}
                            onChange={(_: any, d?: Date) => { setShowDate(false); if (d) setDate(d); }} />
                    )}

                    {/* total */}
                    <View style={S.totalRow}>
                        <View>
                            <Text style={S.totalLbl}>Total Amount</Text>
                            {quantity > 1 && <Text style={S.totalBreak}>{quantity} × ₹{price || 0}</Text>}
                        </View>
                        <Text style={S.totalVal}>₹{totalAmount}</Text>
                    </View>

                    {/* actions */}
                    <TouchableOpacity style={[S.saveBtn, saving && S.saveBtnDim]}
                        onPress={handleSave} disabled={saving}>
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={S.saveBtnTxt}>{mode === "add" ? "Add Meal" : "Save Changes"}</Text>
                        }
                    </TouchableOpacity>

                    {mode === "edit" && onDelete && (
                        <TouchableOpacity style={S.deleteBtn} onPress={onDelete} disabled={saving}>
                            <Ionicons name="trash-outline" size={18} color={C.error} />
                            <Text style={S.deleteBtnTxt}>Delete Entry</Text>
                        </TouchableOpacity>
                    )}

                    <View style={{ height: 24 }} />
                </ScrollView>
            </View>

            {/* member picker (layered on top) */}
            {showPicker && (
                <View style={S.overlay}>
                    <View style={[S.sheet, { maxHeight: "50%" }]}>
                        <View style={S.handle} />
                        <View style={S.sheetHeader}>
                            <Text style={S.sheetTitle}>Select Member</Text>
                            <TouchableOpacity onPress={() => setShowPicker(false)}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                            {members.map(m => (
                                <TouchableOpacity key={m.id}
                                    style={[S.pickerRow, member?.id === m.id && S.pickerRowActive]}
                                    onPress={() => { setMember(m); setShowPicker(false); setErrors(e => ({ ...e, member: "" })); }}
                                >
                                    <View style={[S.avatar, member?.id === m.id && S.avatarActive]}>
                                        <Text style={S.avatarTxt}>{m.name[0].toUpperCase()}</Text>
                                    </View>
                                    <Text style={[S.pickerName, member?.id === m.id && S.pickerNameActive]}>{m.name}</Text>
                                    {member?.id === m.id && <Ionicons name="checkmark" size={18} color={C.green} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}
        </View>
    );
}

// ============================================================
//  CHIP
// ============================================================
function Chip({ label, active, onPress, disabled = false }:
    { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7}
            style={[S.chip, active && S.chipActive, disabled && S.chipDim]}>
            <Text style={[S.chipTxt, active && S.chipActiveTxt]}>{label}</Text>
        </TouchableOpacity>
    );
}

// ============================================================
//  STYLES
// ============================================================
const S = StyleSheet.create({
    /* root */
    container: { flex: 1, backgroundColor: C.bg },

    /* month bar */
    monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
    navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, justifyContent: "center", alignItems: "center" },
    monthTitle: { fontSize: 18, fontWeight: "700", color: C.text },

    /* summary */
    summaryRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12 },
    summaryCard: { flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderRadius: 14, padding: 16, alignItems: "center" },
    summaryVal: { fontSize: 24, fontWeight: "700", color: C.green, marginTop: 6 },
    summaryLbl: { fontSize: 12, color: C.textMuted, marginTop: 4, textAlign: "center" },

    /* list */
    scroll: { flex: 1, marginTop: 16, paddingHorizontal: 20 },
    txCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 14, padding: 14, marginBottom: 10 },
    txEmoji: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.purpleDim, justifyContent: "center", alignItems: "center", marginRight: 14 },
    txEmojiText: { fontSize: 22 },
    txBody: { flex: 1 },
    txRow1: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    txName: { fontSize: 15, fontWeight: "600", color: C.text },
    txAmt: { fontSize: 16, fontWeight: "700", color: C.green },
    txRow2: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
    txSub: { fontSize: 13, color: C.textMuted },
    txDate: { fontSize: 12, color: C.chipBorder },

    /* empty */
    emptyWrap: { alignItems: "center", marginTop: 80 },
    emptyTitle: { color: C.textMuted, fontSize: 16, marginTop: 14, fontWeight: "600" },
    emptyHint: { color: C.chipBorder, fontSize: 13, marginTop: 4 },

    /* FAB */
    fab: { position: "absolute", bottom: 80, right: 28, width: 62, height: 62, borderRadius: 31, backgroundColor: C.purple, justifyContent: "center", alignItems: "center", shadowColor: C.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 8 },

    /* overlay + sheet */
    overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.overlay, justifyContent: "flex-end", zIndex: 1000, elevation: 1000 },
    sheet: { backgroundColor: C.modal, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "85%", paddingTop: 8, paddingBottom: 30 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.cardBorder, alignSelf: "center", marginBottom: 12 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 10 },
    sheetTitle: { fontSize: 18, fontWeight: "700", color: C.text },
    sheetBody: { paddingHorizontal: 20 },

    /* form */
    lbl: { marginTop: 14, marginBottom: 6, fontWeight: "600", fontSize: 12, color: C.textLabel, textTransform: "uppercase", letterSpacing: 0.8 },
    req: { color: C.error },
    input: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 10, padding: 13, fontSize: 16, backgroundColor: C.inputBg, color: C.text },
    inputErr: { borderColor: C.error, backgroundColor: C.errorBg },
    errText: { color: C.error, fontSize: 12, marginTop: 4 },
    select: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 10, padding: 13, backgroundColor: C.inputBg },
    selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    selText: { color: C.text, fontSize: 15, flex: 1 },
    placeholder: { color: C.textMuted },

    /* chips */
    chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
    chip: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: C.chipBorder, marginRight: 8, marginBottom: 8, backgroundColor: C.card },
    chipTxt: { color: C.textMuted, fontSize: 13, fontWeight: "500" },
    chipActive: { backgroundColor: C.purple, borderColor: C.purple },
    chipActiveTxt: { color: "#fff", fontWeight: "600" },
    chipDim: { opacity: 0.4 },

    /* total row */
    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.divider },
    totalLbl: { fontSize: 14, color: C.textMuted },
    totalBreak: { fontSize: 12, color: C.chipBorder, marginTop: 2 },
    totalVal: { fontSize: 26, fontWeight: "700", color: C.green },

    /* save / delete btns */
    saveBtn: { marginTop: 18, backgroundColor: C.purple, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    saveBtnDim: { opacity: 0.55 },
    saveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
    deleteBtn: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.error, borderRadius: 12, paddingVertical: 11, gap: 6 },
    deleteBtnTxt: { color: C.error, fontSize: 15, fontWeight: "600" },

    /* member picker */
    pickerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.divider },
    pickerRowActive: { backgroundColor: "rgba(46,204,113,0.08)", borderRadius: 8, paddingHorizontal: 6 },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.cardBorder, justifyContent: "center", alignItems: "center", marginRight: 12 },
    avatarActive: { borderColor: C.green, backgroundColor: "rgba(46,204,113,0.15)" },
    avatarTxt: { color: C.text, fontWeight: "700", fontSize: 16 },
    pickerName: { flex: 1, color: C.text, fontSize: 15 },
    pickerNameActive: { color: C.green, fontWeight: "600" },
});