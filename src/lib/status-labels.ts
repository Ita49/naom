export const PERIOD_STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  overpaid: "Overpaid",
};

export const PERIOD_STATUS_CLASS: Record<string, string> = {
  paid: "bg-status-paid text-status-paid-foreground",
  overpaid: "bg-status-paid text-status-paid-foreground",
  partial: "bg-status-partial text-status-partial-foreground",
  unpaid: "bg-status-overdue text-status-overdue-foreground",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

export const PAYMENT_STATUS_CLASS: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  verified: "bg-status-paid text-status-paid-foreground",
  rejected: "bg-status-overdue text-status-overdue-foreground",
};
