import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>You&apos;re offline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            NAOM Dues needs an internet connection for this page. Reconnect
            and reload to try again.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
