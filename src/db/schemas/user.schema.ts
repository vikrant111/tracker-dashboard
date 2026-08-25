/**
 * Someone who can sign in, and which PODs they can see.
 *
 * `_id` is the lowercased email, which is what makes "invite the same person
 * twice" an update rather than a second account.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";

export const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, default: "" },

    /*
     * The bcrypt hash.
     *
     * Deliberately **not** `select: false`. Every caller needs it — the two
     * password routes check whether one is set, `verifyPassword` compares
     * against it, and `saveUser` reads the existing one to avoid clobbering it
     * on an unrelated edit. A guard that every caller has to opt out of stops
     * being a guard and becomes a source of silent bugs: the first forgotten
     * `+passwordHash` makes `hasPassword` read false for everybody and password
     * changes refuse with "no password set".
     *
     * The real protection is at the boundary, where it belongs: `/api/users`
     * redacts this to `hasPassword: boolean` and the hash never reaches a
     * browser.
     */
    passwordHash: { type: String, default: null },

    role: { type: String, enum: ["admin", "member"], default: "member" },
    teamIds: { type: [String], default: [] },

    createdAt: { type: String, default: "" },
    /*
     * Sessions issued before this are refused, so changing a password because
     * it was compromised actually ends the attacker's session. Absent on
     * accounts written before the field existed, which invalidates nothing.
     */
    passwordChangedAt: { type: String, default: undefined },
  },
  { collection: COLLECTIONS.users, _id: false, versionKey: false, strict: true, minimize: false },
);

userSchema.index({ email: 1 });
userSchema.index({ teamIds: 1 });
