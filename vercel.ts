import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    // A few days before month-end, for anyone not yet paid this period.
    { path: "/api/cron/due-reminder", schedule: "0 9 25 * *" },
    // Early in the new month, for anyone still unpaid for the period that just ended.
    { path: "/api/cron/overdue-nudge", schedule: "0 9 3 * *" },
  ],
};
