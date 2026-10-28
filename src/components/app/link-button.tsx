import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

/** A Next.js link styled as a button. */
export function LinkButton({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
