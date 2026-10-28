"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "cn";
import { Bell, Cloud, Database, Download, HardDrive, Save, Sparkles, Upload, UserRound, Clock, Timer, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, NativeSelect, PageHeader, Panel, PanelHeader } from "@/components/app/primitives";
import { useAppStore } from "@/lib/store";
import { updateProfile } from "@/lib/app-actions";
import { buildSampleData } from "@/lib/seed";
import { deleteAllCloudData } from "@/app/actions/data";
import { appDataSchema, emptyAppData, profileSchema, type AppData, type Profile } from "@/lib/types";
import { WEEKDAY_NAMES, guessTimeZone } from "@/lib/time";

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Tokyo"];
  }
}

export default function SettingsPage() {
  const data = useAppStore((s) => s.data);
  const mode = useAppStore((s) => s.mode);
  const { setTheme } = useTheme();
  const [draft, setDraft] = useState<Profile>(data.profile);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => timeZones(), []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.profile);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setError(null);
  };

  function save() {
    const parsed = profileSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Some settings are invalid.");
      return;
    }
    if (parsed.data.workDays.length === 0) return setError("Pick at least one working day.");
    updateProfile(parsed.data);
    setTheme(parsed.data.theme);
    toast.success("Settings saved");
  }

  return (
    <div className="pb-20">
      <PageHeader title="Settings" description="Your availability and preferences drive the planner, focus timer and analytics." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader icon={UserRound} title="Profile" />
          <div className="grid gap-4 p-5">
            <Field label="Display name" htmlFor="s-name">
              <Input id="s-name" value={draft.displayName} maxLength={80} onChange={(e) => set("displayName", e.target.value)} />
            </Field>
            <Field label="Time zone" htmlFor="s-tz" hint="Dates, deadlines and your schedule use this zone.">
              <div className="flex gap-2">
                <NativeSelect id="s-tz" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {!zones.includes(draft.timezone) && <option value={draft.timezone}>{draft.timezone}</option>}
                  {zones.map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}
                </NativeSelect>
                <Button type="button" variant="outline" size="sm" onClick={() => set("timezone", guessTimeZone())}>Detect</Button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Theme" htmlFor="s-theme">
                <NativeSelect id="s-theme" value={draft.theme} onChange={(e) => set("theme", e.target.value as Profile["theme"])}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">Match system</option>
                </NativeSelect>
              </Field>
              <Field label="Week starts on" htmlFor="s-week">
                <NativeSelect id="s-week" value={draft.weekStartsOn} onChange={(e) => set("weekStartsOn", Number(e.target.value) as 0 | 1)}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </NativeSelect>
              </Field>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader icon={Clock} title="Availability" description="The planner never schedules tasks outside these hours." />
          <div className="grid gap-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Day starts" htmlFor="s-start">
                <Input id="s-start" type="time" step={900} value={draft.workStart} onChange={(e) => set("workStart", e.target.value)} />
              </Field>
              <Field label="Day ends" htmlFor="s-end">
                <Input id="s-end" type="time" step={900} value={draft.workEnd} onChange={(e) => set("workEnd", e.target.value)} />
              </Field>
            </div>
            <Field label="Working days">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = draft.workDays.includes(d);
                  return (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={on ? "secondary" : "ghost"}
                      aria-pressed={on}
                      className={cn("w-12", on && "ring-1 ring-primary/40")}
                      onClick={() => set("workDays", on ? draft.workDays.filter((x) => x !== d) : [...draft.workDays, d].sort())}
                    >
                      {WEEKDAY_NAMES[d]}
                    </Button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buffer between tasks (min)" htmlFor="s-buffer">
                <Input id="s-buffer" type="number" min={0} max={30} value={draft.bufferMinutes} onChange={(e) => set("bufferMinutes", Number(e.target.value))} />
              </Field>
              <Field label="Break after (min of work)" htmlFor="s-breakafter">
                <Input id="s-breakafter" type="number" min={30} max={240} step={15} value={draft.breakAfterMinutes} onChange={(e) => set("breakAfterMinutes", Number(e.target.value))} />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader icon={Timer} title="Focus & breaks" />
          <div className="grid gap-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Focus (min)" htmlFor="s-focus">
                <Input id="s-focus" type="number" min={5} max={180} step={5} value={draft.focusMinutes} onChange={(e) => set("focusMinutes", Number(e.target.value))} />
              </Field>
              <Field label="Short break" htmlFor="s-short">
                <Input id="s-short" type="number" min={1} max={60} value={draft.shortBreakMinutes} onChange={(e) => set("shortBreakMinutes", Number(e.target.value))} />
              </Field>
              <Field label="Long break" htmlFor="s-long">
                <Input id="s-long" type="number" min={5} max={90} value={draft.longBreakMinutes} onChange={(e) => set("longBreakMinutes", Number(e.target.value))} />
              </Field>
            </div>
            <ToggleRow label="Break reminders" description="Suggest a break when a focus session ends." checked={draft.breakReminders} onChange={(v) => set("breakReminders", v)} />
            <ToggleRow label="Sound" description="Play a soft chime when a session ends." checked={draft.soundEnabled} onChange={(v) => set("soundEnabled", v)} />
            <NotificationRow />
          </div>
        </Panel>

        <AIStatusPanel />
        <DataPanel data={data} mode={mode} />
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 lg:bottom-6 lg:left-auto lg:right-8 lg:justify-end">
        <div className={cn("flex items-center gap-3 rounded-xl border bg-popover/95 px-4 py-2 shadow-lg backdrop-blur transition-all", dirty || error ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
          {error ? <span className="text-sm text-destructive" role="alert">{error}</span> : <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          <Button size="sm" variant="ghost" onClick={() => { setDraft(data.profile); setError(null); }}>Discard</Button>
          <Button size="sm" onClick={save}><Save /> Save</Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
      <span className="text-sm">
        {label}
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(v)} />
    </label>
  );
}

function NotificationRow() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5 text-sm">
      <span>
        Desktop notifications
        <span className="block text-xs text-muted-foreground">
          {perm === "granted" ? "Enabled: you'll be notified when a session ends in a background tab." : perm === "denied" ? "Blocked in your browser settings." : perm === "unsupported" ? "Not supported in this browser." : "Only used for focus session reminders."}
        </span>
      </span>
      {perm === "default" && (
        <Button size="sm" variant="outline" onClick={() => void Notification.requestPermission().then(setPerm)}>
          <Bell /> Enable
        </Button>
      )}
    </div>
  );
}

function AIStatusPanel() {
  const [status, setStatus] = useState<{ configured: boolean; provider: string | null; model: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, provider: null, model: null }));
  }, []);
  return (
    <Panel>
      <PanelHeader icon={Sparkles} title="AI assistant" description="Used only to interpret brain dumps. Scheduling is always done by FixMyDay's own rules." />
      <div className="p-5 text-sm">
        {status === null ? (
          <p className="text-muted-foreground">Checking…</p>
        ) : status.configured ? (
          <p>
            <span className="font-medium text-success">Connected</span>
            <span className="text-muted-foreground"> · {status.provider} ({status.model})</span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Not configured. Brain dumps use the built-in demo parser. Set <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> or{" "}
            <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> on the server to enable AI (see README).
          </p>
        )}
      </div>
    </Panel>
  );
}

function DataPanel({ data, mode }: { data: AppData; mode: "demo" | "cloud" }) {
  const replaceDemoData = useAppStore((s) => s.replaceDemoData);
  const reload = useAppStore((s) => s.reload);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "sample" | "empty">(null);

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: "FixMyDay", version: 1, data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fixmyday-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    try {
      if (file.size > 5_000_000) throw new Error("File is too large.");
      const json = JSON.parse(await file.text());
      const parsed = appDataSchema.safeParse(json?.data ?? json);
      if (!parsed.success) throw new Error("This file isn't a valid FixMyDay export.");
      replaceDemoData(parsed.data as AppData);
      toast.success("Data imported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    }
  }

  async function runConfirmed() {
    const action = confirm;
    setConfirm(null);
    if (action === "sample") {
      replaceDemoData(buildSampleData({ ...data.profile, onboarded: true }));
      toast.success("Sample data loaded");
    } else if (action === "empty" || (action === "delete" && mode === "demo")) {
      replaceDemoData(emptyAppData({ ...data.profile }));
      toast.success("All data cleared");
    } else if (action === "delete") {
      const res = await deleteAllCloudData();
      if (res.ok) {
        await reload();
        toast.success("All of your productivity data was deleted");
      } else toast.error(res.error);
    }
  }

  return (
    <Panel>
      <PanelHeader icon={Database} title="Account & data" />
      <div className="grid gap-4 p-5">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
          {mode === "demo" ? <HardDrive className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <Cloud className="mt-0.5 size-4 shrink-0 text-success" />}
          <p>
            {mode === "demo" ? (
              <>
                <span className="font-medium">Demo mode.</span>{" "}
                <span className="text-muted-foreground">
                  Your data is stored only in this browser&apos;s local storage. It is not synced, backed up or protected by an account.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">Signed in.</span>{" "}
                <span className="text-muted-foreground">Your data is stored in your account and only you can access it.</span>
              </>
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.tasks.length} tasks · {data.focusSessions.length} focus sessions · {data.goals.length} goals · {data.habits.length} habits
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportData}><Download /> Export JSON</Button>
          {mode === "demo" && (
            <>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload /> Import JSON</Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importData(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={() => setConfirm("sample")}><RotateCcw /> Load sample data</Button>
            </>
          )}
          <Button variant="destructive" size="sm" onClick={() => setConfirm("delete")}><Trash2 /> Delete all data</Button>
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "sample" ? "Replace with sample data?" : "Delete all your data?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "sample"
                ? "This replaces everything in this demo workspace with a realistic sample. Export first if you want to keep your data."
                : "All tasks, schedules, focus sessions, goals, habits and history will be permanently deleted. This cannot be undone. Your settings are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={confirm === "sample" ? "default" : "destructive"} onClick={() => void runConfirmed()}>
              {confirm === "sample" ? "Replace" : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
