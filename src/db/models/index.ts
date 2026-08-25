/**
 * The compiled models, one per collection.
 *
 * **Why the lookup before compiling.** Mongoose caches models on the connection
 * by name, and compiling the same name twice throws `OverwriteModelError`.
 * Next re-evaluates this module on every hot reload while the connection
 * survives, so a plain `model(...)` call blows up on the second edit of any
 * file that imports it. Checking `mongoose.models` first is the fix, and it is
 * why this file exists at all rather than each schema exporting its own model.
 */
import mongoose, { type Model } from "mongoose";
import { MODELS } from "../constants/collections.ts";
import { itemSchema } from "../schemas/item.schema.ts";
import { syncStateSchema } from "../schemas/sync-state.schema.ts";
import { teamSchema } from "../schemas/team.schema.ts";
import { userSchema } from "../schemas/user.schema.ts";

/**
 * The stored shape of an item: the domain `Item` with real dates.
 *
 * Kept separate from `lib/types.ts`'s `Item`, whose dates are ISO strings
 * because that is what crosses the wire to the browser. The controller is the
 * one place that converts, so nothing downstream has to know.
 */
export type ItemDoc = {
  _id: string;
  id: string;
  workItemId: string;
  teamId: string;
  source: "azure" | "excel";
  kind: string;
  type: string;
  title: string;
  url: string;
  assignee: string;
  assigneeEmail: string;
  severity: string;
  environment: string;
  status: string;
  state: string;
  priority: number | null;
  tags: string[];
  createdDate: Date;
  changedDate: Date | null;
  closedDate: Date | null;
  isActive: boolean;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const compile = <T>(name: string, schema: any): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);

export const ItemModel = compile<ItemDoc>(MODELS.item, itemSchema);
export const TeamModel = compile<Record<string, any>>(MODELS.team, teamSchema);
export const UserModel = compile<Record<string, any>>(MODELS.user, userSchema);
export const SyncStateModel = compile<Record<string, any>>(MODELS.sync, syncStateSchema);

/** Every model, for the one-shot index build in `ensureIndexes`. */
export const models = {
  item: ItemModel,
  team: TeamModel,
  user: UserModel,
  sync: SyncStateModel,
};
