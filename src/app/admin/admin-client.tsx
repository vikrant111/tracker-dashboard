"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Plug, Plus, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ParallaxBackdrop } from "@/components/parallax-backdrop";
import { ThemeToggle } from "@/components/theme-toggle";
import { SWR_OPTIONS, fetcher } from "@/lib/swr";
import { Button, Empty, Panel, PanelHeader, PasswordField } from "@/components/ui";
import type { Member, Team, User } from "@/lib/types";
import { TIMING } from "@/lib/constants";
import { validateTeam } from "@/lib/validation";
import { BLANK_MEMBER, blankTeam } from "./panels/blank-team";
import { Field, updateMember } from "./panels/field";
import { UsersPanel } from "./panels/people-panel";
import { PodList } from "./panels/pod-list";
import { PodIdentityPanel } from "./panels/pod-identity";
import { PodMembersPanel } from "./panels/pod-members";
import { PodAzurePanel } from "./panels/pod-azure";

export function AdminClient({ adminEmail }: { adminEmail: string }) {
  const teamsReq = useSWR<{ teams: Team[] }>("/api/teams", fetcher, SWR_OPTIONS);
  const usersReq = useSWR<{ users: (User & { hasPassword: boolean })[] }>("/api/users", fetcher, SWR_OPTIONS);

  const [draft, setDraft] = useState<Team | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  const teams = teamsReq.data?.teams ?? [];
  const flash = (text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), TIMING.toastMs);
  };

  const patch = (change: Partial<Team>) => setDraft((d) => (d ? { ...d, ...change } : d));
  const patchAzure = (change: Partial<Team["azure"]>) =>
    setDraft((d) => (d ? { ...d, azure: { ...d.azure, ...change } } : d));

  /**
   * Whether the draft differs from what is stored.
   *
   * A new POD counts as dirty the moment it is given a name — before that it is
   * an empty form, and closing an empty form should not ask you anything.
   */
  const saved = draft?.id ? teams.find((t) => t.id === draft.id) : undefined;
  const dirty = draft ? JSON.stringify(draft) !== JSON.stringify(saved ?? blankTeam()) : false;

  /**
   * Two-step confirmation for anything that throws work away.
   *
   * A single click that deletes a POD *and every work item under it* is not a
   * button, it is a trap. The second click has to be deliberate, and the arming
   * lapses on its own so a stray first click cannot sit there waiting to fire.
   */
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), TIMING.confirmMs);
    return () => clearTimeout(t);
  }, [armed]);

  const confirmThen = (key: string, run: () => void) => {
    if (armed === key) {
      setArmed(null);
      run();
      return;
    }
    setArmed(key);
  };

  /** Close the editor, asking first only if there is something to lose. */
  const closeDraft = () => {
    if (!dirty) return setDraft(null);
    confirmThen("discard", () => {
      setDraft(null);
      flash("Discarded unsaved changes.");
    });
  };

  const saveTeam = async () => {
    // Checked before the request, so a half-filled member row is named rather
    // than silently dropped on the way to the server.
    const problem = validateTeam(draft);
    if (problem) return flash(problem, "bad");

    const creating = !draft?.id;
    setBusy("save");
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, members: draft!.members.filter((m) => m.name.trim() || m.email.trim()) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that POD.");

      flash(creating ? `Created ${body.team.name}.` : `Saved ${body.team.name}.`);
      // The saved POD, not the draft: ids, slugs and defaults are the server's
      // to assign, and the editor should show what was actually stored. On
      // failure the draft is left exactly as typed — see the catch.
      setDraft(body.team);
      await teamsReq.mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save.", "bad");
    } finally {
      setBusy("");
    }
  };

  /**
   * What the project calls its work items, once Test has asked.
   *
   * Kept on screen rather than flashed: the point is to copy from it, and a
   * toast that vanishes in six seconds is no use for that.
   */
  const [projectTypes, setProjectTypes] = useState<{ types: string[]; unmatched: string[] } | null>(null);

  const testConnection = async () => {
    if (!draft?.id) return flash("Save the POD before testing.", "bad");
    setBusy("test");
    const res = await fetch(`/api/teams/${draft.id}/test`, { method: "POST" }).then((r) => r.json());
    setBusy("");

    if (!res.ok) {
      setProjectTypes(null);
      return flash(res.error, "bad");
    }

    setProjectTypes({ types: res.types ?? [], unmatched: res.unmatched ?? [] });
    /*
     * A type that does not exist in the project is the failure worth shouting
     * about: the query matches names exactly, so those items sync silently as
     * nothing at all.
     */
    if (res.unmatched?.length) {
      flash(`Connected, but ${res.project} has no "${res.unmatched.join('", "')}". Those items will not sync.`, "bad");
    } else {
      flash(`Connected to ${res.project}.`);
    }
  };

  const syncTeam = async (full: boolean) => {
    if (!draft?.id) return;
    setBusy("sync");
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: draft.id, full }),
    }).then((r) => r.json());
    setBusy("");
    const result = res.results?.[0];
    flash(result?.error ?? `Imported ${result?.imported ?? 0} work items.`, result?.error ? "bad" : "ok");
  };

  const removeTeam = async (team: Team) => {
    setBusy(`del-${team.id}`);
    await fetch(`/api/teams/${team.id}`, { method: "DELETE" });
    setBusy("");
    if (draft?.id === team.id) setDraft(null);
    flash(`Deleted ${team.name} and its work items.`);
    await teamsReq.mutate();
  };

  return (
    <>
      <ParallaxBackdrop />
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6 pb-24 sm:px-6">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/">
            <Button>
              <ArrowLeft size={15} />
              Dashboard
            </Button>
          </Link>
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
              PODs and access
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Button variant="primary" onClick={() => setDraft(blankTeam())}>
              <Plus size={15} />
              New POD
            </Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <PodList
            teams={teams}
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            armed={armed}
            confirmThen={confirmThen}
            removeTeam={removeTeam}
          />

          {draft ? (
            <div className="flex flex-col gap-4">
              <PodIdentityPanel
                draft={draft}
                setDraft={setDraft}
                busy={busy}
                armed={armed}
                setArmed={setArmed}
                saveTeam={saveTeam}
                removeTeam={removeTeam}
                dirty={dirty}
                closeDraft={closeDraft}
              />
              <PodMembersPanel
                draft={draft}
                setDraft={setDraft}
                busy={busy}
                armed={armed}
                setArmed={setArmed}
                saveTeam={saveTeam}
              />
              <PodAzurePanel
                draft={draft}
                setDraft={setDraft}
                busy={busy}
                armed={armed}
                setArmed={setArmed}
                saveTeam={saveTeam}
                syncTeam={syncTeam}
                testConnection={testConnection}
                projectTypes={projectTypes}
              />
            </div>
          ) : (
            <Panel className="grid place-items-center p-6">
              <Empty
                title="Pick a POD, or create one"
                hint="Each POD gets its own Azure connection, member list and ageing threshold. Members only see the PODs you assign them to."
              />
            </Panel>
          )}
        </div>

        <UsersPanel
          users={usersReq.data?.users ?? []}
          teams={teams}
          adminEmail={adminEmail}
          onChanged={() => usersReq.mutate()}
          flash={flash}
        />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            className="glass fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 px-4 py-3 text-sm"
            style={{ borderColor: toast.tone === "bad" ? "var(--danger)" : "var(--st-good)" }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
