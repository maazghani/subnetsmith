"use client";

import { getSubnetInfo, splitCidr, formatHostCount } from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Network, Plus, Pencil, Trash2, ChevronDown } from "lucide-react";

interface SubnetBlockProps {
  cidr: string;
  depth: number;
  allSubnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  selectedChildPrefix: number | null;
  hoveredSlot: string | null;
  onHoverSlot: (cidr: string | null) => void;
  onPlaceSubnet: (slotCidr: string) => void;
  onEditSubnet: (subnet: SubnetEntry) => void;
  onDeleteSubnet: (subnetId: string) => void;
  onBlockClick: (cidr: string) => void;
  activeCidr: string | null;
}

export function SubnetBlock({
  cidr,
  depth,
  allSubnets,
  colorLabels,
  selectedChildPrefix,
  hoveredSlot,
  onHoverSlot,
  onPlaceSubnet,
  onEditSubnet,
  onDeleteSubnet,
  onBlockClick,
  activeCidr,
}: SubnetBlockProps) {
  const info = getSubnetInfo(cidr);
  if (!info) return null;

  const allocatedSubnet = allSubnets.find((s) => s.cidr === cidr);
  const colorLabel = allocatedSubnet
    ? colorLabels.find((l) => l.id === allocatedSubnet.colorLabelId)
    : null;

  const directChildren = allSubnets.filter((s) => {
    const childInfo = getSubnetInfo(s.cidr);
    if (!childInfo) return false;
    if (childInfo.prefix <= info.prefix) return false;
    if (childInfo.networkInt < info.networkInt || childInfo.broadcastInt > info.broadcastInt) return false;
    const hasIntermediateParent = allSubnets.some((other) => {
      if (other.cidr === s.cidr) return false;
      const otherInfo = getSubnetInfo(other.cidr);
      if (!otherInfo) return false;
      return (
        otherInfo.prefix > info.prefix &&
        otherInfo.prefix < childInfo.prefix &&
        childInfo.networkInt >= otherInfo.networkInt &&
        childInfo.broadcastInt <= otherInfo.broadcastInt
      );
    });
    return !hasIntermediateParent;
  });

  const isActive = activeCidr === cidr;
  const showSlots = isActive && selectedChildPrefix !== null;
  const slots = showSlots ? splitCidr(cidr, selectedChildPrefix) : [];

  if (allocatedSubnet) {
    const color = colorLabel?.color ?? "#64748b";
    const bgHex = color + "18";
    const borderHex = color + "55";

    return (
      <div
        className="group relative rounded-lg border transition-all duration-150 cursor-pointer hover:brightness-110"
        style={{ backgroundColor: bgHex, borderColor: borderHex }}
        onClick={() => onBlockClick(cidr)}
      >
        {/* Color accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
          style={{ backgroundColor: color }}
        />

        <div className="flex items-center gap-3 pl-4 pr-3 py-3">
          {/* Name + CIDR */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground leading-tight truncate">
              {allocatedSubnet.name}
            </span>
            <span className="text-xs font-mono mt-0.5 truncate" style={{ color }}>
              {cidr}
            </span>
          </div>

          {/* Host count */}
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatHostCount(info.usableHosts)}
            </span>
            <span className="text-xs text-muted-foreground">hosts</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              className="p-1.5 rounded hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); onEditSubnet(allocatedSubnet); }}
              aria-label="Edit subnet"
            >
              <Pencil size={13} className="text-muted-foreground" />
            </button>
            <button
              className="p-1.5 rounded hover:bg-red-500/20"
              onClick={(e) => { e.stopPropagation(); onDeleteSubnet(allocatedSubnet.id); }}
              aria-label="Delete subnet"
            >
              <Trash2 size={13} className="text-rose-400" />
            </button>
          </div>
        </div>

        {/* Label badge */}
        {colorLabel && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: color + "30", color }}
            >
              {colorLabel.label}
            </span>
          </div>
        )}

        {/* Nested children */}
        {directChildren.length > 0 && (
          <div className="px-3 pb-3 space-y-1.5 pl-4">
            {directChildren.map((child) => (
              <SubnetBlock
                key={child.cidr}
                cidr={child.cidr}
                depth={depth + 1}
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
        )}

        {/* Carve-deeper button */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-opacity z-10 shadow-lg"
                onClick={(e) => { e.stopPropagation(); onBlockClick(cidr); }}
                aria-label="Carve sub-subnets"
              >
                <ChevronDown size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Carve sub-subnets from {cidr}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // ── Unallocated + active with selected size: show slot grid ──
  if (showSlots) {
    return (
      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Network size={11} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground">{cidr}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {slots.length} × /{selectedChildPrefix} available
          </span>
        </div>
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${Math.min(slots.length <= 4 ? slots.length : slots.length <= 16 ? 4 : 8, 8)}, minmax(0, 1fr))`,
          }}
        >
          {slots.map((slot) => {
            const isOccupied = allSubnets.some((s) => s.cidr === slot);
            const isHovered = hoveredSlot === slot;
            const slotInfo = getSubnetInfo(slot);

            if (isOccupied) {
              return (
                <SubnetBlock
                  key={slot}
                  cidr={slot}
                  depth={depth + 1}
                  allSubnets={allSubnets}
                  colorLabels={colorLabels}
                  selectedChildPrefix={null}
                  hoveredSlot={hoveredSlot}
                  onHoverSlot={onHoverSlot}
                  onPlaceSubnet={onPlaceSubnet}
                  onEditSubnet={onEditSubnet}
                  onDeleteSubnet={onDeleteSubnet}
                  onBlockClick={onBlockClick}
                  activeCidr={activeCidr}
                />
              );
            }

            return (
              <TooltipProvider key={slot} delayDuration={80}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "rounded-md border text-xs font-mono transition-all duration-100 min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1",
                        isHovered
                          ? "bg-primary/25 border-primary text-primary shadow-md shadow-primary/20"
                          : "bg-secondary/30 border-border text-muted-foreground hover:bg-primary/15 hover:border-primary/60 hover:text-foreground",
                      )}
                      onMouseEnter={() => onHoverSlot(slot)}
                      onMouseLeave={() => onHoverSlot(null)}
                      onClick={() => onPlaceSubnet(slot)}
                      aria-label={`Create subnet at ${slot}`}
                    >
                      {slots.length <= 8 ? (
                        <>
                          <span className="text-xs font-mono leading-tight truncate w-full text-center">{slot}</span>
                          <span className="text-xs text-muted-foreground/70">{formatHostCount(slotInfo?.usableHosts ?? 0)}</span>
                        </>
                      ) : slots.length <= 32 ? (
                        <span className="text-xs font-mono truncate px-0.5">{slot.split(".").slice(-2).join(".")}</span>
                      ) : (
                        <Plus size={12} />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs space-y-0.5 font-mono">
                    <div className="font-semibold text-foreground">{slot}</div>
                    <div className="text-muted-foreground">
                      {slotInfo?.networkAddress} — {slotInfo?.broadcastAddress}
                    </div>
                    <div className="text-muted-foreground">
                      {formatHostCount(slotInfo?.usableHosts ?? 0)} usable hosts
                    </div>
                    <div className="text-primary font-sans font-medium mt-1">Click to create subnet</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Default: unallocated, no slots shown ──
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "w-full rounded-lg border px-4 py-3 text-left transition-all duration-150 group",
              isActive
                ? "border-primary/60 bg-primary/10 shadow-sm shadow-primary/10"
                : "border-border bg-secondary/20 hover:border-border/80 hover:bg-secondary/40",
            )}
            onClick={() => onBlockClick(cidr)}
          >
            <div className="flex items-center gap-3">
              <Network size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
              <div className="flex flex-col min-w-0">
                <span className={cn("text-sm font-mono font-medium", isActive ? "text-primary" : "text-foreground")}>
                  {cidr}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatHostCount(info.usableHosts)} usable hosts
                </span>
              </div>
              {directChildren.length > 0 && (
                <span className="ml-auto text-xs text-primary font-medium">{directChildren.length} subnets</span>
              )}
              {isActive && (
                <span className="ml-auto text-xs text-primary font-medium">Selected</span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        {!isActive && (
          <TooltipContent side="right" className="text-xs">
            Click to select, then choose a size in the sidebar
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
