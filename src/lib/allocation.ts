export type UnpaidPeriod = {
  periodId: string;
  periodMonth: string;
  owed: number;
};

export type Allocation = {
  periodId: string;
  periodMonth: string;
  amount: number;
};

/**
 * Oldest-unpaid-first default allocation (plan §3.2 verify dialog, §6a
 * backfill). `unpaidPeriods` must already be sorted oldest-first — this
 * function doesn't sort, so both the verify and backfill screens control
 * ordering explicitly via their query.
 */
export function computeDefaultAllocation(
  paymentAmount: number,
  unpaidPeriods: UnpaidPeriod[]
): Allocation[] {
  const allocations: Allocation[] = [];
  let remaining = paymentAmount;

  for (const period of unpaidPeriods) {
    if (remaining <= 0) break;
    if (period.owed <= 0) continue;

    const amount = Math.min(remaining, period.owed);
    allocations.push({
      periodId: period.periodId,
      periodMonth: period.periodMonth,
      amount,
    });
    remaining -= amount;
  }

  return allocations;
}
