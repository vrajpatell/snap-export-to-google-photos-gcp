import { IconMoon, IconSun } from "@/components/ui/icons";
import { useTheme } from "@/lib/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-raised text-ink-muted hover:text-ink hover:border-border-strong transition-colors"
    >
      {isDark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
    </button>
  );
}
