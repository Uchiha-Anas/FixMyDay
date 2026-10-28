"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { ArrowLeft, ArrowRight, Check, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/app/primitives";
import { Logo } from "@/components/app/logo";
import { useAppStore } from "@/lib/store";
import { updateProfile } from "@/lib/app-actions";
import { buildSampleData } from "@/lib/seed";
import { profileSchema, type Profile } from "@/lib/types";
import { WEEKDAY_NAMES, formatDuration, guessTimeZone, toMinutes } from "@/lib/time";

const STEPS = ["About you", "Your day", "Focus style", "Get started"];

export default function OnboardingPage() {
  const router = useRouter();
  const mode = useAppStore((s) => s.mode);
  const data = useAppStore((s) => s.data);
  const replaceDemoData = useAppStore((s) => s.replaceDemoData);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [withSample, setWithSample] = useState(true);
  const [p, setP] = useState<Profile>(() => ({
    ...data.profile,
    timezone: data.profile.timezone === "UTC" ? guessTimeZone() : data.profile.timezone,
  }));
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [p.timezone];
    }
  }, [p.timezone]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setError(null);
  };

  function validateStep(): boolean {
    if (step === 1) {
      if (toMinutes(p.workEnd) <= toMinutes(p.workStart)) return fail("Your day needs to end after it starts.");
      if (p.workDays.length === 0) return fail("Pick at least one day you're available.");
    }
    return true;
  }
  function fail(msg: string) {
    setError(msg);
    return false;
  }

  function finish() {
    const parsed = profileSchema.safeParse({ ...p, onboarded: true });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check your settings.");
    if (mode === "demo" && withSample) {
      replaceDemoData(buildSampleData(parsed.data));
    } else {
      updateProfile(parsed.data);
    }
    router.replace("/dashboard");
  }

  const hours = (toMinutes(p.workEnd) - toMinutes(p.workStart)) * p.workDays.length;

  return (
    <div className="w-full max-w-lg">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <span className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
      </div>
      <ol className="mb-6 grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>

      <div className="surface-card p-6 sm:p-8">
        <h1 className="font-display text-3xl">{["Let's set up your day", "When are you available?", "How do you like to focus?", "Ready when you are"][step]}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {[
            "A couple of basics so dates and greetings make sense.",
            "The planner only schedules tasks inside these hours, so be realistic.",
            "These become your focus timer defaults. Change them any time.",
            mode === "demo"
              ? "You're in demo mode: everything stays in this browser. Explore with sample data or start fresh."
              : "Your preferences are saved to your account.",
          ][step]}
        </p>

        <div className="mt-6 grid gap-4">
          {step === 0 && (
            <>
              <Field label="What should we call you?" htmlFor="o-name">
                <Input id="o-name" autoFocus value={p.displayName} maxLength={80} placeholder="Your first name" onChange={(e) => set("displayName", e.target.value)} />
              </Field>
              <Field label="Time zone" htmlFor="o-tz" hint="Detected from your browser.">
                <NativeSelect id="o-tz" value={p.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {!zones.includes(p.timezone) && <option value={p.timezone}>{p.timezone}</option>}
                  {zones.map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}
                </NativeSelect>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Day starts" htmlFor="o-start">
                  <Input id="o-start" type="time" step={900} value={p.workStart} onChange={(e) => set("workStart", e.target.value)} />
                </Field>
                <Field label="Day ends" htmlFor="o-end">
                  <Input id="o-end" type="time" step={900} value={p.workEnd} onChange={(e) => set("workEnd", e.target.value)} />
                </Field>
              </div>
              <Field label="Available days">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Available days">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const on = p.workDays.includes(d);
                    return (
                      <Button key={d} type="button" size="sm" variant={on ? "secondary" : "ghost"} aria-pressed={on} className={cn("w-12", on && "ring-1 ring-primary/40")}
                        onClick={() => set("workDays", on ? p.workDays.filter((x) => x !== d) : [...p.workDays, d].sort())}>
                        {WEEKDAY_NAMES[d]}
                      </Button>
                    );
                  })}
                </div>
              </Field>
              {hours > 0 && <p className="text-xs text-muted-foreground">That&apos;s {formatDuration(hours)} of schedulable time per week, before meetings and breaks.</p>}
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Focus session length">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    [25, "Short sprints"],
                    [50, "Balanced"],
                    [90, "Deep work"],
                  ].map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set("focusMinutes", Number(m))}
                      aria-pressed={p.focusMinutes === m}
                      className={cn(
                        "rounded-xl border px-3 py-3 text-left transition-colors",
                        p.focusMinutes === m ? "border-primary bg-primary/10" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="block text-lg font-semibold">{m} min</span>
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Short break (min)" htmlFor="o-short">
                  <Input id="o-short" type="number" min={1} max={60} value={p.shortBreakMinutes} onChange={(e) => set("shortBreakMinutes", Number(e.target.value))} />
                </Field>
                <Field label="Buffer between tasks (min)" htmlFor="o-buffer">
                  <Input id="o-buffer" type="number" min={0} max={30} value={p.bufferMinutes} onChange={(e) => set("bufferMinutes", Number(e.target.value))} />
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {mode === "demo" ? (
                <div className="grid gap-2">
                  {[
                    { value: true, icon: Sparkles, title: "Explore with sample data", desc: "A realistic week of tasks, a planned day, focus history, goals and habits." },
                    { value: false, icon: Database, title: "Start with a clean slate", desc: "Begin empty and add your own tasks or a brain dump." },
                  ].map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      onClick={() => setWithSample(o.value)}
                      aria-pressed={withSample === o.value}
                      className={cn("flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", withSample === o.value ? "border-primary bg-primary/8" : "hover:bg-muted/50")}
                    >
                      <o.icon className="mt-0.5 size-5 text-primary" />
                      <span>
                        <span className="block text-sm font-medium">{o.title}</span>
                        <span className="text-xs text-muted-foreground">{o.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="size-4 text-success" /> Write a brain dump to capture everything on your mind</li>
                  <li className="flex gap-2"><Check className="size-4 text-success" /> Review the tasks it finds, then plan your day</li>
                  <li className="flex gap-2"><Check className="size-4 text-success" /> Ask “What should I do now?” whenever you&apos;re stuck</li>
                </ul>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => validateStep() && setStep((s) => s + 1)}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish}>
              Open my dashboard <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
