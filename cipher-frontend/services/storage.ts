import AsyncStorage from "@react-native-async-storage/async-storage";

export async function setItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
