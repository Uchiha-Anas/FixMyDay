"use server";

import { DEFAULT_PROFILE, mutationBatchSchema, profileSchema, type AppData, type Profile } from "@/lib/types";
import { TABLES, fromRow, mutationToOp } from "@/lib/supabase/mapping";
import { UnauthorizedError, requireUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string; unauthorized?: boolean };

function fail(error: unknown): { ok: false; error: string; unauthorized?: boolean } {
  if (error instanceof UnauthorizedError) return { ok: false, error: error.message, unauthorized: true };
  console.error("[data action]", error);
  return { ok: false, error: "Something went wrong saving your data. Please try again." };
}

/** Load every record belonging to the signed-in user. Authorization: session + RLS. */
export async function loadCloudData(): Promise<ActionResult<AppData>> {
  if (!isSupabaseConfigured) return { ok: false, error: "Cloud mode is not configured." };
  try {
    const { supabase, user } = await requireUser();

    const select = (table: string, order: string, limit = 5000, ascending = true) =>
      supabase.from(table).select("*").eq("user_id", user.id).order(order, { ascending }).limit(limit);

    const [profileRes, tasks, blocks, focus, goals, habits, logs, activity] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      select(TABLES.tasks.table, "created_at"),
      select(TABLES.blocks.table, "date"),
      select(TABLES.focusSessions.table, "started_at"),
      select(TABLES.goals.table, "created_at"),
      select(TABLES.habits.table, "created_at"),
      select(TABLES.habitLogs.table, "date"),
      select(TABLES.activity.table, "at", 2000, false),
    ]);
    const firstError = [profileRes, tasks, blocks, focus, goals, habits, logs, activity].find((r) => r.error)?.error;
    if (firstError) throw firstError;

    const rows = <S extends (typeof TABLES)[keyof typeof TABLES]["schema"]>(data: unknown[] | null, schema: S) =>
      (data ?? []).map((r) => fromRow(r as Record<string, unknown>, schema)).filter((x) => x !== null);

    let profile: Profile = { ...DEFAULT_PROFILE, displayName: (user.user_metadata?.display_name as string) ?? "" };
    if (profileRes.data) {
      const parsed = fromRow(profileRes.data as Record<string, unknown>, profileSchema);
      if (parsed) profile = parsed;
    }

    return {
      ok: true,
      data: {
        profile,
        tasks: rows(tasks.data, TABLES.tasks.schema),
        blocks: rows(blocks.data, TABLES.blocks.schema),
        focusSessions: rows(focus.data, TABLES.focusSessions.schema),
        goals: rows(goals.data, TABLES.goals.schema),
        habits: rows(habits.data, TABLES.habits.schema),
        habitLogs: rows(logs.data, TABLES.habitLogs.schema),
        activity: rows(activity.data, TABLES.activity.schema).reverse(),
      } as AppData,
    };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Apply a batch of mutations for the signed-in user. Every payload is
 * re-validated here; `user_id` is always taken from the verified session and
 * RLS policies enforce ownership again at the database level.
 */
export async function applyCloudMutations(input: unknown): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Cloud mode is not configured." };
  const parsed = mutationBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some of the data was invalid and wasn't saved." };

  try {
    const { supabase, user } = await requireUser();
    const ops = parsed.data.map((m) => mutationToOp(m, user.id));
    // Merge consecutive upserts into the same table (order is preserved for FKs).
    for (let i = 0; i < ops.length; ) {
      const op = ops[i];
      if (op.kind === "upsert") {
        const rows = [op.row];
        let j = i + 1;
        while (j < ops.length) {
          const next = ops[j];
          if (next.kind !== "upsert" || next.table !== op.table) break;
          rows.push(next.row);
          j++;
        }
        const { error } = await supabase.from(op.table).upsert(rows, { onConflict: "id" });
        if (error) throw error;
        i = j;
        continue;
      }
      const res =
        op.kind === "delete"
          ? await supabase.from(op.table).delete().eq("id", op.id).eq("user_id", user.id)
          : await supabase.from("profiles").upsert(op.row, { onConflict: "id" });
      if (res.error) throw res.error;
      i++;
    }
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

/** Permanently delete all of the user's productivity data (the account itself remains). */
export async function deleteAllCloudData(): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Cloud mode is not configured." };
  try {
    const { supabase, user } = await requireUser();
    for (const table of ["activity_events", "habit_logs", "habits", "focus_sessions", "schedule_blocks", "tasks", "goals"]) {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) throw error;
    }
    return { ok: true, data: null };
  } catch (error) {
    return fail(error);
  }
}
