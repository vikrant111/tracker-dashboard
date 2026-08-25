import type { ValueMap } from "./types.ts";

/**
 * How a board's own words map onto ours.
 *
 * Its own file because it grows with every board that connects — each one
 * spells severity and status differently, and a table that keeps growing does
 * not belong inside the file that defines the vocabulary it maps onto.
 *
 * Matching is case-insensitive, and the substring pass is **word-bounded**: an
 * unbounded one had `it` matching inside "microsites", so every item under an
 * area path with that word in it came back IT-UAT.
 */
export const DEFAULT_VALUE_MAP: ValueMap = {
  severity: {
    "1 - critical": "Critical",
    "2 - high": "Major",
    "3 - medium": "Minor",
    "4 - low": "Minor",
    critical: "Critical",
    blocker: "Critical",
    high: "Major",
    major: "Major",
    medium: "Minor",
    minor: "Minor",
    low: "Minor",
  },
  environment: {
    "it-uat": "IT-UAT",
    ituat: "IT-UAT",
    it: "IT-UAT",
    "biz-uat": "BIZ-UAT",
    bizuat: "BIZ-UAT",
    uat: "BIZ-UAT",
    biz: "BIZ-UAT",
    cug: "CUG",
    stage: "CUG",
    staging: "CUG",
    "cug(stage)": "CUG",
    prod: "Production",
    production: "Production",
    live: "Production",
  },
  status: {
    new: "Open",
    open: "Open",
    active: "Open",
    "to do": "Open",
    commented: "Commented",
    "need more info": "Commented",
    "for qa validation": "For QA Validation",
    "qa validation": "For QA Validation",
    resolved: "For QA Validation",
    "ready for test": "For QA Validation",
    // Boards name whoever signs off differently — PO, BA, business. They all
    // mean the same thing to this dashboard: fixed, waiting on somebody.
    "for po validation": "For QA Validation",
    "for ba validation": "For QA Validation",
    "for business validation": "For QA Validation",
    "po validation": "For QA Validation",
    "pending validation": "For QA Validation",
    "ready for qa": "For QA Validation",
    fixed: "For QA Validation",
    // "Approved" on a bug board means triaged and accepted — still open work.
    approved: "Open",
    triaged: "Open",
    reopened: "Open",
    "in progress": "Open",
    "on hold": "Commented",
    blocked: "Commented",
    duplicate: "Not a Bug",
    "cannot reproduce": "Not a Bug",
    "not reproducible": "Not a Bug",
    deferred: "Commented",
    "not a bug": "Not a Bug",
    "by design": "Not a Bug",
    rejected: "Not a Bug",
    closed: "Closed",
    done: "Closed",
    completed: "Closed",
    removed: "Not a Bug",
  },
};
