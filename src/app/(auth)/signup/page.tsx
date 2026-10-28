"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/primitives";
import { AuthCard } from "@/components/auth/auth-card";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setLoading(true);
    setError(null);
    const { data, error } = await getBrowserSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim().slice(0, 80) },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    setLoading(false);
    if (error) return setError(error.message);
    // Full reload so the new session cookie is used everywhere.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (data.session) window.location.assign("/onboarding");
    else setSent(true);
  }

  return (
    <AuthCard
      title={sent ? "Check your inbox" : "Create your account"}
      description={sent ? undefined : "Your tasks and plans, synced and private to you."}
      footer={<>Already have an account? <Link href="/login" className="text-foreground underline-offset-4 hover:underline">Sign in</Link></>}
    >
      {sent ? (
        <div className="flex gap-3 text-sm text-muted-foreground">
          <MailCheck className="size-5 shrink-0 text-success" />
          <p>We sent a confirmation link to <span className="text-foreground">{email}</span>. Open it to finish setting up.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Name" htmlFor="name">
            <Input id="name" autoComplete="given-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Create account
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
