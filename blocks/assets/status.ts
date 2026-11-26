// An asset's status follows what's open on it (docs/assets-block.md §3,
// §3a). Plain function, tested: worked out again after every fault step,
// loss report, recovery and retirement, so it never drifts.
//   retired (by hand, a fault closed as Retired, or retired as lost) → RETIRED, until put back
//   reported lost or stolen → LOST
//   an open Do-not-use fault → OUT_OF_SERVICE
//   a must-pass routine (test & tag) past due → OVERDUE, until a pass is logged
//   an open fault in repair → IN_REPAIR
//   any other open fault → FAULTY
//   nothing open → IN_SERVICE

export type Status = "IN_SERVICE" | "FAULTY" | "OUT_OF_SERVICE" | "IN_REPAIR" | "RETIRED" | "LOST" | "OVERDUE";

export interface OpenThings {
  retired: boolean;
  lossOpen: boolean;
  /** Faults not yet fixed or retired. */
  faults: { doNotUse: boolean; status: string }[];
  /** A must-pass routine is past due (due.ts). */
  overdue?: boolean;
}

export function statusFor(open: OpenThings): Status {
  if (open.retired) return "RETIRED";
  if (open.lossOpen) return "LOST";
  if (open.faults.some((fault) => fault.doNotUse)) return "OUT_OF_SERVICE";
  if (open.overdue) return "OVERDUE";
  if (open.faults.some((fault) => fault.status === "IN_REPAIR")) return "IN_REPAIR";
  if (open.faults.length) return "FAULTY";
  return "IN_SERVICE";
}

/** The steps a fault can move to next. */
export function nextSteps(status: string): string[] {
  switch (status) {
    case "REPORTED":
      return ["ACKNOWLEDGED", "IN_REPAIR", "FIXED", "RETIRED"];
    case "ACKNOWLEDGED":
      return ["IN_REPAIR", "FIXED", "RETIRED"];
    case "IN_REPAIR":
      return ["FIXED", "RETIRED"];
    default:
      return [];
  }
}
