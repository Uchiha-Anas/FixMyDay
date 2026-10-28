import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarRange,
  Compass,
  Eye,
  ShieldCheck,
  Target,
  Timer,
} from "lucide-react";
import { Logo } from "@/components/app/logo";
import { LinkButton } from "@/components/app/link-button";
import { LandingPreview } from "@/components/landing/preview";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const FEATURES = [
  {
    icon: Brain,
    title: "Brain dump to tasks",
    body: "Write the way you think. FixMyDay pulls out tasks with priority, duration, deadlines and dependencies, and asks when something is unclear.",
  },
  {
    icon: CalendarRange,
    title: "A plan that actually fits",
    body: "A deterministic scheduler fits work into your real hours and around your commitments, with breaks and buffers. No overlaps, no wishful thinking.",
  },
  {
    icon: Compass,
    title: "What should I do now?",
    body: "One button weighs deadlines, importance, what's scheduled right now and what's blocked, then tells you the next best thing and why.",
  },
  {
    icon: Timer,
    title: "Distraction-free focus",
    body: "A focus timer that stays accurate in background tabs, nudges you to take breaks and records every session.",
  },
  {
    icon: BarChart3,
    title: "Honest analytics",
    body: "Completion rates, focus time and overdue trends calculated from what you actually did, not vanity metrics.",
  },
  {
    icon: Target,
    title: "Goals and habits",
    body: "Break goals into steps and keep routines going with streaks and weekly consistency, without guilt trips for a missed day.",
  },
];

const STEPS = [
  { n: "01", title: "Empty your head", body: "Type or paste everything on your mind: deadlines, errands, half-formed ideas." },
  { n: "02", title: "Review what it found", body: "Edit, remove or approve each task. Nothing is saved until you say so." },
  { n: "03", title: "Get a realistic day", body: "See exactly what fits, what doesn't, and what to start on right now." },
];

export default function LandingPage() {
  const primaryHref = isSupabaseConfigured ? "/signup" : "/dashboard";
  const primaryLabel = isSupabaseConfigured ? "Get started" : "Try the demo";

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6" aria-label="Main">
          <Link href="/" aria-label="FixMyDay home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#principles" className="hover:text-foreground">Principles</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSupabaseConfigured && (
              <LinkButton href="/login" variant="ghost" className="hidden sm:inline-flex">
                Sign in
              </LinkButton>
            )}
            <LinkButton href={primaryHref}>
              {primaryLabel} <ArrowRight />
            </LinkButton>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
              <span className="size-1.5 rounded-full bg-primary" /> Personal planning, minus the overwhelm
            </p>
            <h1 className="font-display text-5xl leading-[1.05] text-balance sm:text-7xl">
              Turn a messy mind into a day that <em className="text-primary">actually works.</em>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-balance text-muted-foreground">
              Write down everything you&apos;re juggling. FixMyDay turns it into clear tasks and a realistic schedule that fits your
              real hours, and tells you what to do next.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <LinkButton href={primaryHref} size="lg" className="h-11 px-5 text-base">
                {primaryLabel} <ArrowRight />
              </LinkButton>
              <LinkButton href="#how" variant="outline" size="lg" className="h-11 px-5 text-base">
                See how it works
              </LinkButton>
            </div>
            {!isSupabaseConfigured && (
              <p className="mt-3 text-xs text-muted-foreground">Demo mode: no sign-up needed, data stays in your browser.</p>
            )}
          </div>
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="absolute -inset-x-10 -top-10 -bottom-10 -z-10 rounded-[3rem] bg-primary/8 blur-3xl" aria-hidden />
            <LandingPreview />
          </div>
        </section>

        <section id="features" className="border-t bg-surface/40 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-4xl sm:text-5xl">Everything a busy day needs.</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">Nothing it doesn&apos;t. Each piece works on its own and better together.</p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="surface-card p-6">
                  <div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary/12">
                    <f.icon className="size-5 text-primary" aria-hidden />
                  </div>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-4xl sm:text-5xl">How it works</h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="border-t pt-6">
                  <span className="font-display text-4xl text-primary">{s.n}</span>
                  <h3 className="mt-3 font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="principles" className="border-t bg-surface/40 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-4xl sm:text-5xl">Honest by design.</h2>
              <p className="mt-3 max-w-md text-muted-foreground">
                A plan you can trust beats a plan that looks good. These are the rules FixMyDay follows.
              </p>
            </div>
            <ul className="grid gap-5">
              {[
                [Eye, "No invented deadlines", "Dates and times are only set when you mention them. Ambiguity gets a question, not a guess."],
                [CalendarRange, "Overload is shown, not hidden", "If your day doesn't fit, you'll see exactly what was left out and why."],
                [ShieldCheck, "Your data is yours", "With an account, every row is protected by per-user access rules. In demo mode, nothing leaves your browser."],
              ].map(([Icon, title, body]) => {
                const I = Icon as typeof Eye;
                return (
                  <li key={title as string} className="flex gap-4">
                    <I className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div>
                      <h3 className="font-medium">{title as string}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{body as string}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="py-24 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="font-display text-4xl sm:text-5xl">Your day, sorted in a minute.</h2>
            <LinkButton href={primaryHref} size="lg" className="mt-8 h-11 px-6 text-base">
              {primaryLabel} <ArrowRight />
            </LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <Link href="/planner" className="hover:text-foreground">Planner</Link>
            <Link href="/focus" className="hover:text-foreground">Focus</Link>
            {isSupabaseConfigured && <Link href="/login" className="hover:text-foreground">Sign in</Link>}
            {isSupabaseConfigured && <Link href="/signup" className="hover:text-foreground">Create account</Link>}
          </nav>
          <p>© FixMyDay</p>
        </div>
      </footer>
    </div>
  );
}
