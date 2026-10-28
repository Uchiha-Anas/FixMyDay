import { cn } from "cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M9 11.5h9" className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
      <path d="M9 16.5h6" className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
      <path d="m15.5 21.5 3 3 6.5-8" className="stroke-primary-foreground" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && <span className="font-display text-xl leading-none">FixMyDay</span>}
    </span>
  );
}
