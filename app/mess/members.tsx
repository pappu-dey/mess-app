import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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
  const [submitting, setSubmitting] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [emailOrUid, setEmailOrUid] = useState("");
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

      if (data?.role !== "manager") {
        Alert.alert("Access denied", "Only managers can manage members");
        router.back();
        return;
      }

      setMessId(data.messId);
      setCurrentUserRole(data.role);
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
      const snap = await getDocs(collection(db, "messes", mid, "members"));
      const membersList = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
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

  const addMember = async () => {
    const trimmedInput = emailOrUid.trim();

    if (!trimmedInput) {
      Alert.alert("Error", "Please enter an email or user ID");
      return;
    }

    setSubmitting(true);

    try {
      let userDoc;

      if (trimmedInput.includes("@")) {
        const q = query(
          collection(db, "users"),
          where("email", "==", trimmedInput),
        );
        const s = await getDocs(q);
        userDoc = s.docs[0];
      } else {
        const s = await getDoc(doc(db, "users", trimmedInput));
        if (s.exists()) userDoc = s;
      }

      if (!userDoc) {
        Alert.alert("User not found", "No user exists with this email or ID");
        return;
      }

      const memberRef = doc(db, "messes", messId, "members", userDoc.id);
      if ((await getDoc(memberRef)).exists()) {
        Alert.alert("Already a member", "This user is already in your mess");
        return;
      }

      const userData = userDoc.data();

      // New members are always added as "member" role
      await setDoc(memberRef, {
        name: userData.name,
        email: userData.email,
        role: "member",
        joinedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", userDoc.id), {
        messId,
        role: "member",
      });

      await updateDoc(doc(db, "messes", messId), {
        memberCount: increment(1),
      });

      setShowAddModal(false);
      setEmailOrUid("");
      await fetchMembers(messId);

      Alert.alert("Success", `${userData.name} has been added as a member`);
    } catch (error) {
      console.error("Add member error:", error);
      Alert.alert("Error", "Failed to add member. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const transferManagership = (member: Member) => {
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
              await updateDoc(doc(db, "messes", messId, "members", member.id), {
                role: "manager",
              });
              await updateDoc(doc(db, "users", member.id), {
                role: "manager",
              });

              // Demote current manager to member
              await updateDoc(
                doc(db, "messes", messId, "members", currentUser.uid),
                {
                  role: "member",
                },
              );
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
    if (member.role === "manager") {
      Alert.alert(
        "Cannot Remove",
        "You cannot remove the manager. Transfer managership first if needed.",
      );
      return;
    }

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${member.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "messes", messId, "members", member.id));
              await updateDoc(doc(db, "users", member.id), {
                messId: null,
                role: null,
              });
              await updateDoc(doc(db, "messes", messId), {
                memberCount: increment(-1),
              });
              await fetchMembers(messId);
              Alert.alert("Success", `${member.name} has been removed`);
            } catch (error) {
              console.error("Delete member error:", error);
              Alert.alert("Error", "Failed to remove member");
            }
          },
        },
      ],
    );
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEmailOrUid("");
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
      <Text style={styles.title}>Members</Text>
      <Text style={styles.subTitle}>Total Members: {members.length}</Text>

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
              Tap the + button to add your first member
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
                        <Text style={styles.managerBadgeText}>👑 Manager</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.memberEmail}>{item.email}</Text>
                </View>

                <View style={styles.actionButtons}>
                  {!isManager && currentUserRole === "manager" && (
                    <TouchableOpacity
                      onPress={() => transferManagership(item)}
                      style={styles.transferButton}
                    >
                      <Text style={styles.transferIcon}>👑</Text>
                    </TouchableOpacity>
                  )}
                  {!isManager && (
                    <TouchableOpacity
                      onPress={() => deleteMember(item)}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteIcon}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={showAddModal}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeModal}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add New Member</Text>
            <Text style={styles.modalSubtitle}>
              New members will be added as regular members
            </Text>

            <TextInput
              placeholder="Email or User ID"
              placeholderTextColor="#94A3B8"
              value={emailOrUid}
              onChangeText={setEmailOrUid}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
            />

            <TouchableOpacity
              style={[styles.addBtn, submitting && styles.addBtnDisabled]}
              onPress={addMember}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.addBtnText}>Add Member</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={closeModal}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0F172A" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#94A3B8", marginTop: 12, fontSize: 14 },

  title: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 30,
    marginBottom: 8,
  },
  subTitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 16,
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
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  managerBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
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
    padding: 8,
    backgroundColor: "#F59E0B",
    borderRadius: 6,
  },
  transferIcon: { fontSize: 18 },
  deleteButton: { padding: 8 },
  deleteIcon: { fontSize: 20 },

  fab: {
    position: "absolute",
    bottom: 64,
    right: 24,
    backgroundColor: "#6366F1",
    width: 70,
    height: 70,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: { color: "#FFF", fontSize: 32, fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalCard: {
    backgroundColor: "#1E293B",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 16,
  },

  input: {
    backgroundColor: "#0F172A",
    color: "#FFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#334155",
  },
  addBtn: {
    backgroundColor: "#10B981",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  addBtnDisabled: {
    backgroundColor: "#065F46",
    opacity: 0.6,
  },
  addBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },

  cancelBtn: {
    marginTop: 12,
    alignItems: "center",
    padding: 12,
  },
  cancelText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },

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
