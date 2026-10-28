"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "cn";
import {
  BarChart3,
  Brain,
  CalendarDays,
  CalendarRange,
  CircleUserRound,
  Cloud,
  Compass,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sun,
  Target,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState, Kbd, LoadingState } from "./primitives";
import { TaskSheet } from "./task-sheet";
import { BrainDumpDialog } from "./brain-dump";
import { NextActionDialog } from "./next-action";
import { Logo } from "./logo";
import { useAppStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/app-actions";

const NAV = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/planner", label: "Planner", icon: CalendarRange },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/goals", label: "Goals & habits", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const COLLAPSE_KEY = "fixmyday.sidebar.collapsed";

/** Loads user data once and renders loading/error states around the app. */
export function DataGate({ children }: { children: React.ReactNode }) {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const init = useAppStore((s) => s.init);
  const reload = useAppStore((s) => s.reload);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === "error") return <ErrorState message={error ?? "Unknown error"} onRetry={() => void reload()} />;
  if (status !== "ready") return <LoadingState />;
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DataGate>
      <Shell>{children}</Shell>
    </DataGate>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onboarded = useAppStore((s) => s.data.profile.onboarded);
  const theme = useAppStore((s) => s.data.profile.theme);
  const { setTheme } = useTheme();
  // Shell only renders client-side (behind DataGate), so reading storage here is safe.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!onboarded) router.replace("/onboarding");
  }, [onboarded, router]);

  // Apply the saved theme preference once data is loaded.
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  useKeyboardShortcuts();

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  if (!onboarded) return <LoadingState label="Setting things up…" />;

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar/80 backdrop-blur transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-60",
        )}
        aria-label="Main navigation"
      >
        <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
          <Link href="/dashboard" aria-label="FixMyDay home">
            <Logo compact={collapsed} />
          </Link>
        </div>
        <NavList collapsed={collapsed} pathname={pathname} />
        <div className={cn("mt-auto space-y-2 p-3", collapsed && "flex flex-col items-center")}>
          <ModeBadge collapsed={collapsed} />
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn(!collapsed && "w-full justify-start text-muted-foreground")}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center px-4">
            <Logo />
          </div>
          <NavList collapsed={false} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          <div className="mt-auto p-3">
            <ModeBadge collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      <MobileTabBar pathname={pathname} />
      <TaskSheet />
      <BrainDumpDialog />
      <NextActionDialog />
    </div>
  );
}

function NavList({ collapsed, pathname, onNavigate }: { collapsed: boolean; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const link = (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active && "text-primary")} aria-hidden />
            {!collapsed && label}
            {collapsed && <span className="sr-only">{label}</span>}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={href}>
            <TooltipTrigger render={link} />
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function ModeBadge({ collapsed }: { collapsed: boolean }) {
  const mode = useAppStore((s) => s.mode);
  const pending = useAppStore((s) => s.pending);
  const content =
    mode === "demo" ? (
      <>
        <HardDrive className="size-3.5 shrink-0" aria-hidden />
        {!collapsed && <span>Demo mode · saved in this browser only</span>}
      </>
    ) : (
      <>
        {pending > 0 ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : <Cloud className="size-3.5 shrink-0" aria-hidden />}
        {!collapsed && <span>{pending > 0 ? "Saving…" : "Synced to your account"}</span>}
      </>
    );
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background/40 text-[11px] leading-tight text-muted-foreground",
        collapsed ? "size-9 justify-center" : "px-2.5 py-2",
      )}
      title={mode === "demo" ? "Demo mode: data is stored only in this browser and is not synced." : undefined}
      role="status"
    >
      {content}
    </div>
  );
}

function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const openNewTask = useUI((s) => s.openNewTask);
  const setBrainDumpOpen = useUI((s) => s.setBrainDumpOpen);
  const setNextActionOpen = useUI((s) => s.setNextActionOpen);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/75 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu />
      </Button>
      <Link href="/dashboard" className="lg:hidden" aria-label="FixMyDay home">
        <Logo compact />
      </Link>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Button onClick={() => setNextActionOpen(true)} className="shadow-sm" aria-keyshortcuts="w">
          <Compass />
          <span className="hidden sm:inline">What should I do now?</span>
          <span className="sm:hidden">Next</span>
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="icon" onClick={() => setBrainDumpOpen(true)} aria-label="Brain dump" aria-keyshortcuts="b">
                <Brain />
              </Button>
            }
          />
          <TooltipContent>
            Brain dump <Kbd>B</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="icon" onClick={() => openNewTask()} aria-label="New task" aria-keyshortcuts="n">
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            New task <Kbd>N</Kbd>
          </TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const next = resolvedTheme === "dark" ? "light" : "dark";
        setTheme(next);
        updateProfile({ theme: next });
      }}
      aria-label="Toggle color theme"
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

function UserMenu() {
  const mode = useAppStore((s) => s.mode);
  const name = useAppStore((s) => s.data.profile.displayName);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "cloud") return;
    void getBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, [mode]);

  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    // Hard navigation on purpose: drops all in-memory user data.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Account menu" />}>
        <CircleUserRound />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate text-sm text-foreground">{name || "You"}</span>
            <span className="block truncate">{mode === "cloud" ? (email ?? "Signed in") : "Demo workspace"}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings /> Settings
        </DropdownMenuItem>
        {mode === "cloud" ? (
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem render={<Link href="/" />}>
            <LogOut /> Back to home page
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MOBILE_TABS = NAV.filter((n) => ["/dashboard", "/tasks", "/planner", "/focus"].includes(n.href));

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Primary"
    >
      {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-primary" : "text-muted-foreground")}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function useKeyboardShortcuts() {
  const openNewTask = useUI((s) => s.openNewTask);
  const setBrainDumpOpen = useUI((s) => s.setBrainDumpOpen);
  const setNextActionOpen = useUI((s) => s.setNextActionOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      const key = e.key.toLowerCase();
      if (key === "n") openNewTask();
      else if (key === "b") setBrainDumpOpen(true);
      else if (key === "w") setNextActionOpen(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNewTask, setBrainDumpOpen, setNextActionOpen]);
}
