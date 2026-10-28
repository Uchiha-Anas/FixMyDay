# FixMyDay: development brief

This is the original brief FixMyDay was built from, kept verbatim for reference
(for example when reviewing security requirements against the implementation).
See the README for how each requirement was implemented and what remains limited.

---

PROJECT: FixMyDay — AI-Powered Personal Productivity Platform
You are my senior full-stack engineer, product designer, AI engineer, and QA tester. Your job is to develop a complete, polished, production-quality application, not just provide instructions or examples.

Take ownership of the entire development process. Make reasonable decisions independently, implement the application directly in the current workspace, run it, test it, identify bugs, and fix them.

Do not stop after creating a plan or scaffolding the project. Continue until the core product is working.

1. Product vision
Build FixMyDay, a beautiful AI-powered personal productivity platform that turns a user's messy thoughts, tasks, goals, and deadlines into a realistic daily plan.

The core experience should feel effortless:

A user opens the app, writes everything on their mind, clicks one button, and receives an organized, actionable plan for their day.

The product should feel like a premium SaaS startup, not a generic AI-generated dashboard or a basic todo app.

2. Technology stack
Use the following stack unless the existing project has a strong reason to use an alternative:

Next.js with App Router
TypeScript with strict type checking
Tailwind CSS
shadcn/ui for polished interface components
Lucide icons
Supabase for authentication and PostgreSQL database
OpenAI or Anthropic API for AI functionality, using a secure server-side integration
Zod for validating user input and AI-generated data
Recharts for analytics
Vercel-ready deployment configuration
Use current stable, mutually compatible package versions.

If API keys or external credentials are unavailable, build the application with a functional demo mode and clearly document how to enable the real integrations. Never invent credentials or expose secrets in client-side code.

3. Design and user experience
Create a distinctive, premium visual identity.

Design direction:

Elegant dark-first interface with a warm, subtle background.
Charcoal surfaces, soft borders, refined typography, and restrained accent colors.
Beautiful spacing, rounded cards, subtle shadows, and purposeful micro-interactions.
Responsive layouts for desktop, tablet, and mobile.
Collapsible sidebar on desktop and appropriate mobile navigation.
Thoughtful loading, empty, success, and error states.
Accessible controls, keyboard navigation, and clear focus indicators.
Light and dark themes if practical.
Avoid excessive gradients, excessive glassmorphism, oversized cards, and generic template styling.

The dashboard should have a clear visual hierarchy. The user must immediately understand what matters today and what to do next.

Use realistic sample data in demo mode. Never fill the UI with meaningless placeholder text.

4. Core features
A. Dashboard
Build a personalized dashboard containing:

Greeting based on the time of day.
Current date and a daily overview.
Progress toward today's tasks.
Upcoming deadlines.
A daily schedule and timeline.
A prominent AI brain-dump input.
A recommended next action.
A compact productivity summary.
Quick actions for adding tasks and planning the day.
All dashboard elements must reflect actual application state.

B. AI brain dump
Create a clean input experience where users can write natural-language thoughts such as:

"I have an exam tomorrow, need to finish my portfolio website, go to the gym for an hour, and call my friend tonight."

The AI should extract structured tasks with:

Task title and description.
Priority.
Estimated duration.
Deadline, when specified.
Category.
Dependencies, when relevant.
Suggested time of day.
Confidence or clarification requirements when information is ambiguous.
Present the extracted tasks for user review before saving them. Allow users to edit, remove, or approve individual tasks.

Do not silently invent deadlines, commitments, or user preferences.

C. Smart AI planner
Generate a realistic daily schedule using:

Task priority and deadlines.
Estimated duration.
User-defined working hours.
Existing calendar blocks.
Task dependencies.
Breaks and buffer time.
User preferences and available time.
Requirements:

Prevent overlapping scheduled tasks.
Never schedule tasks outside the user's availability.
Do not assume every task fits into one day.
Flag overload and show unscheduled tasks honestly.
Allow users to regenerate, edit, reorder, and manually schedule tasks.
Explain briefly why important tasks were prioritized.
Build a deterministic scheduling engine with unit tests. Use AI for interpreting tasks and providing suggestions, but do not rely on an LLM alone for time arithmetic or conflict detection.

D. "What should I do now?" feature
This is one of the product's signature features.

Create a prominent button that recommends the best next task using:

Urgency.
Importance.
Remaining time.
Task duration.
Dependencies.
Existing schedule.
Current completion status.
Display the recommended task with a concise explanation and actions to start it, complete it, or choose another task.

Recommendations must be derived from actual saved tasks and schedule data, not hardcoded responses.

E. Task management
Implement a complete task management experience:

Create, edit, delete, complete, and reopen tasks.
Priority levels.
Categories and tags.
Deadlines and estimated duration.
Search, sorting, and filtering.
List and board views where useful.
Task detail panel.
Recurring tasks if feasible.
Confirmation or undo for destructive actions.
Changes must persist across refreshes.

F. Focus mode
Create a distraction-free focus screen with:

A selected task and its description.
A configurable focus timer.
Start, pause, resume, and reset controls.
Session completion.
Break reminders.
A simple record of completed focus sessions.
Ensure timer behavior is correct when the tab is inactive or the page rerenders. Do not rely on repeated one-second state updates to measure elapsed time accurately.

G. Calendar and schedule
Build a daily timeline and a useful weekly view.

Include:

Scheduled tasks.
Time blocks.
Deadlines.
Rescheduling controls.
Conflict detection.
A clear visual distinction between completed, upcoming, and overdue tasks.
Do not claim external calendar integration exists unless it is actually implemented. If Google Calendar integration is not configured, provide an honest internal calendar and document future integration steps.

H. Analytics
Create a productivity analytics page with:

Daily and weekly completion rates.
Completed tasks over time.
Focus minutes.
Priority distribution.
Overdue task trends.
Historical activity.
Calculate metrics from persisted records. Handle empty datasets correctly and label chart axes clearly.

I. Goals and habits
Add lightweight goal and habit tracking:

Create goals with target dates.
Break goals into tasks.
Track habit completion.
Display streaks and weekly consistency.
Show progress toward goals.
Avoid manipulative notifications or shaming users for missed days.

J. Settings and personalization
Include:

User profile.
Time zone.
Working hours and availability.
Preferred focus and break durations.
Theme selection.
Week-start preference.
Notification preferences where implemented.
Account and data management.

5. Authentication and data architecture
Implement Supabase authentication and persistent database storage.

Include:

Sign up, sign in, sign out, and password recovery.
Protected application routes.
A sensible first-run onboarding flow.
Database migrations and schema documentation.
Proper foreign keys, indexes, and timestamps.
Row Level Security policies so users can only access their own data.
Server-side authorization checks for every protected operation.
Validated inputs and safe error handling.
Never trust a user ID supplied by the browser as proof of authorization.

Create a clear data model for profiles, tasks, schedules, focus sessions, habits, goals, and relevant activity records.

If Supabase credentials are missing, provide a functional demo mode with realistic seed data and persistent local storage. Clearly separate demo mode from authenticated production mode. Do not silently pretend local data is securely synchronized.

6. AI implementation
Create a provider abstraction so the application can support OpenAI or Anthropic without coupling the whole codebase to one provider.

Requirements:

Keep API keys on the server.
Validate requests and AI responses.
Use structured outputs where supported.
Apply timeouts and sensible error handling.
Handle rate limits.
Limit input size and control token usage.
Never execute model-generated code or SQL.
Treat AI responses as untrusted data.
Provide useful fallback behavior when AI is unavailable.
Keep deterministic scheduling and business rules outside the model.
If the API is not configured, the user should still be able to use task management, the dashboard, focus mode, analytics, and demo planning functionality.

7. Application structure
Organize the codebase cleanly.

Suggested routes:

/ — landing page
/login — authentication
/signup — account creation
/onboarding — initial preferences
/dashboard — daily overview
/tasks — task management
/planner — AI scheduling
/calendar — schedule views
/focus — focus mode
/analytics — productivity analytics
/goals — goals and habits
/settings — preferences
Suggested reusable components:

AppSidebar
AppHeader
DashboardOverview
BrainDumpInput
TaskCard
TaskList
TaskDetailPanel
DailyTimeline
WeeklyCalendar
NextActionCard
FocusTimer
ProductivityChart
EmptyState
LoadingState
ErrorState
Adapt the architecture when needed. Prioritize maintainability over creating excessive files or abstractions.

8. Landing page
Create a polished public landing page that communicates the product's value.

Include:

Strong headline and subheadline.
Clear call to action.
Product preview or dashboard mockup.
Feature highlights.
A short explanation of how the product works.
Responsive navigation.
Footer with relevant links.
Use the actual product UI or a faithful, locally implemented preview rather than generic stock imagery.

Do not invent customer testimonials, user counts, ratings, or business claims.

9. Quality assurance
You are responsible for checking your own work.

After implementation:

Run the development server.
Run linting.
Run TypeScript checks.
Run relevant unit and integration tests.
Fix all errors you can reproduce.
Test the main task creation and completion flows.
Test brain-dump parsing and invalid AI responses.
Test scheduling conflicts and overloaded days.
Test persistence across refreshes.
Test authorization boundaries.
Test empty states and error states.
Check responsive layouts and console errors where browser testing is available.
Use the existing test and browser tools if available. If browser automation is not installed, use the available test tooling and clearly state what could not be visually verified.

Never claim a test passed unless you actually ran it.

10. Execution instructions
Work autonomously and follow this sequence:

Inspect the existing workspace and project files.
Determine whether a project already exists. Preserve useful existing work.
Establish a concise implementation plan.
Set up or repair the project and dependencies.
Implement the design system and main application layout.
Implement the database, authentication, and demo-mode architecture.
Build task management and persistent application state.
Implement AI brain-dump parsing and the scheduling engine.
Build the planner, next-action recommendation, and focus mode.
Build analytics, calendar, goals, and settings.
Build the landing page and onboarding.
Add automated tests and seed data.
Run checks, start the application, and fix discovered problems.
Write complete setup and deployment documentation.
Do not stop at the planning stage. Do not ask me to approve every small implementation choice. Choose sensible defaults and continue.

If a critical credential is missing, work around it with demo mode and continue developing everything else.

If a feature is too large to complete immediately, finish the highest-value working implementation first and clearly document remaining limitations. Do not replace working functionality with fake buttons or decorative mockups.

11. Definition of done
The project is ready when:

The application starts using documented commands.
The main interface is polished and responsive.
Users can create, edit, complete, and persist tasks.
Demo mode works without paid API credentials.
Brain-dump input produces structured tasks through the configured AI provider or an explicitly labeled demo fallback.
Scheduling respects availability and prevents overlapping events.
The next-action recommendation uses real task data.
Focus sessions work correctly.
Analytics use real application records.
Authentication and authorization are implemented safely when configured.
Automated checks have been run and any remaining failures are documented.
An .env.example file is included without real secrets.
Database migrations and setup instructions are included.
The README explains local development, configuration, testing, and deployment.

Final instruction
Start by inspecting the workspace, then immediately begin implementing the product.

I want a working application, not a tutorial about how to build one. Make the important decisions yourself, write the code directly, run the checks, fix bugs, and keep going until the best complete implementation possible is ready.

At the end, provide a concise report containing:

What you built.
The main features that work.
Commands to run the application.
Environment variables and credentials needed for production.
Tests and checks actually completed.
Any remaining limitations.
Begin now.
