"use client";

import { useState, useEffect, useCallback } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // SSR対応: 初期値を返す
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isInitialized, setIsInitialized] = useState(false);

  // クライアントサイドでlocalStorageから読み込み
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsInitialized(true);
  }, [key]);

  // 値を設定
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  // 値を削除
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

// APIキー専用のフック
const GEMINI_API_KEY_STORAGE_KEY = "gemini-api-key";

export function useGeminiApiKey(): [
  string | null,
  (key: string) => void,
  () => void,
  boolean
] {
  const [apiKey, setApiKey, removeApiKey] = useLocalStorage<string | null>(
    GEMINI_API_KEY_STORAGE_KEY,
    null
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // クライアントサイドで読み込み完了を検出
    if (typeof window !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoaded(true);
    }
  }, []);

  const saveApiKey = useCallback(
    (key: string) => {
      setApiKey(key.trim());
    },
    [setApiKey]
  );

  return [apiKey, saveApiKey, removeApiKey, isLoaded];
}
