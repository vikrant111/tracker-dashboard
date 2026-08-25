"use client";

/** A password input with a reveal control, a label, and Enter-to-submit. */
import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

/**
 * A password field with a reveal toggle.
 *
 * Typing a password you cannot see, into a field that may reject it, is how
 * people end up locked out of their own dashboard. Every password input in the
 * product uses this — there is no bare `type="password"` left.
 *
 * The toggle is a real `<button type="button">`: inside a form, a button
 * without an explicit type submits it, which would try to log you in the moment
 * you asked to see what you had typed.
 */
export function PasswordField({
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
  required = false,
  id,
  label,
  onEnter,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  /** Rendered above the field, and tied to it. Prefer this to a placeholder. */
  label?: string;
  /** Submit on Enter, so a three-field form does not need a mouse to finish. */
  onEnter?: () => void;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  const auto = useId();
  const fieldId = id ?? auto;

  return (
    <span className="relative block">
      {label && (
        <label htmlFor={fieldId} className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        // The control reports what it *does*, and the state it reports is the
        // one a screen reader announces on toggle.
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className={`absolute right-1 grid h-8 w-8 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-2)] hover:text-[var(--ink)] ${
          label ? "bottom-1" : "top-1/2 -translate-y-1/2"
        }`}
      >
        {shown ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
      </button>
    </span>
  );
}
