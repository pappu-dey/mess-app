import { WifiOff } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
    Animated,
    Modal,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useNetwork } from "../context/NetworkContext";

export default function OfflineBlocker() {
    const { isOffline } = useNetwork();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isOffline) {
            // Fade in animation
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
            ]).start();

            // Continuous pulse animation for icon
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.2,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            // Fade out animation
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.8,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isOffline]);

    if (!isOffline) {
        return null;
    }

    return (
        <Modal
            visible={isOffline}
            transparent
            animationType="none"
            statusBarTranslucent
        >
            <Animated.View
                style={[
                    styles.overlay,
                    {
                        opacity: fadeAnim,
                    },
                ]}
            >
                <Animated.View
                    style={[
                        styles.card,
                        {
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    <Animated.View
                        style={{
                            transform: [{ scale: pulseAnim }],
                        }}
                    >
                        <View style={styles.iconContainer}>
                            <WifiOff size={64} color="#FF6B6B" strokeWidth={2} />
                        </View>
                    </Animated.View>

                    <Text style={styles.title}>You are offline</Text>
                    <Text style={styles.message}>
                        Please check your internet connection and try again
                    </Text>

                    <View style={styles.statusContainer}>
                        <View style={styles.statusDot} />
                        <Text style={styles.statusText}>Waiting for connection...</Text>
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    card: {
        backgroundColor: "#1E1E1E",
        borderRadius: 24,
        padding: 32,
        alignItems: "center",
        width: "100%",
        maxWidth: 400,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.1)",
    },
    iconContainer: {
        marginBottom: 24,
        padding: 20,
        backgroundColor: "rgba(255, 107, 107, 0.1)",
        borderRadius: 100,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#FFFFFF",
        marginBottom: 12,
        textAlign: "center",
    },
    message: {
        fontSize: 16,
        color: "#A0A0A0",
        textAlign: "center",
        lineHeight: 24,
        marginBottom: 24,
    },
    statusContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginTop: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#FFA500",
        marginRight: 8,
    },
    statusText: {
        fontSize: 14,
        color: "#FFA500",
        fontWeight: "500",
    },
});
