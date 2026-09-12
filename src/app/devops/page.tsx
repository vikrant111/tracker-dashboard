import { redirect } from "next/navigation";
import { AUTH_MODE } from "@/auth";
import { DevOpsClient } from "@/components/devops/devops-client";
import { currentUser } from "@/lib/session";
import { accessibleTeams } from "@/lib/api";
import { canSeeDevOps } from "@/lib/devops/access";
import { canClearData, canEditRecords } from "@/lib/devops/editors";
import { getUser } from "@/lib/users";
import { githubMode } from "@/lib/devops/github";

export const dynamic = "force-dynamic";

/**
 * The DevOps board.
 *
 * Access is decided here rather than in the client: a member who may not see it
 * is sent to the POD board instead of being handed a page whose every request
 * answers 403.
 */
export default async function DevOpsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canSeeDevOps(user.role)) redirect("/");

  const teams = await accessibleTeams(user);
  /*
   * Read from the stored account rather than the session, so granting somebody
   * editor rights takes effect on their next page load instead of their next
   * sign-in.
   */
  const account = await getUser(user.email);

  return (
    <main className="min-h-screen">
      <DevOpsClient
        userName={user.name}
        isAdmin={user.role === "admin"}
        authEnabled={AUTH_MODE !== "off"}
        teamNames={Object.fromEntries(teams.map((t) => [t.id, t.name]))}
        githubMode={githubMode()}
        canEdit={canEditRecords({ role: user.role, devopsEditor: account?.devopsEditor })}
        canClearData={canClearData({ role: user.role, canClearData: account?.canClearData })}
      />
    </main>
  );
}
