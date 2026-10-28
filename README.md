# FixMyDay

FixMyDay turns a messy brain dump into reviewed tasks and a realistic daily plan. You write everything on your mind, approve the tasks it extracts, and get a schedule that fits your real working hours. The **What should I do now?** button then tells you which task to start next and why.

- **Next.js 16** (App Router, Cache Components) · **TypeScript** (strict) · **Tailwind CSS v4** · **shadcn/ui** (Base UI) · Lucide
- **Supabase** for auth + Postgres with Row Level Security
- **Anthropic** (official SDK) or **OpenAI** behind a small provider interface
- **Zod** validation everywhere data crosses a boundary · **Recharts** analytics · **Vitest** + Playwright smoke tests

---

## Quick start (demo mode, no credentials)

```bash
npm install
npm run dev          # http://localhost:3000
```

With no environment variables the app runs in **demo mode**:

- There are no accounts. You go straight into onboarding, where you can load realistic sample data or start empty.
- All data lives in this browser's `localStorage`. It is **not synced or backed up**, and the UI says so (sidebar badge, Settings).
- Brain dumps are parsed by a built-in rule-based parser, clearly labelled **"Demo parser"** in the review dialog.
- Everything else works: tasks, planner, calendar, focus, analytics, goals, habits and settings.

## Features

| Area | What works |
|---|---|
| **Dashboard** | Time-of-day greeting, today's progress, overdue alert, schedule, upcoming deadlines, inline brain dump, recommended next action, weekly summary, quick actions. Everything is computed from saved state. |
| **Brain dump** | Natural language → tasks with title, priority, duration, deadline, category, dependencies, time of day, confidence and clarification questions. You edit, remove or approve each task before anything is saved. Deadlines are only set when the text states them. |
| **Planner** | Deterministic scheduler: respects working hours, events, locked blocks, dependencies, same-day deadlines, preferred time windows, buffers and breaks. Splits long tasks, never overlaps, and lists what didn't fit with the reason ("Due & unplanned", capacity "Over"). You can regenerate, reorder, lock, reschedule, remove and schedule manually (with conflict validation). It also explains why the top tasks were prioritized. |
| **What should I do now?** | Ranks open, unblocked tasks by urgency, importance, deadline slack, current/next schedule block, progress, unblocking value and fit with the remaining time. Shows reasons, plus Start / Complete / Something else. |
| **Tasks** | Create, edit, delete (with undo), complete and reopen; priorities, categories, tags, deadlines, durations, dependencies, goals, recurring tasks (daily / weekdays / weekly). Search, filters, sorting, grouped list and drag-and-drop board, detail side panel. Keyboard: `N` new task, `B` brain dump, `W` what now. |
| **Focus** | Timer based on timestamps (correct in background tabs and across reloads), configurable length, pause/resume/reset/finish early, break phases with long breaks every 4 sessions, optional chime and desktop notifications, distraction-free fullscreen, session history. |
| **Calendar** | Day timeline and week grid with now line, deadlines, events, rescheduling, conflict highlighting, and distinct styles for completed / now / upcoming / overdue. This is an internal calendar only; no external sync. |
| **Analytics** | Completed per day, focus minutes, weekly on-time rate, overdue trend, priority distribution, 12-week activity heatmap, activity feed and a raw data table. Empty datasets are handled. |
| **Goals & habits** | Goals with target dates, steps linked as tasks, progress bars; habits with weekly targets, a streak that doesn't break before the day is over, and 4-week consistency. No shaming copy. |
| **Settings** | Name, time zone, working hours/days, buffers, break cadence, focus/break lengths, theme, week start, sound, notifications, AI status, export/import JSON, sample data, delete all data. |

## Enabling real integrations

Copy `.env.example` to `.env.local` and fill in what you need. Restart the dev server after changes. `NEXT_PUBLIC_*` values are inlined at build time, so rebuild for production.

### Supabase (accounts + cloud storage)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema: either paste `supabase/migrations/20261028000000_init.sql` into the SQL editor, or run `supabase link` then `supabase db push` with the CLI.
3. In **Authentication → URL Configuration**, set the Site URL (e.g. `http://localhost:3000`) and add `http://localhost:3000/auth/callback` (plus your production URL's `/auth/callback`) to the redirect URLs.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

When these are set, the app switches to **cloud mode**: sign up / sign in / sign out / password recovery, protected routes, and data stored per user. Demo-mode data in a browser is not migrated automatically; use **Settings → Export JSON** if you want to keep it.

### AI provider

Set **one** of these keys on the server:

| Variable | Default model | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `claude-opus-5-5` (override with `ANTHROPIC_MODEL`) | Official `@anthropic-ai/sdk`, JSON-schema structured output, `effort: low`, server-side refusal fallbacks on supported models |
| `OPENAI_API_KEY` | `gpt-5-mini` (override with `OPENAI_MODEL`) | Chat Completions with strict `json_schema` response format |

`AI_PROVIDER=anthropic|openai` forces a choice when both are set. Without Supabase, AI calls are anonymous, so they're only allowed in development unless `AI_ALLOW_ANONYMOUS=true`.

## Architecture

```
src/
  app/
    page.tsx                 landing page (static)
    (auth)/                  login, signup, forgot-password, reset-password
    auth/callback/route.ts   email confirmation / recovery code exchange
    onboarding/              first-run preferences
    (app)/                   dashboard, tasks, planner, calendar, focus, analytics, goals, settings
    actions/data.ts          server actions: load + apply mutations (cloud mode)
    api/ai/brain-dump        POST: validated, rate-limited AI parsing with fallback
    api/ai/status            GET: is an AI provider configured (no secrets)
  proxy.ts                   session refresh + optimistic route protection (Next 16 "proxy")
  lib/
    types.ts                 domain model + Zod schemas + mutation union
    mutations.ts             pure reducer shared by demo and cloud modes
    store.ts                 Zustand store: localStorage (demo) or server actions (cloud)
    app-actions.ts           domain operations → mutations (recurrence, undo, activity log)
    scheduler.ts             deterministic planner, conflict detection, swaps, free slots
    recommend.ts             "What should I do now?" ranking
    analytics.ts             metrics, streaks, habit + goal progress
    focus-timer.ts           timestamp-based timer state machine
    brain-dump/              heuristic parser, schemas, normalization of AI output, service
    ai/                      provider interface, Anthropic + OpenAI implementations, prompt, rate limiter
    supabase/                config, browser/server clients, row mapping
    seed.ts                  realistic, date-relative sample data
  components/app/            shell, task sheet, brain dump, next action, timelines, charts, …
supabase/migrations/         SQL schema, indexes, triggers, RLS policies
e2e/smoke.mjs                end-to-end smoke test (headless local Chrome)
```

**One write path.** Every change is a typed `Mutation` (e.g. `task.upsert`, `block.delete`). The client applies it optimistically through a pure reducer. In demo mode the result goes to `localStorage`. In cloud mode the same mutations go to a server action that re-validates them with Zod, gets the user from the verified session (`supabase.auth.getUser()`), stamps `user_id` itself, and writes through RLS. A user id supplied by the browser is never trusted. If a write fails, the client shows the error and reloads from the server.

**Deterministic core, AI at the edge.** All time arithmetic, conflict detection, prioritization and recommendations are plain TypeScript with unit tests. The LLM only interprets free text into candidate tasks. Its output is treated as untrusted: parsed against a schema, clamped and repaired (`normalizeModelTasks`), and past or implausible dates are dropped. Any failure (timeout, refusal, rate limit, malformed JSON) falls back to the heuristic parser, labelled as such.

**Times** are stored as local wall-clock values in the user's time zone: dates as `YYYY-MM-DD`, times as `HH:MM`, schedule blocks as minutes since midnight. Instants (completion, focus sessions) are ISO timestamps converted with `Intl` using the profile's zone.

### Data model

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | 1:1 with `auth.users`, created by trigger | time zone, working hours/days, focus/break prefs, theme, onboarded |
| `tasks` | to-dos | status, priority, category, tags[], estimated_minutes, due_date, due_time, depends_on uuid[], preferred_time, recurrence, goal_id → goals, completed_at |
| `schedule_blocks` | plan output, manual blocks, events | date, start_min, end_min, kind (task/event/break), task_id → tasks (cascade), locked, source |
| `focus_sessions` | timer history | task_id → tasks (set null), started_at, ended_at, planned/focused minutes, completed |
| `goals` | longer-term outcomes | title, description, target_date, status |
| `habits` / `habit_logs` | routines and check-ins | target_per_week / (habit_id, date) unique |
| `activity_events` | append-only history | type, task_id (no FK, survives deletes), title, at |

Every user-owned table has `user_id → auth.users on delete cascade`, indexes on the access paths, `created_at`/`updated_at` timestamps, `CHECK` constraints mirroring the Zod schemas, and owner-only RLS policies for select/insert/update/delete. A `security definer` trigger also rejects references to another user's goals, tasks or habits, because FK checks alone bypass RLS.

### Security notes

- API keys are read only on the server (`server-only` modules). Nothing secret uses `NEXT_PUBLIC_`.
- Brain-dump input is capped at 4,000 characters, validated, and rate-limited (6/min, 100/day per user or IP). The rate limiter lives in memory per instance; use Redis/Upstash behind the same interface for multi-instance deployments.
- The prompt tells the model to ignore instructions inside the user's text. Model output is never executed or used to build SQL or code.
- Redirect targets (`?next=`) are parsed the way browsers parse them and must resolve to the app's own origin.
- Every response carries security headers (`next.config.ts`): `frame-ancestors 'none'` / `X-Frame-Options: DENY` against clickjacking, `nosniff`, a strict referrer policy, a restrictive permissions policy and HSTS.
- The brain-dump endpoint stops reading a request body once it passes ~17 KB, even without a `Content-Length` header.
- Anonymous rate limiting uses `x-real-ip` / `x-forwarded-for`, which Vercel sets itself. Behind another proxy, make sure the proxy overwrites these headers.
- Apply **both** SQL migrations. The second one clamps signup display names and revokes direct execution of the trigger functions.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit tests (scheduler, recommender, parser, AI normalization/fallback, reducer, analytics, focus timer, auth/data boundaries, seed) |
| `npm run test:e2e` | End-to-end smoke test against a running server (see below) |

### End-to-end smoke test

The smoke test drives a locally installed Chrome with `playwright-core`, so there's no browser download. In demo mode it covers onboarding, the dashboard, What-now, brain-dump review/save, task create/complete/persist-after-reload, the board and detail panel, plan generation without conflicts, the calendar, focus pause/resume/reload, analytics charts, habit check-in, settings persistence, theme toggle, horizontal overflow at 375px on every page, API input validation, and it fails on any browser console error.

```bash
npm run build && npx next start -p 3100     # terminal 1
npm run test:e2e                            # terminal 2 (BASE_URL, CHROME_CHANNEL=msedge, SCREENSHOT_DIR optional)
```

## Deploying to Vercel

1. Push the repo and import it in Vercel. The framework is detected automatically; no extra config is needed.
2. Add the environment variables from `.env.example` (Supabase URL/key, and an AI key if wanted).
3. Add `https://<your-domain>/auth/callback` to Supabase's redirect URLs and set the Site URL.
4. Deploy. Without Supabase variables the deployment is a public demo with browser-only storage and AI disabled (unless `AI_ALLOW_ANONYMOUS=true`).

## Known limitations

- **No external calendar sync.** The calendar is internal. Google Calendar integration would need OAuth (via Supabase Auth or Google Identity), a stored refresh token per user, a server job that maps events into `schedule_blocks` with `kind = 'event'`, `locked = true` and an external id, and write-back for planned blocks.
- **Cloud mode was not exercised against a live Supabase project in this environment** (no credentials). It is covered by type checks, unit tests of the mapping and authorization boundary, and the SQL migration, but should be smoke-tested once a project is connected.
- **Real AI calls were not exercised** (no API keys here). The provider code type-checks against the SDK, and the validation and fallback paths are unit-tested with fake providers.
- Demo data isn't migrated to an account on sign-up (export/import JSON covers demo mode only).
- Notifications only fire while a FixMyDay tab is open; there are no push or email notifications.
- Cloud writes are optimistic and processed in order. Concurrent edits from two devices are last-write-wins.
- Rate limiting is per server instance (see Security notes).
