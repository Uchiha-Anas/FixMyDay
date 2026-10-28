"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/primitives";
import { AuthCard } from "@/components/auth/auth-card";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/supabase/config";

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" description="Sign in to see your day." footer={<>New here? <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">Create an account</Link></>}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "link" ? "That link is invalid or has expired. Please try again." : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await getBrowserSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
      return;
    }
    window.location.assign(safeNextPath(params.get("next")));
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" size="lg" disabled={loading}>
        {loading && <Loader2 className="animate-spin" />} Sign in
      </Button>
    </form>
  );
}
