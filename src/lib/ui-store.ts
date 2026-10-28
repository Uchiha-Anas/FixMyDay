"use client";

import { create } from "zustand";
import type { Task } from "./types";

interface UIState {
  /** null = closed; "new" = create; otherwise the id of the task being viewed. */
  taskSheet: { mode: "new"; defaults?: Partial<Task> } | { mode: "edit"; taskId: string } | null;
  brainDumpOpen: boolean;
  nextActionOpen: boolean;
  openNewTask: (defaults?: Partial<Task>) => void;
  openTask: (taskId: string) => void;
  closeTaskSheet: () => void;
  setBrainDumpOpen: (open: boolean) => void;
  setNextActionOpen: (open: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  taskSheet: null,
  brainDumpOpen: false,
  nextActionOpen: false,
  openNewTask: (defaults) => set({ taskSheet: { mode: "new", defaults } }),
  openTask: (taskId) => set({ taskSheet: { mode: "edit", taskId } }),
  closeTaskSheet: () => set({ taskSheet: null }),
  setBrainDumpOpen: (brainDumpOpen) => set({ brainDumpOpen }),
  setNextActionOpen: (nextActionOpen) => set({ nextActionOpen }),
}));
