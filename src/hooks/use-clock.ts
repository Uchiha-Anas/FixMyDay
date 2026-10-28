"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { minutesInTz, todayInTz } from "@/lib/time";

/** Current time, refreshed periodically and whenever the tab becomes visible again. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** "Today" and the current minute in the user's configured time zone. */
export function useClock(intervalMs?: number) {
  const now = useNow(intervalMs);
  const tz = useAppStore((s) => s.data.profile.timezone);
  return useMemo(() => ({ now, tz, today: todayInTz(tz, now), nowMin: minutesInTz(now, tz) }), [now, tz]);
}
