import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase/firebaseConfig";

/* ---------- types ---------- */
export type Role = "manager" | "member";

export type User = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  messId: string;
};

type AuthContextType = {
  user: User | null;
  activeMessId: string | null; // ✅ added
  loading: boolean;
  logout: () => Promise<void>;
};

/* ---------- context ---------- */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ---------- provider ---------- */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeMessId, setActiveMessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setActiveMessId(null);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));

        if (!snap.exists()) {
          console.warn("User document not found");
          setUser(null);
          setActiveMessId(null);
          setLoading(false);
          return;
        }

        const data = snap.data();

        const userData: User = {
          uid: firebaseUser.uid,
          name: data.name,
          email: data.email,
          role: data.role,
          messId: data.messId,
        };

        setUser(userData);
        setActiveMessId(data.messId); // ✅ here
      } catch (err) {
        console.error("Auth load error", err);
        setUser(null);
        setActiveMessId(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    await auth.signOut();
    setUser(null);
    setActiveMessId(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeMessId,
        loading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/* ---------- hook ---------- */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
