"use client";

import { useState } from "react";
import { normalizeCidr, getSubnetInfo, formatHostCount } from "@/lib/subnet";
import { cn } from "@/lib/utils";
import { Network, ArrowRight } from "lucide-react";

const PRESETS = [
  { label: "CG-NAT /10",   cidr: "100.64.0.0/10",  description: "Carrier-grade NAT space" },
  { label: "Private /8",   cidr: "10.0.0.0/8",     description: "Class A private" },
  { label: "Private /12",  cidr: "172.16.0.0/12",  description: "Class B private" },
  { label: "Private /16",  cidr: "192.168.0.0/16", description: "Class C private" },
  { label: "Loopback /8",  cidr: "127.0.0.0/8",    description: "Loopback range" },
  { label: "RFC 6598 /10", cidr: "100.64.0.0/10",  description: "Shared address space" },
];

interface CidrInputProps {
  onConfirm: (cidr: string) => void;
}

export function CidrInput({ onConfirm }: CidrInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const normalized = normalizeCidr(value.trim());
  const info = normalized ? getSubnetInfo(normalized) : null;

  const validate = (raw: string): string | null => {
    const norm = normalizeCidr(raw.trim());
    if (!norm) return "Enter a valid CIDR, e.g. 10.0.0.0/8";
    const inf = getSubnetInfo(norm);
    if (!inf) return "Invalid CIDR block";
    if (inf.prefix > 28) return "Choose a prefix ≤ /28 to have room to work";
    return null;
  };

  const submit = (raw?: string) => {
    const target = raw ?? value;
    const err = validate(target);
    if (err) { setError(err); return; }
    const norm = normalizeCidr(target.trim())!;
    onConfirm(norm);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8">
      {/* Logo mark */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Network size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            subnet<span className="text-primary">smith</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Enter a CIDR block to start planning your IP space visually.
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="w-full max-w-sm space-y-2">
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. 10.0.0.0/8"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-card border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          <button
            onClick={() => submit()}
            disabled={!value.trim()}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all",
              value.trim()
                ? "bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30"
                : "bg-secondary/30 border border-border text-muted-foreground cursor-not-allowed",
            )}
          >
            Open <ArrowRight size={14} />
          </button>
        </div>

        {/* Preview */}
        {info && !error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/8 border border-primary/20">
            <span className="text-xs font-mono text-primary font-semibold">{info.cidr}</span>
            <span className="text-border">·</span>
            <span className="text-xs text-muted-foreground">
              {info.networkAddress} — {info.broadcastAddress}
            </span>
            <span className="text-border">·</span>
            <span className="text-xs text-muted-foreground">
              {formatHostCount(info.usableHosts)} usable hosts
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-rose-400 px-1">{error}</p>
        )}
      </div>

      {/* Presets */}
      <div className="w-full max-w-sm space-y-2">
        <p className="text-xs text-muted-foreground text-center font-medium uppercase tracking-wide">
          Common ranges
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.slice(0, 4).map((p) => (
            <button
              key={p.cidr + p.label}
              onClick={() => { setValue(p.cidr); submit(p.cidr); }}
              className="flex flex-col items-start rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/40 hover:bg-primary/5 transition-all group text-left"
            >
              <span className="text-xs font-mono font-bold text-foreground group-hover:text-primary transition-colors">
                {p.cidr}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">{p.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
