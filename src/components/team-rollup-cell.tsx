"use client";

/** One number in the roll-up table, with a tooltip saying what it counts. */
import { Tooltip } from "./ui";

export function Cell({
  value,
  color,
  onClick,
  label,
}: {
  value: number | string;
  color: string;
  onClick: () => void;
  /** What this number means, for the tooltip. */
  label: string;
}) {
  return (
    <td className="py-3 pl-4 text-right">
      <Tooltip label={label}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="rounded-md px-2 py-0.5 font-[family-name:var(--font-mono)] font-semibold tnum transition-colors hover:bg-[var(--wash-2)]"
        style={{ color }}
      >
        {value}
      </button>
      </Tooltip>
    </td>
  );
}
