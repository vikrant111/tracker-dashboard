/**
 * A POD — a team, and everything about how its board is read.
 *
 * The nested objects (`azure`, `fieldMap`, `valueMap`, `members`) were stored
 * with indexing disabled under OpenSearch, because nothing queries inside them.
 * That is still true here, so they are `Mixed`: their shape is owned by
 * `lib/types.ts` and validated by `lib/validation.ts` before a write, and
 * duplicating it as a sub-schema would give two definitions to keep in step.
 *
 * `_id` is the slug (`AMC POD` → `amc-pod`), so a rename is a decision rather
 * than an accident.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";

export const teamSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },

    members: { type: Schema.Types.Mixed, default: [] },
    /*
     * Carries the Azure PAT. `/api/teams` redacts it before serialising, and a
     * value arriving back masked means "keep the stored one" — so the secret
     * never round-trips through a browser.
     */
    azure: { type: Schema.Types.Mixed, default: {} },
    fieldMap: { type: Schema.Types.Mixed, default: {} },
    valueMap: { type: Schema.Types.Mixed, default: {} },

    ageingThresholdDays: { type: Number, default: 7 },
    createdAt: { type: String, default: "" },
  },
  { collection: COLLECTIONS.teams, _id: false, versionKey: false, strict: true, minimize: false },
);

teamSchema.index({ name: 1 });
