"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { applyMutations } from "./mutations";
import { appDataSchema, emptyAppData, type AppData, type Mutation } from "./types";
import { guessTimeZone } from "./time";
import { isSupabaseConfigured } from "./supabase/config";
import { applyCloudMutations, loadCloudData } from "@/app/actions/data";

export const DEMO_STORAGE_KEY = "fixmyday.demo.v1";

export type DataMode = "demo" | "cloud";
type Status = "idle" | "loading" | "ready" | "error";

interface AppState {
  mode: DataMode;
  status: Status;
  error: string | null;
  data: AppData;
  /** Number of cloud writes in flight. */
  pending: number;
  init: () => Promise<void>;
  reload: () => Promise<void>;
  commit: (ms: Mutation[]) => void;
  /** Demo mode only: replace everything (sample data, import, reset). */
  replaceDemoData: (data: AppData) => void;
}

function readDemo(): { data: AppData | null; corrupt: boolean } {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return { data: null, corrupt: false };
    const parsed = appDataSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { data: parsed.data as AppData, corrupt: false };
    window.localStorage.setItem(`${DEMO_STORAGE_KEY}.corrupt`, raw);
    return { data: null, corrupt: true };
  } catch {
    return { data: null, corrupt: true };
  }
}

function writeDemo(data: AppData) {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  } catch {
    toast.error("Couldn't save to this browser's storage. Your latest change may be lost on refresh.");
  }
}

let cloudQueue: Promise<void> = Promise.resolve();
let storageListener = false;

export const useAppStore = create<AppState>((set, get) => ({
  mode: isSupabaseConfigured ? "cloud" : "demo",
  status: "idle",
  error: null,
  data: emptyAppData(),
  pending: 0,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    await get().reload();
  },

  reload: async () => {
    if (get().mode === "demo") {
      const { data, corrupt } = readDemo();
      if (corrupt) toast.error("Saved demo data was unreadable, so a fresh workspace was started. A backup was kept.");
      const next = data ?? emptyAppData({ timezone: guessTimeZone() });
      if (!data) writeDemo(next);
      set({ data: next, status: "ready" });
      if (!storageListener) {
        storageListener = true;
        // Keep multiple tabs in sync in demo mode.
        window.addEventListener("storage", (e) => {
          if (e.key !== DEMO_STORAGE_KEY) return;
          const fresh = readDemo().data;
          if (fresh) set({ data: fresh });
        });
      }
      return;
    }
    const res = await loadCloudData();
    if (res.ok) set({ data: res.data, status: "ready", error: null });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    else if (res.unauthorized) window.location.assign("/login");
    else set({ status: "error", error: res.error });
  },

  commit: (ms) => {
    if (ms.length === 0) return;
    const next = applyMutations(get().data, ms);
    set({ data: next });
    if (get().mode === "demo") {
      writeDemo(next);
      return;
    }
    set((s) => ({ pending: s.pending + 1 }));
    cloudQueue = cloudQueue.then(async () => {
      try {
        const res = await applyCloudMutations(ms);
        if (!res.ok) {
          toast.error(res.error);
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          if (res.unauthorized) window.location.assign("/login");
          else await get().reload();
        }
      } catch {
        toast.error("You appear to be offline. Changes will be reloaded from the server.");
        await get().reload();
      } finally {
        set((s) => ({ pending: s.pending - 1 }));
      }
    });
  },

  replaceDemoData: (data) => {
    if (get().mode !== "demo") return;
    writeDemo(data);
    set({ data });
  },
}));

export function useAppData(): AppData {
  return useAppStore((s) => s.data);
}
