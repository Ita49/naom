export function currentPeriodMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

export function previousPeriodMonth() {
  const today = new Date();
  const prev = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function formatPeriod(periodMonth: string) {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
