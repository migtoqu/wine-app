"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { applyThemePreference, type ThemePreference } from "@/lib/preferences";
import type { Dictionary } from "@/i18n/dictionaries/es";

// La fuente de verdad es el atributo data-theme-pref de <html> (lo pone ThemeScript antes de hidratar).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme-pref"] });
  return () => observer.disconnect();
}

function getSnapshot(): ThemePreference {
  const value = document.documentElement.getAttribute("data-theme-pref");
  return value === "light" || value === "dark" ? value : "system";
}

const icons: Record<ThemePreference, React.ReactNode> = {
  light: (
    <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  system: <path d="M4 5h16v11H4zM9 20h6m-3-4v4" />,
};

const options: ThemePreference[] = ["light", "dark", "system"];

// El resaltado sale del atributo de <html> vía CSS (no del estado de React) para que sea
// correcto desde el primer pintado, antes de hidratar.
const selectedStyles: Record<ThemePreference, string> = {
  light: "[[data-theme-pref=light]_&]:bg-surface-2 [[data-theme-pref=light]_&]:text-fg",
  dark: "[[data-theme-pref=dark]_&]:bg-surface-2 [[data-theme-pref=dark]_&]:text-fg",
  system: "[[data-theme-pref=system]_&]:bg-surface-2 [[data-theme-pref=system]_&]:text-fg",
};

export function ThemeToggle({ labels }: { labels: Dictionary["theme"] }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => "system" as const);

  return (
    <fieldset className="flex rounded-full border border-border bg-surface p-0.5">
      <legend className="sr-only">{labels.label}</legend>
      {options.map((option) => (
        <label
          key={option}
          title={labels[option]}
          className={cn(
            "relative grid size-10 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:text-fg",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            selectedStyles[option],
          )}
        >
          <input
            type="radio"
            name="theme"
            value={option}
            checked={current === option}
            onChange={() => applyThemePreference(option)}
            className="sr-only"
          />
          <span className="sr-only">{labels[option]}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icons[option]}
          </svg>
        </label>
      ))}
    </fieldset>
  );
}
