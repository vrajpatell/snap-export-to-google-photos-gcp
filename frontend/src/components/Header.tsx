import { Badge } from "@/components/ui/Badge";
import { IconShield, IconSparkles } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header({
  connected,
  accountEmail,
}: {
  connected: boolean;
  accountEmail?: string;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lift">
          <IconSparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Snap to Google Photos
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <IconShield className="h-3.5 w-3.5 text-success" aria-hidden />
            Secure import with live progress and audit-ready reports
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={connected ? "success" : "neutral"} pulse={connected}>
          {connected
            ? accountEmail
              ? `Connected · ${accountEmail}`
              : "Google Photos connected"
            : "Not connected"}
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  );
}
