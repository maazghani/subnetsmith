"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  getSubnetInfo,
  formatHostCount,
  intToIp,
  ipToInt,
} from "@/lib/subnet";
import { SubnetEntry, ColorLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ArrowRight,
  X,
  Check,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Segment {
  type: "allocated" | "free";
  cidr: string;              // for allocated: the subnet cidr; for free: synthetic "start-end" key
  start: number;             // absolute IP int
  end: number;               // inclusive
  size: number;
  subnet?: SubnetEntry;
}

interface SubnetCanvasProps {
  rootCidr: string;
  allSubnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  breadcrumbs: string[];     // path from root → current; last element is current scope
  onAddSubnet: (subnet: SubnetEntry) => void;
  onUpdateSubnet: (id: string, patch: Partial<SubnetEntry>) => void;
  onDeleteSubnet: (id: string) => void;
  onDrillDown: (cidr: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Return direct children of rootCidr from allSubnets (not grandchildren) */
function directChildren(rootCidr: string, allSubnets: SubnetEntry[]): SubnetEntry[] {
  const root = getSubnetInfo(rootCidr);
  if (!root) return [];
  return allSubnets.filter((s) => {
    if (s.parentCidr !== rootCidr) return false;
    const si = getSubnetInfo(s.cidr);
    return si && si.networkInt >= root.networkInt && si.broadcastInt <= root.broadcastInt;
  });
}

function buildSegments(rootCidr: string, subnets: SubnetEntry[]): Segment[] {
  const root = getSubnetInfo(rootCidr);
  if (!root) return [];

  const sorted = [...subnets]
    .map((s) => ({ s, info: getSubnetInfo(s.cidr) }))
    .filter((x) => x.info !== null)
    .sort((a, b) => a.info!.networkInt - b.info!.networkInt);

  const segs: Segment[] = [];
  let cursor = root.networkInt;

  for (const { s, info } of sorted) {
    if (!info) continue;
    if (info.networkInt > cursor) {
      segs.push({
        type: "free",
        cidr: `free-${cursor}-${info.networkInt - 1}`,
        start: cursor,
        end: info.networkInt - 1,
        size: info.networkInt - cursor,
      });
    }
    segs.push({
      type: "allocated",
      cidr: s.cidr,
      start: info.networkInt,
      end: info.broadcastInt,
      size: info.totalHosts,
      subnet: s,
    });
    cursor = info.broadcastInt + 1;
  }

  if (cursor <= root.broadcastInt) {
    segs.push({
      type: "free",
      cidr: `free-${cursor}-${root.broadcastInt}`,
      start: cursor,
      end: root.broadcastInt,
      size: root.broadcastInt - cursor + 1,
    });
  }

  return segs;
}

function suggestedPrefixes(gapSize: number, parentPrefix: number): number[] {
  const result: number[] = [];
  for (let p = parentPrefix + 1; p <= 30; p++) {
    const s = Math.pow(2, 32 - p);
    if (s <= gapSize) result.push(p);
    if (result.length >= 8) break;
  }
  return result;
}

function firstAlignedCidr(gapStart: number, gapEnd: number, prefix: number): string | null {
  const blockSize = Math.pow(2, 32 - prefix);
  const aligned = Math.ceil(gapStart / blockSize) * blockSize;
  if (aligned + blockSize - 1 > gapEnd) return null;
  return `${intToIp(aligned >>> 0)}/${prefix}`;
}

// ── Inline name editor for allocated segment ──────────────────────────────────

interface InlineEditorProps {
  subnet: SubnetEntry;
  colorLabels: ColorLabel[];
  onSave: (id: string, name: string, colorLabelId: string | null) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function InlineEditor({ subnet, colorLabels, onSave, onClose, onDelete }: InlineEditorProps) {
  const [name, setName] = useState(subnet.name);
  const [labelId, setLabelId] = useState(subnet.colorLabelId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const save = () => {
    onSave(subnet.id, name.trim() || "Unnamed", labelId);
    onClose();
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3 shadow-xl">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Subnet name"
          className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 font-medium"
        />
        <button
          onClick={save}
          className="w-7 h-7 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center hover:bg-primary/30 transition-colors"
        >
          <Check size={13} className="text-primary" />
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/5 transition-colors"
        >
          <X size={13} className="text-muted-foreground" />
        </button>
      </div>

      {/* Color label picker */}
      {colorLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colorLabels.map((l) => (
            <button
              key={l.id}
              onClick={() => setLabelId(labelId === l.id ? null : l.id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all",
                labelId === l.id
                  ? "border-transparent"
                  : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
              )}
              style={
                labelId === l.id
                  ? { backgroundColor: l.color + "25", borderColor: l.color + "80", color: l.color }
                  : undefined
              }
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: l.color }}
              />
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border">
        <span className="text-xs font-mono text-muted-foreground">{subnet.cidr}</span>
        <button
          onClick={() => { onDelete(subnet.id); onClose(); }}
          className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors"
        >
          <Trash2 size={11} />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Gap expander — inline size picker ─────────────────────────────────────────

interface GapExpanderProps {
  seg: Segment;
  parentPrefix: number;
  colorLabels: ColorLabel[];
  onAdd: (subnet: SubnetEntry) => void;
  onClose: () => void;
}

function GapExpander({ seg, parentPrefix, colorLabels, onAdd, onClose }: GapExpanderProps) {
  const prefixes = suggestedPrefixes(seg.size, parentPrefix);
  const [step, setStep] = useState<"pick-size" | "name">("pick-size");
  const [chosenCidr, setChosenCidr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [labelId, setLabelId] = useState<string | null>(colorLabels[0]?.id ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "name") inputRef.current?.focus();
  }, [step]);

  const commit = () => {
    if (!chosenCidr) return;
    onAdd({
      id: nanoid(),
      cidr: chosenCidr,
      name: name.trim() || "Unnamed",
      colorLabelId: labelId,
      parentCidr: chosenCidr, // will be overridden by caller
    });
    onClose();
  };

  return (
    <div className="bg-card border border-primary/30 rounded-lg overflow-hidden shadow-xl">
      {step === "pick-size" ? (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Choose a subnet size</p>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {intToIp(seg.start >>> 0)} — {intToIp(seg.end >>> 0)}
            <span className="ml-2 text-muted-foreground/60">{formatHostCount(seg.size)} IPs free</span>
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {prefixes.map((p) => {
              const cidr = firstAlignedCidr(seg.start, seg.end, p);
              if (!cidr) return null;
              const info = getSubnetInfo(cidr);
              const hosts = Math.pow(2, 32 - p) - 2;
              return (
                <button
                  key={p}
                  onClick={() => { setChosenCidr(cidr); setStep("name"); }}
                  className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2.5 hover:border-primary/50 hover:bg-primary/8 transition-all group text-left"
                >
                  <div>
                    <span className="text-sm font-mono font-bold text-foreground group-hover:text-primary block">
                      /{p}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatHostCount(Math.max(0, hosts))} hosts
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground/50 text-right hidden sm:block">
                    {info?.networkAddress}
                  </span>
                </button>
              );
            })}
          </div>
          {prefixes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Space too small to allocate further subnets
            </p>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep("pick-size")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            >
              <ChevronRight size={11} className="rotate-180" /> Back
            </button>
            <span className="text-xs font-mono text-primary font-semibold">{chosenCidr}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") onClose();
              }}
              placeholder="Name this subnet…"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              onClick={commit}
              className="shrink-0 px-3 py-1.5 rounded-md bg-primary/20 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors flex items-center gap-1.5"
            >
              <Check size={12} /> Create
            </button>
            <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          </div>
          {colorLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {colorLabels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLabelId(labelId === l.id ? null : l.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all",
                    labelId === l.id
                      ? "border-transparent"
                      : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
                  )}
                  style={
                    labelId === l.id
                      ? { backgroundColor: l.color + "25", borderColor: l.color + "80", color: l.color }
                      : undefined
                  }
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main SubnetCanvas ─────────────────────────────────────────────────────────

export function SubnetCanvas({
  rootCidr,
  allSubnets,
  colorLabels,
  breadcrumbs,
  onAddSubnet,
  onUpdateSubnet,
  onDeleteSubnet,
  onDrillDown,
}: SubnetCanvasProps) {
  const rootInfo = getSubnetInfo(rootCidr);
  const [activeSegKey, setActiveSegKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const subnets = directChildren(rootCidr, allSubnets);
  const segments = buildSegments(rootCidr, subnets);

  if (!rootInfo) return null;

  const totalIps = rootInfo.totalHosts;
  const usedIps = subnets.reduce((acc, s) => {
    const si = getSubnetInfo(s.cidr);
    return acc + (si?.totalHosts ?? 0);
  }, 0);
  const usedPct = totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0;

  function getLabel(subnet: SubnetEntry) {
    if (!subnet.colorLabelId) return null;
    return colorLabels.find((l) => l.id === subnet.colorLabelId) ?? null;
  }

  function segKey(seg: Segment) {
    return seg.type === "allocated" ? seg.cidr : seg.cidr;
  }

  const handleAdd = (subnet: SubnetEntry) => {
    onAddSubnet({ ...subnet, parentCidr: rootCidr });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Scope header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b border-border/50">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={11} className="text-border" />}
                <span
                  className={cn(
                    "font-mono",
                    i === breadcrumbs.length - 1
                      ? "text-foreground font-semibold"
                      : "hover:text-foreground cursor-pointer transition-colors",
                  )}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{rootInfo.networkAddress} — {rootInfo.broadcastAddress}</span>
            <span className="text-border">·</span>
            <span>{formatHostCount(rootInfo.usableHosts)} usable hosts</span>
            <span className="text-border">·</span>
            <span>/{rootInfo.prefix}</span>
          </div>
        </div>

        {/* Utilisation */}
        <div className="flex items-center gap-3 shrink-0">
          {usedPct > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">{usedPct}% allocated</span>
          )}
          <div className="w-32 h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(usedPct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Proportional strip map ───────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 shrink-0">
        <div
          className="flex h-10 rounded-md overflow-hidden border border-border"
          style={{ gap: "1px", backgroundColor: "var(--border)" }}
        >
          {segments.map((seg) => {
            const widthPct = (seg.size / totalIps) * 100;
            const key = segKey(seg);
            const isActive = activeSegKey === key;
            const isHovered = hoveredKey === key;
            const label = seg.subnet ? getLabel(seg.subnet) : null;
            const color = label?.color;

            return (
              <div
                key={key}
                className={cn(
                  "relative flex items-center justify-center overflow-hidden transition-all duration-100 cursor-pointer shrink-0",
                  seg.type === "free" && "group",
                )}
                style={{
                  flexBasis: `${Math.max(widthPct, 0.15)}%`,
                  backgroundColor:
                    seg.type === "allocated"
                      ? (color ?? "#64748b") + "30"
                      : isActive || isHovered
                      ? "oklch(0.65 0.18 200 / 0.08)"
                      : "oklch(0.12 0.006 240)",
                  borderLeft:
                    seg.type === "allocated"
                      ? `2px solid ${color ?? "#64748b"}`
                      : undefined,
                  outline:
                    isActive && seg.type === "free"
                      ? "1.5px solid oklch(0.65 0.18 200 / 0.5)"
                      : isHovered && seg.type === "allocated"
                      ? `1.5px solid ${color ?? "#64748b"}88`
                      : undefined,
                  outlineOffset: "-1px",
                }}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => {
                  if (seg.type === "free") {
                    setActiveSegKey(isActive ? null : key);
                  }
                }}
              >
                {seg.type === "allocated" && seg.subnet && widthPct > 6 && (
                  <span
                    className="text-xs font-semibold truncate px-1 select-none"
                    style={{ color: color ?? "#e2e8f0", fontSize: widthPct > 15 ? "0.7rem" : "0.6rem" }}
                  >
                    {seg.subnet.name}
                  </span>
                )}
                {seg.type === "free" && widthPct > 4 && (
                  <Plus
                    size={11}
                    className={cn(
                      "transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground/25 group-hover:text-primary/60",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* Range ticks */}
        <div className="flex justify-between mt-1.5">
          <span className="text-xs font-mono text-muted-foreground/40">{rootInfo.networkAddress}</span>
          <span className="text-xs font-mono text-muted-foreground/40">{rootInfo.broadcastAddress}</span>
        </div>
      </div>

      {/* ── Segment list ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 pb-6 space-y-1.5">
        {segments.map((seg) => {
          const key = segKey(seg);
          const isActive = activeSegKey === key;

          if (seg.type === "allocated" && seg.subnet) {
            const label = getLabel(seg.subnet);
            const info = getSubnetInfo(seg.subnet.cidr);
            const isEditing = isActive;
            const pctOfRoot = (seg.size / totalIps) * 100;

            return (
              <div key={key}>
                {/* Allocated row */}
                <div
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-100 cursor-pointer",
                  )}
                  style={{
                    borderColor: (label?.color ?? "#64748b") + "44",
                    backgroundColor:
                      isEditing
                        ? (label?.color ?? "#64748b") + "18"
                        : (label?.color ?? "#64748b") + "0d",
                  }}
                  onClick={() => setActiveSegKey(isEditing ? null : key)}
                >
                  {/* Color accent */}
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: label?.color ?? "#64748b" }}
                  />

                  {/* Name + label */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {seg.subnet.name}
                      </span>
                      {label && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                          style={{
                            backgroundColor: label.color + "25",
                            color: label.color,
                          }}
                        >
                          {label.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">
                        {seg.subnet.cidr}
                      </span>
                      {info && (
                        <span className="text-xs text-muted-foreground/60 hidden sm:block">
                          {info.networkAddress} — {info.broadcastAddress}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Host count */}
                  <div className="flex flex-col items-end shrink-0 mr-3">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {info ? formatHostCount(info.usableHosts) : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">hosts</span>
                  </div>

                  {/* Proportion bar */}
                  <div className="w-14 h-1 rounded-full bg-border overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(pctOfRoot * 3, 100)}%`,
                        backgroundColor: label?.color ?? "oklch(0.65 0.18 200)",
                      }}
                    />
                  </div>

                  {/* Drill-down + edit actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      className="p-1.5 rounded hover:bg-white/8 transition-colors"
                      title="Edit"
                      onClick={(e) => { e.stopPropagation(); setActiveSegKey(isEditing ? null : key); }}
                    >
                      <Pencil size={12} className="text-muted-foreground" />
                    </button>
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/15 text-xs text-muted-foreground hover:text-primary transition-colors"
                      title="Drill into this subnet"
                      onClick={(e) => { e.stopPropagation(); onDrillDown(seg.subnet!.cidr); }}
                    >
                      Drill in <ArrowRight size={11} />
                    </button>
                  </div>
                </div>

                {/* Inline editor */}
                {isEditing && (
                  <div className="mt-1 ml-4">
                    <InlineEditor
                      subnet={seg.subnet}
                      colorLabels={colorLabels}
                      onSave={(id, name, colorLabelId) => onUpdateSubnet(id, { name, colorLabelId })}
                      onClose={() => setActiveSegKey(null)}
                      onDelete={onDeleteSubnet}
                    />
                  </div>
                )}
              </div>
            );
          }

          // ── Free gap row ───────────────────────────────────────────────────
          return (
            <div key={key}>
              <button
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 text-left transition-all duration-100 group",
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/40 hover:border-primary/30 hover:bg-primary/3",
                )}
                onClick={() => setActiveSegKey(isActive ? null : key)}
              >
                <div className="w-1 self-stretch rounded-full bg-border/50 shrink-0" />
                <span className="text-xs font-mono text-muted-foreground/60 flex-1 truncate">
                  {intToIp(seg.start >>> 0)} — {intToIp(seg.end >>> 0)}
                </span>
                <span className="text-xs text-muted-foreground/50 shrink-0">
                  {formatHostCount(seg.size)} IPs free
                </span>
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium transition-colors shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground/50 group-hover:text-primary/70",
                  )}
                >
                  {isActive ? <X size={11} /> : <Plus size={11} />}
                  <span>{isActive ? "Close" : "Add subnet"}</span>
                </div>
              </button>

              {isActive && (
                <div className="mt-1 ml-4">
                  <GapExpander
                    seg={seg}
                    parentPrefix={rootInfo.prefix}
                    colorLabels={colorLabels}
                    onAdd={handleAdd}
                    onClose={() => setActiveSegKey(null)}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {subnets.length === 0 && segments.length === 1 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Click{" "}
              <span className="text-primary font-medium">Add subnet</span>{" "}
              above to allocate your first block within{" "}
              <span className="font-mono text-foreground">{rootCidr}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
