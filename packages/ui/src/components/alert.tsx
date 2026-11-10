import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "../lib/utils";

const alertVariants = cva("flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0", {
  variants: {
    variant: {
      info: "bg-card text-card-foreground",
      error: "border-destructive/40 bg-destructive/10 text-destructive",
      success: "border-success/40 bg-success/10 text-success",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { info: Info, error: AlertTriangle, success: CheckCircle2 };

/** Renders nothing when children is empty, so `<Alert variant="error">{error}</Alert>` is safe. */
export function Alert({
  className,
  variant = "info",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  if (children === null || children === undefined || children === false || children === "") return null;
  const Icon = icons[variant ?? "info"];
  return (
    <div
      data-slot="alert"
      role={variant === "error" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden />
      <div className="min-w-0 flex-1 [&_a]:font-semibold [&_a]:underline">{children}</div>
    </div>
  );
}
