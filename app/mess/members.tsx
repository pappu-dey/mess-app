import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { Crown, Eye, Trash2 } from "lucide-react-native";

import { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebase/firebaseConfig";

type Role = "member" | "manager";

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: any;
}

export default function MembersScreen() {
  const router = useRouter();

  const [messId, setMessId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<Role>("member");

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "Please log in to continue");
        router.back();
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data();

      if (!data?.messId) {
        Alert.alert("Error", "You are not part of any mess");
        router.back();
        return;
      }

      setMessId(data.messId);
      setCurrentUserRole(data.role || "member");
      await fetchMembers(data.messId);
    } catch (error) {
      console.error("Init error:", error);
      Alert.alert("Error", "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (mid: string) => {
    try {
      // Fetch all users who have this messId
      const q = query(collection(db, "users"), where("messId", "==", mid));
      const snap = await getDocs(q);

      const membersList = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        email: d.data().email,
        role: d.data().role,
        joinedAt: d.data().joinedAt || null,
      })) as Member[];

      // Sort: manager first, then current user, then by name
      const sortedMembers = membersList.sort((a, b) => {
        if (a.role === "manager") return -1;
        if (b.role === "manager") return 1;
        if (a.id === auth.currentUser?.uid) return -1;
        if (b.id === auth.currentUser?.uid) return 1;
        return a.name.localeCompare(b.name);
      });

      setMembers(sortedMembers);
    } catch (error) {
      console.error("Fetch members error:", error);
      Alert.alert("Error", "Failed to load members");
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMembers(messId);
    setRefreshing(false);
  }, [messId]);

  const transferManagership = (member: Member) => {
    if (currentUserRole !== "manager") {
      Alert.alert("Access Denied", "Only managers can transfer managership");
      return;
    }

    Alert.alert(
      "Transfer Managership",
      `Are you sure you want to transfer managership to ${member.name}? You will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              if (!currentUser) return;

              // Update new manager
              await updateDoc(doc(db, "users", member.id), {
                role: "manager",
              });

              // Demote current manager to member
              await updateDoc(doc(db, "users", currentUser.uid), {
                role: "member",
              });

              Alert.alert(
                "Success",
                `${member.name} is now the manager. You are now a member.`,
                [
                  {
                    text: "OK",
                    onPress: () => router.back(),
                  },
                ],
              );
            } catch (error) {
              console.error("Transfer managership error:", error);
              Alert.alert("Error", "Failed to transfer managership");
            }
          },
        },
      ],
    );
  };

  const deleteMember = (member: Member) => {
    if (currentUserRole !== "manager") {
      Alert.alert("Access Denied", "Only managers can remove members");
      return;
    }

    if (member.role === "manager") {
      Alert.alert(
        "Cannot Remove",
        "You cannot remove the manager. Transfer managership first if needed.",
      );
      return;
    }

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${member.name}? This will remove them from the mess.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Remove mess assignment from user
              await updateDoc(doc(db, "users", member.id), {
                messId: null,
                role: null,
              });

              // Update mess member count
              await updateDoc(doc(db, "messes", messId), {
                memberCount: increment(-1),
              });

              await fetchMembers(messId);
              Alert.alert(
                "Success",
                `${member.name} has been removed from the mess`,
              );
            } catch (error) {
              console.error("Delete member error:", error);
              Alert.alert("Error", "Failed to remove member");
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading members...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Members</Text>
          <Text style={styles.subTitle}>Total Members: {members.length}</Text>
        </View>
        {currentUserRole !== "manager" && (
          <View style={styles.viewOnlyBadge}>
            <Eye size={14} color="#6B7280" />
            <Text style={styles.viewOnlyText}>View Only</Text>
          </View>
        )}
      </View>

      <FlatList
        data={members}
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
            <Text style={styles.emptyText}>No members yet</Text>
            <Text style={styles.emptySubtext}>
              Members will appear here when they join the mess
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isCurrentUser = item.id === auth.currentUser?.uid;
          const isManager = item.role === "manager";

          return (
            <View
              style={[
                styles.memberRow,
                isCurrentUser && styles.currentUserRow,
                isManager && styles.managerRow,
              ]}
            >
              <View style={styles.rowTop}>
                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>
                      {index + 1}. {item.name}
                      {isCurrentUser && (
                        <Text style={styles.youTag}> (You)</Text>
                      )}
                    </Text>
                    {isManager && (
                      <View style={styles.managerBadge}>
                        <Crown size={14} color="#FACC15" />
                        <Text style={styles.managerBadgeText}>Manager</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.memberEmail}>{item.email}</Text>
                </View>

                {/* Only show action buttons for managers */}
                {currentUserRole === "manager" && (
                  <View style={styles.actionButtons}>
                    {!isManager && (
                      <>
                        {/* Transfer Managership */}
                        <TouchableOpacity
                          onPress={() => transferManagership(item)}
                          style={styles.transferButton}
                          activeOpacity={0.7}
                        >
                          <Crown size={18} color="#FACC15" />
                        </TouchableOpacity>

                        {/* Delete Member */}
                        <TouchableOpacity
                          onPress={() => deleteMember(item)}
                          style={styles.deleteButton}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0F172A" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#94A3B8", marginTop: 12, fontSize: 14 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 30,
    marginBottom: 16,
  },

  title: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },
  subTitle: {
    color: "#94A3B8",
    fontSize: 14,
  },

  viewOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,

    backgroundColor: "rgba(245, 158, 11, 0.15)", // soft amber
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",

    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999, // pill shape
  },

  viewOnlyText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  memberRow: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    marginBottom: 8,
    borderRadius: 8,
  },
  currentUserRow: {
    borderColor: "#6366F1",
    borderWidth: 1,
  },
  managerRow: {
    borderColor: "#F59E0B",
    borderWidth: 2,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  memberInfo: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  memberName: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  youTag: { color: "#6366F1", fontSize: 14 },
  managerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,

    backgroundColor: "rgba(245, 158, 11, 0.15)", // soft amber
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",

    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999, // pill
  },

  managerBadgeText: {
    color: "#F59E0B",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  memberEmail: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  transferButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(250, 204, 21, 0.15)",
  },

  deleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },

  transferIcon: { fontSize: 18 },
  deleteIcon: { fontSize: 20 },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
