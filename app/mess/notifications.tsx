import { format } from "date-fns";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
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
  type: "expense" | "deposit" | "adjustment";
  date: string;
  createdAt: any;
  memberName?: string;
  isCommon?: boolean;
};

/* ---------- component ---------- */
export default function Notifications() {
  const { activeMessId } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const monthId = useMemo(() => format(new Date(), "yyyy-MM"), []);

  if (!activeMessId) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No active mess</Text>
      </View>
    );
  }

  /* ---------- Firestore ref ---------- */
  const entriesRef = collection(
    db,
    "messes",
    activeMessId,
    "managerMoney",
    monthId,
    "entries",
  );

  /* ---------- Fetch notifications ---------- */
  useEffect(() => {
    const q = query(entriesRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list: NotificationItem[] = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          amount: data.amount,
          type: data.type,
          date: data.date,
          createdAt: data.createdAt,
          memberName: data.memberName,
          isCommon: data.isCommon,
        };
      });

      setNotifications(list);
      setLoading(false);
    });

    return unsub;
  }, [activeMessId, monthId]);

  /* ---------- Helpers ---------- */
  const getTitle = (item: NotificationItem) => {
    if (item.type === "expense") {
      return item.isCommon
        ? "Common expense added"
        : "Meal-based expense added";
    }
    if (item.type === "deposit") {
      return `${item.memberName ?? "Member"} deposited money`;
    }
    return "Balance adjusted";
  };

  const getColor = (type: NotificationItem["type"]) => {
    if (type === "expense") return "#EF4444";
    if (type === "deposit") return "#22C55E";
    return "#F59E0B";
  };

  /* ---------- Render ---------- */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Notifications</Text>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No notifications yet</Text>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>{getTitle(item)}</Text>
              <Text style={[styles.amount, { color: getColor(item.type) }]}>
                ₹{item.amount}
              </Text>
            </View>

            <Text style={styles.date}>{item.date}</Text>

            {item.createdAt && (
              <Text style={styles.time}>
                {format(item.createdAt.toDate(), "dd MMM yyyy • hh:mm a")}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  header: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFF",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#1E293B",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E5E7EB",
  },
  amount: {
    fontSize: 16,
    fontWeight: "800",
  },
  date: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 6,
  },
  time: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  empty: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 40,
    fontSize: 16,
  },
});
