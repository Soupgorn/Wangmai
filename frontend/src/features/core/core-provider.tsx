"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MockCoreRepository } from "./mock-repository";
import type { BlockDraft, CoreRepository, CoreSnapshot, Profile } from "./types";

type CoreContextValue = {
  snapshot: CoreSnapshot | null;
  error: string;
  retry: () => void;
  saveBlock: (draft: BlockDraft, id?: string) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
  updateProfile: (patch: Pick<Profile, "displayName" | "timezone" | "shareAvailability">) => Promise<void>;
};
const CoreContext = createContext<CoreContextValue | null>(null);

export function CoreProvider({ children, repository }: { children: ReactNode; repository?: CoreRepository }) {
  const [adapter] = useState(() => repository ?? new MockCoreRepository());
  const [snapshot, setSnapshot] = useState<CoreSnapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    adapter.getSnapshot().then(
      (value) => { if (current) { setSnapshot(value); setError(""); } },
      () => { if (current) setError("The preview could not load. Please try again."); },
    );
    return () => { current = false; };
  }, [adapter, attempt]);
  return <CoreContext.Provider value={{
    snapshot, error,
    retry: () => setAttempt((value) => value + 1),
    saveBlock: async (draft, id) => setSnapshot(await adapter.saveBlock(draft, id)),
    deleteBlock: async (id) => setSnapshot(await adapter.deleteBlock(id)),
    updateProfile: async (patch) => setSnapshot(await adapter.updateProfile(patch)),
  }}>{children}</CoreContext.Provider>;
}

export function useCore() {
  const context = useContext(CoreContext);
  if (!context) throw new Error("Core views must be inside CoreProvider.");
  return context;
}
