import AsyncStorage from "@react-native-async-storage/async-storage";
import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import {
    collection,
    collectionGroup,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    Unsubscribe,
    updateDoc,
    where
} from "firebase/firestore";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { auth, db } from "../firebase/firebaseConfig";

// Cache key for dashboard data
const DASHBOARD_CACHE_KEY = "@dashboard_cache_v2";
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/* ---------- types ---------- */
export type Role = "manager" | "member";

export type AppState = "initializing" | "unauthenticated" | "no_mess" | "ready";

export type User = {
    uid: string;
    name: string;
    email: string;
    role: Role;
    messId: string | null;
    joinedDate: string;
};

export type MessData = {
    id: string;
    name: string;
    createdAt: string;
    memberCount: number;
};

export type Member = {
    id: string;
    name: string;
    email: string;
    role: Role;
    joinedAt: any;
};

export type HouseStats = {
    currentMonth: string;
    totalMeal: number;
    totalBazar: number;
    costPerMeal: number;
    remainingMoney: number;
    totalGuestMeal?: number;
};

export type MemberStat = {
    id: string;
    name: string;
    meal: number;
    deposit: number;
    commonCharge: number;
    mealCost: number;
    guestMealCost: number;
    totalCost: number;
    balance: number;
};

export type NotificationItem = {
    id: string;
    type: "member_joined" | "deposit" | "expense";
    message: string;
    timestamp: string;
    createdAt: any;
    amount?: number;
    memberName?: string;
    item?: string;
};

export type DashboardData = {
    stats: HouseStats | null;
    memberStats: MemberStat[];
    notifications: NotificationItem[];
    selectedMonth: Date;
    loading: boolean;
};

type AppContextType = {
    appState: AppState;
    user: User | null;
    mess: MessData | null;
    members: Member[];
    loading: boolean;
    dashboardData: DashboardData;
    refreshData: () => Promise<void>;
    updateMessData: (data: Partial<MessData>) => void;
    clearMessData: () => void;
    updateDashboardMonth: (date: Date) => Promise<void>;
    refreshDashboard: () => Promise<void>;
};

/* ---------- context ---------- */
const AppContext = createContext<AppContextType | undefined>(undefined);

/* ---------- provider ---------- */
export const AppProvider = ({ children }: { children: React.ReactNode }) => {
    const [appState, setAppState] = useState<AppState>("initializing");
    const [user, setUser] = useState<User | null>(null);
    const [mess, setMess] = useState<MessData | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<DashboardData>({
        stats: null,
        memberStats: [],
        notifications: [],
        selectedMonth: new Date(),
        loading: false,
    });

    // Track active listeners to prevent duplicates
    const membersUnsubscribeRef = useRef<Unsubscribe | null>(null);
    const initializingRef = useRef(false);

    /**
     * Fetch user document from Firestore
     */
    const fetchUserData = useCallback(
        async (firebaseUser: FirebaseUser): Promise<User | null> => {
            try {
                const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

                if (!userDoc.exists()) {
                    console.warn("User document not found in Firestore");
                    return null;
                }

                const data = userDoc.data();
                const userData: User = {
                    uid: firebaseUser.uid,
                    name: data.name || "User",
                    email: data.email || firebaseUser.email || "",
                    role: data.role || "member",
                    messId: data.messId || null,
                    joinedDate: data.createdAt?.toDate
                        ? data.createdAt.toDate().toISOString()
                        : new Date().toISOString(),
                };

                return userData;
            } catch (error) {
                console.error("Error fetching user data:", error);
                return null;
            }
        },
        []
    );

    /**
     * Fetch mess document and setup members listener
     */
    const fetchMessData = useCallback(async (messId: string, userId: string): Promise<{ mess: MessData; initialMembers: Member[] } | null> => {
        try {
            // Fetch mess document
            const messDoc = await getDoc(doc(db, "messes", messId));

            if (!messDoc.exists()) {
                console.warn("Mess document not found");
                return null;
            }

            const messData = messDoc.data();
            const mess: MessData = {
                id: messId,
                name: messData.name || "Mess",
                createdAt: messData.createdAt?.toDate
                    ? messData.createdAt.toDate().toISOString()
                    : new Date().toISOString(),
                memberCount: messData.memberCount || 0,
            };

            // Self-healing: Ensure current user is in members subcollection
            const memberRef = doc(db, "messes", messId, "members", userId);
            const memberSnap = await getDoc(memberRef);

            if (!memberSnap.exists()) {
                console.log("⚠️ User missing from members subcollection. Auto-fixing...");
                const userDoc = await getDoc(doc(db, "users", userId));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    await setDoc(memberRef, {
                        name: userData.name || "User",
                        email: userData.email || "",
                        role: userData.role || "member",
                        joinedAt: serverTimestamp(),
                    });
                    console.log("✅ User added to members subcollection.");
                }
            }

            // Fetch members synchronously first to avoid race condition
            const membersSnap = await getDocs(collection(db, "messes", messId, "members"));
            const initialMembers = membersSnap.docs.map((d) => ({
                id: d.id,
                name: d.data().name || "Unknown",
                email: d.data().email || "",
                role: d.data().role || "member",
                joinedAt: d.data().joinedAt || null,
            })) as Member[];

            // Sort: manager first, then alphabetically
            initialMembers.sort((a, b) => {
                if (a.role === "manager") return -1;
                if (b.role === "manager") return 1;
                return a.name.localeCompare(b.name);
            });

            // Set initial members immediately
            setMembers(initialMembers);

            // Setup real-time listener for future updates
            if (membersUnsubscribeRef.current) {
                membersUnsubscribeRef.current();
            }

            membersUnsubscribeRef.current = onSnapshot(
                collection(db, "messes", messId, "members"),
                (snapshot) => {
                    const membersList = snapshot.docs.map((d) => ({
                        id: d.id,
                        name: d.data().name || "Unknown",
                        email: d.data().email || "",
                        role: d.data().role || "member",
                        joinedAt: d.data().joinedAt || null,
                    })) as Member[];

                    // Sort: manager first, then alphabetically
                    membersList.sort((a, b) => {
                        if (a.role === "manager") return -1;
                        if (b.role === "manager") return 1;
                        return a.name.localeCompare(b.name);
                    });

                    setMembers(membersList);
                },
                (error) => {
                    console.error("Members listener error:", error);
                }
            );

            return { mess, initialMembers };
        } catch (error) {
            console.error("Error fetching mess data:", error);
            return null;
        }
    }, []);

    /**
     * Preload dashboard data (stats + notifications) for faster rendering
     * Uses cache-first strategy: show cached data immediately, then update with fresh data
     */
    const preloadDashboardData = useCallback(async (messId: string, membersList: Member[], date: Date = new Date()) => {
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
        const cacheKey = `${DASHBOARD_CACHE_KEY}_${messId}_${monthKey}`;

        try {
            console.log("🚀 Loading dashboard data...");
            setDashboardData(prev => ({ ...prev, loading: true }));

            // Step 1: Try to load from cache immediately for instant display
            try {
                const cachedDataStr = await AsyncStorage.getItem(cacheKey);
                if (cachedDataStr) {
                    const cachedData = JSON.parse(cachedDataStr);
                    const cacheAge = Date.now() - (cachedData.timestamp || 0);

                    if (cacheAge < CACHE_EXPIRY_MS) {
                        console.log("📦 Showing cached data (age:", Math.round(cacheAge / 1000), "s)");
                        setDashboardData({
                            stats: cachedData.stats,
                            memberStats: cachedData.memberStats,
                            notifications: cachedData.notifications,
                            selectedMonth: new Date(cachedData.selectedMonth),
                            loading: true, // Keep loading true while fetching fresh data
                        });
                    }
                }
            } catch (e) {
                console.log("Cache read skipped");
            }

            // Step 2: Fetch fresh data from Firestore
            const [mealsSnap, transactionsSnap, guestMealsSnap] = await Promise.all([
                getDocs(collection(db, "messes", messId, "meals", monthKey, "entries")),
                getDocs(collection(db, "messes", messId, "managerMoney", monthKey, "entries")),
                getDocs(collection(db, "messes", messId, "guest_meal")),
            ]);

            // Process data quickly
            const totalMembers = membersList.length;
            const memberMeals: Record<string, { name: string; count: number }> = {};
            const memberDeposits: Record<string, number> = {};
            const memberGuestMeals: Record<string, number> = {};
            let totalCommonExpense = 0;
            let totalIndividualExpense = 0;

            // Process meals
            mealsSnap.forEach((d) => {
                const data = d.data();
                const mealCount = (Number(data.breakfast) || 0) + (Number(data.lunch) || 0) + (Number(data.dinner) || 0);
                if (!memberMeals[data.memberId]) {
                    memberMeals[data.memberId] = { name: data.memberName, count: 0 };
                }
                memberMeals[data.memberId].count += mealCount;
            });
            console.log(`🐞 DEBUG: Found ${mealsSnap.size} meal entries in ${monthKey}`);
            console.log("🐞 DEBUG: Member Meal Counts:", memberMeals);

            // Process guest meals – accumulate per-member AND the month-wide total.
            // guest_meal docs store totalAmount as a positive number.
            let totalGuestMealExpense = 0;
            guestMealsSnap.forEach((d) => {
                const data = d.data();
                if (data.date && data.date.startsWith(monthKey)) {
                    const memberId = data.memberId;
                    const amount = Number(data.totalAmount || 0);
                    memberGuestMeals[memberId] = (memberGuestMeals[memberId] || 0) + amount;
                    totalGuestMealExpense += amount;
                }
            });

            // Process transactions (deposits + expenses from managerMoney entries).
            //
            // ⚠️  Guest-meal adjustment entries are stored with a NEGATIVE amount
            //     (GuestMeal.tsx step 4: amount: -totalAmount).
            //     They land in totalIndividualExpense and automatically reduce it.
            //     After this loop:
            //       totalIndividualExpense = realFoodExpenses − guestMealAmounts
            //     This is exactly the "adjusted non-common" value we need for costPerMeal —
            //     no further subtraction required.
            const allNotifications: NotificationItem[] = [];
            transactionsSnap.forEach((d) => {
                const data = d.data();
                const amount = Number(data.amount || 0);
                const type = data.type;

                if (type === "deposit") {
                    memberDeposits[data.memberId] = (memberDeposits[data.memberId] || 0) + amount;
                } else if (type === "expense") {
                    // IGNORE negative amounts (guest meal adjustments) here.
                    // We want totalIndividualExpense to be the GROSS amount.
                    if (amount < 0) return;

                    if (data.isCommon === true) {
                        totalCommonExpense += amount;
                    } else {
                        totalIndividualExpense += amount;
                    }
                }

                // Build notifications (limit to 50 for performance)
                if ((type === "deposit" || type === "expense") && allNotifications.length < 50) {
                    const createdAt = data.createdAt;
                    const item = data.description || data.item || data.purpose || "N/A";
                    allNotifications.push({
                        id: d.id,
                        type: type as "deposit" | "expense",
                        message: type === "deposit"
                            ? `${data.memberName || "Someone"} deposited ₹${data.amount}`
                            : `${data.memberName || "Manager"} added expense: ${item} - ₹${data.amount}`,
                        timestamp: createdAt?.toDate ? new Date(createdAt.toDate()).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                        }) : "",
                        createdAt: createdAt,
                        amount: data.amount,
                        item: item,
                    });
                }
            });

            // ── Stats calculation ─────────────────────────────────────────────
            const totalMeal = Object.values(memberMeals).reduce((sum, m) => sum + m.count, 0);
            const totalDeposit = Object.values(memberDeposits).reduce((sum, amount) => sum + amount, 0);
            const commonChargePerMember = totalMembers > 0 ? totalCommonExpense / totalMembers : 0;

            // ── Dashboard total expense ──────────────────────────────────────
            // totalIndividualExpense is now GROSS (ignored negatives).
            // grandTotalExpense should be the sum of all money spent.
            // grandTotalExpense = Common + NonCommon
            const grandTotalExpense = totalCommonExpense + totalIndividualExpense;

            // ── Cost per meal ────────────────────────────────────────────────
            // Formula: (Total Non-Common - Total Guest Meals) / Total Meals
            // totalIndividualExpense is Gross Non-Common.
            const costPerMeal = totalMeal > 0
                ? Math.max(0, (totalIndividualExpense - totalGuestMealExpense) / totalMeal)
                : 0;

            // Build member statistics
            const membersArray: MemberStat[] = membersList.map((memberDoc) => {
                const memberId = memberDoc.id;
                const name = memberDoc.name?.trim() || "Unknown";
                const mealCount = Number(memberMeals?.[memberId]?.count ?? 0);
                const deposit = Number(memberDeposits?.[memberId] ?? 0);
                const mealCost = mealCount * costPerMeal;
                const commonCharge = commonChargePerMember;
                const guestMealCost = Number(memberGuestMeals?.[memberId] ?? 0);
                const totalCost = commonCharge + mealCost + guestMealCost;
                const balance = deposit - totalCost;

                return {
                    id: memberId,
                    name,
                    meal: mealCount,
                    deposit,
                    commonCharge,
                    mealCost,
                    guestMealCost,
                    totalCost,
                    balance,
                };
            }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

            const stats: HouseStats = {
                currentMonth: date.toLocaleString("default", { month: "long", year: "numeric" }),
                totalMeal,
                totalBazar: grandTotalExpense,
                costPerMeal,
                remainingMoney: totalDeposit - grandTotalExpense,
                totalGuestMeal: totalGuestMealExpense, // Added for debugging/display
            };

            // Add member join notifications (limit to 10 recent)
            membersList.slice(0, 10).forEach((member) => {
                const joinedAt = member.joinedAt;
                if (joinedAt && allNotifications.length < 50) {
                    allNotifications.push({
                        id: `member_${member.id}`,
                        type: "member_joined",
                        message: `${member.name || "New member"} joined the mess`,
                        timestamp: new Date(joinedAt.toDate()).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                        }),
                        createdAt: joinedAt,
                        memberName: member.name,
                    });
                }
            });

            // Sort notifications by date
            allNotifications.sort((a, b) => {
                if (!a.createdAt || !b.createdAt) return 0;
                return b.createdAt.toMillis() - a.createdAt.toMillis();
            });

            const finalNotifications = allNotifications.slice(0, 50);

            const dashboardResult = {
                stats,
                memberStats: membersArray,
                notifications: finalNotifications,
                selectedMonth: date,
                loading: false,
            };

            setDashboardData(dashboardResult);

            // Step 3: Cache the data for offline access
            try {
                const cacheData = {
                    ...dashboardResult,
                    selectedMonth: date.toISOString(),
                    notifications: finalNotifications.map(n => ({ ...n, createdAt: null })), // Remove non-serializable
                    timestamp: Date.now(),
                };
                await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
                console.log("💾 Cached dashboard data");
            } catch (e) {
                console.log("Cache write skipped");
            }

            console.log("✅ Dashboard data loaded");
        } catch (error) {
            console.error("Error loading dashboard data:", error);
            setDashboardData(prev => ({ ...prev, loading: false }));
        }
    }, []);

    /**
     * Initialize app state based on auth and user data
     */
    const initializeApp = useCallback(
        async (firebaseUser: FirebaseUser | null) => {
            // Prevent duplicate initialization
            if (initializingRef.current) {
                console.log("Initialization already in progress, skipping...");
                return;
            }

            initializingRef.current = true;
            setLoading(true);

            try {
                if (!firebaseUser) {
                    // User not authenticated
                    setAppState("unauthenticated");
                    setUser(null);
                    setMess(null);
                    setMembers([]);
                    return;
                }

                // 1. Fetch user document
                let userData = await fetchUserData(firebaseUser);

                // 2. BOOTSTRAP: Check if user is already a member of ANY mess via Email
                // Using Collection Group Query: all collections named 'members'
                // CAUTION: Requires a composite index in Firestore (email ASC)
                // If it fails, the console will print a link to create it.
                if (!userData?.messId) {
                    console.log("Checking for existing memberships for:", firebaseUser.email);
                    const membershipsQuery = query(
                        collectionGroup(db, 'members'),
                        where('email', '==', firebaseUser.email)
                    );
                    const membershipsSnap = await getDocs(membershipsQuery);

                    if (!membershipsSnap.empty) {
                        console.log(`Found ${membershipsSnap.size} memberships for this email.`);
                        // Single Mess Policy: Take the first one found.
                        const memberDoc = membershipsSnap.docs[0];
                        const messParentRef = memberDoc.ref.parent.parent; // messes/{messId}

                        if (messParentRef) {
                            const messId = messParentRef.id;
                            console.log("Auto-linking to mess:", messId);

                            // AUTO-LINK: Update the member doc with userId if missing
                            const memberData = memberDoc.data() as any;
                            if (!memberData.userId) {
                                await updateDoc(memberDoc.ref, {
                                    userId: firebaseUser.uid,
                                    status: 'ACTIVE'
                                });
                            }

                            // Update User Doc with messId
                            await setDoc(doc(db, "users", firebaseUser.uid), {
                                name: userData?.name || firebaseUser.displayName || "User",
                                email: firebaseUser.email,
                                messId: messId,
                                role: memberData.role || 'member',
                                createdAt: userData?.joinedDate ? undefined : serverTimestamp(), // Keep old if exists
                            }, { merge: true });

                            // Refetch updated user data
                            userData = await fetchUserData(firebaseUser);
                        }
                    }
                }

                if (!userData) {
                    // Should generally be created above, but fallback
                    setAppState("unauthenticated");
                    setUser(null);
                    setMess(null);
                    return;
                }

                setUser(userData);

                if (!userData.messId) {
                    // User authenticated but not in a mess
                    setAppState("no_mess");
                    setMess(null);
                    setMembers([]);
                    return;
                }

                // Fetch mess data and setup listeners
                const result = await fetchMessData(userData.messId, userData.uid);

                if (!result) {
                    // Mess doesn't exist, clear user's messId
                    setAppState("no_mess");
                    setMess(null);
                    setMembers([]);
                    return;
                }

                const { mess: messData, initialMembers } = result;
                setMess(messData);
                setAppState("ready");

                // Preload dashboard data immediately with the fetched members
                if (initialMembers.length > 0) {
                    preloadDashboardData(userData.messId!, initialMembers).catch(err => {
                        console.error("Background preload failed:", err);
                    });
                }

            } catch (error) {
                console.error("Error initializing app:", error);
                setAppState("unauthenticated");
            } finally {
                setLoading(false);
                initializingRef.current = false;
            }
        },
        [fetchUserData, fetchMessData, preloadDashboardData]
    );

    /**
     * Refresh data (useful after joining/creating a mess)
     */
    const refreshData = useCallback(async () => {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
            await initializeApp(firebaseUser);
        }
    }, [initializeApp]);

    /**
     * Update mess data (for optimistic updates)
     */
    const updateMessData = useCallback((data: Partial<MessData>) => {
        setMess((prev) => (prev ? { ...prev, ...data } : null));
    }, []);

    /**
     * Clear mess data (when leaving a mess)
     */
    const clearMessData = useCallback(() => {
        setMess(null);
        setMembers([]);
        setAppState("no_mess");

        // Cleanup listeners
        if (membersUnsubscribeRef.current) {
            membersUnsubscribeRef.current();
            membersUnsubscribeRef.current = null;
        }

        // Clear dashboard data
        setDashboardData({
            stats: null,
            memberStats: [],
            notifications: [],
            selectedMonth: new Date(),
            loading: false,
        });
    }, []);

    /**
     * Update dashboard month and reload data
     */
    const updateDashboardMonthRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateDashboardMonth = useCallback(async (date: Date) => {
        if (!mess?.id || members.length === 0) return;

        // Debounce rapid calls (e.g., from multiple listener fires)
        if (updateDashboardMonthRef.current) {
            clearTimeout(updateDashboardMonthRef.current);
        }

        updateDashboardMonthRef.current = setTimeout(async () => {
            setDashboardData(prev => ({ ...prev, selectedMonth: date }));
            await preloadDashboardData(mess.id, members, date);
            updateDashboardMonthRef.current = null;
        }, 200); // 200ms debounce - feels instant but prevents excessive calls
    }, [mess?.id, members, preloadDashboardData]);

    /**
     * Refresh dashboard data for current month (called after transactions)
     */
    const refreshDashboard = useCallback(async () => {
        if (!mess?.id || members.length === 0) return;
        await preloadDashboardData(mess.id, members, dashboardData.selectedMonth);
    }, [mess?.id, members, dashboardData.selectedMonth, preloadDashboardData]);

    /**
     * Setup auth state listener
     */
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log("Auth state changed:", firebaseUser?.uid || "null");
            await initializeApp(firebaseUser);
        });

        return () => {
            unsubscribe();
            // Cleanup members listener on unmount
            if (membersUnsubscribeRef.current) {
                membersUnsubscribeRef.current();
            }
        };
    }, [initializeApp]);

    return (
        <AppContext.Provider
            value={{
                appState,
                user,
                mess,
                members,
                loading,
                dashboardData,
                refreshData,
                updateMessData,
                clearMessData,
                updateDashboardMonth,
                refreshDashboard,
            }}
        >
            {children}
        </AppContext.Provider>
    );
};

/* ---------- hook ---------- */
export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useApp must be used within AppProvider");
    }
    return context;
};