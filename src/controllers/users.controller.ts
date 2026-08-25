/**
 * Persistence for accounts.
 *
 * The domain rules — hashing, role validation, the first-admin bootstrap — stay
 * in `lib/users.ts`. This file only knows where the records live.
 */
import { connectToDatabase } from "../db/connect.ts";
import { UserModel } from "../db/models/index.ts";
import type { User } from "../lib/types.ts";

/** The domain shape, without Mongo's bookkeeping keys. */
const clean = (doc: Record<string, unknown> | null): User | null => {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  void _id;
  void __v;
  return rest as unknown as User;
};

export async function findUserById(id: string): Promise<User | null> {
  await connectToDatabase();
  /*
   * The id is an email that arrives from a request body or a session claim.
   * Mongo accepts an object as a filter value, so an `id` of `{"$ne": null}`
   * would match the first account in the collection — very possibly an admin.
   * A non-string is refused rather than queried.
   */
  if (typeof id !== "string" || !id) return null;
  return clean((await UserModel.findById(id).lean()) as Record<string, unknown> | null);
}

export async function findAllUsers(): Promise<User[]> {
  await connectToDatabase();
  const docs = await UserModel.find({}).lean();
  return docs.map((d) => clean(d as Record<string, unknown>)!).filter(Boolean);
}

export async function countUserDocs(): Promise<number> {
  await connectToDatabase();
  return UserModel.countDocuments({});
}

export async function saveUserDoc(user: User): Promise<User> {
  await connectToDatabase();
  await UserModel.replaceOne({ _id: user.id }, { ...user, _id: user.id }, { upsert: true });
  return user;
}

export async function deleteUserDoc(id: string): Promise<void> {
  await connectToDatabase();
  if (typeof id !== "string" || !id) return;
  await UserModel.deleteOne({ _id: id });
}

/**
 * Create an account only if the collection is empty.
 *
 * `insertOne` on a unique `_id` rather than a read-then-write: two workers
 * starting together would both see zero users and both write an admin, and the
 * second would silently overwrite the first — including its password. Letting
 * the unique key reject the loser makes the race harmless.
 *
 * Returns false when somebody already exists, which is not an error.
 */
export async function insertFirstUser(user: User): Promise<boolean> {
  await connectToDatabase();
  if ((await countUserDocs()) > 0) return false;
  try {
    await UserModel.create({ ...user, _id: user.id });
    return true;
  } catch (err) {
    /* 11000 is a duplicate key: another worker got there first. Not a failure. */
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}
