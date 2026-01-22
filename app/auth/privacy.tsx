import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function PrivacyPolicy() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.lastUpdated}>Last updated: {new Date().toLocaleDateString()}</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Introduction</Text>
            <Text style={styles.sectionText}>
              Mess Manager ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Information We Collect</Text>
            <Text style={styles.sectionText}>
              We collect information that you provide directly to us, including:
            </Text>
            <Text style={styles.bulletPoint}>• Account information (name, email address, password)</Text>
            <Text style={styles.bulletPoint}>• Mess-related data (expenses, meals, member information)</Text>
            <Text style={styles.bulletPoint}>• Usage data (how you interact with the app)</Text>
            <Text style={styles.bulletPoint}>• Device information (device type, operating system)</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. How We Use Your Information</Text>
            <Text style={styles.sectionText}>
              We use the information we collect to:
            </Text>
            <Text style={styles.bulletPoint}>• Provide, maintain, and improve our services</Text>
            <Text style={styles.bulletPoint}>• Process your transactions and manage your mess accounts</Text>
            <Text style={styles.bulletPoint}>• Send you technical notices and support messages</Text>
            <Text style={styles.bulletPoint}>• Respond to your comments and questions</Text>
            <Text style={styles.bulletPoint}>• Detect and prevent fraud and abuse</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Data Storage and Security</Text>
            <Text style={styles.sectionText}>
              Your data is stored securely using Firebase services. We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
            </Text>
            <Text style={styles.sectionText}>
              However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your data, we cannot guarantee absolute security.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Data Sharing</Text>
            <Text style={styles.sectionText}>
              We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
            </Text>
            <Text style={styles.bulletPoint}>• With other members of your mess group (as necessary for the service)</Text>
            <Text style={styles.bulletPoint}>• With service providers who assist us in operating our app</Text>
            <Text style={styles.bulletPoint}>• When required by law or to protect our rights</Text>
            <Text style={styles.bulletPoint}>• In connection with a business transfer or merger</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Your Rights</Text>
            <Text style={styles.sectionText}>
              You have the right to:
            </Text>
            <Text style={styles.bulletPoint}>• Access and update your personal information</Text>
            <Text style={styles.bulletPoint}>• Delete your account and associated data</Text>
            <Text style={styles.bulletPoint}>• Opt-out of certain data collection practices</Text>
            <Text style={styles.bulletPoint}>• Request a copy of your data</Text>
            <Text style={styles.sectionText}>
              To exercise these rights, please contact us through the app or at support@messmanager.com
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Cookies and Tracking</Text>
            <Text style={styles.sectionText}>
              We use Firebase Analytics to understand how users interact with our app. This helps us improve our services. You can control tracking preferences through your device settings.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
            <Text style={styles.sectionText}>
              Our service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us immediately.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. International Data Transfers</Text>
            <Text style={styles.sectionText}>
              Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Changes to This Privacy Policy</Text>
            <Text style={styles.sectionText}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date and posting the new Privacy Policy in the app. You are advised to review this Privacy Policy periodically.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. Contact Us</Text>
            <Text style={styles.sectionText}>
              If you have any questions about this Privacy Policy, please contact us at:
            </Text>
            <Text style={styles.sectionText}>
              Email: support@messmanager.com
            </Text>
            <Text style={styles.sectionText}>
              Through the app: Settings → Contact Support
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  content: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(99, 102, 241, 0.2)",
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#6366F1",
    fontWeight: "600",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  lastUpdated: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6366F1",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionText: {
    fontSize: 15,
    color: "#E2E8F0",
    lineHeight: 24,
    marginBottom: 8,
  },
  bulletPoint: {
    fontSize: 15,
    color: "#CBD5E1",
    lineHeight: 24,
    marginLeft: 16,
    marginBottom: 4,
  },
});
