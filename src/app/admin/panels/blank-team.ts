import type { Member, Team } from "@/lib/types";
import { AGEING, AZURE } from "@/lib/constants";
import { DEFAULT_FIELD_MAP } from "@/lib/types";

/** An empty row in the member editor. */
export const BLANK_MEMBER: Member = { name: "", email: "", designation: "", role: "member" };

/**
 * What "New POD" starts from.
 *
 * A function rather than a constant: it is handed straight to `useState`, and a
 * shared object would let one draft's edits show up in the next.
 */
export const blankTeam = (): Team => ({
  id: "",
  name: "",
  description: "",
  // A POD with nobody in it is not a POD, so the first row is its lead.
  members: [{ ...BLANK_MEMBER, role: "lead" }],
  azure: {
    orgUrl: "",
    project: "",
    pat: "",
    areaPath: "",
    workItemTypes: [...AZURE.defaultWorkItemTypes],
  },
  fieldMap: { ...DEFAULT_FIELD_MAP },
  valueMap: { severity: {}, environment: {}, status: {} },
  ageingThresholdDays: AGEING.defaultThresholdDays,
  createdAt: "",
});
