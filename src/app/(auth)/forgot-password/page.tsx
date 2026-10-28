"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/primitives";
import { AuthCard } from "@/components/auth/auth-card";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await getBrowserSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    // Rate-limit errors are worth showing; otherwise don't reveal whether the account exists.
    if (error && error.status === 429) return setError("Too many attempts. Please wait a minute and try again.");
    setSent(true);
  }

  return (
    <AuthCard title="Reset your password" description={sent ? undefined : "We'll email you a link to choose a new one."} footer={<Link href="/login" className="text-foreground underline-offset-4 hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div className="flex gap-3 text-sm text-muted-foreground">
          <MailCheck className="size-5 shrink-0 text-success" />
          <p>If an account exists for <span className="text-foreground">{email}</span>, a reset link is on its way.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
