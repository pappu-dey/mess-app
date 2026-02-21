import { db } from "@/firebase";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useAuth } from "../../context/AuthContext";

// ==================== SVG ICONS ====================
const PlusIcon = ({ size = 24, color = "#FFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 5v14M5 12h14"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
        />
    </Svg>
);

const CheckIcon = ({ size = 24, color = "#FFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M5 13l4 4L19 7"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const CloseIcon = ({ size = 24, color = "#FFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M18 6L6 18M6 6l12 12"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
        />
    </Svg>
);

const EditIcon = ({ size = 24, color = "#FFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const TrashIcon = ({ size = 24, color = "#FFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const ClipboardIcon = ({ size = 24, color = "#FFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect
            x={8}
            y={2}
            width={8}
            height={4}
            rx={1}
            stroke={color}
            strokeWidth={2}
        />
        <Path
            d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
        />
    </Svg>
);

/**
 * ASSUMPTIONS
 * - messId, monthId from route params or context
 * - role from auth context
 */

type RequestStatus = "pending" | "approved" | "rejected";

interface Item {
    itemName: string;
    quantity: string;
    unit: string;
    price: number;
}

interface ExpenseRequest {
    id: string;
    requestedBy: string;
    requestedByName: string;
    expenseDate: string;
    items: Item[];
    totalPrice: number;
    isCommon: boolean;
    status: RequestStatus;
    createdAt: any;
    approvedAt?: any;
}

export default function ExpenseRequests() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { user, activeMessId } = useAuth();
    const role = user?.role || "member";

    // Initialize month from params or default to current
    const getInitialMonth = () => {
        if (params.monthId && typeof params.monthId === "string") {
            return params.monthId;
        }
        return format(new Date(), "yyyy-MM");
    };

    const [monthId, setMonthId] = useState(getInitialMonth());
    const rawMessId = params.messId;
    const messId = (typeof rawMessId === "string" ? rawMessId : rawMessId?.[0]) || activeMessId;

    const [requests, setRequests] = useState<ExpenseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Member form state
    const [expenseDate, setExpenseDate] = useState(getTodayDate());
    const [items, setItems] = useState<Item[]>([]);
    const [itemName, setItemName] = useState("");
    const [qty, setQty] = useState("");
    const [unit, setUnit] = useState("kg");
    const [price, setPrice] = useState("");
    const [isCommon, setIsCommon] = useState(false);

    // Manager edit state
    const [editingRequest, setEditingRequest] = useState<ExpenseRequest | null>(null);
    const [editAmount, setEditAmount] = useState("");
    const [editIsCommon, setEditIsCommon] = useState(false);

    const totalPrice = items.reduce((s, i) => s + Number(i.price), 0);

    // Filter requests by status
    const pendingRequests = requests.filter((r) => r.status === "pending");
    const approvedRequests = requests.filter((r) => r.status === "approved");
    const rejectedRequests = requests.filter((r) => r.status === "rejected");

    // Calculate totals
    const totalPending = pendingRequests.reduce((sum, r) => sum + r.totalPrice, 0);
    const totalApproved = approvedRequests.reduce((sum, r) => sum + r.totalPrice, 0);

    // Early return for no mess
    if (!messId) {
        return (
            <View style={[styles.container, styles.center]}>
                <Text style={styles.errorText}>No active mess selected</Text>
                <Text style={styles.errorSubtext}>Please select or join a mess first</Text>
            </View>
        );
    }

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

    // 🔁 Listen to requests
    useEffect(() => {
        const q = query(
            collection(db, "messes", messId, "managerMoney", monthId, "expense_requests"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(
            q,
            (snap) => {
                setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseRequest)));
                setLoading(false);
            },
            (error) => {
                const code = error?.code || '';
                const msg = (error?.message || '').toLowerCase();
                if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
                    console.log("Expense requests listener detached (user signed out)");
                    return;
                }
                console.error("Error fetching requests:", error);
                Alert.alert("Error", "Failed to load expense requests");
                setLoading(false);
            }
        );

        return unsubscribe;
    }, [messId, monthId]);

    // ➕ Add item to list
    const addItem = () => {
        if (!itemName.trim()) {
            Alert.alert("Error", "Please enter item name");
            return;
        }
        if (!price || Number(price) <= 0) {
            Alert.alert("Error", "Please enter a valid price");
            return;
        }

        setItems([
            ...items,
            {
                itemName: itemName.trim(),
                quantity: qty.trim(),
                unit: unit.trim(),
                price: Number(price),
            },
        ]);

        // Clear form
        setItemName("");
        setQty("");
        setPrice("");
    };

    // 🗑️ Remove item from list
    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    // 📤 Submit request (MEMBER ONLY)
    const submitRequest = async () => {
        if (!user) {
            Alert.alert("Error", "You must be logged in to submit a request");
            return;
        }

        if (items.length === 0) {
            Alert.alert("Error", "Please add at least one item");
            return;
        }

        if (!expenseDate) {
            Alert.alert("Error", "Please select expense date");
            return;
        }

        setSubmitting(true);

        try {
            await addDoc(
                collection(db, "messes", messId, "managerMoney", monthId, "expense_requests"),
                {
                    requestedBy: user.uid,
                    requestedByName: user.name,
                    expenseDate,
                    items,
                    totalPrice,
                    isCommon,
                    status: "pending",
                    createdAt: serverTimestamp(),
                }
            );

            Alert.alert("Success", "Expense request submitted successfully");

            // Clear form
            setItems([]);
            setIsCommon(false);
            setExpenseDate(getTodayDate());
        } catch (error) {
            console.error("Error submitting request:", error);
            Alert.alert("Error", "Failed to submit request. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    // ✏️ Start editing request (MANAGER)
    const startEdit = (req: ExpenseRequest) => {
        setEditingRequest(req);
        setEditAmount(req.totalPrice.toString());
        setEditIsCommon(req.isCommon);
    };

    // ❌ Cancel editing
    const cancelEdit = () => {
        setEditingRequest(null);
        setEditAmount("");
        setEditIsCommon(false);
    };

    // ✅ Approve request (MANAGER)
    const approveRequest = async (req: ExpenseRequest) => {
        const finalAmount = editingRequest?.id === req.id
            ? Number(editAmount)
            : req.totalPrice;

        const finalIsCommon = editingRequest?.id === req.id
            ? editIsCommon
            : req.isCommon;

        if (editingRequest && Number(editAmount) <= 0) {
            Alert.alert("Error", "Amount must be greater than 0");
            return;
        }

        Alert.alert(
            "Confirm Approval",
            `Approve expense of ₹${finalAmount}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Approve",
                    onPress: async () => {
                        try {
                            const reqRef = doc(
                                db,
                                "messes",
                                messId,
                                "managerMoney",
                                monthId,
                                "expense_requests",
                                req.id
                            );

                            await runTransaction(db, async (tx) => {
                                const snap = await tx.get(reqRef);
                                if (!snap.exists()) {
                                    throw new Error("Request not found");
                                }
                                if (snap.data().status !== "pending") {
                                    throw new Error("Request is not pending");
                                }

                                const purpose = req.items.map((i) => i.itemName).join(", ");

                                const entryRef = doc(
                                    collection(db, "messes", messId, "managerMoney", monthId, "entries")
                                );

                                // Create entry in accounting
                                tx.set(entryRef, {
                                    amount: finalAmount,
                                    purpose,
                                    isCommon: finalIsCommon,
                                    type: "expense",
                                    date: formatDate(req.expenseDate),
                                    createdAt: serverTimestamp(),
                                    edited: editingRequest?.id === req.id, // Mark as edited if manager changed values
                                });

                                // Update request status
                                tx.update(reqRef, {
                                    status: "approved",
                                    approvedAt: serverTimestamp(),
                                });
                            });

                            Alert.alert("Success", "Expense approved and added to accounting");
                            cancelEdit();
                        } catch (error) {
                            console.error("Error approving request:", error);
                            Alert.alert("Error", "Failed to approve request");
                        }
                    },
                },
            ]
        );
    };

    // ❌ Reject request (MANAGER)
    const rejectRequest = async (id: string) => {
        Alert.alert(
            "Confirm Rejection",
            "Are you sure you want to reject this request?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Reject",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await runTransaction(db, async (tx) => {
                                const reqRef = doc(
                                    db,
                                    "messes",
                                    messId,
                                    "managerMoney",
                                    monthId,
                                    "expense_requests",
                                    id
                                );
                                tx.update(reqRef, { status: "rejected" });
                            });

                            Alert.alert("Success", "Request rejected");
                        } catch (error) {
                            console.error("Error rejecting request:", error);
                            Alert.alert("Error", "Failed to reject request");
                        }
                    },
                },
            ]
        );
    };

    // Render member form
    const renderMemberForm = () => (
        <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Create New Expense Request</Text>

            <Text style={styles.label}>Expense Date</Text>
            <TextInput
                style={styles.input}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="YYYY-MM-DD"
            />

            <View style={styles.divider} />

            <Text style={styles.label}>Add Items</Text>

            <TextInput
                style={styles.input}
                placeholder="Item name (e.g., Fish, Rice)"
                value={itemName}
                onChangeText={setItemName}
            />

            <View style={styles.row}>
                <TextInput
                    style={[styles.input, styles.flex1]}
                    placeholder="Qty (optional)"
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="numeric"
                />
                <TextInput
                    style={[styles.input, styles.flex1, styles.ml8]}
                    placeholder="Unit (kg, gram)"
                    value={unit}
                    onChangeText={setUnit}
                />
            </View>

            <TextInput
                style={styles.input}
                placeholder="Price (₹)"
                value={price}
                keyboardType="numeric"
                onChangeText={setPrice}
            />

            <TouchableOpacity style={styles.addButton} onPress={addItem}>
                <PlusIcon size={20} color="#FFF" />
                <Text style={styles.addButtonText}>Add Item</Text>
            </TouchableOpacity>

            {/* Items List */}
            {items.length > 0 && (
                <View style={styles.itemsList}>
                    <Text style={styles.itemsTitle}>Items ({items.length})</Text>
                    {items.map((item, index) => (
                        <View key={index} style={styles.itemRow}>
                            <View style={styles.flex1}>
                                <Text style={styles.itemName}>{item.itemName}</Text>
                                <Text style={styles.itemDetails}>
                                    {item.quantity} {item.unit} • ₹{item.price}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => removeItem(index)}>
                                <CloseIcon size={20} color="#EF4444" />
                            </TouchableOpacity>
                        </View>
                    ))}
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total Amount:</Text>
                        <Text style={styles.totalAmount}>₹{totalPrice}</Text>
                    </View>
                </View>
            )}

            <View style={styles.switchRow}>
                <Text style={styles.label}>Common Expense</Text>
                <Switch value={isCommon} onValueChange={setIsCommon} />
            </View>
            <Text style={styles.helpText}>
                {isCommon
                    ? "This expense will be shared equally among all members"
                    : "This expense will be charged to you only"}
            </Text>

            <TouchableOpacity
                style={[styles.submitButton, submitting && styles.disabledButton]}
                onPress={submitRequest}
                disabled={submitting}
            >
                {submitting ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.submitButtonText}>Submit Request</Text>
                )}
            </TouchableOpacity>
        </View>
    );

    // Render request card
    const renderRequestCard = ({ item }: { item: ExpenseRequest }) => {
        const isEditing = editingRequest?.id === item.id;
        const isPending = item.status === "pending";
        const statusColor =
            item.status === "approved" ? "#10b981" :
                item.status === "rejected" ? "#ef4444" :
                    "#f59e0b";

        return (
            <View style={styles.requestCard}>
                <View style={styles.requestHeader}>
                    <View style={styles.flex1}>
                        <Text style={styles.requestedBy}>{item.requestedByName}</Text>
                        <Text style={styles.requestDate}>
                            {new Date(item.expenseDate).toLocaleDateString("en-IN")}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                    </View>
                </View>

                <View style={styles.itemsSection}>
                    {item.items.map((i, idx) => (
                        <Text key={idx} style={styles.itemText}>
                            • {i.itemName} {i.quantity && `(${i.quantity} ${i.unit})`} - ₹{i.price}
                        </Text>
                    ))}
                </View>

                {isEditing ? (
                    <View style={styles.editSection}>
                        <Text style={styles.label}>Edit Amount</Text>
                        <TextInput
                            style={styles.input}
                            value={editAmount}
                            onChangeText={setEditAmount}
                            keyboardType="numeric"
                        />
                        <View style={styles.switchRow}>
                            <Text style={styles.label}>Common Expense</Text>
                            <Switch value={editIsCommon} onValueChange={setEditIsCommon} />
                        </View>
                    </View>
                ) : (
                    <View style={styles.requestFooter}>
                        <Text style={styles.totalText}>₹{item.totalPrice}</Text>
                        <Text style={styles.commonText}>
                            {item.isCommon ? "Common" : "NotCommon"}
                        </Text>
                    </View>
                )}

                {role === "manager" && isPending && (
                    <View style={styles.managerActions}>
                        {isEditing ? (
                            <>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.approveButton]}
                                    onPress={() => approveRequest(item)}
                                >
                                    <CheckIcon size={18} color="#FFF" />
                                    <Text style={styles.actionButtonText}>Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.cancelButton]}
                                    onPress={cancelEdit}
                                >
                                    <CloseIcon size={18} color="#FFF" />
                                    <Text style={styles.actionButtonText}>Cancel</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.approveButton]}
                                    onPress={() => approveRequest(item)}
                                >
                                    <CheckIcon size={18} color="#FFF" />
                                    <Text style={styles.actionButtonText}>Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.editButton]}
                                    onPress={() => startEdit(item)}
                                >
                                    <EditIcon size={16} color="#FFF" />
                                    <Text style={styles.actionButtonText}>Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.rejectButton]}
                                    onPress={() => rejectRequest(item.id)}
                                >
                                    <CloseIcon size={18} color="#FFF" />
                                    <Text style={styles.actionButtonText}>Reject</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.loadingText}>Loading expense requests...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            {/* Month Selector Header */}
            <View style={styles.monthSelectorContainer}>
                <TouchableOpacity
                    style={styles.monthNavButton}
                    onPress={() => handleMonthChange("prev")}
                >
                    <Text style={styles.monthNavButtonText}>‹</Text>
                </TouchableOpacity>

                <View style={styles.monthDisplayContainer}>
                    <Text style={styles.title}>Expense Requests</Text>
                    <Text style={styles.subtitle}>{getMonthName()}</Text>
                </View>

                <TouchableOpacity
                    style={styles.monthNavButton}
                    onPress={() => handleMonthChange("next")}
                >
                    <Text style={styles.monthNavButtonText}>›</Text>
                </TouchableOpacity>
            </View>

            {/* Statistics Cards */}
            <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                    <ClipboardIcon size={24} color="#F59E0B" />
                    <Text style={styles.statValue}>{pendingRequests.length}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                    <Text style={styles.statAmount}>₹{totalPending.toLocaleString("en-IN")}</Text>
                </View>

                <View style={styles.statCard}>
                    <CheckIcon size={24} color="#10B981" />
                    <Text style={styles.statValue}>{approvedRequests.length}</Text>
                    <Text style={styles.statLabel}>Approved</Text>
                    <Text style={styles.statAmount}>₹{totalApproved.toLocaleString("en-IN")}</Text>
                </View>

                <View style={styles.statCard}>
                    <CloseIcon size={24} color="#EF4444" />
                    <Text style={styles.statValue}>{rejectedRequests.length}</Text>
                    <Text style={styles.statLabel}>Rejected</Text>
                </View>
            </View>

            {/* MEMBER FORM */}
            {role === "member" && renderMemberForm()}

            {/* MANAGER VIEW - PENDING */}
            {role === "manager" && pendingRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Pending Requests ({pendingRequests.length})
                    </Text>
                    {pendingRequests.map((req) => (
                        <View key={req.id}>{renderRequestCard({ item: req })}</View>
                    ))}
                </View>
            )}

            {/* APPROVED REQUESTS */}
            {approvedRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Approved ({approvedRequests.length})
                    </Text>
                    {approvedRequests.map((req) => (
                        <View key={req.id}>{renderRequestCard({ item: req })}</View>
                    ))}
                </View>
            )}

            {/* REJECTED REQUESTS */}
            {rejectedRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Rejected ({rejectedRequests.length})
                    </Text>
                    {rejectedRequests.map((req) => (
                        <View key={req.id}>{renderRequestCard({ item: req })}</View>
                    ))}
                </View>
            )}

            {requests.length === 0 && (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No expense requests yet</Text>
                </View>
            )}
        </ScrollView>
    );
}

// Helper function to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split("T")[0];
}

// Format date for entry
function formatDate(d: string): string {
    return new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0F172A",
        padding: 16,
    },
    centerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0F172A",
    },
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
    title: {
        fontSize: 18,
        fontWeight: "800",
        color: "#FFF",
        marginBottom: 4,
        marginTop: 20,
    },
    subtitle: {
        fontSize: 15,
        color: "#94A3B8",
    },
    monthSelectorContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        marginTop: 20,
        marginBottom: 20,
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
    statsContainer: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: "#1E293B",
        borderRadius: 12,
        padding: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#334155",
    },
    statValue: {
        fontSize: 24,
        fontWeight: "800",
        color: "#FFF",
        marginTop: 8,
    },
    statLabel: {
        fontSize: 11,
        color: "#94A3B8",
        fontWeight: "600",
        marginTop: 2,
    },
    statAmount: {
        fontSize: 12,
        color: "#E2E8F0",
        fontWeight: "600",
        marginTop: 4,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 12,
        color: "#E2E8F0",
    },
    formCard: {
        backgroundColor: "#1E293B",
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: "#334155",
    },
    requestCard: {
        backgroundColor: "#1E293B",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#334155",
    },
    label: {
        fontSize: 13,
        fontWeight: "600",
        color: "#94A3B8",
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    input: {
        borderWidth: 1,
        borderColor: "#334155",
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 12,
        backgroundColor: "#0F172A",
        color: "#FFF",
        fontWeight: "600",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
    },
    flex1: {
        flex: 1,
    },
    ml8: {
        marginLeft: 8,
    },
    divider: {
        height: 1,
        backgroundColor: "#334155",
        marginVertical: 16,
    },
    addButton: {
        backgroundColor: "#6366F1",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
    },
    addButtonText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "700",
    },
    itemsList: {
        marginTop: 16,
        padding: 12,
        backgroundColor: "#0F172A",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#334155",
    },
    itemsTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#E2E8F0",
        marginBottom: 8,
    },
    itemRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#334155",
    },
    itemName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFF",
    },
    itemDetails: {
        fontSize: 14,
        color: "#94A3B8",
        marginTop: 2,
    },
    totalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 2,
        borderTopColor: "#334155",
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: "600",
        color: "#94A3B8",
    },
    totalAmount: {
        fontSize: 20,
        fontWeight: "800",
        color: "#6366F1",
    },
    switchRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 16,
        backgroundColor: "#0F172A",
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#334155",
    },
    helpText: {
        fontSize: 12,
        color: "#64748B",
        marginTop: 8,
        marginBottom: 16,
    },
    submitButton: {
        backgroundColor: "#10B981",
        padding: 16,
        borderRadius: 8,
        alignItems: "center",
    },
    submitButtonText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "700",
    },
    disabledButton: {
        backgroundColor: "#334155",
        opacity: 0.6,
    },
    requestHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    requestedBy: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFF",
    },
    requestDate: {
        fontSize: 13,
        color: "#94A3B8",
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: "flex-start",
    },
    statusText: {
        color: "#FFF",
        fontSize: 11,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    itemsSection: {
        marginBottom: 12,
    },
    itemText: {
        fontSize: 14,
        color: "#E2E8F0",
        marginBottom: 4,
        lineHeight: 20,
    },
    requestFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "#334155",
    },
    totalText: {
        fontSize: 22,
        fontWeight: "800",
        color: "#EF4444",
    },
    commonText: {
        fontSize: 13,
        color: "#3B82F6",
        fontWeight: "700",
        textTransform: "uppercase",
    },
    editSection: {
        marginTop: 12,
        padding: 12,
        backgroundColor: "#451A03",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#78350F",
    },
    managerActions: {
        flexDirection: "row",
        marginTop: 12,
        gap: 8,
    },
    actionButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
    },
    actionButtonText: {
        color: "#FFF",
        fontSize: 14,
        fontWeight: "700",
    },
    approveButton: {
        backgroundColor: "#10B981",
    },
    editButton: {
        backgroundColor: "#6366F1",
    },
    rejectButton: {
        backgroundColor: "#EF4444",
    },
    cancelButton: {
        backgroundColor: "#475569",
    },
    emptyState: {
        padding: 40,
        alignItems: "center",
    },
    emptyText: {
        fontSize: 16,
        color: "#64748B",
        textAlign: "center",
    },
});