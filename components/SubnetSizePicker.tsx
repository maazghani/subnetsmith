"use client";

import { getValidChildPrefixes, subnetSizeLabel, getSubnetInfo } from "@/lib/subnet";
import { cn } from "@/lib/utils";

interface SubnetSizePickerProps {
  parentCidr: string;
  selectedPrefix: number | null;
  onSelectPrefix: (prefix: number | null) => void;
}

const SIZE_TIERS: { label: string; min: number; max: number }[] = [
  { label: "Huge", min: 8, max: 15 },
  { label: "Large", min: 16, max: 19 },
  { label: "Medium", min: 20, max: 23 },
  { label: "Small", min: 24, max: 27 },
  { label: "Tiny", min: 28, max: 32 },
];

export function SubnetSizePicker({ parentCidr, selectedPrefix, onSelectPrefix }: SubnetSizePickerProps) {
  const parsed = getSubnetInfo(parentCidr);
  if (!parsed) return null;
  const validPrefixes = getValidChildPrefixes(parsed.prefix);

  return (
    <div className="space-y-4">
      {SIZE_TIERS.map((tier) => {
        const tieredPrefixes = validPrefixes.filter(
          (p) => p >= tier.min && p <= tier.max,
        );
        if (tieredPrefixes.length === 0) return null;

        return (
          <div key={tier.label} className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{tier.label}</span>
            <div className="space-y-1">
              {tieredPrefixes.map((prefix) => {
                const isSelected = selectedPrefix === prefix;
                const count = Math.pow(2, prefix - parsed.prefix);
                const hosts = subnetSizeLabel(prefix);
                return (
                  <button
                    key={prefix}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-all duration-100",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/30 border-border text-foreground hover:border-primary/50 hover:bg-primary/8",
                    )}
                    onClick={() => onSelectPrefix(isSelected ? null : prefix)}
                    aria-pressed={isSelected}
                  >
                    <span className="text-sm font-mono font-bold w-10 shrink-0">/{prefix}</span>
                    <span className={cn("text-xs flex-1", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {hosts} hosts
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium shrink-0",
                        isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {count > 999 ? "999+" : count}x fit
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selectedPrefix !== null && (
        <button
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors border border-transparent hover:border-border rounded-md"
          onClick={() => onSelectPrefix(null)}
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
