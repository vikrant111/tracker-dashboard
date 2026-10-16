/**
 * **The arrays to edit.** One per thing the boards are filtered on.
 *
 * Adding a name, an email, a module or a POD to the tracker is adding a line
 * here; removing one is deleting a line. Nothing else holds a list — not the
 * query builder, not the verifier, not the dashboard — so this file is the
 * whole of what the board is filtered by.
 *
 * **An empty array removes that filter**, it does not match everything. A
 * source left with every array empty is refused, because *that* would read the
 * whole project.
 *
 * `src/lib/contracts/azure-sources.ts` wires these to the boards they belong
 * to; `src/lib/contracts/item-filters.ts` holds the vocabulary and the window.
 */

/**
 * **Which PODs this tracker shows, and the Azure tags that identify each one.**
 *
 * The key is the POD as the dashboard names it — it is what the POD switcher
 * offers. The value is the tag, or the tags, a work item carries on the Azure
 * boards when it belongs to that POD.
 *
 * Adding a POD to the tracker is adding a line here; giving a POD a second tag
 * is adding it to that line. Both boards are then searched for it — there is
 * nothing else to wire up.
 *
 * ```ts
 * AMC: ["AMC_POD", "Investment Mall"],   // two tags, one POD
 * "Trading mall": "Trading_mall",        // one tag, written plainly
 * ```
 *
 * Matched against the POD's name or its id, ignoring case, spaces and
 * punctuation — and as a whole word, so the key `AMC` finds the POD called
 * `AMC POD` without also finding `AMC Trading`. A POD that matches two keys is
 * refused rather than guessed at.
 */
export const POD_TAG: Record<string, string | string[]> = {
  AMC: ["AMC_POD"],
};

/**
 * `POD Name`, on the 3in1 IT Requests board. A second way to find the same
 * work, for items that were never tagged.
 *
 * Matched with **contains**: the field holds several PODs at once — a live
 * request reads `AMC, Investment mall, Learning Centre` — so `AMC` is the part
 * to look for, not the whole string.
 */
export const POD_NAME = ["AMC"];

/** `BFL IT Spoc`, on the 3in1 IT Requests board. A display name or a sign-in name. */
export const BFL_IT_SPOC = [
  "Aravind I",
  "Aravind.i@bajajfinserv.in",
  "vikrant.tiwari2@bajajfinserv.in",
];

/** `Delivery SPOC`, on the 3in1_Agile_Projects board. */
export const DELIVERY_SPOC = [
  "Aravind I",
  "Aravind.i@bajajfinserv.in",
  "vikrant.tiwari2@bajajfinserv.in",
];
