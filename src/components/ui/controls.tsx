"use client";

/**
 * Things you press: a button, a dismissible chip, and the segmented control
 * that switches between a small fixed set of views.
 */
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, type ReactNode } from "react";

/** Sliding pill behind the active option — one shared layout id per group. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  groupId,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  groupId: string;
}) {
  return (
    <div className="relative flex shrink-0 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`relative rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 ${
            value === o.key ? "text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink-2)]"
          }`}
        >
          {value === o.key && (
            <motion.span
              layoutId={groupId}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="glow-sm absolute inset-0 rounded-lg bg-[var(--panel)]"
              style={{ "--hue": "var(--accent)" } as React.CSSProperties}
            />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  type = "button",
  disabled,
  title,
  className = "",
  ref,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Anything else a `<button>` takes — `aria-*`, `onKeyDown`.
   *
   * Spread rather than enumerated: a menu trigger needs `aria-haspopup`,
   * `aria-expanded` and its own key handling, and re-declaring the button's
   * styling somewhere else to get them is how two button styles start
   * drifting apart.
   */
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "title" | "className">) {
  const styles = {
    ghost: "border-[var(--hairline)] bg-[var(--wash)] hover:bg-[var(--wash-2)] text-[var(--ink)]",
    primary:
      "glow border-transparent bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] text-white hover:brightness-110",
    danger: "border-[var(--danger-line)] bg-[var(--danger-tint)] text-[var(--danger-ink)] hover:bg-[var(--danger-tint-2)]",
  }[variant];

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-[var(--wash-3)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-[var(--wash)] hover:text-[var(--ink-2)]"
      }`}
    >
      {label}
    </button>
  );
}
