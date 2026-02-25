"use client";

import { getSubnetInfo, formatHostCount } from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { intToIp, ipToInt } from "@/lib/subnet";

// CG-NAT space: 100.64.0.0/10 → 64 × /16 blocks
const CGNAT_BASE = "100.64.0.0";
const CGNAT_PREFIX = 10;
const BLOCK_PREFIX = 16;
const BLOCK_COUNT = Math.pow(2, BLOCK_PREFIX - CGNAT_PREFIX); // 64

function getCgnatBlocks(): string[] {
  const base = ipToInt(CGNAT_BASE);
  const blockSize = Math.pow(2, 32 - BLOCK_PREFIX);
  return Array.from({ length: BLOCK_COUNT }, (_, i) =>
    `${intToIp((base + i * blockSize) >>> 0)}/${BLOCK_PREFIX}`
  );
}

interface CgnatBlockSelectorProps {
  selectedBlock: string | null;
  subnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  onSelectBlock: (cidr: string) => void;
}

export function CgnatBlockSelector({
  selectedBlock,
  subnets,
  colorLabels,
  onSelectBlock,
}: CgnatBlockSelectorProps) {
  const blocks = getCgnatBlocks();

  function getBlockUsage(blockCidr: string) {
    const info = getSubnetInfo(blockCidr);
    if (!info) return { count: 0, pct: 0, topLabel: null as ColorLabel | null };
    const blockSubnets = subnets.filter((s) => {
      const si = getSubnetInfo(s.cidr);
      if (!si) return false;
      return si.networkInt >= info.networkInt && si.broadcastInt <= info.broadcastInt;
    });
    const usedHosts = blockSubnets.reduce((acc, s) => {
      const si = getSubnetInfo(s.cidr);
      return acc + (si?.totalHosts ?? 0);
    }, 0);
    const pct = Math.round((usedHosts / info.totalHosts) * 100);
    // Find dominant label
    const labelCounts: Record<string, number> = {};
    blockSubnets.forEach((s) => {
      if (s.colorLabelId) labelCounts[s.colorLabelId] = (labelCounts[s.colorLabelId] ?? 0) + 1;
    });
    const topLabelId = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topLabel = topLabelId ? colorLabels.find((l) => l.id === topLabelId) ?? null : null;
    return { count: blockSubnets.length, pct, topLabel };
  }

  return (
    <div className="bg-card border-b border-border px-5 py-4">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">CG-NAT Space</span>
        <span className="text-xs font-mono text-muted-foreground">100.64.0.0/10</span>
        <span className="text-xs text-muted-foreground">— 64 × /16 blocks · select one to plan</span>
      </div>

      {/* 8×8 grid of /16 blocks */}
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}>
        {blocks.map((block, i) => {
          const { count, pct, topLabel } = getBlockUsage(block);
          const isSelected = selectedBlock === block;
          const hasSubnets = count > 0;
          const row = Math.floor(i / 8);
          const col = i % 8;

          return (
            <button
              key={block}
              onClick={() => onSelectBlock(block)}
              title={`${block} — ${getSubnetInfo(block)?.networkAddress} to ${getSubnetInfo(block)?.broadcastAddress}`}
              className={cn(
                "relative h-9 rounded transition-all duration-100 border text-xs font-mono group",
                isSelected
                  ? "border-primary shadow-md shadow-primary/30 z-10 scale-105"
                  : "border-border hover:border-primary/50 hover:scale-105",
              )}
              style={{
                backgroundColor: isSelected
                  ? "oklch(0.65 0.18 200 / 0.25)"
                  : hasSubnets && topLabel
                  ? topLabel.color + "22"
                  : "oklch(0.15 0.006 240)",
                borderColor: isSelected
                  ? "oklch(0.65 0.18 200)"
                  : hasSubnets && topLabel
                  ? topLabel.color + "66"
                  : undefined,
              }}
            >
              {/* Usage fill bar at bottom */}
              {pct > 0 && (
                <div
                  className="absolute bottom-0 left-0 h-0.5 rounded-b transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: topLabel?.color ?? "oklch(0.65 0.18 200)",
                  }}
                />
              )}

              {/* Block number */}
              <span
                className={cn(
                  "text-xs",
                  isSelected ? "text-primary font-bold" : hasSubnets ? "text-foreground/80" : "text-muted-foreground/60",
                )}
              >
                .{(64 + i) /* 100.64–100.127 */}
              </span>

              {/* Subnet count badge */}
              {count > 0 && !isSelected && (
                <span
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{
                    backgroundColor: topLabel?.color ?? "oklch(0.65 0.18 200)",
                    color: "oklch(0.10 0.005 240)",
                  }}
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend row */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-border bg-secondary/30" />
          <span className="text-xs text-muted-foreground">Empty</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border" style={{ borderColor: "oklch(0.65 0.18 200 / 0.6)", backgroundColor: "oklch(0.65 0.18 200 / 0.15)" }} />
          <span className="text-xs text-muted-foreground">Has subnets</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2" style={{ borderColor: "oklch(0.65 0.18 200)" }} />
          <span className="text-xs text-muted-foreground">Selected</span>
        </div>
        {selectedBlock && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono text-primary font-semibold">{selectedBlock}</span>
            <span className="text-xs text-muted-foreground">
              — {formatHostCount(getSubnetInfo(selectedBlock)?.usableHosts ?? 0)} usable hosts
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
