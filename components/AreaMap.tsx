"use client";

import { useRef, useState, useCallback } from "react";
import { getSubnetInfo, splitCidr, formatHostCount, intToIp, ipToInt } from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Segment {
  cidr: string;
  start: number;   // offset in /16 address space (0..65535)
  size: number;    // number of IPs
  subnet: SubnetEntry | null;
}

interface AreaMapProps {
  rootCidr: string;
  subnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  onAddSubnet: (cidr: string) => void;
  onEditSubnet: (subnet: SubnetEntry) => void;
  onDeleteSubnet: (id: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildSegments(rootCidr: string, subnets: SubnetEntry[]): Segment[] {
  const rootInfo = getSubnetInfo(rootCidr);
  if (!rootInfo) return [];

  const totalIps = rootInfo.totalHosts;
  const baseInt = rootInfo.networkInt;

  // Sort subnets by start address
  const sorted = [...subnets]
    .map((s) => ({ s, info: getSubnetInfo(s.cidr) }))
    .filter((x) => x.info !== null && x.info.networkInt >= baseInt && x.info.broadcastInt <= rootInfo.broadcastInt)
    .sort((a, b) => a.info!.networkInt - b.info!.networkInt);

  const segments: Segment[] = [];
  let cursor = baseInt;

  for (const { s, info } of sorted) {
    if (!info) continue;
    // Free gap before this subnet
    if (info.networkInt > cursor) {
      segments.push({
        cidr: `${intToIp(cursor)}-${intToIp(info.networkInt - 1)}`,
        start: cursor - baseInt,
        size: info.networkInt - cursor,
        subnet: null,
      });
    }
    segments.push({
      cidr: s.cidr,
      start: info.networkInt - baseInt,
      size: info.totalHosts,
      subnet: s,
    });
    cursor = info.broadcastInt + 1;
  }

  // Trailing free space
  const endInt = rootInfo.broadcastInt + 1;
  if (cursor < endInt) {
    segments.push({
      cidr: `${intToIp(cursor)}-${intToIp(endInt - 1)}`,
      start: cursor - baseInt,
      size: endInt - cursor,
      subnet: null,
    });
  }

  return segments;
}

// Suggested split sizes for a free gap
function suggestSizes(gapSize: number): number[] {
  const sizes: number[] = [];
  for (let p = 16; p <= 30; p++) {
    const s = Math.pow(2, 32 - p);
    if (s <= gapSize) sizes.push(p);
    if (sizes.length >= 6) break;
  }
  return sizes;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AreaMap({
  rootCidr,
  subnets,
  colorLabels,
  onAddSubnet,
  onEditSubnet,
  onDeleteSubnet,
}: AreaMapProps) {
  const rootInfo = getSubnetInfo(rootCidr);
  const [activeGap, setActiveGap] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  if (!rootInfo) return null;

  const segments = buildSegments(rootCidr, subnets);
  const totalIps = rootInfo.totalHosts;

  function getLabel(subnet: SubnetEntry | null) {
    if (!subnet?.colorLabelId) return null;
    return colorLabels.find((l) => l.id === subnet.colorLabelId) ?? null;
  }

  // Compute first aligned CIDR of a given prefix that fits inside the gap
  function firstAlignedCidr(gapStart: number, gapSize: number, prefix: number): string | null {
    const blockSize = Math.pow(2, 32 - prefix);
    const base = rootInfo!.networkInt;
    const absStart = base + gapStart;
    // Round up to next alignment
    const aligned = Math.ceil(absStart / blockSize) * blockSize;
    if (aligned + blockSize - 1 > base + gapStart + gapSize - 1) return null;
    return `${intToIp(aligned >>> 0)}/${prefix}`;
  }

  return (
    <div className="flex-1 overflow-auto p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-semibold text-foreground">{rootCidr}</span>
          <span className="text-xs text-muted-foreground">
            {formatHostCount(rootInfo.usableHosts)} usable hosts
            <span className="mx-1.5 text-border">·</span>
            {rootInfo.networkAddress} — {rootInfo.broadcastAddress}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Utilisation */}
          {subnets.length > 0 && (() => {
            const used = subnets.reduce((acc, s) => {
              const si = getSubnetInfo(s.cidr);
              return acc + (si?.totalHosts ?? 0);
            }, 0);
            const pct = Math.round((used / totalIps) * 100);
            return (
              <div className="flex items-center gap-2">
                <div className="w-28 h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{pct}% allocated</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Area map — horizontal bar */}
      <div className="relative mb-6">
        {/* Scale bar */}
        <div className="flex h-12 rounded-lg overflow-hidden border border-border gap-px bg-border">
          {segments.map((seg, i) => {
            const widthPct = (seg.size / totalIps) * 100;
            const label = getLabel(seg.subnet);
            const isAllocated = !!seg.subnet;
            const isHovered = hovered === seg.cidr;

            return (
              <div
                key={i}
                className={cn(
                  "relative flex items-center justify-center overflow-hidden transition-all duration-100 cursor-pointer shrink-0",
                  isAllocated
                    ? "hover:brightness-110"
                    : "group hover:bg-primary/15",
                )}
                style={{
                  flexBasis: `${Math.max(widthPct, 0.2)}%`,
                  backgroundColor: isAllocated
                    ? (label?.color ?? "#64748b") + "33"
                    : isHovered
                    ? "oklch(0.65 0.18 200 / 0.12)"
                    : "oklch(0.13 0.007 240)",
                  borderLeft: isAllocated
                    ? `3px solid ${label?.color ?? "#64748b"}`
                    : undefined,
                  outline: isHovered ? "1px solid oklch(0.65 0.18 200 / 0.5)" : undefined,
                }}
                onMouseEnter={() => setHovered(seg.cidr)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  if (!isAllocated) setActiveGap(activeGap === seg.cidr ? null : seg.cidr);
                }}
              >
                {isAllocated && seg.subnet ? (
                  <span
                    className="text-xs font-semibold truncate px-1"
                    style={{ color: label?.color ?? "#e2e8f0", fontSize: widthPct > 8 ? "0.75rem" : "0.6rem" }}
                  >
                    {widthPct > 5 ? seg.subnet.name : ""}
                  </span>
                ) : (
                  widthPct > 3 && (
                    <Plus
                      size={12}
                      className="text-muted-foreground/40 group-hover:text-primary transition-colors"
                    />
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Range labels below bar */}
        <div className="flex justify-between mt-1">
          <span className="text-xs font-mono text-muted-foreground/50">{rootInfo.networkAddress}</span>
          <span className="text-xs font-mono text-muted-foreground/50">{rootInfo.broadcastAddress}</span>
        </div>
      </div>

      {/* Segment cards */}
      <div className="space-y-2">
        {segments.map((seg, i) => {
          const label = getLabel(seg.subnet);
          const widthPct = (seg.size / totalIps) * 100;
          const isGapActive = activeGap === seg.cidr;

          if (seg.subnet) {
            // ── Allocated subnet card ─────────────────────────────────────────
            const info = getSubnetInfo(seg.subnet.cidr);
            return (
              <div
                key={i}
                className="group flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-100"
                style={{
                  borderColor: (label?.color ?? "#64748b") + "55",
                  backgroundColor: (label?.color ?? "#64748b") + "10",
                }}
              >
                {/* Color bar */}
                <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: label?.color ?? "#64748b" }} />

                {/* Main info */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{seg.subnet.name}</span>
                    {label && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                        style={{ backgroundColor: label.color + "28", color: label.color }}
                      >
                        {label.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-mono text-muted-foreground">{seg.subnet.cidr}</span>
                    {info && (
                      <span className="text-xs text-muted-foreground">
                        {info.networkAddress} — {info.broadcastAddress}
                      </span>
                    )}
                  </div>
                </div>

                {/* Size indicator */}
                <div className="flex flex-col items-end shrink-0 mr-2">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatHostCount(seg.subnet ? (getSubnetInfo(seg.subnet.cidr)?.usableHosts ?? 0) : seg.size - 2)}
                  </span>
                  <span className="text-xs text-muted-foreground">hosts</span>
                </div>

                {/* Proportional width hint */}
                <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(widthPct * 2, 100)}%`, backgroundColor: label?.color ?? "oklch(0.65 0.18 200)" }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    className="p-1.5 rounded hover:bg-white/10"
                    onClick={() => onEditSubnet(seg.subnet!)}
                    aria-label="Edit"
                  >
                    <Pencil size={13} className="text-muted-foreground" />
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-red-500/15"
                    onClick={() => onDeleteSubnet(seg.subnet!.id)}
                    aria-label="Delete"
                  >
                    <Trash2 size={13} className="text-rose-400" />
                  </button>
                </div>
              </div>
            );
          }

          // ── Free gap card ─────────────────────────────────────────────────────
          const gapStart = seg.start;
          const gapSize = seg.size;
          const suggested = suggestSizes(gapSize);
          const gapStartIp = intToIp((rootInfo.networkInt + gapStart) >>> 0);
          const gapEndIp = intToIp((rootInfo.networkInt + gapStart + gapSize - 1) >>> 0);

          return (
            <div key={i} className="space-y-1.5">
              <button
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 text-left transition-all duration-100 group",
                  isGapActive
                    ? "border-primary/60 bg-primary/8"
                    : "border-border/50 hover:border-primary/40 hover:bg-primary/5",
                )}
                onClick={() => setActiveGap(isGapActive ? null : seg.cidr)}
              >
                <div className="w-1 self-stretch rounded-full bg-border shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground font-mono">
                    {gapStartIp} — {gapEndIp}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatHostCount(gapSize)} IPs free
                </span>
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium transition-colors shrink-0",
                    isGapActive ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                  )}
                >
                  {isGapActive ? <X size={11} /> : <Plus size={11} />}
                  {isGapActive ? "Close" : "Add subnet here"}
                </div>
              </button>

              {/* Inline size picker for this gap */}
              {isGapActive && (
                <div className="ml-4 rounded-lg border border-primary/25 bg-card/80 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Choose a size to place in this free space. The first aligned block will be used.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {suggested.map((prefix) => {
                      const cidr = firstAlignedCidr(gapStart, gapSize, prefix);
                      if (!cidr) return null;
                      const info = getSubnetInfo(cidr);
                      const hostCount = Math.pow(2, 32 - prefix);
                      return (
                        <button
                          key={prefix}
                          className="flex flex-col items-start rounded-md border border-border bg-secondary/30 px-3 py-2 hover:border-primary/60 hover:bg-primary/10 transition-all duration-100 text-left group"
                          onClick={() => {
                            setActiveGap(null);
                            onAddSubnet(cidr);
                          }}
                        >
                          <span className="text-sm font-mono font-bold text-foreground group-hover:text-primary">
                            /{prefix}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatHostCount(hostCount - 2)} hosts
                          </span>
                          {info && (
                            <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 truncate w-full">
                              {info.networkAddress}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {subnets.length === 0 && (
          <div className="mt-4 text-center py-8 text-muted-foreground text-sm">
            Click <span className="text-primary font-medium">"Add subnet here"</span> above to place your first subnet
          </div>
        )}
      </div>
    </div>
  );
}
