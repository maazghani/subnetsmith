"use client";

import { useState, useEffect } from "react";
import { SubnetEntry, ColorLabel, PRESET_COLORS } from "@/lib/types";
import { getSubnetInfo, formatHostCount } from "@/lib/subnet";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface SubnetEditModalProps {
  subnet: SubnetEntry | null;
  colorLabels: ColorLabel[];
  onSave: (updated: Partial<SubnetEntry> & { id: string }) => void;
  onClose: () => void;
  isNew?: boolean;
}

export function SubnetEditModal({ subnet, colorLabels, onSave, onClose, isNew }: SubnetEditModalProps) {
  const [name, setName] = useState(subnet?.name ?? "");
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(subnet?.colorLabelId ?? null);
  const [notes, setNotes] = useState(subnet?.notes ?? "");

  useEffect(() => {
    if (subnet) {
      setName(subnet.name);
      setSelectedLabelId(subnet.colorLabelId);
      setNotes(subnet.notes ?? "");
    }
  }, [subnet]);

  if (!subnet) return null;

  const info = getSubnetInfo(subnet.cidr);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: subnet.id,
      name: name.trim(),
      colorLabelId: selectedLabelId,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog open={!!subnet} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {isNew ? "Name this subnet" : "Edit subnet"}
          </DialogTitle>
        </DialogHeader>

        {/* CIDR info */}
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">CIDR</span>
            <span className="text-xs font-mono text-foreground font-semibold">{subnet.cidr}</span>
          </div>
          {info && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Range</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {info.networkAddress} — {info.broadcastAddress}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Usable hosts</span>
                <span className="text-xs font-mono text-foreground">
                  {info.firstHost} — {info.lastHost} ({formatHostCount(info.usableHosts)})
                </span>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="subnet-name" className="text-xs text-muted-foreground">Subnet name</Label>
            <Input
              id="subnet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Public Web Tier"
              className="bg-input border-border text-foreground text-xs h-8"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>

          {/* Color label */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Color label</Label>
            <div className="flex flex-wrap gap-2">
              {colorLabels.map((label) => {
                const isSelected = selectedLabelId === label.id;
                return (
                  <button
                    key={label.id}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all",
                      isSelected
                        ? "border-current text-foreground"
                        : "border-border text-muted-foreground hover:border-white/30",
                    )}
                    style={isSelected ? { borderColor: label.color, backgroundColor: label.color + "22" } : {}}
                    onClick={() => setSelectedLabelId(isSelected ? null : label.id)}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.label}
                    {isSelected && <Check size={10} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="subnet-notes" className="text-xs text-muted-foreground">Notes (optional)</Label>
            <Input
              id="subnet-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional description..."
              className="bg-input border-border text-foreground text-xs h-8"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!name.trim()}
            className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isNew ? "Create subnet" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
