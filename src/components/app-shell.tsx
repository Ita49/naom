import { SignOutButton } from "@/components/sign-out-button";

export function AppShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-card flex items-center justify-between border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold">NAOM Dues</span>
          <span className="text-muted-foreground text-xs">{name}</span>
        </div>
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
