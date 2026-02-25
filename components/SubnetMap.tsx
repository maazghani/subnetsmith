"use client";

import { getSubnetInfo, splitCidr, formatHostCount, subnetSizeLabel } from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SubnetBlock } from "./SubnetBlock";
import { Network, MousePointerClick, Ruler, AlertCircle } from "lucide-react";

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

  const allocatedCount = allSubnets.length;
  const totalSpace = rootInfo.totalHosts;
  const allocatedSpace = allSubnets.reduce((sum, s) => {
    const si = getSubnetInfo(s.cidr);
    return sum + (si?.totalHosts ?? 0);
  }, 0);
  const utilizationPct = totalSpace > 0 ? Math.round((allocatedSpace / totalSpace) * 100) : 0;

  const showRootSlots = activeCidr === rootCidr && selectedChildPrefix !== null;
  const rootSlots = showRootSlots ? splitCidr(rootCidr, selectedChildPrefix) : [];

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
      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-card/60 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-primary shrink-0" />
          <span className="text-sm font-mono font-semibold text-foreground">{rootCidr}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <span className="text-xs text-muted-foreground">
          {formatHostCount(rootInfo.usableHosts)} usable hosts
        </span>
        <div className="h-3 w-px bg-border hidden sm:block" />
        <span className="text-xs font-mono text-muted-foreground hidden sm:block">
          {rootInfo.networkAddress} – {rootInfo.broadcastAddress}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {allocatedCount} subnet{allocatedCount !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{utilizationPct}%</span>
          </div>
        </div>
      </div>

      {/* Hover preview bar */}
      {hoveredSlot && (() => {
        const si = getSubnetInfo(hoveredSlot);
        return (
          <div className="flex items-center gap-3 px-5 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
            <span className="text-xs font-mono font-semibold text-primary">{hoveredSlot}</span>
            {si && (
              <>
                <span className="text-xs text-muted-foreground hidden sm:block">{si.networkAddress} – {si.broadcastAddress}</span>
                <span className="text-xs text-muted-foreground">{formatHostCount(si.usableHosts)} usable hosts</span>
              </>
            )}
            <span className="ml-auto text-xs text-primary font-medium">Click to create subnet</span>
          </div>
        );
      })()}

      {/* Instruction banner — shown when a size is selected */}
      {selectedChildPrefix && !hoveredSlot && (
        <div className="flex items-center gap-2 px-5 py-2 bg-primary/5 border-b border-primary/15 shrink-0">
          <MousePointerClick size={13} className="text-primary shrink-0" />
          <span className="text-xs text-primary">
            Click any slot below to create a{" "}
            <span className="font-mono font-semibold">/{selectedChildPrefix}</span>{" "}
            subnet ({subnetSizeLabel(selectedChildPrefix)} hosts)
          </span>
        </div>
      )}

      {/* Main map */}
      <div className="flex-1 overflow-auto p-5">
        {allSubnets.length === 0 && !showRootSlots ? (
          <EmptyState
            rootCidr={rootCidr}
            activeCidr={activeCidr}
            selectedChildPrefix={selectedChildPrefix}
            onBlockClick={onBlockClick}
          />
        ) : showRootSlots ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {rootSlots.length} × <span className="font-mono text-foreground">/{selectedChildPrefix}</span> slots in{" "}
              <span className="font-mono text-foreground">{rootCidr}</span>
            </p>
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${
                  rootSlots.length <= 2 ? 1 :
                  rootSlots.length <= 4 ? 2 :
                  rootSlots.length <= 8 ? 2 :
                  rootSlots.length <= 16 ? 4 : 8
                }, minmax(0, 1fr))`,
              }}
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
          <div className="space-y-2.5">
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
            {/* Add more prompt */}
            <button
              className="w-full rounded-lg border border-dashed border-border/60 py-3.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center justify-center gap-2 mt-1"
              onClick={() => onBlockClick(rootCidr)}
            >
              <Network size={13} />
              Carve more subnets from {rootCidr}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  rootCidr,
  activeCidr,
  selectedChildPrefix,
  onBlockClick,
}: {
  rootCidr: string;
  activeCidr: string | null;
  selectedChildPrefix: number | null;
  onBlockClick: (c: string) => void;
}) {
  const rootInfo = getSubnetInfo(rootCidr);

  // Guide the user through the remaining steps
  const steps = [
    {
      done: true,
      icon: Network,
      text: <>Range set: <span className="font-mono text-foreground">{rootCidr}</span></>,
    },
    {
      done: !!activeCidr,
      icon: MousePointerClick,
      text: activeCidr
        ? <>Selected: <span className="font-mono text-foreground">{activeCidr}</span></>
        : <><span className="text-foreground font-medium">Click the block below</span> to select it</>,
    },
    {
      done: !!selectedChildPrefix,
      icon: Ruler,
      text: selectedChildPrefix
        ? <>Size chosen: <span className="font-mono text-foreground">/{selectedChildPrefix}</span></>
        : <><span className="text-foreground font-medium">Pick a subnet size</span> in the left panel</>,
    },
  ];

  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      {/* Step checklist */}
      <div className="w-full max-w-sm space-y-2">
        {steps.map((s, i) => (
          <div key={i} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg", s.done ? "opacity-50" : "bg-secondary/30 border border-border")}>
            <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", s.done ? "bg-primary/20" : "bg-primary/10 border border-primary/30")}>
              <s.icon size={11} className={s.done ? "text-primary" : "text-primary"} />
            </div>
            <span className="text-xs text-muted-foreground">{s.text}</span>
          </div>
        ))}
      </div>

      {/* Clickable root block */}
      <div className="w-full max-w-sm">
        <button
          className={cn(
            "w-full rounded-xl border-2 border-dashed px-5 py-6 text-left transition-all duration-150 group",
            activeCidr
              ? "border-primary/60 bg-primary/8"
              : "border-border hover:border-primary/50 hover:bg-primary/5",
          )}
          onClick={() => onBlockClick(rootCidr)}
        >
          <div className="flex items-center gap-3 mb-2">
            <Network size={18} className={cn("shrink-0", activeCidr ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
            <span className={cn("text-base font-mono font-semibold", activeCidr ? "text-primary" : "text-foreground")}>
              {rootCidr}
            </span>
            {activeCidr && <span className="ml-auto text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">Selected</span>}
          </div>
          <p className="text-xs text-muted-foreground ml-7">
            {rootInfo ? formatHostCount(rootInfo.usableHosts) : ""} usable hosts
            {!activeCidr && " — click to select"}
          </p>
        </button>
      </div>
    </div>
  );
}
