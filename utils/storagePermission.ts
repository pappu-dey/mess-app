import AsyncStorage from "@react-native-async-storage/async-storage";
import { StorageAccessFramework } from "expo-file-system/legacy";

const SAF_DIR_KEY = "DOWNLOADS_SAF_URI";

export const requestDownloadsPermissionOnce = async (): Promise<string> => {
    const savedUri = await AsyncStorage.getItem(SAF_DIR_KEY);
    if (savedUri) {
        return savedUri;
    }

    const permission =
        await StorageAccessFramework
            .requestDirectoryPermissionsAsync();

    if (!permission.granted) {
        throw new Error("Storage permission denied");
    }

    await AsyncStorage.setItem(
        SAF_DIR_KEY,
        permission.directoryUri
    );

    return permission.directoryUri;
};
