"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "pod-tracker-theme";

/**
 * Runs before paint, from a blocking inline script in the document head, so the
 * page never renders in the wrong theme and then snaps. Kept as a string because
 * it has to execute ahead of hydration.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "Match system", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function ThemeToggle() {
  // Start at "system" so the server and the first client render agree; the
  // stored preference is read in an effect, after hydration.
  const [theme, setTheme] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") setTheme(stored);
    setReady(true);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private browsing — the choice just will not persist */
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = ready && theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`rounded-lg p-1.5 transition-colors ${
              active
                ? "bg-[var(--wash-3)] text-[var(--ink)]"
                : "text-[var(--ink-muted)] hover:bg-[var(--wash-2)] hover:text-[var(--ink-2)]"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
