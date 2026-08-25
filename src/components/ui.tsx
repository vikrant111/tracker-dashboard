/**
 * The shared interface pieces, re-exported from one place.
 *
 * Each lives in its own file under `ui/` — a single 750-line module meant that
 * finding the tooltip required scrolling past the menu's keyboard handling.
 * This barrel keeps every existing `from "./ui"` import working, so the split
 * is about where code lives rather than about churning call sites.
 */
export { Panel, PanelHeader, Empty } from "./ui/surfaces";
export { Button, Chip, SegmentedControl } from "./ui/controls";
export { CountUp } from "./ui/count-up";
export { PasswordField } from "./ui/password-field";
export { Menu } from "./ui/menu";
export { MenuSection, MenuItem } from "./ui/menu-item";
export { Tooltip } from "./ui/tooltip";
