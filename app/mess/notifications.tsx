import { format } from "date-fns";
import { collection, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  BellOff,
  Clock,
  DollarSign,
  Edit3,
  Home,
  Inbox,
  UserPlus,
  UtensilsCrossed,
  Wallet
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/firebaseConfig";

/* ---------- types ---------- */
type NotificationItem = {
  id: string;
  amount: number;
  type: "expense" | "deposit" | "adjustment" | "member_joined";
  date: string;
  createdAt: any;
  updatedAt?: any;
  memberName?: string;
  memberId?: string;
  isCommon?: boolean;
  description?: string;
  item?: string;
  purpose?: string;
  isEdited?: boolean;
};

/* ---------- component ---------- */
export default function Notifications() {
  const { activeMessId } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const monthId = useMemo(() => format(new Date(), "yyyy-MM"), []);

  useEffect(() => {
    if (!activeMessId) {
      setLoading(false);
      return;
    }

    const unsub = fetchNotifications();
    return () => {
      if (unsub) unsub();
    };
  }, [activeMessId, monthId]);

  const fetchNotifications = () => {
    if (!activeMessId) return;

    const entriesRef = collection(
      db,
      "messes",
      activeMessId,
      "managerMoney",
      monthId,
      "entries",
    );

    const membersRef = collection(db, "messes", activeMessId, "members");

    const q = query(entriesRef, orderBy("createdAt", "desc"));

    // Listen to transactions
    const unsubTransactions = onSnapshot(
      q,
      async (snap) => {
        const transactionList: NotificationItem[] = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            amount: data.amount || 0,
            type: data.type || "adjustment",
            date: data.date || "",
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            memberName: data.memberName,
            memberId: data.memberId,
            isCommon: data.isCommon,
            description: data.description,
            item: data.item,
            purpose: data.purpose,
            isEdited: data.updatedAt ? true : false,
          };
        });

        // Fetch member joins
        const membersSnap = await getDocs(membersRef);
        const memberJoinList: NotificationItem[] = [];

        membersSnap.forEach((doc) => {
          const data = doc.data();
          if (data.joinedAt) {
            memberJoinList.push({
              id: `member_${doc.id}`,
              amount: 0,
              type: "member_joined",
              date: "",
              createdAt: data.joinedAt,
              memberName: data.name,
              memberId: doc.id,
            });
          }
        });

        // Combine and sort all notifications
        const allNotifications = [...transactionList, ...memberJoinList].sort(
          (a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
          }
        );

        setNotifications(allNotifications);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        const code = error?.code || '';
        const msg = (error?.message || '').toLowerCase();
        if (code === 'permission-denied' || msg.includes('missing or insufficient permissions')) {
          console.log("Notifications listener detached (user signed out)");
          return;
        }
        console.error("Error fetching notifications:", error);
        setLoading(false);
        setRefreshing(false);
      },
    );

    return unsubTransactions;
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  /* ---------- Helpers ---------- */
  const getTitle = (item: NotificationItem) => {
    if (item.type === "expense") {
      const expenseType = item.isCommon ? "Common Expense" : "Meal Expense";
      const detail = item.description || item.item || item.purpose || "";
      return detail ? `${expenseType}: ${detail}` : expenseType;
    }
    if (item.type === "deposit") {
      return `${item.memberName || "Member"} made a deposit`;
    }
    if (item.type === "member_joined") {
      return `${item.memberName || "New member"} joined the mess`;
    }
    return "Balance Adjustment";
  };

  const getDescription = (item: NotificationItem) => {
    const parts: string[] = [];

    if (item.type === "expense") {
      if (item.isCommon) {
        parts.push("Common expense shared by all members");
      } else {
        parts.push("Meal-based expense");
      }

      if (item.description || item.item || item.purpose) {
        const detail = item.description || item.item || item.purpose || "";
        if (!getTitle(item).includes(detail)) {
          parts.push(`• ${detail}`);
        }
      }
    } else if (item.type === "deposit") {
      parts.push(`Deposited by ${item.memberName || "Unknown member"}`);
      if (item.purpose) {
        parts.push(`• ${item.purpose}`);
      }
    } else if (item.type === "member_joined") {
      parts.push("Welcome to the mess family! 🎉");
    }

    return parts.join("\n");
  };

  const getIcon = (type: NotificationItem["type"], isCommon?: boolean) => {
    if (type === "expense") {
      return isCommon ? Home : UtensilsCrossed;
    }
    if (type === "deposit") {
      return Wallet;
    }
    if (type === "member_joined") {
      return UserPlus;
    }
    return DollarSign;
  };

  const getColor = (type: NotificationItem["type"]) => {
    if (type === "expense") return "#EF4444";
    if (type === "deposit") return "#10B981";
    if (type === "member_joined") return "#6366F1";
    return "#F59E0B";
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return "";
    try {
      return format(timestamp.toDate(), "dd MMM yyyy • hh:mm a");
    } catch {
      return "";
    }
  };

  /* ---------- Render ---------- */
  if (!activeMessId) {
    return (
      <View style={styles.center}>
        <Inbox size={64} color="#64748B" strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>No Active Mess</Text>
        <Text style={styles.emptySubtext}>
          Please select or create a mess to view notifications
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Notifications</Text>
        <Text style={styles.subHeader}>
          {notifications.length}{" "}
          {notifications.length === 1 ? "entry" : "entries"} this month
        </Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
            colors={["#6366F1"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <BellOff size={64} color="#64748B" strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySubtext}>
              Transactions will appear here when members make deposits or
              expenses
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const IconComponent = getIcon(item.type, item.isCommon);
          const iconColor = getColor(item.type);
          const showAmount = item.type !== "member_joined";

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${iconColor}20` },
                  ]}
                >
                  <IconComponent size={24} color={iconColor} strokeWidth={2} />
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>
                      {getTitle(item)}
                    </Text>
                    {item.isEdited && (
                      <View style={styles.editedBadge}>
                        <Text style={styles.editedText}>EDITED</Text>
                      </View>
                    )}
                  </View>

                  {getDescription(item) ? (
                    <Text style={styles.description} numberOfLines={3}>
                      {getDescription(item)}
                    </Text>
                  ) : null}

                  <View style={styles.metaRow}>
                    {item.createdAt && (
                      <View style={styles.timeContainer}>
                        <Clock size={12} color="#64748B" strokeWidth={2} />
                        <Text style={styles.time}>
                          {formatTimestamp(item.createdAt)}
                        </Text>
                      </View>
                    )}
                    {showAmount && (
                      <Text style={[styles.amount, { color: iconColor }]}>
                        {item.type === "deposit" ? "+" : "-"}₹
                        {item.amount.toFixed(2)}
                      </Text>
                    )}
                  </View>

                  {item.isEdited && item.updatedAt && (
                    <View style={styles.editTimeContainer}>
                      <Edit3 size={11} color="#F59E0B" strokeWidth={2} />
                      <Text style={styles.editTime}>
                        Last edited: {formatTimestamp(item.updatedAt)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 24,
  },
  loadingText: {
    color: "#94A3B8",
    marginTop: 16,
    fontSize: 14,
  },
  headerContainer: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  header: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 14,
    color: "#94A3B8",
    fontWeight: "500",
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 20,
  },
  editedBadge: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  editedText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 13,
    color: "#94A3B8",
    marginBottom: 8,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  amount: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  time: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  editTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  editTime: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
});