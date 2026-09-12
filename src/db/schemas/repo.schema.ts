/**
 * A GitHub repository the DevOps board tracks.
 *
 * `_id` is `owner-repo` slugged, so onboarding the same repository twice is an
 * update rather than a second row — the same rule PODs follow.
 *
 * `freeze` is stored rather than read from GitHub on every render. The board is
 * looked at far more often than a branch is frozen, and a page that hit the
 * GitHub API once per repo per view would spend its rate limit on people
 * scrolling. `/api/repos/[id]/freeze` writes it; a reconcile can refresh it.
 */
import { Schema } from "mongoose";
import { COLLECTIONS } from "../constants/collections.ts";
import { FREEZE_METHODS, FREEZE_STATES } from "../../lib/devops/types.ts";

export const repoSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },

    name: { type: String, required: true },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    url: { type: String, default: "" },

    releaseBranch: { type: String, default: "release" },
    developBranch: { type: String, default: "develop" },

    /*
     * The PODs that own this repo. Plural: one repository is routinely worked
     * on by several teams, and a single owner made somebody pick one.
     */
    teamIds: { type: [String], default: [], index: true },

    /*
     * A GitHub token with admin rights on this repo. Redacted by `/api/repos`
     * before serialising, exactly as the Azure PAT is, so it never reaches a
     * browser. Blank falls back to the GITHUB_TOKEN environment variable.
     */
    token: { type: String, default: "" },

    freezeMethod: { type: String, enum: [...FREEZE_METHODS], default: "ruleset" },

    freeze: {
      state: { type: String, enum: [...FREEZE_STATES], default: "open" },
      changedAt: { type: String, default: "" },
      changedBy: { type: String, default: "" },
      reason: { type: String, default: "" },
      detail: { type: String, default: "" },
      rulesetId: { type: String, default: "" },
    },

    createdAt: { type: String, default: "" },
  },
  { collection: COLLECTIONS.repos, _id: false, versionKey: false, strict: true, minimize: false },
);

repoSchema.index({ owner: 1, repo: 1 });
repoSchema.index({ "freeze.state": 1 });
