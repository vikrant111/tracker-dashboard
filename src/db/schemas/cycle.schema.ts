/**
 * One deployment cycle: a release going out of one repository.
 *
 * `_id` is `${repoId}-${slugged name}`, so naming the same cycle twice updates
 * it rather than leaving two scope sheets for one release.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";

export const cycleSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },

    repoId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    releaseBranch: { type: String, default: "" },

    /* `YYYY-MM-DD`, so grouping by day, month or year is a string prefix. */
    plannedFor: { type: String, default: "" },

    /*
     * Closing the scope sheet is per cycle, not per repository: "what is in
     * 2026.09" is a different list from "what is in 2026.10", and agreeing one
     * must not close the other.
     */
    scope: {
      frozen: { type: Boolean, default: false },
      changedAt: { type: String, default: "" },
      changedBy: { type: String, default: "" },
      reason: { type: String, default: "" },
    },

    createdAt: { type: String, default: "" },
    updatedAt: { type: String, default: "" },
  },
  { collection: COLLECTIONS.cycles, _id: false, versionKey: false, strict: true, minimize: false },
);

cycleSchema.index({ repoId: 1, plannedFor: -1 });
