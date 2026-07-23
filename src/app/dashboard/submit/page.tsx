import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubmitPaymentForm } from "./submit-payment-form";

export default async function SubmitPaymentPage() {
  const session = await getSessionRole();
  if (session.role !== "member") redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Submit a payment</CardTitle>
        </CardHeader>
        <CardContent>
          <SubmitPaymentForm memberId={session.memberId} />
        </CardContent>
      </Card>
    </div>
  );
}
