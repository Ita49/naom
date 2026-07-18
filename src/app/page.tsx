import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>NAOM Dues</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Association dues &amp; remittance tracking. This month:
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-status-paid text-status-paid-foreground">
              Paid
            </Badge>
            <Badge className="bg-status-partial text-status-partial-foreground">
              Partial
            </Badge>
            <Badge className="bg-status-overdue text-status-overdue-foreground">
              Overdue
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
