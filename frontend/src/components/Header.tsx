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
    <header className="motion-rise mb-10 flex items-center justify-between gap-4 rounded-full border border-white/65 bg-white/62 px-4 py-3 shadow-soft backdrop-blur-2xl dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-3">
        <div className="pulse-orb relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 via-indigo-500 to-pink-500 text-white shadow-lift">
          <span className="absolute inset-0 rounded-2xl bg-white/20 blur-sm" />
          <IconSparkles className="relative h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-black tracking-tight text-ink">
            Snap to Photos
          </p>
          <p className="hidden text-xs text-ink-subtle sm:block">
            Move memories in minutes
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={connected ? "success" : "neutral"} pulse={connected}>
          {connected
            ? accountEmail
              ? `Connected · ${accountEmail}`
              : "Connected"
            : "Connect to start"}
        </Badge>
        <ThemeToggle />
      </div>
    </header>
  );
}
