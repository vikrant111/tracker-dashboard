import bcrypt from "bcryptjs";
import {
  countUserDocs,
  deleteUserDoc,
  findAllUsers,
  findUserById,
  insertFirstUser,
  saveUserDoc,
} from "../controllers/users.controller.ts";
import type { User } from "./types";
import { LIMITS } from "./constants";

export const userId = (email: string) => email.trim().toLowerCase();

export async function getUser(email: string): Promise<User | null> {
  return findUserById(userId(email));
}

export async function listUsers(): Promise<User[]> {
  const users = await findAllUsers();
  /*
   * Sorted defensively. One record with no email used to throw out of
   * `localeCompare` and take the **entire** user list with it — and with it the
   * admin page, on which the only way to fix the record lives.
   *
   * That matters more since the store can be plain JSON files: they are meant
   * to be looked at, and a hand-edited row with a missing field is a normal
   * accident rather than a corrupted database.
   */
  return users
    .filter((u) => u && typeof u.email === "string" && u.email)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function countUsers(): Promise<number> {
  return countUserDocs();
}

const ROLES: User["role"][] = ["admin", "member"];

/**
 * Must be a real array. A bare string survives `teamIds.includes(id)` as a
 * substring test, so "amc-pod-archive" would silently grant "amc-pod" — an
 * access grant nobody asked for.
 */
function cleanTeamIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

export async function saveUser(input: {
  email: string;
  name?: string;
  password?: string;
  role?: User["role"];
  teamIds?: unknown;
}): Promise<User> {
  const id = userId(input.email);
  const existing = await findUserById(id);

  const user: User = {
    id,
    email: id,
    name: String(input.name ?? existing?.name ?? id.split("@")[0]).slice(0, LIMITS.personName),
    passwordHash: input.password
      ? await bcrypt.hash(input.password, 10)
      : existing?.passwordHash ?? null,
    role: ROLES.includes(input.role as User["role"]) ? (input.role as User["role"]) : (existing?.role ?? "member"),
    teamIds: cleanTeamIds(input.teamIds) ?? existing?.teamIds ?? [],
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  await saveUserDoc(user);
  return user;
}

export async function deleteUser(email: string) {
  await deleteUserDoc(userId(email));
}

export async function verifyPassword(email: string, password: string): Promise<User | null> {
  const user = await getUser(email);
  if (!user?.passwordHash) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

/**
 * SSO users are not pre-created. First one in becomes admin (there is nobody to
 * grant it otherwise); everyone after joins as a member with no teams until an
 * admin assigns them.
 */
export async function upsertSsoUser(email: string, name: string): Promise<User> {
  const existing = await getUser(email);
  if (existing) return existing;
  const isFirst = (await countUsers()) === 0;
  return saveUser({ email, name, role: isFirst ? "admin" : "member" });
}

/**
 * Set a password, having already established the caller is allowed to.
 *
 * Deliberately narrow: it writes the hash and nothing else. `saveUser` would
 * also happily rewrite the role and the POD list from whatever the caller sent,
 * which on a password route is an escalation waiting to happen — a member
 * changing their own password must not be able to smuggle `role: "admin"`
 * through the same request.
 */
export async function setPassword(email: string, password: string): Promise<boolean> {
  const id = userId(email);
  const user = await findUserById(id);
  if (!user) return false;

  await saveUserDoc({
    ...user,
    passwordHash: await bcrypt.hash(password, 10),
    /*
     * Stamped so every session issued before this moment stops working.
     *
     * Somebody changing their password because it leaked expects that to end
     * the intruder's access. Without this stamp it does the opposite of what
     * they think: the old password stops working while the session opened with
     * it keeps going, for as long as the attacker keeps using it.
     */
    passwordChangedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Create the first admin from the environment, when there is nobody at all.
 *
 * Without this, a fresh production deploy in `password` mode has zero users and
 * **nobody can sign in** — the seeder is a local convenience, not something you
 * run against production. SSO already self-bootstraps (the first person to sign
 * in becomes admin, in `upsertSsoUser`); this is the same idea for passwords.
 *
 * Deliberately only when the store is **empty**. Once anyone exists this must
 * never run again, or deleting the last account would conjure a new admin with
 * a password from an environment variable somebody forgot was set.
 */
export async function ensureFirstAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!email || !password) return;

  try {
    const id = userId(email);
    /*
     * An atomic insert rather than count-then-save. Two workers booting
     * together both see an empty collection, and with a plain save the second
     * overwrites the first — including its password hash. `insertFirstUser`
     * lets the unique key reject the loser, so the race is harmless.
     */
    const created = await insertFirstUser({
      id,
      email: id,
      name: "Administrator",
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin",
      teamIds: [],
      createdAt: new Date().toISOString(),
    });
    if (created) console.info(`[auth] Created the first admin account for ${email} from the environment.`);
  } catch {
    // A racing request already made it, or the database is unhappy. Either way
    // the next sign-in attempt will find the account or fail loudly on its own.
  }
}
