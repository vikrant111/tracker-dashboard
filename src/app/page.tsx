import { redirect } from "next/navigation";
import { AUTH_MODE } from "@/auth";
import { DashboardClient } from "@/components/dashboard-client";
import { currentUser } from "@/lib/session";
import { accessibleTeams } from "@/lib/api";
import { currentWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const teams = await accessibleTeams(user);
  // Null unless WEATHER_LAT/WEATHER_LON are set — see docs/operations.md.
  const weather = await currentWeather();

  return (
    <main className="min-h-screen">
      <DashboardClient
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        userName={user.name}
        weather={weather}
        isAdmin={user.role === "admin"}
        authEnabled={AUTH_MODE !== "off"}
        // Admins land on the cross-POD view; members land on their own POD.
        initialTeamId={user.role === "admin" ? "" : (teams[0]?.id ?? "")}
      />
    </main>
  );
}
