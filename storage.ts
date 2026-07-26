import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin JSON-aware wrapper around AsyncStorage, namespaced so multiple
 * caches/outboxes in the same app don't collide on keys.
 */
export class KeyedStorage {
  constructor(private namespace: string) {}

  private fullKey(key: string) {
    return `${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(this.fullKey(key));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(this.fullKey(key), JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.fullKey(key));
  }

  async keys(): Promise<string[]> {
    const all = await AsyncStorage.getAllKeys();
    const prefix = `${this.namespace}:`;
    return all
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }
}
