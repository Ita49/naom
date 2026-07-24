"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PERIOD_STATUS_LABEL,
  PERIOD_STATUS_CLASS,
} from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RosterMember = {
  id: string;
  fullName: string;
  phone: string | null;
  membershipStatus: string;
  currentStatus: string;
  arrears: number;
};

const STATUS_FILTERS = ["all", "paid", "partial", "unpaid"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export function MemberRoster({ members }: { members: RosterMember[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      if (q && !member.fullName.toLowerCase().includes(q)) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === "paid") {
        return (
          member.currentStatus === "paid" || member.currentStatus === "overpaid"
        );
      }
      return member.currentStatus === statusFilter;
    });
  }, [members, query, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={statusFilter === filter ? "secondary" : "outline"}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "all"
                ? "All"
                : PERIOD_STATUS_LABEL[filter] ?? filter}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {members.length === 0
            ? "No one has signed up yet — share the app link to get started."
            : "No members match."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Arrears</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((member) => (
              <TableRow
                key={member.id}
                className="cursor-pointer"
                onClick={() => router.push(`/admin/members/${member.id}`)}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{member.fullName}</span>
                    {member.membershipStatus === "inactive" && (
                      <span className="text-muted-foreground text-xs">
                        Inactive
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={PERIOD_STATUS_CLASS[member.currentStatus]}>
                    {PERIOD_STATUS_LABEL[member.currentStatus] ??
                      member.currentStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.arrears > 0
                    ? `₦${member.arrears.toLocaleString()}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
