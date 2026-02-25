"use client";

import { getSubnetInfo, splitCidr, formatHostCount, subnetSizeLabel } from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SubnetBlock } from "./SubnetBlock";
import { Network, AlertCircle } from "lucide-react";

interface SubnetMapProps {
  rootCidr: string;
  allSubnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  selectedChildPrefix: number | null;
  hoveredSlot: string | null;
  activeCidr: string | null;
  onHoverSlot: (cidr: string | null) => void;
  onPlaceSubnet: (slotCidr: string) => void;
  onEditSubnet: (subnet: SubnetEntry) => void;
  onDeleteSubnet: (subnetId: string) => void;
  onBlockClick: (cidr: string) => void;
}

export function SubnetMap({
  rootCidr,
  allSubnets,
  colorLabels,
  selectedChildPrefix,
  hoveredSlot,
  activeCidr,
  onHoverSlot,
  onPlaceSubnet,
  onEditSubnet,
  onDeleteSubnet,
  onBlockClick,
}: SubnetMapProps) {
  const rootInfo = getSubnetInfo(rootCidr);

  if (!rootInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle size={24} />
        <span className="text-sm">Enter a valid CIDR range to begin</span>
      </div>
    );
  }

  // Stats
  const allocatedCount = allSubnets.length;
  const totalSpace = rootInfo.totalHosts;
  const allocatedSpace = allSubnets.reduce((sum, s) => {
    const si = getSubnetInfo(s.cidr);
    return sum + (si?.totalHosts ?? 0);
  }, 0);
  const utilizationPct = totalSpace > 0 ? Math.round((allocatedSpace / totalSpace) * 100) : 0;

  // Top-level unallocated blocks: if we have a selectedChildPrefix and activeCidr === rootCidr,
  // show all root-level split slots
  const showRootSlots = activeCidr === rootCidr && selectedChildPrefix !== null;
  const rootSlots = showRootSlots ? splitCidr(rootCidr, selectedChildPrefix) : [];

  // Top-level subnets (no parent among existing subnets)
  const topLevelSubnets = allSubnets.filter((s) => {
    const si = getSubnetInfo(s.cidr);
    if (!si) return false;
    if (si.networkInt < rootInfo.networkInt || si.broadcastInt > rootInfo.broadcastInt) return false;
    const hasParent = allSubnets.some((other) => {
      if (other.cidr === s.cidr) return false;
      const oi = getSubnetInfo(other.cidr);
      if (!oi) return false;
      return (
        oi.prefix < si.prefix &&
        si.networkInt >= oi.networkInt &&
        si.broadcastInt <= oi.broadcastInt
      );
    });
    return !hasParent;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card/50 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-primary" />
          <span className="text-xs font-mono text-foreground font-semibold">{rootCidr}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{formatHostCount(rootInfo.usableHosts)}</span>
          <span>usable hosts</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>/{rootInfo.prefix}</span>
          <span className="text-border">|</span>
          <span>{rootInfo.networkAddress} — {rootInfo.broadcastAddress}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{allocatedCount} subnet{allocatedCount !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{utilizationPct}%</span>
          </div>
        </div>
      </div>

      {/* Hover preview bar */}
      {hoveredSlot && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-primary/10 border-b border-primary/30 shrink-0">
          <span className="text-xs font-mono text-primary font-semibold">{hoveredSlot}</span>
          {(() => {
            const si = getSubnetInfo(hoveredSlot);
            if (!si) return null;
            return (
              <>
                <span className="text-xs text-muted-foreground">{si.networkAddress} — {si.broadcastAddress}</span>
                <span className="text-xs text-muted-foreground">{formatHostCount(si.usableHosts)} usable hosts</span>
              </>
            );
          })()}
        </div>
      )}

      {/* Main map area */}
      <div className="flex-1 overflow-auto p-4">
        {allSubnets.length === 0 && !showRootSlots ? (
          <EmptyState rootCidr={rootCidr} onBlockClick={onBlockClick} />
        ) : showRootSlots ? (
          /* Root-level slot grid */
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">
                Showing {rootSlots.length} × /{selectedChildPrefix} slots ({subnetSizeLabel(selectedChildPrefix!)} hosts each)
              </span>
              <span className="text-xs text-muted-foreground">— click a slot to allocate</span>
            </div>
            <div
              className={cn(
                "grid gap-1",
                rootSlots.length <= 4 ? "grid-cols-1" :
                rootSlots.length <= 8 ? "grid-cols-2" :
                rootSlots.length <= 16 ? "grid-cols-4" :
                rootSlots.length <= 64 ? "grid-cols-8" :
                "grid-cols-16",
              )}
            >
              {rootSlots.map((slot) => (
                <SubnetBlock
                  key={slot}
                  cidr={slot}
                  depth={0}
                  allSubnets={allSubnets}
                  colorLabels={colorLabels}
                  selectedChildPrefix={selectedChildPrefix}
                  hoveredSlot={hoveredSlot}
                  onHoverSlot={onHoverSlot}
                  onPlaceSubnet={onPlaceSubnet}
                  onEditSubnet={onEditSubnet}
                  onDeleteSubnet={onDeleteSubnet}
                  onBlockClick={onBlockClick}
                  activeCidr={activeCidr}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Existing subnets list */
          <div className="space-y-2">
            {topLevelSubnets.map((subnet) => (
              <SubnetBlock
                key={subnet.cidr}
                cidr={subnet.cidr}
                depth={0}
                allSubnets={allSubnets}
                colorLabels={colorLabels}
                selectedChildPrefix={selectedChildPrefix}
                hoveredSlot={hoveredSlot}
                onHoverSlot={onHoverSlot}
                onPlaceSubnet={onPlaceSubnet}
                onEditSubnet={onEditSubnet}
                onDeleteSubnet={onDeleteSubnet}
                onBlockClick={onBlockClick}
                activeCidr={activeCidr}
              />
            ))}
            {/* Add more button */}
            <button
              className="w-full rounded border border-dashed border-white/15 py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center justify-center gap-2"
              onClick={() => onBlockClick(rootCidr)}
            >
              <Network size={12} />
              Click to carve more subnets from {rootCidr}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ rootCidr, onBlockClick }: { rootCidr: string; onBlockClick: (c: string) => void }) {
  const rootInfo = getSubnetInfo(rootCidr);
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Network size={28} className="text-primary" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">No subnets carved yet</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          Select a subnet size from the panel on the left, then click a slot to allocate it within{" "}
          <span className="font-mono text-foreground">{rootCidr}</span>{" "}
          {rootInfo && <>({formatHostCount(rootInfo.usableHosts)} usable hosts)</>}
        </p>
      </div>
      <button
        className="text-xs text-primary hover:underline"
        onClick={() => onBlockClick(rootCidr)}
      >
        Select {rootCidr} to start carving
      </button>
    </div>
  );
}
