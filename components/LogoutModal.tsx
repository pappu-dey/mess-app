import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface LogoutModalProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onExitMess?: () => void;
  showExitMess?: boolean;
}

export default function LogoutModal({
  visible,
  onClose,
  onLogout,
  onExitMess,
  showExitMess = false,
}: LogoutModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>

          <Text style={styles.title}>Confirm Action</Text>
          <Text style={styles.message}>
            Are you sure you want to logout? You'll need to login again to access
            your mess.
          </Text>

          <View style={styles.buttonContainer}>
            {showExitMess && onExitMess && (
              <TouchableOpacity
                style={[styles.button, styles.exitMessButton]}
                onPress={() => {
                  onExitMess();
                  onClose();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.exitMessButtonText}>Exit Mess</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.logoutButton]}
              onPress={() => {
                onLogout();
                onClose();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.3)",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  message: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
  },
  exitMessButton: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.4)",
  },
  exitMessButtonText: {
    color: "#60A5FA",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    backgroundColor: "rgba(71, 85, 105, 0.3)",
    borderColor: "rgba(71, 85, 105, 0.5)",
  },
  cancelButtonText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "700",
  },
  logoutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  logoutButtonText: {
    color: "#F87171",
    fontSize: 16,
    fontWeight: "700",
  },
});
