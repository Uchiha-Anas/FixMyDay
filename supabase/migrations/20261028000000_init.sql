-- FixMyDay initial schema
-- Every user-owned table carries user_id and is protected by Row Level Security
-- so a user can only ever read or write their own rows.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null default '' check (char_length(display_name) <= 80),
  timezone            text not null default 'UTC' check (char_length(timezone) <= 64),
  work_start          text not null default '09:00' check (work_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  work_end            text not null default '18:00' check (work_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  work_days           smallint[] not null default '{1,2,3,4,5}',
  focus_minutes       int not null default 50 check (focus_minutes between 5 and 180),
  short_break_minutes int not null default 10 check (short_break_minutes between 1 and 60),
  long_break_minutes  int not null default 20 check (long_break_minutes between 5 and 90),
  buffer_minutes      int not null default 5 check (buffer_minutes between 0 and 30),
  break_after_minutes int not null default 90 check (break_after_minutes between 30 and 240),
  week_starts_on      smallint not null default 1 check (week_starts_on in (0, 1)),
  theme               text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  break_reminders     boolean not null default true,
  sound_enabled       boolean not null default true,
  onboarded           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (work_end > work_start)
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  target_date date,
  status      text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index goals_user_idx on public.goals (user_id, created_at);
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 200),
  description       text not null default '' check (char_length(description) <= 4000),
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority          text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  category          text not null default 'personal'
                    check (category in ('work', 'study', 'health', 'personal', 'errands', 'social', 'home', 'finance')),
  tags              text[] not null default '{}',
  estimated_minutes int not null default 30 check (estimated_minutes between 5 and 720),
  due_date          date,
  due_time          text check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  depends_on        uuid[] not null default '{}',
  preferred_time    text not null default 'any' check (preferred_time in ('morning', 'afternoon', 'evening', 'any')),
  recurrence        text not null default 'none' check (recurrence in ('none', 'daily', 'weekdays', 'weekly')),
  goal_id           uuid references public.goals (id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_goal_idx on public.tasks (goal_id);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Schedule blocks (planner output, manual time blocks and calendar events)
-- Times are minutes since local midnight in the user's time zone.
-- ---------------------------------------------------------------------------
create table public.schedule_blocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  start_min  int not null check (start_min between 0 and 1440),
  end_min    int not null check (end_min between 0 and 1440),
  kind       text not null check (kind in ('task', 'event', 'break')),
  task_id    uuid references public.tasks (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  locked     boolean not null default false,
  source     text not null default 'manual' check (source in ('planner', 'manual')),
  created_at timestamptz not null default now(),
  check (end_min > start_min)
);
create index schedule_blocks_user_date_idx on public.schedule_blocks (user_id, date);
create index schedule_blocks_task_idx on public.schedule_blocks (task_id);

-- ---------------------------------------------------------------------------
-- Focus sessions
-- ---------------------------------------------------------------------------
create table public.focus_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id         uuid references public.tasks (id) on delete set null,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  planned_minutes int not null check (planned_minutes between 1 and 240),
  focused_minutes int not null check (focused_minutes between 0 and 240),
  completed       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index focus_sessions_user_started_idx on public.focus_sessions (user_id, started_at);

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 120),
  target_per_week int not null default 5 check (target_per_week between 1 and 7),
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id);

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id   uuid not null references public.habits (id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- Activity history (append-only log used for the analytics timeline)
-- task_id has no FK so history survives task deletion.
-- ---------------------------------------------------------------------------
create table public.activity_events (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type    text not null check (type in (
            'task_created', 'task_completed', 'task_reopened', 'task_deleted',
            'focus_completed', 'plan_generated', 'habit_logged')),
  task_id uuid,
  title   text not null default '' check (char_length(title) <= 200),
  at      timestamptz not null default now()
);
create index activity_events_user_at_idx on public.activity_events (user_id, at desc);

-- ---------------------------------------------------------------------------
-- Cross-row ownership checks: references to goals/tasks/habits must point at
-- rows owned by the same user (FK checks alone bypass RLS).
-- ---------------------------------------------------------------------------
create or replace function public.assert_same_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'tasks' and new.goal_id is not null then
    if not exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id) then
      raise exception 'goal does not belong to this user';
    end if;
  elsif tg_table_name in ('schedule_blocks', 'focus_sessions') and new.task_id is not null then
    if not exists (select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id) then
      raise exception 'task does not belong to this user';
    end if;
  elsif tg_table_name = 'habit_logs' then
    if not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
      raise exception 'habit does not belong to this user';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_same_owner before insert or update on public.tasks
  for each row execute function public.assert_same_owner();
create trigger schedule_blocks_same_owner before insert or update on public.schedule_blocks
  for each row execute function public.assert_same_owner();
create trigger focus_sessions_same_owner before insert or update on public.focus_sessions
  for each row execute function public.assert_same_owner();
create trigger habit_logs_same_owner before insert or update on public.habit_logs
  for each row execute function public.assert_same_owner();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.goals           enable row level security;
alter table public.tasks           enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.focus_sessions  enable row level security;
alter table public.habits          enable row level security;
alter table public.habit_logs      enable row level security;
alter table public.activity_events enable row level security;

create policy "profiles: owner can read"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner can insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: owner can update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array['goals', 'tasks', 'schedule_blocks', 'focus_sessions', 'habits', 'habit_logs', 'activity_events']
  loop
    execute format('create policy "%1$s: owner can read" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: owner can update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;
