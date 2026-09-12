import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { DevOpsAdminClient } from "./devops-admin-client";

export const dynamic = "force-dynamic";

/**
 * Admin for the DevOps board.
 *
 * Its own page rather than more panels on the POD admin screen: onboarding a
 * repository and onboarding a POD are different jobs done by different people
 * at different times, and stacking them made one long page where neither was
 * easy to find.
 */
export default async function DevOpsAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <main className="min-h-screen">
      <DevOpsAdminClient />
    </main>
  );
}
