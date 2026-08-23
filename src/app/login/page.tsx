import { redirect } from "next/navigation";
import { AUTH_MODE, entraEnabled, passwordEnabled } from "@/auth";
import { ParallaxBackdrop } from "@/components/parallax-backdrop";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (AUTH_MODE === "off") redirect("/");
  if (await currentUser()) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <ParallaxBackdrop />
      <LoginForm passwordEnabled={passwordEnabled} entraEnabled={entraEnabled} />
    </main>
  );
}
