/**
 * Where each POD's incremental sync got to.
 *
 * `_id` is the team id: one watermark per POD, and writing it twice is an
 * update. `lastChangedDate` is stored as the ISO string Azure's WIQL expects
 * rather than a `Date`, because it is fed straight back into a query — parsing
 * and re-formatting it is a round trip with nothing to gain and a timezone bug
 * to lose.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";

export const syncStateSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    lastChangedDate: { type: String, default: "" },
    lastRunAt: { type: String, default: "" },
    lastResult: { type: String, default: "" },
  },
  { collection: COLLECTIONS.sync, _id: false, versionKey: false, strict: true, minimize: false },
);
