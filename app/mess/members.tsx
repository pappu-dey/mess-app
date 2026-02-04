import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  collectionGroup,
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
import { AlertCircle, Check, Crown, Eye, Hash, Mail, Search, Trash2, User, UserPlus, X } from "lucide-react-native";

import { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useApp } from "../../context/AppContext";
import { auth, db } from "../../firebase/firebaseConfig";

type Role = "member" | "manager";
type SearchMode = "email" | "userId";
// Controls which screen the NEW_USER flow is on


interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: any;
}

interface SearchResult {
  id: string;
  name: string;
  email: string;
  alreadyInMess: boolean;
}

export default function MembersScreen() {
  const router = useRouter();
  const { user, mess, members: contextMembers, refreshData } = useApp();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Modal state ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("email");
  const [searchInput, setSearchInput] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // ── NEW_USER two-step state ──
  const [newMemberName, setNewMemberName] = useState("");
  const [nameError, setNameError] = useState("");

  // ── Animations ──
  const resultFadeIn = new Animated.Value(0);
  const resultSlideUp = new Animated.Value(12);

  useEffect(() => {
    setLoading(false);
  }, []);

  // Animate result card in
  useEffect(() => {
    if (searchResult && !searchLoading) {
      resultFadeIn.setValue(0);
      resultSlideUp.setValue(12);
      Animated.parallel([
        Animated.timing(resultFadeIn, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(resultSlideUp, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [searchResult, searchLoading]);

  // Debounced search
  useEffect(() => {
    if (!showAddModal) return;
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setSearchResult(null);
      setSearchError("");
      return;
    }
    const timer = setTimeout(() => {
      if (mess?.id) performSearch(trimmed);
    }, 600);
    return () => clearTimeout(timer);
  }, [searchInput, searchMode, showAddModal, mess?.id]);

  // Clear name error as user types
  useEffect(() => {
    if (newMemberName.trim().length >= 3) setNameError("");
  }, [newMemberName]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); }
    finally { setRefreshing(false); }
  }, [refreshData]);

  // ─── RESET ──────────────────────────────────────────────────────
  const resetModalState = () => {
    setSearchInput("");
    setSearchResult(null);
    setSearchError("");
    setSearchLoading(false);
    setAddingMember(false);
    setNewMemberName("");
    setSearchMode("email");
    setSearchFocused(false);
    setSearchFocused(false);
    setNameError("");
  };

  // ─── VALIDATION ─────────────────────────────────────────────────
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateName = (name: string): string | "" => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return ""; // silent while empty
    if (trimmed.length < 3) return "Name must be at least 3 characters.";
    if (/[0-9]/.test(trimmed)) return "Name should not contain numbers.";
    if (/[^a-zA-Z\s\-'.()]/.test(trimmed)) return "Name contains invalid characters.";
    return "";
  };

  // ─── SEARCH ─────────────────────────────────────────────────────
  const performSearch = async (input: string) => {
    if (!mess?.id) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResult(null);
    setNewMemberName("");
    setNewMemberName("");
    setNameError("");

    try {
      if (searchMode === "email") {
        const email = input.trim().toLowerCase();
        if (!validateEmail(email)) {
          if (email.length > 5 && email.includes("@")) setSearchError("Please enter a valid email address.");
          return;
        }

        const userQuery = query(collection(db, "users"), where("email", "==", email));
        const userSnap = await getDocs(userQuery);

        if (!userSnap.empty) {
          const foundUser = userSnap.docs[0];
          const userData = foundUser.data();
          if (foundUser.id === auth.currentUser?.uid) {
            setSearchError("You are already in this mess as the manager.");
            return;
          }
          setSearchResult({
            id: foundUser.id,
            name: userData.name || "Unknown",
            email: userData.email,
            alreadyInMess: contextMembers.some((m) => m.id === foundUser.id),
          });
        } else {
          // Not in app → NEW_USER path
          setSearchResult({
            id: "NEW_USER",
            name: "",
            email: email,
            alreadyInMess: contextMembers.some((m) => m.email.toLowerCase() === email),
          });
        }
      } else {
        // Search by User ID
        const docSnap = await getDoc(doc(db, "users", input));
        if (docSnap.exists()) {
          const userData = docSnap.data();
          if (input === auth.currentUser?.uid) {
            setSearchError("You are already in this mess as the manager.");
            return;
          }
          setSearchResult({
            id: input,
            name: userData.name || "Unknown",
            email: userData.email,
            alreadyInMess: contextMembers.some((m) => m.id === input),
          });
        } else {
          setSearchError("No user found with that User ID.");
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchError("Something went wrong. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  };



  // ─── ADD MEMBER ─────────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!searchResult || !mess?.id || !user) return;
    if (searchResult.alreadyInMess) return;

    // For NEW_USER, validate name before proceeding
    if (searchResult.id === "NEW_USER") {
      const err = validateName(newMemberName);
      if (err || newMemberName.trim().length < 3) {
        setNameError(err || "Name is required");
        Alert.alert("Missing Name", "Please enter a valid name for the new member.");
        return;
      }
    }

    const finalName = searchResult.id === "NEW_USER" ? newMemberName.trim() : searchResult.name;

    setAddingMember(true);
    try {
      // Global duplicate check
      const globalQuery = query(collectionGroup(db, "members"), where("email", "==", searchResult.email));
      const globalSnap = await getDocs(globalQuery);
      if (!globalSnap.empty) {
        // Check if the user is in THIS mess or ANOTHER mess
        const existingMemberDoc = globalSnap.docs[0];
        const existingMessId = existingMemberDoc.ref.parent.parent?.id;

        if (existingMessId && existingMessId === mess.id) {
          Alert.alert("Already in this Mess", "This user is already a member or pending in this mess. Please check the member list.");
        } else {
          Alert.alert("Action Blocked", "This user is already a member of another mess. They must leave their current mess before joining a new one.");
        }
        setAddingMember(false);
        return;
      }


      if (searchResult.id !== "NEW_USER") {
        // Existing app user
        await updateDoc(doc(db, "users", searchResult.id), { messId: mess.id, role: "member" });
        await setDoc(doc(db, "messes", mess.id, "members", searchResult.id), {
          name: searchResult.name,
          email: searchResult.email,
          role: "member",
          userId: searchResult.id,
          joinedAt: serverTimestamp(),
        });
      } else {
        // Pending / new user
        await addDoc(collection(db, "messes", mess.id, "members"), {
          name: finalName,
          email: searchResult.email,
          role: "member",
          userId: "",
          status: "PENDING",
          joinedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, "messes", mess.id), { memberCount: increment(1) });
      await refreshData();

      Alert.alert("Success", `${finalName} has been added to the mess.`);
      setShowAddModal(false);
      resetModalState();
    } catch (error: any) {
      console.error("Add member error:", error);
      Alert.alert("Error", `Failed to add member: ${error.message}`);
    } finally {
      setAddingMember(false);
    }
  };

  // ─── TRANSFER & DELETE ──────────────────────────────────────────
  const transferManagership = (member: Member) => {
    if (user?.role !== "manager") {
      Alert.alert("Access Denied", "Only managers can transfer managership");
      return;
    }
    Alert.alert(
      "Transfer Managership",
      `Are you sure you want to transfer managership to ${member.name}? You will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer", style: "destructive",
          onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              if (!currentUser || !mess?.id) return;
              await updateDoc(doc(db, "users", member.id), { role: "manager" });
              await updateDoc(doc(db, "users", currentUser.uid), { role: "member" });
              await refreshData();
              Alert.alert("Success", `${member.name} is now the manager. You are now a member.`, [
                { text: "OK", onPress: () => router.back() },
              ]);
            } catch (error) {
              console.error("Transfer managership error:", error);
              Alert.alert("Error", "Failed to transfer managership");
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!mess?.id || !user) return;
    if (user.role !== "manager") {
      Alert.alert("Access Denied", "Only managers can remove members");
      return;
    }
    const memberToRemove = contextMembers.find((m) => m.id === memberId);
    if (memberToRemove?.role === "manager") {
      Alert.alert("Cannot Remove", "You cannot remove the manager. Transfer managership first if needed.");
      return;
    }
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${memberName}? This will remove them from the mess.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            try {
              // Attempt to update user doc if it exists (for registered users)
              try {
                await updateDoc(doc(db, "users", memberId), { messId: null, role: null });
              } catch (e) {
                // Ignore if user doc doesn't exist (e.g. pending member)
                console.log("Skipping user doc update for pending member");
              }
              // CRITICAL FIX: Delete the member document so they are not found in global searches
              await deleteDoc(doc(db, "messes", mess.id, "members", memberId));
              await updateDoc(doc(db, "messes", mess.id), { memberCount: increment(-1) });
              await refreshData();
              Alert.alert("Success", `${memberName} has been removed from the mess`);
            } catch (error) {
              console.error("Delete member error:", error);
              Alert.alert("Error", "Failed to remove member");
            }
          },
        },
      ]
    );
  };

  // ─── DERIVED ────────────────────────────────────────────────────
  const isNewUser = searchResult?.id === "NEW_USER";
  const isRegistered = searchResult && !isNewUser;

  // Bottom button disabled logic
  const isConfirmDisabled =
    !searchResult ||
    searchResult.alreadyInMess ||
    addingMember ||
    (isNewUser && false); // ALWAYS ENABLE button for new users so they can get the alert feedback

  // ─── RENDER ─────────────────────────────────────────────────────
  if (!user || !mess) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const currentUserRole = user.role || "member";

  // ── What the bottom button says / does ──
  const getButtonLabel = () => {
    if (isNewUser) return "Create & Add Member";
    return "Add Member";
  };
  const handleBottomButton = () => {
    handleAddMember();
  };

  return (
    <View style={styles.container}>
      {/* ── Page Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Members</Text>
          <Text style={styles.subTitle}>Total Members: {contextMembers.length}</Text>
        </View>
        <View style={styles.headerRight}>
          {currentUserRole !== "manager" && (
            <View style={styles.viewOnlyBadge}>
              <Eye size={14} color="#F59E0B" />
              <Text style={styles.viewOnlyText}>View Only</Text>
            </View>
          )}
          {currentUserRole === "manager" && (
            <TouchableOpacity style={styles.addButton} onPress={() => { resetModalState(); setShowAddModal(true); }} activeOpacity={0.75}>
              <UserPlus size={18} color="#FFF" />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Member List ── */}
      <FlatList
        data={contextMembers}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" colors={["#6366F1"]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No members yet</Text>
            <Text style={styles.emptySubtext}>Members will appear here when they join the mess</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isCurrentUser = item.id === auth.currentUser?.uid;
          const isManager = item.role === "manager";
          return (
            <View style={[styles.memberRow, isCurrentUser && styles.currentUserRow, isManager && styles.managerRow]}>
              <View style={styles.rowTop}>
                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>
                      {index + 1}. {item.name}
                      {isCurrentUser && <Text style={styles.youTag}> (You)</Text>}
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
                {currentUserRole === "manager" && (
                  <View style={styles.actionButtons}>
                    {!isManager && (
                      <>
                        <TouchableOpacity onPress={() => transferManagership(item)} style={styles.transferButton} activeOpacity={0.7}>
                          <Crown size={18} color="#FACC15" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemoveMember(item.id, item.name)} style={styles.deleteButton} activeOpacity={0.7}>
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

      {/* ── ADD MEMBER MODAL ── */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => { setShowAddModal(false); resetModalState(); }}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === "ios" ? "padding" : "height"}>

            {/* Drag Handle */}
            <View style={styles.dragHandleRow}><View style={styles.dragHandle} /></View>

            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconBg}>
                  <UserPlus size={18} color="#6366F1" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Add Member</Text>
                  <Text style={styles.modalSubtitle}>Search by email or user ID</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { setShowAddModal(false); resetModalState(); }} activeOpacity={0.6} style={styles.closeButton}>
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* ── Show search UI ── */}
            {(
              <>
                {/* Toggle */}
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[styles.toggleOption, searchMode === "email" && styles.toggleOptionActive]}
                    onPress={() => { setSearchMode("email"); setSearchInput(""); setSearchResult(null); setSearchError(""); setNewMemberName(""); setNameError(""); }}
                    activeOpacity={0.7}
                  >
                    <Mail size={15} color={searchMode === "email" ? "#FFF" : "#64748B"} />
                    <Text style={[styles.toggleText, searchMode === "email" && styles.toggleTextActive]}>Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleOption, searchMode === "userId" && styles.toggleOptionActive]}
                    onPress={() => { setSearchMode("userId"); setSearchInput(""); setSearchResult(null); setSearchError(""); setNewMemberName(""); setNameError(""); }}
                    activeOpacity={0.7}
                  >
                    <Hash size={15} color={searchMode === "userId" ? "#FFF" : "#64748B"} />
                    <Text style={[styles.toggleText, searchMode === "userId" && styles.toggleTextActive]}>User ID</Text>
                  </TouchableOpacity>
                </View>

                {/* Search Input */}
                <View style={[styles.searchInputWrapper, searchFocused && styles.searchInputWrapperFocused]}>
                  <Search size={18} color={searchFocused ? "#6366F1" : "#64748B"} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={searchMode === "email" ? "Email address" : "User ID"}
                    placeholderTextColor="#475569"
                    value={searchInput}
                    onChangeText={setSearchInput}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={searchMode === "email" ? "email-address" : "default"}
                    editable={!addingMember}
                  />
                  {searchInput.length > 0 && (
                    <TouchableOpacity onPress={() => { setSearchInput(""); setSearchResult(null); setSearchError(""); }} activeOpacity={0.6} style={styles.clearButton}>
                      <X size={14} color="#64748B" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Searching… */}
                {searchLoading && (
                  <View style={styles.searchStateContainer}>
                    <ActivityIndicator size="small" color="#6366F1" />
                    <Text style={styles.searchStateText}>Searching...</Text>
                  </View>
                )}

                {/* Search error */}
                {searchError && !searchLoading && (
                  <View style={styles.errorContainer}>
                    <View style={styles.errorIconWrap}><AlertCircle size={15} color="#EF4444" /></View>
                    <Text style={styles.errorText}>{searchError}</Text>
                  </View>
                )}

                {/* ── REGISTERED USER result card ── */}
                {isRegistered && !searchLoading && (
                  <Animated.View style={[styles.resultCard, searchResult!.alreadyInMess && styles.resultCardDisabled, { opacity: resultFadeIn, transform: [{ translateY: resultSlideUp }] }]}>
                    <View style={styles.resultAvatar}>
                      <Text style={styles.resultAvatarText}>{searchResult!.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{searchResult!.name}</Text>
                      <Text style={styles.resultEmail}>{searchResult!.email}</Text>
                    </View>
                    {searchResult!.alreadyInMess && (
                      <View style={styles.alreadyBadge}><Check size={13} color="#F59E0B" /></View>
                    )}
                  </Animated.View>
                )}
                {isRegistered && searchResult!.alreadyInMess && (
                  <Text style={styles.alreadyInMessText}>This person is already in your mess</Text>
                )}

                {/* ── NEW_USER  ─  Step 1: Name entry ── */}
                {isNewUser && !searchLoading && (
                  <View style={styles.newUserNameCard}>
                    {/* header row: icon + label */}
                    <View style={styles.newUserHeaderRow}>
                      <View style={styles.newUserIconWrap}>
                        <User size={18} color="#818CF8" />
                      </View>
                      <View style={styles.newUserHeaderText}>
                        <Text style={styles.newUserTitle}>Not found in the app</Text>
                        <Text style={styles.newUserSubtitle}>This email is not registered. Enter a name to add them as a pending member.</Text>
                      </View>
                    </View>

                    {/* email chip */}
                    <View style={styles.emailChipRow}>
                      <Mail size={13} color="#64748B" />
                      <Text style={styles.emailChipText}>{searchResult!.email}</Text>
                    </View>

                    {/* step pills removed */}

                    {/* name input */}
                    <Text style={styles.nameFieldLabel}>Full Name</Text>
                    <View style={[styles.nameInputWrapper, nameError && styles.nameInputWrapperError]}>
                      <TextInput
                        style={styles.nameInputField}
                        placeholder="e.g. John Doe"
                        placeholderTextColor="#475569"
                        value={newMemberName}
                        onChangeText={(t) => { setNewMemberName(t); setNameError(validateName(t)); }}
                        autoFocus
                      />
                    </View>
                    {nameError ? (
                      <View style={styles.inlineErrorRow}>
                        <AlertCircle size={13} color="#EF4444" />
                        <Text style={styles.inlineErrorText}>{nameError}</Text>
                      </View>
                    ) : newMemberName.trim().length >= 3 ? (
                      <View style={styles.inlineOkRow}>
                        <Check size={13} color="#34D399" />
                        <Text style={styles.inlineOkText}>Name looks good</Text>
                      </View>
                    ) : null}

                    {/* already-in-mess warning */}
                    {searchResult!.alreadyInMess && (
                      <View style={[styles.errorContainer, { marginTop: 10 }]}>
                        <View style={styles.errorIconWrap}><AlertCircle size={15} color="#EF4444" /></View>
                        <Text style={styles.errorText}>This person is already in your mess</Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ── NEW_USER  ─  Step 2: Review card ── */}


            {/* ── Bottom button ── */}
            <View style={{ height: 12 }} />
            <TouchableOpacity
              style={[styles.confirmButton, isConfirmDisabled && styles.confirmButtonDisabled]}
              onPress={handleBottomButton}
              disabled={isConfirmDisabled}
              activeOpacity={0.75}
            >
              {addingMember ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <UserPlus size={18} color="#FFF" />
                  <Text style={styles.confirmButtonText}>{getButtonLabel()}</Text>
                </>
              )}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0F172A" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#94A3B8", marginTop: 12, fontSize: 14 },

  // ── Header ──
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 30, marginBottom: 16 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: "#FFF", fontSize: 24, fontWeight: "800", marginBottom: 8 },
  subTitle: { color: "#94A3B8", fontSize: 14 },
  viewOnlyBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  viewOnlyText: { color: "#F59E0B", fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#6366F1", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addButtonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },

  // ── Member Row ──
  memberRow: { padding: 14, borderBottomWidth: 1, borderColor: "#334155", backgroundColor: "#1E293B", marginBottom: 8, borderRadius: 8 },
  currentUserRow: { borderColor: "#6366F1", borderWidth: 1 },
  managerRow: { borderColor: "#F59E0B", borderWidth: 2 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  memberInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  memberName: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  youTag: { color: "#6366F1", fontSize: 14 },
  managerBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  managerBadgeText: { color: "#F59E0B", fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
  memberEmail: { color: "#94A3B8", fontSize: 13, marginBottom: 4 },
  actionButtons: { flexDirection: "row", gap: 8 },
  transferButton: { padding: 6, borderRadius: 8, backgroundColor: "rgba(250,204,21,0.15)" },
  deleteButton: { padding: 6, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.15)" },

  // ── Empty State ──
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyText: { color: "#FFF", fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtext: { color: "#94A3B8", fontSize: 14 },

  // ── MODAL SHELL ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1E293B", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: Platform.OS === "ios" ? 44 : 28, paddingTop: 8, shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 20 },
  dragHandleRow: { alignItems: "center", paddingVertical: 10 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#334155" },

  // Modal Header
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIconBg: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(99,102,241,0.12)", alignItems: "center", justifyContent: "center" },
  modalTitle: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  modalSubtitle: { color: "#64748B", fontSize: 13, marginTop: 1 },
  closeButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" },
  divider: { height: 1, backgroundColor: "#2E3A4F", marginBottom: 18 },

  // ── Toggle ──
  toggleContainer: { flexDirection: "row", backgroundColor: "#0F172A", borderRadius: 10, padding: 3, marginBottom: 14 },
  toggleOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  toggleOptionActive: { backgroundColor: "#6366F1", shadowColor: "#6366F1", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  toggleText: { color: "#64748B", fontSize: 14, fontWeight: "600" },
  toggleTextActive: { color: "#FFF" },

  // ── Search Input ──
  searchInputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F172A", borderRadius: 12, borderWidth: 1.5, borderColor: "#2E3A4F", paddingHorizontal: 14, gap: 10, marginBottom: 14 },
  searchInputWrapperFocused: { borderColor: "#6366F1", backgroundColor: "rgba(99,102,241,0.04)" },
  searchInput: { flex: 1, height: 48, color: "#FFF", fontSize: 15 },
  clearButton: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center" },

  // Search feedback
  searchStateContainer: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 2 },
  searchStateText: { color: "#64748B", fontSize: 14 },
  errorContainer: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 4 },
  errorIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.15)", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  errorText: { color: "#F87171", fontSize: 13, lineHeight: 20, flex: 1 },

  // ── Registered User Result Card ──
  resultCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(99,102,241,0.07)", borderWidth: 1, borderColor: "rgba(99,102,241,0.22)", borderRadius: 14, padding: 14, marginBottom: 2 },
  resultCardDisabled: { backgroundColor: "rgba(71,85,105,0.08)", borderColor: "rgba(71,85,105,0.2)" },
  resultAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#6366F1", alignItems: "center", justifyContent: "center", shadowColor: "#6366F1", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 4 },
  resultAvatarText: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  resultInfo: { flex: 1, minWidth: 0 },
  resultName: { color: "#FFF", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  resultEmail: { color: "#64748B", fontSize: 13 },
  alreadyBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "rgba(245,158,11,0.35)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  alreadyInMessText: { color: "#F59E0B", fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 6 },

  // ── NEW USER  ─  Step 1: Name card ──
  newUserNameCard: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#2E3A4F",
    borderRadius: 16,
    padding: 18,
  },
  newUserHeaderRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  newUserIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(129,140,248,0.13)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  newUserHeaderText: { flex: 1 },
  newUserTitle: { color: "#FFF", fontSize: 14, fontWeight: "700", marginBottom: 2 },
  newUserSubtitle: { color: "#64748B", fontSize: 12, lineHeight: 17 },

  emailChipRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(99,102,241,0.1)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14, alignSelf: "flex-start" },
  emailChipText: { color: "#818CF8", fontSize: 13, fontWeight: "600" },

  // Step pills
  stepRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  stepPill: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#1E293B", borderWidth: 1.5, borderColor: "#334155", alignItems: "center", justifyContent: "center" },
  stepPillActive: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  stepPillDone: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  stepPillText: { color: "#64748B", fontSize: 11, fontWeight: "700" },
  stepPillTextActive: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  stepLine: { width: 28, height: 2, backgroundColor: "#334155", borderRadius: 1 },
  stepLineDone: { backgroundColor: "#6366F1" },
  stepLabel: { color: "#64748B", fontSize: 12, fontWeight: "600", marginLeft: 4 },

  // Name input
  nameFieldLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  nameInputWrapper: { backgroundColor: "#1E293B", borderRadius: 10, borderWidth: 1.5, borderColor: "#334155", paddingHorizontal: 14, marginBottom: 6 },
  nameInputWrapperError: { borderColor: "rgba(239,68,68,0.5)" },
  nameInputField: { height: 46, color: "#FFF", fontSize: 15, fontWeight: "600" },

  // Inline validation feedback
  inlineErrorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineErrorText: { color: "#F87171", fontSize: 12 },
  inlineOkRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineOkText: { color: "#34D399", fontSize: 12, fontWeight: "600" },

  // ── NEW USER  ─  Step 2: Review ──
  reviewWrapper: { paddingTop: 2 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { color: "#6366F1", fontSize: 14, fontWeight: "600" },

  reviewCard: { backgroundColor: "#0F172A", borderRadius: 14, borderWidth: 1, borderColor: "#2E3A4F", overflow: "hidden", marginBottom: 14 },
  reviewAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366F1", alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 18, marginBottom: 14, shadowColor: "#6366F1", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 4 },
  reviewAvatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },

  reviewRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  reviewRowIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(100,116,139,0.12)", alignItems: "center", justifyContent: "center" },
  reviewRowContent: { flex: 1 },
  reviewRowLabel: { color: "#64748B", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  reviewRowValue: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  reviewDivider: { height: 1, backgroundColor: "#1E293B", marginHorizontal: 18 },

  pendingBadge: { alignSelf: "flex-start", backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  pendingBadgeText: { color: "#F59E0B", fontSize: 12, fontWeight: "700" },

  infoNote: { flexDirection: "row", gap: 10, backgroundColor: "rgba(100,116,139,0.08)", borderRadius: 10, borderWidth: 1, borderColor: "#2E3A4F", padding: 14 },
  infoNoteText: { color: "#64748B", fontSize: 13, lineHeight: 19, flex: 1 },
  infoNoteHighlight: { color: "#F59E0B", fontWeight: "700" },

  // ── Confirm Button ──
  confirmButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#6366F1", paddingVertical: 15, borderRadius: 14, marginTop: 4, shadowColor: "#6366F1", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  confirmButtonDisabled: { backgroundColor: "#2E3A4F", shadowColor: "transparent", shadowOpacity: 0, elevation: 0 },
  confirmButtonText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
});