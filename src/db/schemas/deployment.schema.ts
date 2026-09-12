/**
 * One bug, hotfix or CR going out.
 *
 * `_id` carries the repo and the timestamp, so a repo's rows sort by time
 * without a second index and without a write to reorder them.
 *
 * `ticket` is indexed because the board joins these rows back to work items to
 * show a bug's *current* severity and status, rather than whatever was typed
 * into the form weeks ago.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";
import { DEPLOY_KINDS, DEPLOY_STATES } from "../../lib/devops/types.ts";

export const deploymentSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },

    repoId: { type: String, required: true, index: true },
    /* Which POD this row is for — one of the repo's, chosen on the form. */
    teamId: { type: String, default: "", index: true },
    /* Which release this row is in scope for. */
    cycleId: { type: String, required: true, index: true },
    branch: { type: String, default: "" },
    environment: { type: String, default: "Unknown" },

    kind: { type: String, enum: [...DEPLOY_KINDS], default: "bug" },
    state: { type: String, enum: [...DEPLOY_STATES], default: "planned" },

    ticket: { type: String, default: "", index: true },
    title: { type: String, required: true },
    prUrl: { type: String, default: "" },
    /* The pull request this row was moved from, so removing it hands it back. */
    pullId: { type: String, default: "", index: true },

    author: { type: String, default: "" },
    notes: { type: String, default: "" },

    /* `YYYY-MM-DD`, so grouping by day, month or year is a string prefix. */
    deployedOn: { type: String, default: "" },

    createdAt: { type: String, default: "" },
    updatedAt: { type: String, default: "" },
  },
  { collection: COLLECTIONS.deployments, _id: false, versionKey: false, strict: true, minimize: false },
);

deploymentSchema.index({ cycleId: 1, deployedOn: -1 });
deploymentSchema.index({ repoId: 1, deployedOn: -1 });
deploymentSchema.index({ environment: 1, branch: 1 });
