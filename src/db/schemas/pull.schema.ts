/**
 * A pull request that reached a release branch.
 *
 * Read from GitHub, then annotated: the sign-offs are ours, because GitHub
 * knows nothing about who in the business agreed a change should ship.
 *
 * `_id` is `${repoId}-${number}`, so re-syncing updates one row rather than
 * accumulating a copy per sync. `mergedOn` carries the day of `mergedAt` as its
 * own indexed string, because every filter and every deletion on this board is
 * a `YYYY-MM-DD` prefix.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";

export const pullSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },

    repoId: { type: String, required: true, index: true },
    /* Which POD this change is for — one of the repo's, chosen on the row. */
    teamId: { type: String, default: "", index: true },
    cycleId: { type: String, default: "" },

    number: { type: Number, required: true },
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    author: { type: String, default: "" },

    baseBranch: { type: String, default: "" },
    mergedAt: { type: String, default: "" },
    mergedOn: { type: String, default: "", index: true },
    deployedOn: { type: String, default: "" },
    environment: { type: String, default: "" },

    ticket: { type: String, default: "", index: true },

    /*
     * `Mixed`, because the shape is a map of level → { by, at } and the levels
     * are owned by `lib/devops/signoff.ts`. Declaring it twice would give two
     * definitions to keep in step, which is the rule the rest of the schemas
     * follow for the same reason.
     */
    signoffs: { type: Schema.Types.Mixed, default: {} },

    /* Already on a scope sheet, so it cannot be added twice. */
    movedToScope: { type: Boolean, default: false },

    /* Why it was taken back off the sheet, so the reader knows what to fix. */
    returned: {
      at: { type: String, default: "" },
      by: { type: String, default: "" },
      remarks: { type: String, default: "" },
    },

    syncedAt: { type: String, default: "" },
  },
  { collection: COLLECTIONS.pulls, _id: false, versionKey: false, strict: true, minimize: false },
);

pullSchema.index({ repoId: 1, mergedOn: -1 });
pullSchema.index({ baseBranch: 1, mergedOn: -1 });
