import { redirect } from "next/navigation";
import { AdminClient } from "./admin-client";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <main className="min-h-screen">
      <AdminClient adminEmail={user.email} />
    </main>
  );
}
