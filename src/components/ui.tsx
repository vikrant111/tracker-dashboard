"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Panel({
  children,
  className = "",
  delay = 0,
  hover = false,
  /** Tints the panel's corner bloom. Chrome only — never a data encoding. */
  hue,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
  hue?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 210, damping: 26, delay }}
      className={`glass sheen ${hover ? "glass-hover" : ""} relative overflow-hidden ${className}`}
    >
      {hue && (
        <span
          aria-hidden
          className="bloom -top-28 -right-24 h-80 w-80"
          style={{ "--hue": hue, "--bloom-delay": `${(delay * 4).toFixed(2)}s` } as React.CSSProperties}
        />
      )}
      {children}
    </motion.section>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  action,
  icon,
  hue = "var(--accent)",
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
  hue?: string;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span
            className="glow-sm mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${hue} 18%, transparent)`,
              color: hue,
              "--hue": hue,
            } as React.CSSProperties}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: hue }}>
            {eyebrow}
          </p>
          {/* min-w-0 above plus wrapping here: without both, a long title in a
              flex row collapses to one word per line on a narrow screen. */}
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-base leading-snug font-semibold tracking-tight text-pretty sm:text-lg">
            {title}
          </h2>
        </div>
      </div>
      {action}
    </header>
  );
}

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

/** Counts up when scrolled into view. Reduced motion gets the final value immediately. */
export function CountUp({
  value,
  decimals = 0,
  duration = 900,
  className = "",
  style,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  // Where the next run starts. The dashboard refetches every 30s, and counting
  // up from zero on each refresh would flash the whole board back to 0.
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const origin = from.current;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={className} style={style}>
      {shown.toFixed(decimals)}
    </span>
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

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <p className="font-[family-name:var(--font-display)] text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}

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
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <span className="relative block">
      <input
        id={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        className="absolute top-1/2 right-1 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-2)] hover:text-[var(--ink)]"
      >
        {shown ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
      </button>
    </span>
  );
}

/**
 * A dropdown menu.
 *
 * The top bar grew to nine controls, which is more than a header can carry and
 * far more than a phone can. This collects the actions behind one trigger, and
 * it is a real menu rather than a div that toggles: `aria-haspopup`, roving
 * arrow keys, Escape returning focus to the trigger, and dismissal on an
 * outside press. A menu you cannot leave with the keyboard is a trap.
 */
const MenuContext = createContext<{ close: () => void }>({ close: () => {} });

export function Menu({
  label,
  icon,
  children,
  align = "right",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  /**
   * How far to nudge the panel back into view.
   *
   * Anchoring to the trigger is only right while the trigger is where you
   * expect. On a phone it sits at the *left* of the bar, so a right-anchored
   * panel 19rem wide hangs off the left edge of the screen and its labels are
   * cut in half — which is exactly what happened.
   *
   * The anchor below handles the common case; this handles the rest. Measured
   * before paint, so the panel is never seen in the wrong place.
   */
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }

    const fit = () => {
      const el = panel.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // `clientWidth`, not `innerWidth`: the scrollbar is not usable space.
      const viewport = document.documentElement.clientWidth;
      const margin = 12;

      let dx = 0;
      if (rect.left < margin) dx = margin - rect.left;
      else if (rect.right > viewport - margin) dx = viewport - margin - rect.right;
      // The rect already includes whatever shift is applied, so this converges
      // rather than compounding.
      if (dx) setShift((current) => current + dx);
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // `pointerdown`, not `click`: a click fires after the button it landed on
    // has already run, so a press outside would act *and* leave the menu open.
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        // Focus goes back where it came from, or it lands on `<body>` and the
        // next Tab starts from the top of the page.
        trigger.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;

      const items = [...(panel.current?.querySelectorAll<HTMLElement>("[data-menuitem]:not([disabled])") ?? [])];
      if (!items.length) return;
      e.preventDefault();

      const here = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? items.length - 1
        : e.key === "ArrowDown" ? (here + 1) % items.length
        : (here - 1 + items.length) % items.length;
      items[next]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Opening with the keyboard should land on the first item; opening with a
  // pointer should not steal the cursor's place.
  const openWith = (focusFirst: boolean) => {
    setOpen(true);
    if (!focusFirst) return;
    requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLElement>("[data-menuitem]:not([disabled])")?.focus();
    });
  };

  return (
    <div ref={root} className="relative">
      <Button
        onClick={() => (open ? setOpen(false) : openWith(false))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            if (!open) {
              e.preventDefault();
              openWith(true);
            }
          }
        }}
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        className={open ? "bg-[var(--wash-2)]" : ""}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            role="menu"
            aria-label={label}
            initial={reduced ? { opacity: 0, x: shift } : { opacity: 0, y: -6, scale: 0.97, x: shift }}
            animate={reduced ? { opacity: 1, x: shift } : { opacity: 1, y: 0, scale: 1, x: shift }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            /*
             * Solid, not glass. A menu that you can read the dashboard through
             * is unreadable — `--panel` is the token for exactly this: "solid
             * popovers, drawers, menus". Glass is for surfaces you look *at*,
             * not for ones that sit temporarily on top of other content.
             *
             * The anchor flips by breakpoint because the trigger does: it is at
             * the left of the bar on a phone and near the right on a desktop, so
             * a single anchor sends the panel off one edge or the other.
             *
             * Width is capped against the viewport as well as set — a fixed
             * 19rem panel does not fit a 320px screen at all.
             */
            className={`absolute top-full z-40 mt-2 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col gap-1 rounded-2xl border border-[var(--glass-border)] bg-[var(--panel)] p-2 shadow-[var(--glass-shadow)] ${
              align === "right" ? "left-0 sm:right-0 sm:left-auto" : "left-0"
            }`}
          >
            <MenuContext.Provider value={{ close: () => setOpen(false) }}>{children}</MenuContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A labelled group inside a menu. */
export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <p className="eyebrow px-2.5 pt-1 pb-0.5">{label}</p>
      {children}
    </div>
  );
}

/**
 * One row of a menu.
 *
 * Renders as an anchor when given `href` so a download or a route change is a
 * real link — right-clickable, openable in a new tab, and streamed by the
 * browser rather than assembled in JavaScript.
 */
export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  href,
  download,
  disabled,
  tone = "normal",
  busy = false,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  download?: boolean;
  disabled?: boolean;
  tone?: "normal" | "primary";
  busy?: boolean;
}) {
  const { close } = useContext(MenuContext);

  const body = (
    <>
      <span
        aria-hidden
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
          tone === "primary"
            ? "bg-[var(--accent-tint)] text-[var(--accent-ink)]"
            : "bg-[var(--wash)] text-[var(--ink-2)] group-hover:bg-[var(--wash-2)]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-[var(--ink)]">{busy ? `${label}…` : label}</span>
        {hint && <span className="block truncate text-[11px] text-[var(--ink-muted)]">{hint}</span>}
      </span>
    </>
  );

  const className =
    "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--wash)] focus-visible:bg-[var(--wash)] disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

  if (href && !disabled) {
    return (
      <a
        data-menuitem
        role="menuitem"
        href={href}
        download={download}
        onClick={close}
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      data-menuitem
      role="menuitem"
      type="button"
      disabled={disabled || busy}
      // An `href` item that is disabled falls through to here, so the reason it
      // cannot be used is still announced rather than the row simply vanishing.
      aria-disabled={disabled || undefined}
      onClick={() => {
        onClick?.();
        close();
      }}
      className={className}
    >
      {body}
    </button>
  );
}

/* -------------------------------------------------------------- tooltips -- */

/**
 * A small label that appears beside whatever you point at.
 *
 * This replaces the browser's own `title=` attribute, which looked like nothing
 * else in the product, took about a second to appear, could not be styled, and
 * never showed up on a touch screen at all.
 *
 * Three things make it worth writing rather than reaching for a library:
 *
 * 1. **It escapes the panel.** Every panel is `overflow: hidden` so its glass
 *    edge stays crisp, which clips anything a child draws outside its box. A
 *    tooltip on the top row of a chart would be sliced in half. This one renders
 *    into `document.body` through a portal and positions itself with `fixed`,
 *    so no ancestor can clip it.
 * 2. **It stays on screen.** The bubble is nudged back inside the viewport, and
 *    flips below the target when there is no room above.
 * 3. **Keyboard and pointer both.** It shows on focus as well as hover, so the
 *    same information is available without a mouse.
 */
export function Tooltip({
  label,
  children,
  className = "",
}: {
  /** What to say. Keep it to a phrase — this is a label, not a paragraph. */
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const reduced = useReducedMotion();

  /*
   * Measured after the bubble exists but before the browser paints it, so it is
   * never seen at the wrong coordinates first. `useLayoutEffect` rather than
   * `useEffect` for exactly that reason.
   */
  useLayoutEffect(() => {
    if (!at) return;

    const place = () => {
      const target = anchor.current?.getBoundingClientRect();
      const self = bubble.current?.getBoundingClientRect();
      if (!target || !self) return;

      const margin = 8;
      const gap = 8;
      // `clientWidth`, not `innerWidth`: the scrollbar is not usable space.
      const viewportW = document.documentElement.clientWidth;
      const viewportH = document.documentElement.clientHeight;

      // Above by default, below when the top of the screen is in the way.
      const below = target.top - self.height - gap < margin;
      const y = below ? target.bottom + gap : target.top - self.height - gap;

      // Centred on the target, then pulled back inside either edge.
      let x = target.left + target.width / 2 - self.width / 2;
      x = Math.max(margin, Math.min(x, viewportW - self.width - margin));

      setAt((current) => {
        if (!current) return current;
        const next = { x, y: Math.max(margin, Math.min(y, viewportH - self.height - margin)), below };
        // Only re-render on a real move, or this loops forever.
        const same = Math.abs(next.x - current.x) < 0.5 && Math.abs(next.y - current.y) < 0.5 && next.below === current.below;
        return same ? current : next;
      });
    };

    place();
    // A scroll moves the target out from under the bubble; close rather than
    // chase it, which is what every native tooltip does too.
    const dismiss = () => setAt(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", place);
    };
  }, [at]);

  // Escape closes it, matching every other transient surface in the product.
  useEffect(() => {
    if (!at) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [at]);

  // Start at the anchor's own position; the layout effect corrects it before paint.
  const open = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect) setAt({ x: rect.left, y: rect.top, below: false });
  };
  const close = () => setAt(null);

  if (!label) return <>{children}</>;

  return (
    <span
      ref={anchor}
      className={`contents ${className}`}
      onPointerEnter={(e) => e.pointerType !== "touch" && open()}
      onPointerLeave={close}
      onFocusCapture={open}
      onBlurCapture={close}
    >
      {children}
      {at &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={bubble}
              role="tooltip"
              initial={reduced ? false : { opacity: 0, y: at.below ? -4 : 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 30 }}
              style={{ left: at.x, top: at.y }}
              className="pointer-events-none fixed z-[100] max-w-[16rem] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-xs leading-snug font-medium text-[var(--ink)] shadow-lg"
            >
              {label}
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}
