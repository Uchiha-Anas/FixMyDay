/**
 * End-to-end smoke test for demo mode, driven through a locally installed
 * Chrome (no browser download needed).
 *
 *   npm run build && npx next start -p 3100   # in one terminal
 *   npm run test:e2e                           # in another
 *
 * Env: BASE_URL (default http://localhost:3100), CHROME_CHANNEL (default "chrome"; "msedge" also works),
 *      SCREENSHOT_DIR (optional, saves screenshots).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const problems = [];
let passed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    problems.push(`${name}: ${error.message.split("\n")[0]}`);
    console.log(`  ✗ ${name}\n      ${error.message.split("\n").slice(0, 3).join("\n      ")}`);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "dark" });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`[${page.url()}] ${m.text()}`);
});
page.on("pageerror", (e) => consoleErrors.push(`[${page.url()}] pageerror: ${e.message}`));

const shot = async (name, p = page) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

console.log(`FixMyDay smoke test against ${BASE}\n`);

await step("landing page renders", async () => {
  await page.goto(BASE);
  await page.getByRole("heading", { level: 1 }).waitFor();
  expect((await page.textContent("h1")).includes("actually works"), "headline missing");
  await shot("01-landing");
});

await step("first visit goes through onboarding with sample data", async () => {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("What should we call you?").fill("Alex");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Explore with sample data/ }).click();
  await page.getByRole("button", { name: "Open my dashboard" }).click();
  await page.waitForURL("**/dashboard");
  await page.getByText(/, Alex\./).waitFor();
});

await step("dashboard shows next action, schedule and progress", async () => {
  await page.getByText("Do this next").waitFor();
  await page.getByText("Today's schedule").waitFor();
  await page.getByText("Upcoming deadlines").waitFor();
  expect(await page.getByRole("button", { name: "Start now" }).isVisible(), "next action has no Start button");
  await shot("02-dashboard");
});

await step("'What should I do now?' dialog recommends a real task", async () => {
  await page.getByRole("button", { name: /What should I do now/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start now" }).waitFor();
  await dialog.getByRole("button", { name: "Suggest a different task" }).click();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
});

await step("brain dump extracts tasks for review and saves them", async () => {
  await page.getByLabel("Everything on your mind").first().fill(
    "I have an exam tomorrow, need to finish my portfolio website, go to the gym for an hour, and call my friend tonight.",
  );
  await page.getByRole("button", { name: "Fix my day" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Review your tasks").waitFor({ timeout: 45_000 });
  const titles = await dialog.getByLabel("Task title").evaluateAll((els) => els.map((e) => e.value));
  expect(titles.length >= 3, `expected ≥3 extracted tasks, got ${titles.length}`);
  await shot("03-brain-dump-review");
  await dialog.getByRole("button", { name: "Save tasks" }).click();
  await page.getByText(/Added \d+ tasks?/).first().waitFor();
});

await step("create, find and complete a task; it persists after reload", async () => {
  await page.goto(`${BASE}/tasks`);
  await page.getByRole("button", { name: "New task" }).first().click();
  await page.getByLabel("Title").fill("Write e2e smoke test");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Search tasks").fill("e2e smoke");
  const row = page.getByRole("checkbox", { name: "Complete “Write e2e smoke test”" });
  await row.waitFor();
  await row.click();
  await page.getByLabel("Status").selectOption("done");
  await page.getByRole("checkbox", { name: "Reopen “Write e2e smoke test”" }).waitFor();
  await page.reload();
  await page.getByLabel("Status").selectOption("done");
  await page.getByLabel("Search tasks").fill("e2e smoke");
  await page.getByRole("checkbox", { name: "Reopen “Write e2e smoke test”" }).waitFor();
  await shot("04-tasks");
});

await step("board view and task detail panel", async () => {
  await page.getByLabel("Search tasks").fill("");
  await page.getByRole("tab", { name: "Board view" }).click();
  await page.getByLabel("In progress column").waitFor();
  await page.getByRole("tab", { name: "List view" }).click();
  await page.getByLabel("Status").selectOption("open");
  await page.getByRole("button", { name: /Finish portfolio case study/ }).first().click();
  await page.getByText("Task details").waitFor();
  await page.keyboard.press("Escape");
});

await step("planner regenerates a conflict-free plan", async () => {
  await page.goto(`${BASE}/planner`);
  await page.getByRole("button", { name: /Regenerate plan|Plan my day/ }).first().click();
  await page.getByText("Free time left", { exact: true }).waitFor();
  expect(!(await page.getByText(/scheduling conflict/).isVisible()), "plan has conflicts");
  await page.getByRole("button", { name: "Tomorrow" }).click();
  await page.getByRole("button", { name: /Regenerate plan|Plan my day/ }).first().click();
  await page.getByText(/Schedule for tomorrow/).waitFor();
  await shot("05-planner");
});

await step("calendar week and day views", async () => {
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("tab", { name: "Week" }).waitFor();
  await page.getByText("Design critique").first().waitFor();
  await shot("06-calendar-week");
  await page.getByRole("tab", { name: "Day" }).click();
  await shot("07-calendar-day");
});

await step("focus timer starts, pauses and resumes", async () => {
  await page.goto(`${BASE}/focus`);
  await page.getByRole("button", { name: "25 min" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).waitFor();
  const shown = await page.locator("p.font-mono").textContent();
  expect(/^2[45]:\d\d$/.test(shown.trim()), `unexpected timer display ${shown}`);
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).waitFor();
  await page.getByRole("button", { name: /Reset timer/ }).click();
  await shot("08-focus");
});

await step("analytics renders charts from records", async () => {
  await page.goto(`${BASE}/analytics`);
  await page.getByText("Tasks completed").waitFor();
  await page.waitForSelector(".recharts-surface");
  const charts = await page.locator(".recharts-surface").count();
  expect(charts >= 4, `expected ≥4 charts, got ${charts}`);
  await shot("09-analytics");
});

await step("goals & habits: check in a habit", async () => {
  await page.goto(`${BASE}/goals`);
  await page.getByText("Land a product design role").waitFor();
  const checkIn = page.getByRole("button", { name: /Check in|Done today/ }).first();
  const before = await checkIn.textContent();
  await checkIn.click();
  await page.waitForTimeout(200);
  expect((await checkIn.textContent()) !== before, "habit check-in did not toggle");
  await shot("10-goals");
});

await step("settings save working hours", async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("Day ends").fill("17:30");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Settings saved").waitFor();
  await page.reload();
  expect((await page.getByLabel("Day ends").inputValue()) === "17:30", "working hours not persisted");
});

await step("light theme toggle", async () => {
  await page.goto(`${BASE}/dashboard`);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.waitForTimeout(200);
  expect(!(await page.evaluate(() => document.documentElement.classList.contains("dark"))), "theme did not switch");
  await shot("11-dashboard-light");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
});

await step("mobile layout has no horizontal overflow", async () => {
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  mobile.on("pageerror", (e) => consoleErrors.push(`[mobile] pageerror: ${e.message}`));
  // Reuse this browser's demo data.
  const state = await context.storageState();
  const ls = state.origins.find((o) => o.origin === new URL(BASE).origin)?.localStorage ?? [];
  await mobile.goto(BASE);
  await mobile.evaluate((items) => items.forEach(({ name, value }) => localStorage.setItem(name, value)), ls);
  for (const path of ["/", "/dashboard", "/tasks", "/planner", "/calendar", "/focus", "/analytics", "/goals", "/settings"]) {
    await mobile.goto(`${BASE}${path}`);
    await mobile.waitForLoadState("networkidle");
    await mobile.waitForTimeout(300);
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 1, `${path} overflows horizontally by ${overflow}px`);
    if (path === "/dashboard" || path === "/") await shot(`12-mobile${path.replace("/", "-") || "-home"}`, mobile);
  }
  await mobile.close();
});

await step("invalid brain-dump requests are rejected by the API", async () => {
  const res = await page.request.post(`${BASE}/api/ai/brain-dump`, { data: { text: "x" } });
  expect(res.status() === 400, `expected 400, got ${res.status()}`);
  const big = await page.request.post(`${BASE}/api/ai/brain-dump`, {
    data: { text: "a".repeat(5000), today: "2026-10-28", nowTime: "10:00", timezone: "UTC" },
  });
  expect(big.status() === 400 || big.status() === 413, `expected 400/413 for oversized input, got ${big.status()}`);
});

await browser.close();

const relevantErrors = consoleErrors.filter((e) => !e.includes("Failed to load resource: the server responded with a status of 400"));
console.log(`\n${passed} passed, ${problems.length} failed`);
if (relevantErrors.length) {
  console.log(`\nConsole errors (${relevantErrors.length}):`);
  for (const e of [...new Set(relevantErrors)].slice(0, 30)) console.log(`  - ${e}`);
}
process.exit(problems.length || relevantErrors.length ? 1 : 0);
