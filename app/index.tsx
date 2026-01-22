import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { auth, db } from "../firebase/firebaseConfig";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const user = auth.currentUser;

      // 🔐 Safety check (should not happen if _layout.tsx is correct)
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));

        if (snap.exists() && snap.data().messId) {
          router.replace("/mess/dashboard");
        } else {
          router.replace("/mess/select");
        }
      } catch (e) {
        console.error("Failed to load user doc:", e);
        router.replace("/mess/select");
      }
    };

    run();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
