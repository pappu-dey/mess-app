// fileSaver.ts - Cross-platform file saving utility
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

const SAF_DIR_KEY = "DOWNLOADS_SAF_URI";

/**
 * Save file to Downloads folder on Android using Storage Access Framework
 * This creates a permanent file that persists after app closes
 */
export const saveToDownloadsAndroid = async (
  fileUri: string,
  fileName: string,
  mimeType: string
): Promise<boolean> => {
  try {
    // Check if we have a saved directory URI
    let dirUri = await AsyncStorage.getItem(SAF_DIR_KEY);

    // Request permission if not already granted
    if (!dirUri) {
      const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please grant access to save files to Downloads folder"
        );
        return false;
      }
      dirUri = permission.directoryUri;
      await AsyncStorage.setItem(SAF_DIR_KEY, dirUri);
    }

    // Read the file content as base64
    const fileContent = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Create the file in the selected directory (Downloads)
    const newFileUri = await StorageAccessFramework.createFileAsync(
      dirUri,
      fileName,
      mimeType
    );

    // Write the content to the new file
    await FileSystem.writeAsStringAsync(newFileUri, fileContent, {
      encoding: FileSystem.EncodingType.Base64,
    });

    Alert.alert(
      "Success",
      `${fileName} saved to Downloads folder successfully ✅`,
      [{ text: "OK" }]
    );
    return true;
  } catch (error) {
    console.error("Android save error:", error);
    Alert.alert(
      "Error",
      "Failed to save file. Please try again.",
      [{ text: "OK" }]
    );
    return false;
  }
};

/**
 * Save file on iOS using Share Sheet (UIDocumentPicker style)
 * iOS doesn't allow direct Downloads folder access, so we use the share dialog
 * which lets users choose where to save (iCloud, Files app, etc.)
 */
export const saveFileIOS = async (
  fileUri: string,
  fileName: string,
  mimeType: string
): Promise<boolean> => {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        "Error",
        "File sharing is not available on this device",
        [{ text: "OK" }]
      );
      return false;
    }

    // Determine UTI based on mime type
    let UTI = ".pdf";
    if (mimeType.includes("csv") || mimeType.includes("spreadsheet")) {
      UTI = ".csv";
    } else if (mimeType.includes("excel")) {
      UTI = ".xlsx";
    }

    await Sharing.shareAsync(fileUri, {
      UTI,
      mimeType,
      dialogTitle: `Save ${fileName}`,
    });

    return true;
  } catch (error) {
    console.error("iOS save error:", error);
    Alert.alert(
      "Error",
      "Failed to share file. Please try again.",
      [{ text: "OK" }]
    );
    return false;
  }
};

/**
 * Cross-platform file saver
 * Android: Saves directly to Downloads folder (permanent)
 * iOS: Opens share sheet for user to choose save location
 */
export const saveFile = async (
  fileUri: string,
  fileName: string,
  fileType: "pdf" | "excel"
): Promise<boolean> => {
  const mimeType =
    fileType === "pdf"
      ? "application/pdf"
      : fileType === "excel"
        ? "text/csv"
        : "application/octet-stream";

  if (Platform.OS === "android") {
    return await saveToDownloadsAndroid(fileUri, fileName, mimeType);
  } else {
    return await saveFileIOS(fileUri, fileName, mimeType);
  }
};

/**
 * Helper to clear cached directory URI (useful for testing or if user wants to change location)
 */
export const clearSavedDirectory = async (): Promise<void> => {
  await AsyncStorage.removeItem(SAF_DIR_KEY);
};