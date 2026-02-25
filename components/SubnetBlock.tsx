"use client";

import { useState } from "react";
import { getSubnetInfo, splitCidr, formatHostCount } from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Network, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";

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

const DEPTH_COLORS = [
  "border-cyan-500/30 bg-cyan-500/5",
  "border-emerald-500/30 bg-emerald-500/5",
  "border-violet-500/30 bg-violet-500/5",
  "border-amber-500/30 bg-amber-500/5",
];

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

  // Find if this slot is an allocated subnet
  const allocatedSubnet = allSubnets.find((s) => s.cidr === cidr);
  const colorLabel = allocatedSubnet
    ? colorLabels.find((l) => l.id === allocatedSubnet.colorLabelId)
    : null;

  // Find children that are direct children of this cidr
  const directChildren = allSubnets.filter((s) => {
    const childInfo = getSubnetInfo(s.cidr);
    if (!childInfo) return false;
    if (childInfo.prefix <= info.prefix) return false;
    if (childInfo.networkInt < info.networkInt || childInfo.broadcastInt > info.broadcastInt) return false;
    // Only direct children: no other subnet sits between this and the child
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
  const depthClass = DEPTH_COLORS[depth % DEPTH_COLORS.length];

  // If we have a selectedChildPrefix and this block is active, show slots
  const showSlots = isActive && selectedChildPrefix !== null;
  let slots: string[] = [];
  if (showSlots) {
    slots = splitCidr(cidr, selectedChildPrefix);
  }

  if (allocatedSubnet) {
    // Render as an allocated named subnet
    const bgColor = colorLabel ? colorLabel.color + "22" : "#ffffff10";
    const borderColor = colorLabel ? colorLabel.color + "66" : "#ffffff30";
    const textColor = colorLabel ? colorLabel.color : "#94a3b8";

    return (
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(
            "group relative rounded border transition-all duration-150",
            "hover:brightness-110 cursor-pointer",
          )}
          style={{
            backgroundColor: bgColor,
            borderColor: borderColor,
          }}
          onClick={() => onBlockClick(cidr)}
        >
          <div className="flex items-center justify-between px-3 py-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {colorLabel && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: colorLabel.color }}
                />
              )}
              <span
                className="text-xs font-semibold truncate"
                style={{ color: textColor }}
              >
                {allocatedSubnet.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono truncate">
                {cidr}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground hidden sm:block">
                {formatHostCount(info.usableHosts)} hosts
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onEditSubnet(allocatedSubnet); }}
                aria-label="Edit subnet"
              >
                <Pencil size={12} className="text-muted-foreground" />
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDeleteSubnet(allocatedSubnet.id); }}
                aria-label="Delete subnet"
              >
                <Trash2 size={12} className="text-destructive-foreground" />
              </button>
            </div>
          </div>

          {/* Nested children */}
          {directChildren.length > 0 && (
            <div className="px-2 pb-2 space-y-1">
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

          {/* Expandable carve button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-opacity z-10"
                onClick={(e) => { e.stopPropagation(); onBlockClick(cidr); }}
                aria-label="Carve subnet"
              >
                <ChevronRight size={10} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Carve sub-subnets from {cidr}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  // Render as an unallocated slot
  if (showSlots) {
    // This block is active with a selected size — render the split slots
    return (
      <div className={cn("rounded border p-1 space-y-1", depthClass)}>
        <div className="flex items-center gap-1 px-1 py-0.5">
          <Network size={10} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono">{cidr}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {slots.length} × /{selectedChildPrefix} slots
          </span>
        </div>
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${Math.min(slots.length, 8)}, 1fr)`,
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
                  selectedChildPrefix={selectedChildPrefix}
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
              <TooltipProvider key={slot} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "rounded border text-xs font-mono transition-all duration-100 min-h-[32px] flex items-center justify-center",
                        isHovered
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-white/3 border-white/10 text-muted-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-foreground",
                      )}
                      onMouseEnter={() => onHoverSlot(slot)}
                      onMouseLeave={() => onHoverSlot(null)}
                      onClick={() => onPlaceSubnet(slot)}
                      aria-label={`Place subnet at ${slot}`}
                    >
                      {slots.length <= 16 ? (
                        <span className="px-1 truncate">{slot}</span>
                      ) : (
                        <Plus size={10} />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs space-y-0.5">
                    <div className="font-mono font-semibold">{slot}</div>
                    <div className="text-muted-foreground">
                      {slotInfo?.networkAddress} — {slotInfo?.broadcastAddress}
                    </div>
                    <div className="text-muted-foreground">
                      {formatHostCount(slotInfo?.usableHosts ?? 0)} usable hosts
                    </div>
                    <div className="text-primary text-xs mt-1">Click to allocate</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: unallocated, not active
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "w-full rounded border px-3 py-2 text-left transition-all duration-150 group",
              isActive
                ? "border-primary/60 bg-primary/10"
                : "border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5",
            )}
            onClick={() => onBlockClick(cidr)}
          >
            <div className="flex items-center gap-2">
              <Network size={12} className="text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-foreground">{cidr}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {formatHostCount(info.usableHosts)} hosts
              </span>
              {directChildren.length > 0 && (
                <span className="text-xs text-primary ml-1">{directChildren.length} subnets</span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Click to select, then pick a size to carve
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
