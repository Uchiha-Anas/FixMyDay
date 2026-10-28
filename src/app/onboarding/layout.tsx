import type { Metadata } from "next";
import { DataGate } from "@/components/app/app-shell";

export const metadata: Metadata = { title: "Get started" };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <DataGate>{children}</DataGate>
    </main>
  );
}
