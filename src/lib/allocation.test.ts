import { describe, expect, it } from "vitest";
import { computeDefaultAllocation } from "./allocation";

const periods = [
  { periodId: "p1", periodMonth: "2026-05-01", owed: 5000 },
  { periodId: "p2", periodMonth: "2026-06-01", owed: 5000 },
  { periodId: "p3", periodMonth: "2026-07-01", owed: 5000 },
];

describe("computeDefaultAllocation", () => {
  it("allocates an exact single-period payment in full", () => {
    expect(computeDefaultAllocation(5000, periods)).toEqual([
      { periodId: "p1", periodMonth: "2026-05-01", amount: 5000 },
    ]);
  });

  it("splits a multi-month payment oldest-first", () => {
    expect(computeDefaultAllocation(15000, periods)).toEqual([
      { periodId: "p1", periodMonth: "2026-05-01", amount: 5000 },
      { periodId: "p2", periodMonth: "2026-06-01", amount: 5000 },
      { periodId: "p3", periodMonth: "2026-07-01", amount: 5000 },
    ]);
  });

  it("leaves a partial payment partially allocated to the oldest period only", () => {
    expect(computeDefaultAllocation(3000, periods)).toEqual([
      { periodId: "p1", periodMonth: "2026-05-01", amount: 3000 },
    ]);
  });

  it("caps allocation at what's actually owed, leaving the rest unallocated", () => {
    // Payment exceeds total owed across all known periods — the excess is
    // deliberately left unallocated for the admin to notice, not silently
    // over-applied to a period past what it owes.
    expect(computeDefaultAllocation(20000, periods)).toEqual([
      { periodId: "p1", periodMonth: "2026-05-01", amount: 5000 },
      { periodId: "p2", periodMonth: "2026-06-01", amount: 5000 },
      { periodId: "p3", periodMonth: "2026-07-01", amount: 5000 },
    ]);
  });

  it("handles a partial-then-full sequence across periods", () => {
    const mixed = [
      { periodId: "p1", periodMonth: "2026-05-01", owed: 2000 }, // already partially paid
      { periodId: "p2", periodMonth: "2026-06-01", owed: 5000 },
    ];
    expect(computeDefaultAllocation(4000, mixed)).toEqual([
      { periodId: "p1", periodMonth: "2026-05-01", amount: 2000 },
      { periodId: "p2", periodMonth: "2026-06-01", amount: 2000 },
    ]);
  });

  it("returns an empty allocation when there's nothing owed", () => {
    expect(computeDefaultAllocation(5000, [])).toEqual([]);
  });

  it("returns an empty allocation for a zero-amount payment", () => {
    expect(computeDefaultAllocation(0, periods)).toEqual([]);
  });

  it("skips periods with zero or negative owed (already covered)", () => {
    const withPaid = [
      { periodId: "p1", periodMonth: "2026-05-01", owed: 0 },
      { periodId: "p2", periodMonth: "2026-06-01", owed: 5000 },
    ];
    expect(computeDefaultAllocation(5000, withPaid)).toEqual([
      { periodId: "p2", periodMonth: "2026-06-01", amount: 5000 },
    ]);
  });
});
