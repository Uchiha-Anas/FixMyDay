"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { LinkButton } from "@/components/app/link-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8" aria-label="FixMyDay home">
        <Logo />
      </Link>
      <div className="surface-card w-full max-w-sm p-6 sm:p-8">
        <h1 className="font-display text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-6">{isSupabaseConfigured ? children : <DemoNotice />}</div>
      </div>
      {footer && isSupabaseConfigured && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}

function DemoNotice() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <HardDrive className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          Accounts aren&apos;t enabled on this deployment because Supabase isn&apos;t configured. You can use FixMyDay in{" "}
          <span className="text-foreground">demo mode</span>: everything is saved only in this browser.
        </p>
      </div>
      <LinkButton href="/dashboard" className="w-full" size="lg">
        Continue in demo mode
      </LinkButton>
    </div>
  );
}
