// app/_layout.tsx
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import OfflineBlocker from "../components/OfflineBlocker";
import { Skeleton, SkeletonCard, SkeletonRow } from "../components/Skeleton";
import { AppProvider, useApp } from "../context/AppContext";
import { AuthProvider } from "../context/AuthContext";
import { NetworkProvider } from "../context/NetworkContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <NetworkProvider>
        <AppProvider>
          <OfflineBlocker />
          <ProtectedStack />
        </AppProvider>
      </NetworkProvider>
    </AuthProvider>
  );
}

/* ---------- ProtectedStack handles route protection ---------- */
function ProtectedStack() {
  const { appState, loading } = useApp();
  const router = useRouter();
  const segments = useSegments();

  // Route protection logic based on app state
  useEffect(() => {
    if (loading || appState === "initializing") return;

    const inAuthGroup = segments[0] === "auth";
    const inMessGroup = segments[0] === "mess";

    console.log("Navigation check:", { appState, segments: segments[0] });

    // Unauthenticated users should be on auth screens
    if (appState === "unauthenticated" && !inAuthGroup) {
      console.log("Redirecting to login");
      router.replace("/auth/login");
      return;
    }

    // Authenticated users on auth screens should be redirected
    if (appState !== "unauthenticated" && inAuthGroup) {
      if (appState === "no_mess") {
        console.log("Redirecting from auth to join/create");
        router.replace("/mess/join"); // Or /mess/create which is usually same flow
      } else {
        console.log("Redirecting from auth to dashboard");
        router.replace("/mess/dashboard");
      }
      return;
    }

    // Users without a mess should be on join/create screen
    if (appState === "no_mess" && inMessGroup && segments[1] !== "join" && segments[1] !== "create") {
      console.log("Redirecting to mess join");
      router.replace("/mess/join");
      return;
    }

    // Users with a ready mess should be on dashboard
    // If they try to go to join/create, redirect back to dashboard? 
    // Maybe allow them to create IF we supported multiple messes, but we don't.
    // So enforcing dashboard is good.
    if (appState === "ready" && (segments[1] === "join" || segments[1] === "create")) {
      console.log("Redirecting to dashboard");
      router.replace("/mess/dashboard");
      return;
    }
  }, [appState, loading, segments, router]);

  // Show skeleton loading screen during initialization
  if (loading || appState === "initializing") {
    return (
      <View style={styles.splashContainer}>
        {/* Skeleton Header */}
        <View style={styles.skeletonHeader}>
          <View>
            <Skeleton width={150} height={24} borderRadius={8} />
            <Skeleton width={120} height={16} style={{ marginTop: 8 }} />
            <Skeleton width={60} height={20} borderRadius={10} style={{ marginTop: 8 }} />
          </View>
          <Skeleton width={40} height={40} borderRadius={20} />
        </View>

        {/* Skeleton Stats Cards */}
        <View style={styles.skeletonStatsGrid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>

        {/* Month Selector Skeleton */}
        <View style={styles.skeletonMonthSelector}>
          <Skeleton width={30} height={30} borderRadius={15} />
          <Skeleton width={140} height={20} />
          <Skeleton width={30} height={30} borderRadius={15} />
        </View>

        {/* Member Stats Header */}
        <View style={styles.skeletonSectionHeader}>
          <Skeleton width={120} height={18} />
        </View>

        {/* Member List */}
        <View style={styles.skeletonMemberList}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  skeletonHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  skeletonStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  skeletonMonthSelector: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    marginBottom: 24,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
  },
  skeletonSectionHeader: {
    marginBottom: 16,
  },
  skeletonMemberList: {
    gap: 12,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#94A3B8",
    marginTop: 16,
    fontSize: 16,
  },
});
