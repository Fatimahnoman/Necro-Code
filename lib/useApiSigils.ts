"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_SIGILS_STORAGE_KEY,
  type ApiSigils,
  EMPTY_API_SIGILS,
  hasLiveSigils,
  normalizeApiSigils,
  sigilsToHeaders,
} from "@/lib/apiSigils";

function readStoredSigils(): ApiSigils {
  if (typeof window === "undefined") return EMPTY_API_SIGILS;

  try {
    const raw = window.localStorage.getItem(API_SIGILS_STORAGE_KEY);
    if (!raw) return EMPTY_API_SIGILS;
    return normalizeApiSigils(JSON.parse(raw) as Partial<ApiSigils>);
  } catch {
    return EMPTY_API_SIGILS;
  }
}

export function useApiSigils() {
  const [sigils, setSigils] = useState<ApiSigils>(EMPTY_API_SIGILS);

  useEffect(() => {
    setSigils(readStoredSigils());
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === API_SIGILS_STORAGE_KEY) {
        setSigils(readStoredSigils());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const saveSigils = useCallback((next: Partial<ApiSigils>) => {
    const normalized = normalizeApiSigils(next);
    setSigils(normalized);
    try {
      if (hasLiveSigils(normalized)) {
        window.localStorage.setItem(
          API_SIGILS_STORAGE_KEY,
          JSON.stringify(normalized),
        );
      } else {
        window.localStorage.removeItem(API_SIGILS_STORAGE_KEY);
      }
    } catch {
      // Private mode / quota: keys still work for the current session.
    }
  }, []);

  const clearSigils = useCallback(() => {
    setSigils(EMPTY_API_SIGILS);
    try {
      window.localStorage.removeItem(API_SIGILS_STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);

  const liveKeys = useMemo(() => hasLiveSigils(sigils), [sigils]);
  const headers = useMemo(() => sigilsToHeaders(sigils), [sigils]);

  return {
    sigils,
    liveKeys,
    headers,
    saveSigils,
    clearSigils,
  };
}
