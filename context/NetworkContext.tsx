import NetInfo from "@react-native-community/netinfo";
import React, { createContext, useContext, useEffect, useState } from "react";

/* ---------- types ---------- */
type NetworkContextType = {
    isOffline: boolean;
    isConnected: boolean;
};

/* ---------- context ---------- */
const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

/* ---------- provider ---------- */
export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
    const [isOffline, setIsOffline] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    useEffect(() => {
        // Subscribe to network state changes
        const unsubscribe = NetInfo.addEventListener((state) => {
            const offline = !state.isConnected || !state.isInternetReachable;

            console.log("Network state changed:", {
                isConnected: state.isConnected,
                isInternetReachable: state.isInternetReachable,
                type: state.type,
                offline,
            });

            setIsOffline(offline);
            setIsConnected(state.isConnected ?? false);
        });

        // Get initial network state
        NetInfo.fetch().then((state) => {
            const offline = !state.isConnected || !state.isInternetReachable;

            console.log("Initial network state:", {
                isConnected: state.isConnected,
                isInternetReachable: state.isInternetReachable,
                type: state.type,
                offline,
            });

            setIsOffline(offline);
            setIsConnected(state.isConnected ?? false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <NetworkContext.Provider
            value={{
                isOffline,
                isConnected,
            }}
        >
            {children}
        </NetworkContext.Provider>
    );
};

/* ---------- hook ---------- */
export const useNetwork = () => {
    const context = useContext(NetworkContext);
    if (!context) {
        throw new Error("useNetwork must be used within NetworkProvider");
    }
    return context;
};
