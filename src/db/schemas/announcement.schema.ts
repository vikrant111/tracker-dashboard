/**
 * An announcement about a repository's release branch.
 *
 * `_id` carries the repo and the timestamp, so the rows for one repo sort by
 * time without an index on two fields and without a second write to reorder.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";
import { ANNOUNCEMENT_KINDS } from "../../lib/devops/types.ts";

export const announcementSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },

    repoId: { type: String, required: true, index: true },
    branch: { type: String, default: "" },
    kind: { type: String, enum: [...ANNOUNCEMENT_KINDS], default: "note" },

    title: { type: String, required: true },
    body: { type: String, default: "" },

    author: { type: String, default: "" },
    pinned: { type: Boolean, default: false },
    createdAt: { type: String, default: "" },
  },
  { collection: COLLECTIONS.announcements, _id: false, versionKey: false, strict: true, minimize: false },
);

announcementSchema.index({ repoId: 1, createdAt: -1 });
