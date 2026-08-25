/**
 * A bug, ticket or CR — the document every dashboard number is counted from.
 *
 * Two rules carried over from the OpenSearch mappings, both load-bearing:
 *
 * 1. **Age is never stored.** It is computed at query time from `createdDate`.
 *    A stored age is wrong the next morning and needs a nightly job to stay
 *    honest.
 * 2. **`_id` is the deterministic document id** (`<teamId>:<workItemId>`), not
 *    an ObjectId. That single property is what makes every import an upsert, so
 *    the sync watermark can overlap safely and a spreadsheet can be re-uploaded
 *    after a correction without duplicating a row.
 */
import { Schema } from "mongoose";
import { ENVIRONMENTS, KINDS, SEVERITIES, STATUSES } from "../../lib/types.ts";
import { COLLECTIONS } from "../constants/collections.ts";

export const itemSchema = new Schema(
  {
    /* The deterministic id, so an upsert replaces rather than inserts. */
    _id: { type: String, required: true },

    id: { type: String, required: true },
    workItemId: { type: String, required: true },
    teamId: { type: String, required: true, index: true },
    source: { type: String, enum: ["azure", "excel"], required: true },

    kind: { type: String, enum: [...KINDS], required: true },
    type: { type: String, default: "" },
    title: { type: String, default: "" },
    url: { type: String, default: "" },

    assignee: { type: String, default: "" },
    assigneeEmail: { type: String, default: "" },

    /*
     * Constrained to the vocabulary. `normalize` already resolves a board's own
     * words down to these and falls back to `Unknown` rather than guessing — the
     * enum is the second line of defence, so a bad write fails loudly here
     * instead of appearing as a mystery bucket on a chart.
     */
    severity: { type: String, enum: [...SEVERITIES], default: "Unknown" },
    environment: { type: String, enum: [...ENVIRONMENTS], default: "Unknown" },
    status: { type: String, enum: [...STATUSES], default: "Unknown" },
    state: { type: String, default: "" },

    priority: { type: Number, default: null },
    tags: { type: [String], default: [] },

    /*
     * Real `Date`s, not the ISO strings the `Item` type carries.
     *
     * `$dateTrunc` and date arithmetic in the aggregation need BSON dates —
     * against a string they return null and every trend bucket comes back
     * empty. The controller converts on the way in and on the way out, so the
     * shape the rest of the app sees is unchanged.
     */
    createdDate: { type: Date, required: true },
    changedDate: { type: Date, default: null },
    closedDate: { type: Date, default: null },

    isActive: { type: Boolean, required: true },
  },
  {
    collection: COLLECTIONS.items,
    /* `_id` is ours; Mongoose must not add its own or version documents. */
    _id: false,
    versionKey: false,
    /* Written by the sync, never by a user editing a row. */
    timestamps: false,
    /* An unexpected key is a mapping bug — drop it rather than store it. */
    strict: true,
    minimize: false,
  },
);

/*
 * Indexes for the queries this app actually issues.
 *
 * Every dashboard panel is one `$match` on the filters followed by `$facet`, so
 * the compound indexes below front-load the fields that appear in that match.
 * `createdDate` trails every one of them because ageing, the trend and the
 * default sort are all ordered by it.
 */
itemSchema.index({ teamId: 1, isActive: 1, createdDate: -1 });
itemSchema.index({ teamId: 1, kind: 1, createdDate: -1 });
itemSchema.index({ teamId: 1, severity: 1, isActive: 1 });
itemSchema.index({ teamId: 1, environment: 1 });
itemSchema.index({ teamId: 1, status: 1 });
itemSchema.index({ teamId: 1, assignee: 1, isActive: 1 });
itemSchema.index({ createdDate: -1 });
itemSchema.index({ closedDate: -1 });

/*
 * The drill-down's search box matches a title prefix and an assignee substring.
 * A text index would stem and tokenise — "microsite" would match "microsites",
 * which is the kind of near-miss this project has been bitten by before — so
 * the search uses an anchored regex and these plain indexes support it.
 */
itemSchema.index({ workItemId: 1 });
itemSchema.index({ assignee: 1 });
