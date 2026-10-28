"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/primitives";
import { AuthCard } from "@/components/auth/auth-card";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setLoading(true);
    setError(null);
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setLoading(false);
      return setError("This reset link has expired. Request a new one.");
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    toast.success("Password updated");
    // Full reload so the new session cookie is used everywhere.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  }

  return (
    <AuthCard title="Choose a new password" footer={<Link href="/forgot-password" className="text-foreground underline-offset-4 hover:underline">Request a new link</Link>}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="New password" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" size="lg" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Update password
        </Button>
      </form>
    </AuthCard>
  );
}
