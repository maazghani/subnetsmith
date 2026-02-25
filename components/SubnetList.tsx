"use client";

import { SubnetEntry, ColorLabel } from "@/lib/types";
import { getSubnetInfo, formatHostCount } from "@/lib/subnet";
import { cn } from "@/lib/utils";
import { Pencil, Trash2, Network } from "lucide-react";

interface SubnetListProps {
  subnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  activeCidr: string | null;
  onEdit: (subnet: SubnetEntry) => void;
  onDelete: (id: string) => void;
  onSelect: (cidr: string) => void;
}

export function SubnetList({ subnets, colorLabels, activeCidr, onEdit, onDelete, onSelect }: SubnetListProps) {
  if (subnets.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-muted-foreground">No subnets yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {subnets.map((subnet) => {
        const info = getSubnetInfo(subnet.cidr);
        const label = colorLabels.find((l) => l.id === subnet.colorLabelId);
        const isActive = activeCidr === subnet.cidr;

        return (
          <div
            key={subnet.id}
            className={cn(
              "group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
              isActive ? "bg-primary/15" : "hover:bg-white/5",
            )}
            onClick={() => onSelect(subnet.cidr)}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: label?.color ?? "#64748b" }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium text-foreground truncate">{subnet.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-muted-foreground">{subnet.cidr}</span>
                {info && (
                  <span className="text-xs text-muted-foreground/60">
                    · {formatHostCount(info.usableHosts)}h
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                className="p-1 rounded hover:bg-white/10"
                onClick={(e) => { e.stopPropagation(); onEdit(subnet); }}
                aria-label="Edit"
              >
                <Pencil size={10} className="text-muted-foreground" />
              </button>
              <button
                className="p-1 rounded hover:bg-red-500/20"
                onClick={(e) => { e.stopPropagation(); onDelete(subnet.id); }}
                aria-label="Delete"
              >
                <Trash2 size={10} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
