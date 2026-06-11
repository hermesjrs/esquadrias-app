"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "esquadrias-claude-api-key";

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setApiKeyState(saved);
    } catch {
      // ignora
    }
  }, []);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    try {
      if (key) {
        localStorage.setItem(STORAGE_KEY, key);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignora
    }
  };

  return { apiKey, setApiKey };
}
