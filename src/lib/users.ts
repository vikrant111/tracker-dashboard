import bcrypt from "bcryptjs";
import { IDX, ensureIndices, getDoc, os, putDoc, searchAll } from "./opensearch";
import type { User } from "./types";
import { LIMITS } from "./constants";

export const userId = (email: string) => email.trim().toLowerCase();

export async function getUser(email: string): Promise<User | null> {
  await ensureIndices();
  return getDoc<User>(IDX.users, userId(email));
}

export async function listUsers(): Promise<User[]> {
  await ensureIndices();
  const users = await searchAll<User>(IDX.users, { query: { match_all: {} } });
  return users.sort((a, b) => a.email.localeCompare(b.email));
}

export async function countUsers(): Promise<number> {
  await ensureIndices();
  const { body } = await os().count({ index: IDX.users });
  return body.count;
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
  await ensureIndices();
  const id = userId(input.email);
  const existing = await getDoc<User>(IDX.users, id);

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

  await putDoc(IDX.users, id, user);
  return user;
}

export async function deleteUser(email: string) {
  await ensureIndices();
  await os().delete({ index: IDX.users, id: userId(email), refresh: true }).catch(() => {});
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
