import { Badge } from "@grid/ui";

const look: Record<string, { label: string; variant: "outline" | "secondary" | "success" | "warning" | "destructive" | "default" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  SENT: { label: "Sent", variant: "default" },
  ACCEPTED: { label: "Accepted", variant: "success" },
  DECLINED: { label: "Declined", variant: "destructive" },
  EXPIRED: { label: "Expired", variant: "warning" },
  WITHDRAWN: { label: "Withdrawn", variant: "secondary" },
};

/** "Viewed" is a sent quote the customer has opened. */
export function StatusBadge({ status, viewed = false }: { status: string; viewed?: boolean }) {
  const badge = status === "SENT" && viewed ? { label: "Viewed", variant: "warning" as const } : (look[status] ?? { label: status, variant: "outline" as const });
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
