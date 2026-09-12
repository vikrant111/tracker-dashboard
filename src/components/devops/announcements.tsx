"use client";

/**
 * What everyone working on these repos needs to know.
 *
 * Pinned first, then newest, because somebody opening the board mid-release
 * wants the freeze notice at the top rather than whatever was posted last.
 *
 * Admins get a composer inline. Members get the list, which is the point of it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, Pin, Plus, Rocket, Snowflake, StickyNote, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import { STATUS_INK } from "@/lib/palette";
import type { Announcement, AnnouncementKind, Repo } from "@/lib/devops/types";
import { AnnouncementComposer } from "./announcement-composer";
import { Button, Empty, Panel, PanelHeader, Tooltip } from "@/components/ui";

const KIND: Record<AnnouncementKind, { Icon: typeof Rocket; ink: string; hint: string }> = {
  release: { Icon: Rocket, ink: STATUS_INK.good, hint: "A release has been cut or deployed." },
  freeze: { Icon: Snowflake, ink: STATUS_INK.critical, hint: "A branch is locked, or about to be." },
  hotfix: { Icon: Zap, ink: STATUS_INK.warning, hint: "Something is going out outside the normal cycle." },
  note: { Icon: StickyNote, ink: "var(--ink-muted)", hint: "Anything else worth saying." },
};

export function Announcements({ repos, isAdmin }: { repos: Repo[]; isAdmin: boolean }) {
  const { data, error, mutate } = useSWR<{ announcements?: Announcement[]; error?: string }>(
    "/api/announcements",
    fetcher,
    SWR_OPTIONS,
  );

  const [draft, setDraft] = useState<Partial<Announcement> | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const failed = failureReason(error, data);
  const list = data?.announcements ?? [];
  const nameOf = (id: string) => repos.find((r) => r.id === id)?.name ?? id;

  const post = async () => {
    if (!draft?.repoId) return setProblem("Pick the repository this is about.");
    if (!String(draft.title ?? "").trim()) return setProblem("Give it a title. It is the only part most people read.");

    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not post that.");

      setDraft(null);
      await mutate();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not post that.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Announcement) => {
    setBusy(true);
    try {
      await fetch(`/api/announcements?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-4 sm:p-6" delay={0.05} hue="var(--accent-2)">
      <PanelHeader
        eyebrow="Release notes"
        title="Announcements"
        hue="var(--accent-2)"
        icon={<Megaphone size={16} strokeWidth={2.2} />}
        action={
          isAdmin &&
          !draft && (
            <Button
              variant="primary"
              onClick={() => setDraft({ repoId: repos[0]?.id ?? "", kind: "release", pinned: false })}
              disabled={repos.length === 0}
            >
              <Plus size={14} />
              Post
            </Button>
          )
        }
      />

      <AnnouncementComposer
        draft={draft}
        setDraft={setDraft}
        repos={repos}
        busy={busy}
        problem={problem}
        onPost={post}
        onCancel={() => { setDraft(null); setProblem(null); }}
      />

      {failed ? (
        <Empty title="Could not load announcements" hint={failed} />
      ) : list.length === 0 ? (
        <Empty
          title="Nothing announced yet"
          hint={isAdmin ? "Post one when a release is cut or a branch is frozen." : "An admin posts here when a release is cut."}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {list.map((a) => {
              const { Icon, ink } = KIND[a.kind] ?? KIND.note;
              return (
                <motion.li
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-[var(--hairline)] px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon size={14} aria-hidden style={{ color: ink }} />
                    <span className="font-medium">{a.title}</span>
                    {a.pinned && (
                      <Tooltip label="Pinned to the top">
                        <Pin size={12} aria-hidden className="text-[var(--accent-ink)]" />
                      </Tooltip>
                    )}

                    <span className="ml-auto flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <span className="font-mono">{nameOf(a.repoId)} · {a.branch}</span>
                      <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString()}</time>
                      {isAdmin && (
                        <Button
                          onClick={() => {
                            if (armed !== a.id) return setArmed(a.id);
                            setArmed(null);
                            void remove(a);
                          }}
                          disabled={busy}
                        >
                          <Trash2 size={12} />
                          {armed === a.id ? "Delete it?" : "Delete"}
                        </Button>
                      )}
                    </span>
                  </div>

                  {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-muted)]">{a.body}</p>}
                  {a.author && <p className="mt-1 text-xs text-[var(--ink-muted)]">— {a.author}</p>}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}
