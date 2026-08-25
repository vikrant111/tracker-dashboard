"use client";

import type { Member, Team } from "@/lib/types";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-xs text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

export function updateMember(
  draft: Team,
  setDraft: (t: Team) => void,
  index: number,
  change: Partial<Member>,
) {
  setDraft({
    ...draft,
    members: draft.members.map((m, i) => (i === index ? { ...m, ...change } : m)),
  });
}
