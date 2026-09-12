import { redirect } from "next/navigation";
import { AUTH_MODE } from "@/auth";
import { DashboardClient } from "@/components/dashboard-client";
import { currentUser } from "@/lib/session";
import { accessibleTeams } from "@/lib/api";
import { currentWeather } from "@/lib/weather";
import { canSeeDevOps } from "@/lib/devops/access";
import { canClearData } from "@/lib/devops/editors";
import { getUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const teams = await accessibleTeams(user);
  /* From the stored account, not the session: a grant takes effect on the next
     page load rather than the next sign-in, and a revocation just as fast. */
  const account = await getUser(user.email);
  // Null unless WEATHER_LAT/WEATHER_LON are set — see docs/operations.md.
  const weather = await currentWeather();

  return (
    <main className="min-h-screen">
      <DashboardClient
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        canClearData={canClearData({ role: user.role, canClearData: account?.canClearData })}
        userName={user.name}
        weather={weather}
        isAdmin={user.role === "admin"}
        authEnabled={AUTH_MODE !== "off"}
        // Admins land on the cross-POD view; members land on their own POD.
        initialTeamId={user.role === "admin" ? "" : (teams[0]?.id ?? "")}
        canSeeDevOps={canSeeDevOps(user.role)}
      />
    </main>
  );
}
