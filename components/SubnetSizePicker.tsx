"use client";

import { getValidChildPrefixes, subnetSizeLabel, getSubnetInfo } from "@/lib/subnet";
import { cn } from "@/lib/utils";

interface SubnetSizePickerProps {
  parentCidr: string;
  selectedPrefix: number | null;
  onSelectPrefix: (prefix: number | null) => void;
}

const SIZE_TIERS: { label: string; min: number; max: number; description: string }[] = [
  { label: "Huge", min: 8, max: 15, description: "Millions of IPs" },
  { label: "Large", min: 16, max: 19, description: "64K – 512K IPs" },
  { label: "Medium", min: 20, max: 23, description: "256 – 16K IPs" },
  { label: "Small", min: 24, max: 27, description: "32 – 256 IPs" },
  { label: "Tiny", min: 28, max: 32, description: "1 – 16 IPs" },
];

export function SubnetSizePicker({ parentCidr, selectedPrefix, onSelectPrefix }: SubnetSizePickerProps) {
  const parsed = getSubnetInfo(parentCidr);
  if (!parsed) return null;
  const validPrefixes = getValidChildPrefixes(parsed.prefix);

  const handleSelect = (prefix: number) => {
    onSelectPrefix(selectedPrefix === prefix ? null : prefix);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground">Subnet Size</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pick a size, then click a slot in the map to allocate
        </p>
      </div>

      {SIZE_TIERS.map((tier) => {
        const tieredPrefixes = validPrefixes.filter(
          (p) => p >= tier.min && p <= tier.max,
        );
        if (tieredPrefixes.length === 0) return null;

        return (
          <div key={tier.label} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">{tier.label}</span>
              <span className="text-xs text-muted-foreground/60">{tier.description}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {tieredPrefixes.map((prefix) => {
                const isSelected = selectedPrefix === prefix;
                const count = Math.pow(2, prefix - parsed.prefix);
                return (
                  <button
                    key={prefix}
                    className={cn(
                      "relative group flex flex-col items-center justify-center rounded border px-2 py-1.5 transition-all duration-150 min-w-[52px]",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                        : "bg-secondary/50 border-border text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-foreground",
                    )}
                    onClick={() => handleSelect(prefix)}
                    aria-pressed={isSelected}
                    title={`/${prefix} — ${subnetSizeLabel(prefix)} IPs, ${count} fit in ${parentCidr}`}
                  >
                    <span className="text-xs font-mono font-bold">/{prefix}</span>
                    <span className={cn("text-xs leading-none mt-0.5", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {subnetSizeLabel(prefix)}
                    </span>
                    {/* Count badge */}
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-1.5 text-xs rounded-full w-4 h-4 flex items-center justify-center font-mono font-bold leading-none",
                        isSelected
                          ? "bg-primary-foreground text-primary"
                          : "bg-border text-muted-foreground",
                        count > 99 ? "text-xs w-5" : "",
                      )}
                    >
                      {count > 999 ? "∞" : count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selectedPrefix && (
        <button
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
          onClick={() => onSelectPrefix(null)}
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
