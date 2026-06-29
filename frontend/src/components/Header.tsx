import { Badge } from "@/components/ui/Badge";
import { IconSparkles } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header({
  connected,
  accountEmail,
}: {
  connected: boolean;
  accountEmail?: string;
}) {
  return (
    <header className="motion-rise mb-10 flex items-center justify-between gap-4 rounded-full border border-white/60 bg-white/55 px-4 py-3 shadow-soft backdrop-blur-2xl dark:border-white/10 dark:bg-surface-raised/55">
      <div className="flex items-center gap-3">
        <div className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand-500 to-indigo-500 text-white shadow-lift">
          <span className="absolute inset-0 rounded-2xl bg-white/20 blur-sm" />
          <IconSparkles className="relative h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black tracking-tight text-ink sm:text-base">
            Snap to Photos
          </p>
          <p className="hidden text-xs text-ink-subtle sm:block">
            Private Snapchat export importer
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={connected ? "success" : "neutral"} pulse={connected}>
          {connected
            ? accountEmail
              ? `Connected · ${accountEmail}`
              : "Connected"
            : "Not connected"}
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  );
}
