// app/_layout.tsx
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { useEffect } from "react"; // ✅ Add this

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProtectedStack />
    </AuthProvider>
  );
}

/* ---------- ProtectedStack handles route protection ---------- */
function ProtectedStack() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Route protection logic
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "auth";

    if (!user && !inAuthGroup) {
      router.replace("/auth/login");
    }

    if (user && inAuthGroup) {
      router.replace("/mess/select");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
