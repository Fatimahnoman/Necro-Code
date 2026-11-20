"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createHistoryId,
  type GrimoireHistoryEntry,
  HISTORY_STORAGE_KEY,
  isGrimoireHistoryEntry,
  MAX_HISTORY_ENTRIES,
} from "@/lib/history";

function readHistory(): GrimoireHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGrimoireHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function persistHistory(entries: GrimoireHistoryEntry[]): GrimoireHistoryEntry[] {
  if (typeof window === "undefined") return entries;

  for (let limit = entries.length; limit > 0; limit -= 1) {
    const candidate = entries.slice(0, limit);
    try {
      window.localStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(candidate),
      );
      return candidate;
    } catch {
      // Quota exceeded — retry with fewer entries.
    }
  }

  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  return [];
}

export function useGrimoireHistory() {
  const [entries, setEntries] = useState<GrimoireHistoryEntry[]>([]);

  useEffect(() => {
    setEntries(readHistory());
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_STORAGE_KEY) setEntries(readHistory());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const addEntry = useCallback((entry: GrimoireHistoryEntry) => {
    setEntries((prev) => {
      const next = [
        entry,
        ...prev.filter((item) => item.id !== entry.id),
      ].slice(0, MAX_HISTORY_ENTRIES);
      return persistHistory(next);
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);

  return {
    entries,
    addEntry,
    clearHistory,
    createId: createHistoryId,
  };
}
