import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useApp } from "../context/AppContext";

export default function Index() {
  const router = useRouter();
  const { appState, loading } = useApp();

  useEffect(() => {
    if (loading || appState === "initializing") return;

    // Navigate based on app state
    switch (appState) {
      case "unauthenticated":
        router.replace("/auth/login");
        break;
      case "no_mess":
        router.replace("/mess/select");
        break;
      case "ready":
        router.replace("/mess/dashboard");
        break;
    }
  }, [appState, loading, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
});
