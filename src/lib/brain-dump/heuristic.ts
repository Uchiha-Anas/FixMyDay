import type { Category, Priority, TimeOfDay } from "../types";
import { addDays, toHHMM, weekday } from "../time";
import { MAX_PARSED_TASKS, breakCycles, type ParsedTask } from "./schema";

/**
 * Rule-based brain-dump parser used in demo mode and whenever the AI provider
 * is unavailable. It only sets dates and times that appear in the text, and
 * flags anything it had to guess.
 */

const ACTION_VERBS = new Set(
  (
    "call email text message reply finish write go buy pay book read study prepare review clean cook send submit " +
    "fix update meet schedule plan practice work walk run visit pick drop return renew file check learn watch apply " +
    "organize do make take get start complete research design build test deploy attend wash water feed order cancel " +
    "print sign draft edit outline record ship publish follow ask tell remind sort tidy vacuum mow repair install " +
    "set call text finalize revise memorize exercise stretch meditate journal grab collect deliver post backup back " +
    "hang shop prep refill"
  ).split(" "),
);

const LEADING_FILLERS = [
  "and then", "and also", "and", "also", "then", "after that", "afterwards", "plus", "oh and", "oh",
  "i really need to", "i need to", "i have to", "i've got to", "i got to", "i gotta", "i must", "i should",
  "i want to", "i'd like to", "i'll", "i will", "i also need to", "i also have to", "need to", "have to",
  "got to", "gotta", "must", "should", "want to", "remember to", "don't forget to", "dont forget to",
  "please", "maybe", "probably", "we need to", "try to", "i", "to",
];

const PREP_EVENTS = ["exam", "test", "quiz", "midterm", "final", "finals", "interview", "presentation", "talk", "pitch", "demo"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["study", /\b(exam|test|quiz|midterm|finals?|study|homework|assignment|lecture|class|course|thesis|essay|revise|revision|chapter|flashcards?)\b/],
  ["health", /\b(gym|workout|run|running|jog|yoga|exercise|doctor|dentist|therapy|meditat\w*|stretch|walk|swim|physio|pharmacy|meds|medication|sleep)\b/],
  ["finance", /\b(pay|bill|bills|invoice|tax|taxes|budget|bank|rent|insurance|refund|expenses?|transfer)\b/],
  ["social", /\b(friend|friends|mom|mum|dad|parents|family|sister|brother|grandma|grandpa|birthday|party|dinner with|catch up|date)\b/],
  ["home", /\b(clean|laundry|dishes|vacuum|tidy|cook|groceries|garden|plants?|repair|fix the|mow|trash|bins?|declutter)\b/],
  ["errands", /\b(buy|pick up|drop off|post office|return|renew|order|shop|shopping|collect|deliver|car wash|haircut)\b/],
  ["work", /\b(work|client|meeting|report|email|emails|deck|slides|project|portfolio|website|deploy|code|review|pr|pull request|proposal|standup|manager|boss|team|deadline|resume|cv|linkedin)\b/],
];

const ESTIMATES: Array<[number, RegExp]> = [
  [15, /\b(call|text|email|reply|message|pay|book|order|renew|remind|sign|print|cancel|schedule)\b/],
  [60, /\b(gym|workout|run|yoga|exercise|swim)\b/],
  [120, /\b(prepare for|study|revise|finish|build|design|write|portfolio|website|essay|report|presentation|deck)\b/],
  [45, /\b(read|clean|cook|groceries|shopping|laundry|review)\b/],
  [60, /\b(meeting|appointment|dinner|lunch|interview)\b/],
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstWord(s: string): string {
  return s.trim().toLowerCase().replace(/^[^a-z']+/, "").split(/\s+/)[0] ?? "";
}

function stripFillers(s: string): string {
  let out = s.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of LEADING_FILLERS) {
      const re = new RegExp(`^${f.replace(/'/g, "['’]")}\\b[\\s,]*`, "i");
      if (re.test(out)) {
        out = out.replace(re, "");
        changed = true;
      }
    }
  }
  return out;
}

function looksLikeTaskStart(fragment: string): boolean {
  const stripped = stripFillers(fragment);
  const w = firstWord(stripped);
  return ACTION_VERBS.has(w) || /^(i|i'll|i've|have|need|gotta|must|should|remember|don't|dont|then|also|my|an?|the)\b/i.test(fragment.trim());
}

/** Split free text into candidate task fragments. */
export function splitFragments(text: string): string[] {
  const sentences = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?;])\s+|;\s*/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const sentence of sentences) {
    const pieces: string[] = [];
    for (const part of sentence.split(/,\s*/)) {
      // Captured separators sit at odd indexes: [text, sep, text, sep, text…]
      const tokens = part.split(/\s+(and then|and also|and|then|plus)\s+/i);
      for (let i = 0; i < tokens.length; i += 2) {
        const p = tokens[i];
        if (!p) continue;
        if (i === 0) {
          // A short comma piece without a verb continues the previous item ("milk, eggs, bread").
          if (pieces.length && !looksLikeTaskStart(p) && p.split(/\s+/).length <= 3) {
            pieces[pieces.length - 1] += `, ${p}`;
          } else pieces.push(p);
          continue;
        }
        const sep = tokens[i - 1].toLowerCase();
        if (looksLikeTaskStart(p)) pieces.push(sep.includes("then") ? `then ${p}` : p);
        else pieces[pieces.length - 1] += ` ${sep} ${p}`;
      }
    }
    out.push(...pieces);
  }
  return out.map((s) => s.replace(/[.!?;,\s]+$/, "").trim()).filter((s) => s.length > 1);
}

interface When {
  dueDate: string | null;
  dueTime: string | null;
  preferredTime: TimeOfDay;
  vague: string | null;
  rest: string;
}

function parseClock(h: string, m: string | undefined, ampm: string | undefined): number | null {
  let hour = Number(h);
  const min = m ? Number(m) : 0;
  if (hour > 23 || min > 59) return null;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  } else if (hour >= 1 && hour <= 7) {
    hour += 12; // "at 5" almost always means 5 PM in a to-do list
  }
  return hour * 60 + min;
}

function extractWhen(input: string, today: string): When {
  let rest = ` ${input} `;
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  let preferredTime: TimeOfDay = "any";
  let vague: string | null = null;
  const take = (re: RegExp) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(re, " ");
    return m;
  };

  if (take(/\b(?:by |before )?(?:the )?end of (?:the )?day\b|\b(?:by )?eod\b/i)) dueDate = today;
  if (take(/\btonight\b|\bthis evening\b/i)) {
    dueDate = today;
    preferredTime = "evening";
  }
  if (take(/\bthis morning\b/i)) {
    dueDate = today;
    preferredTime = "morning";
  }
  if (take(/\bthis afternoon\b/i)) {
    dueDate = today;
    preferredTime = "afternoon";
  }
  const tm = take(/\btomorrow(?:\s+(morning|afternoon|evening|night))?\b/i);
  if (tm) {
    dueDate = addDays(today, 1);
    const part = tm[1]?.toLowerCase();
    if (part) preferredTime = part === "night" ? "evening" : (part as TimeOfDay);
  }
  if (take(/\b(?:by |until )?today\b/i)) dueDate = today;

  const inDays = take(/\bin (\d{1,2}|a|one|two|three|four|five|six|seven) days?\b/i);
  if (inDays) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const n = words[inDays[1].toLowerCase()] ?? Number(inDays[1]);
    if (n > 0) dueDate = addDays(today, n);
  }

  const wd = take(new RegExp(`\\b(?:by |on |this |before |due )?(${WEEKDAYS.join("|")})\\b`, "i"));
  if (wd && !dueDate) {
    const target = WEEKDAYS.indexOf(wd[1].toLowerCase());
    const delta = (target - weekday(today) + 7) % 7 || 7;
    dueDate = addDays(today, delta);
  }

  const md = take(new RegExp(`\\b(?:by |on |due )?(${MONTHS.join("|")})[a-z]*\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"))
    ?? take(new RegExp(`\\b(?:by |on |due )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTHS.join("|")})[a-z]*\\b`, "i"));
  if (md && !dueDate) {
    const monthToken = isNaN(Number(md[1])) ? md[1] : md[2];
    const dayToken = isNaN(Number(md[1])) ? md[2] : md[1];
    const month = MONTHS.indexOf(monthToken.slice(0, 3).toLowerCase());
    const day = Number(dayToken);
    const year = Number(today.slice(0, 4));
    let candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate < today) candidate = `${year + 1}${candidate.slice(4)}`;
    if (day >= 1 && day <= 31) dueDate = candidate;
  }

  if (take(/\bnext week\b|\bthis week\b|\bsoon\b|\bsometime\b|\blater\b/i)) {
    vague = "No specific day was given. Want to set a deadline?";
  }

  const clock = take(/\b(?:at|by|before|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\W)/i)
    ?? take(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (clock) {
    const min = parseClock(clock[1], clock[2], clock[3]);
    if (min !== null) {
      if (dueDate) dueTime = toHHMM(min);
      else vague = `A time (${toHHMM(min)}) was mentioned but no day. Is this for today?`;
      if (preferredTime === "any") preferredTime = min < 720 ? "morning" : min < 1020 ? "afternoon" : "evening";
    }
  }
  const partOfDay = take(/\bin the (morning|afternoon|evening)\b/i);
  if (partOfDay) preferredTime = partOfDay[1].toLowerCase() as TimeOfDay;
  if (take(/\bat night\b/i)) preferredTime = "evening";
  if (take(/\b(?:first thing|early)\b/i)) preferredTime = "morning";

  return { dueDate, dueTime, preferredTime, vague, rest: rest.replace(/\s+/g, " ").trim() };
}

function extractDuration(s: string): { minutes: number | null; rest: string } {
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/\b(?:for )?(?:an|one) hour and a half\b/i, () => 90],
    [/\b(?:for )?half an hour\b/i, () => 30],
    [/\b(?:for )?(?:an|one) hour\b/i, () => 60],
    [/\b(?:for )?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i, (m) => Math.round(Number(m[1]) * 60)],
    [/\b(?:for )?(\d+)\s*(?:minutes?|mins?|m)\b/i, (m) => Number(m[1])],
    [/\b(?:for )?(a couple of|two|2) hours\b/i, () => 120],
    [/\b(?:for )?a few hours\b/i, () => 180],
  ];
  for (const [re, fn] of patterns) {
    const m = s.match(re);
    if (m) return { minutes: fn(m), rest: s.replace(re, " ").replace(/\s+/g, " ").trim() };
  }
  return { minutes: null, rest: s };
}

function detectCategory(lower: string): Category {
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(lower)) return cat;
  return "personal";
}

function estimate(lower: string): number {
  for (const [min, re] of ESTIMATES) if (re.test(lower)) return min;
  return 30;
}

function detectPriority(lower: string, dueDate: string | null, today: string): Priority {
  if (/\b(urgent|asap|immediately|right away|critical|emergency)\b/.test(lower)) return "urgent";
  if (/\b(if i have time|someday|eventually|no rush|low priority|maybe)\b/.test(lower)) return "low";
  const soon = dueDate !== null && dueDate <= addDays(today, 1);
  if (/\b(important|high priority|must|crucial|deadline)\b/.test(lower)) return "high";
  if (soon && /\b(exam|test|quiz|interview|presentation|submit|deadline|finals?|pitch)\b/.test(lower)) return "high";
  if (dueDate === today) return "high";
  return "medium";
}

function cleanTitle(s: string): string {
  return capitalize(
    s
      .replace(/\b(?:urgent(?:ly)?|asap|important|right away|if i have time|no rush)\b/gi, " ")
      .replace(/\s+(?:by|on|at|before|for|due|until)\s*$/i, "")
      .replace(/^(?:to|the)\s+/i, "")
      .replace(/\s+/g, " ")
      .replace(/[\s,.;:!-]+$/, "")
      .trim(),
  );
}

export function parseBrainDump(text: string, today: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  for (const fragment of splitFragments(text)) {
    if (tasks.length >= MAX_PARSED_TASKS) break;
    const original = fragment.trim();
    const sequential = /^(then|after that|afterwards|and then)\b/i.test(original);
    const lowerOriginal = original.toLowerCase();

    const when = extractWhen(original, today);
    const dur = extractDuration(when.rest);
    let body = stripFillers(dur.rest);

    // "I have an exam tomorrow" → "Prepare for the exam"
    const have = body.match(/^(?:have|got|there'?s)\s+(?:an?|my|the|this|that)?\s*(.+)$/i);
    if (have) {
      const noun = have[1];
      const isPrep = PREP_EVENTS.some((e) => new RegExp(`\\b${e}\\b`, "i").test(noun));
      body = isPrep ? `Prepare for ${noun.match(/^(?:my|the)\b/i) ? noun : `the ${noun}`}` : noun;
    }

    const title = cleanTitle(body);
    if (title.length < 2) continue;
    const lower = `${title.toLowerCase()} ${lowerOriginal}`;

    let confidence = 0.75;
    const clarifications: string[] = [];
    if (when.vague) {
      clarifications.push(when.vague);
      confidence -= 0.15;
    }
    if (dur.minutes === null) confidence -= 0.1;
    if (title.split(/\s+/).length < 2) {
      confidence -= 0.15;
      clarifications.push("This is quite short. Could you add what exactly needs doing?");
    }

    const minutes = dur.minutes ?? estimate(lower);
    tasks.push({
      title: title.slice(0, 200),
      description: `From your brain dump: “${original.slice(0, 300)}”`,
      priority: detectPriority(lower, when.dueDate, today),
      category: detectCategory(lower),
      estimatedMinutes: Math.min(720, Math.max(5, minutes)),
      dueDate: when.dueDate,
      dueTime: when.dueTime,
      preferredTime: when.preferredTime,
      dependsOn: sequential && tasks.length > 0 ? [tasks.length - 1] : [],
      tags: [],
      confidence: Math.max(0.2, Math.round(confidence * 100) / 100),
      clarification: clarifications[0] ?? null,
    });
  }
  return breakCycles(tasks);
}
