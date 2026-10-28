"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MockCoreRepository } from "./mock-repository";
import { DatabaseCoreRepository, ScheduleRequestError } from "./database-repository";
import type { BlockDraft, CoreRepository, CoreSnapshot, Profile } from "./types";

type CoreContextValue = {
  mode: "preview" | "persistent";
  snapshot: CoreSnapshot | null;
  error: string;
  retry: () => void;
  saveBlock: (draft: BlockDraft, id?: string) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
  updateProfile: (patch: Pick<Profile, "displayName" | "timezone" | "shareAvailability">) => Promise<void>;
  saveOccurrence: (id: string, date: string, replacement: BlockDraft | null) => Promise<void>;
  restoreOccurrence: (id: string, date: string) => Promise<void>;
};
const CoreContext = createContext<CoreContextValue | null>(null);

export function CoreProvider({ children, repository, mode = "preview" }: { children: ReactNode; repository?: CoreRepository; mode?: "preview" | "persistent" }) {
  const [adapter] = useState<CoreRepository>(() => repository ?? (mode === "persistent" ? new DatabaseCoreRepository() : new MockCoreRepository()));
  const pending = useRef(false);
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<CoreSnapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    adapter.getSnapshot().then(
      (value) => { if (current) { setSnapshot(value); setError(""); } },
      (reason) => { if (current) {
        if (reason instanceof ScheduleRequestError && reason.status === 401) router.replace("/login");
        setError(mode === "persistent" ? "Your saved schedule could not load. Please try again." : "The preview could not load. Please try again.");
      } },
    );
    return () => { current = false; };
  }, [adapter, attempt, mode, router]);
  async function mutate(action: () => Promise<CoreSnapshot>) {
    if (pending.current) throw new Error("Wait for the current save to finish.");
    pending.current = true;
    try { setSnapshot(await action()); }
    catch (error) { if (error instanceof ScheduleRequestError && error.status === 401) router.replace("/login"); throw error; }
    finally { pending.current = false; }
  }
  return <CoreContext.Provider value={{
    snapshot, error, mode,
    retry: () => { setSnapshot(null); setError(""); setAttempt((value) => value + 1); },
    saveBlock: (draft, id) => mutate(() => adapter.saveBlock(draft, id)),
    deleteBlock: (id) => mutate(() => adapter.deleteBlock(id)),
    updateProfile: (patch) => mutate(() => adapter.updateProfile(patch)),
    saveOccurrence: (id, date, replacement) => mutate(() => { if (!adapter.saveOccurrence) throw new Error("Occurrence overrides require a saved schedule."); return adapter.saveOccurrence(id, date, replacement); }),
    restoreOccurrence: (id, date) => mutate(() => { if (!adapter.restoreOccurrence) throw new Error("Occurrence overrides require a saved schedule."); return adapter.restoreOccurrence(id, date); }),
  }}>{children}</CoreContext.Provider>;
}

export function useCore() {
  const context = useContext(CoreContext);
  if (!context) throw new Error("Core views must be inside CoreProvider.");
  return context;
}
