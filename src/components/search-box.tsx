"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { TIMING } from "@/lib/constants";
import { highlight, suggest } from "@/lib/suggest";

/**
 * The board search, with suggestions.
 *
 * Two things make this feel different from what it replaced.
 *
 * **It does not query on every keystroke.** The input is instant, but the
 * search that reaches the server is debounced — typing "Ananya" used to fire six
 * requests, each re-rendering every panel underneath, which is most of what
 * made it feel heavy.
 *
 * **The suggestions are ours.** A native `<datalist>` matches differently in
 * every browser — Chrome anywhere in the string, Safari only from the start —
 * and neither shows which part matched. This ranks them predictably and shows
 * the match, so the list is worth reading.
 */
export function SearchBox({
  value,
  onChange,
  names,
  placeholder = "Search title, id or assignee…",
}: {
  /** The committed search — what the board is actually filtered by. */
  value: string;
  onChange: (next: string) => void;
  /** Names on this board, for the suggestion list. */
  names: string[];
  placeholder?: string;
}) {
  const listId = useId();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // What is on screen, which leads what has been committed.
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // The board can change the search from elsewhere — clearing a filter, or a
  // drill-down. Follow it, but never while the reader is mid-word.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(value);
  }, [value]);

  /*
   * The debounce.
   *
   * Committing on every keystroke re-keys SWR and re-renders every panel on the
   * board. The input stays instant either way; this only delays the query.
   */
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), TIMING.searchDebounceMs);
    return () => clearTimeout(t);
    // `onChange` is a setState in practice; including it would re-arm the timer
    // on every parent render and the search would never settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, value]);

  const options = open ? suggest(text, names) : [];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /** Take a suggestion: fill the box and search for it at once, not in 200ms. */
  const choose = (name: string) => {
    setText(name);
    onChange(name);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  const clear = () => {
    setText("");
    onChange("");
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // First Escape closes the list; a second clears the search. Closing and
      // clearing in one keystroke throws away a query somebody meant to keep.
      if (open) setOpen(false);
      else if (text) clear();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) {
        setOpen(true);
        return;
      }
      if (!options.length) return;
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? (active + 1) % options.length
          : (active - 1 + options.length) % options.length;
      setActive(next);
      return;
    }

    if (e.key === "Enter") {
      if (open && active >= 0 && options[active]) {
        e.preventDefault();
        choose(options[active].value);
        return;
      }
      // Enter with nothing highlighted means "search for exactly this, now".
      setOpen(false);
      onChange(text);
    }
  };

  return (
    <div ref={root} className="relative">
      <Search
        size={14}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--ink-muted)]"
      />
      <input
        ref={input}
        value={text}
        placeholder={placeholder}
        aria-label="Search every work item"
        // A combobox, said properly: what it controls, whether it is open, and
        // which row is current. `aria-activedescendant` keeps focus in the input
        // while the highlight moves, which is what lets typing continue.
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="!w-full !py-1.5 !pr-8 !pl-8 text-sm sm:!w-44 lg:!w-60"
      />

      {text && (
        <button
          onClick={clear}
          aria-label="Clear the search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--wash-2)] hover:text-[var(--ink)]"
        >
          <X size={13} />
        </button>
      )}

      <AnimatePresence>
        {open && options.length > 0 && (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label="Matching people"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -2 }}
            transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.5 }}
            /* Opaque, like the menu: a list you can read the board through is
               not a list. Width follows the input, capped against the viewport. */
            className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-64 min-w-[13rem] overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--panel)] p-1 shadow-[var(--glass-shadow)]"
          >
            {options.map((option, i) => {
              const [before, match, after] = highlight(option.value, option.at, option.length);
              return (
                <li key={option.value}>
                  <button
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    // `mousedown`, not `click`: the input blurs first on click,
                    // which closes the list before the choice registers.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(option.value);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      i === active ? "bg-[var(--wash-2)] text-[var(--ink)]" : "text-[var(--ink-2)] hover:bg-[var(--wash)]"
                    }`}
                  >
                    <Search size={12} aria-hidden className="shrink-0 text-[var(--ink-muted)]" />
                    <span className="truncate">
                      {before}
                      {/* The matched run, so the reason this row is here is visible. */}
                      <mark className="bg-transparent font-semibold text-[var(--accent-ink)]">{match}</mark>
                      {after}
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
