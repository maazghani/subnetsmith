"use client";

import { useState, useEffect, useCallback } from "react";
import { nanoid } from "nanoid";
import { SubnetSmithConfig, SubnetEntry, ColorLabel, DEFAULT_COLOR_LABELS } from "@/lib/types";
import { normalizeCidr, getSubnetInfo, decodeConfig, encodeConfig } from "@/lib/subnet";
import { cn } from "@/lib/utils";
import { Toolbar } from "@/components/Toolbar";
import { CgnatBlockSelector } from "@/components/CgnatBlockSelector";
import { AreaMap } from "@/components/AreaMap";
import { SubnetEditModal } from "@/components/SubnetEditModal";
import { ColorLabelManager } from "@/components/ColorLabelManager";
import { SubnetList } from "@/components/SubnetList";
import {
  Tag,
  List,
  LayoutGrid,
  Network,
  Globe,
  Settings2,
} from "lucide-react";

const STORAGE_KEY = "subnetsmith-config-v2";
const CGNAT_ROOT = "100.64.0.0/10";

function makeDefault(): SubnetSmithConfig {
  return {
    id: nanoid(),
    name: "CG-NAT Plan",
    rootCidr: CGNAT_ROOT,
    subnets: [],
    colorLabels: DEFAULT_COLOR_LABELS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadFromStorage(): SubnetSmithConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SubnetSmithConfig;
  } catch {
    return null;
  }
}

function saveToStorage(config: SubnetSmithConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// Filter subnets that belong to a given /16 block
function subnetsForBlock(block: string, allSubnets: SubnetEntry[]): SubnetEntry[] {
  const blockInfo = getSubnetInfo(block);
  if (!blockInfo) return [];
  return allSubnets.filter((s) => {
    const si = getSubnetInfo(s.cidr);
    if (!si) return false;
    return si.networkInt >= blockInfo.networkInt && si.broadcastInt <= blockInfo.broadcastInt;
  });
}

type SidePanel = "map" | "labels" | "list";

export default function SubnetSmithPage() {
  const [config, setConfig] = useState<SubnetSmithConfig>(makeDefault);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [editingSubnet, setEditingSubnet] = useState<SubnetEntry | null>(null);
  const [isNewSubnet, setIsNewSubnet] = useState(false);
  const [pendingCidr, setPendingCidr] = useState<string | null>(null);
  const [panel, setPanel] = useState<SidePanel>("map");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("config");
    if (encoded) {
      const decoded = decodeConfig(encoded) as SubnetSmithConfig | null;
      if (decoded) {
        setConfig(decoded);
        setHydrated(true);
        return;
      }
    }
    const stored = loadFromStorage();
    if (stored) setConfig(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(config);
  }, [config, hydrated]);

  const updateConfig = useCallback((partial: Partial<SubnetSmithConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial, updatedAt: new Date().toISOString() }));
  }, []);

  // ── Subnet actions ──────────────────────────────────────────────────────────

  const handleAddSubnet = (cidr: string) => {
    const placeholder: SubnetEntry = {
      id: nanoid(),
      cidr,
      name: "",
      colorLabelId: config.colorLabels[0]?.id ?? null,
      parentCidr: selectedBlock ?? config.rootCidr,
    };
    setPendingCidr(cidr);
    setEditingSubnet(placeholder);
    setIsNewSubnet(true);
  };

  const handleSaveSubnet = (updated: Partial<SubnetEntry> & { id: string }) => {
    if (isNewSubnet) {
      const full: SubnetEntry = {
        id: updated.id,
        cidr: pendingCidr!,
        name: updated.name ?? "Unnamed",
        colorLabelId: updated.colorLabelId ?? null,
        parentCidr: selectedBlock ?? config.rootCidr,
        notes: updated.notes,
      };
      updateConfig({ subnets: [...config.subnets, full] });
    } else {
      updateConfig({
        subnets: config.subnets.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
      });
    }
    setEditingSubnet(null);
    setPendingCidr(null);
    setIsNewSubnet(false);
  };

  const handleDeleteSubnet = (id: string) => {
    const subnet = config.subnets.find((s) => s.id === id);
    if (!subnet) return;
    const si = getSubnetInfo(subnet.cidr);
    const toDelete = config.subnets.filter((s) => {
      if (s.id === id) return true;
      const ci = getSubnetInfo(s.cidr);
      return ci && si && ci.networkInt >= si.networkInt && ci.broadcastInt <= si.broadcastInt;
    });
    updateConfig({ subnets: config.subnets.filter((s) => !toDelete.find((d) => d.id === s.id)) });
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const blockSubnets = selectedBlock ? subnetsForBlock(selectedBlock, config.subnets) : [];
  const totalAllocated = config.subnets.length;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top toolbar */}
      <Toolbar
        config={config}
        onNameChange={(name) => updateConfig({ name })}
        onImport={(imported) => {
          setConfig({ ...imported, id: nanoid() });
          setSelectedBlock(null);
        }}
        onClear={() => {
          updateConfig({ subnets: [] });
          setSelectedBlock(null);
        }}
      />

      {/* CG-NAT block selector — always visible */}
      <CgnatBlockSelector
        selectedBlock={selectedBlock}
        subnets={config.subnets}
        colorLabels={config.colorLabels}
        onSelectBlock={(block) => {
          setSelectedBlock((prev) => (prev === block ? null : block));
          setPanel("map");
        }}
      />

      {/* Main body — only shown when a block is selected */}
      {selectedBlock ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left nav tabs */}
          <nav className="w-10 shrink-0 flex flex-col items-center border-r border-border bg-card pt-3 gap-1">
            {(
              [
                { id: "map" as SidePanel, icon: LayoutGrid, label: "Area Map" },
                { id: "labels" as SidePanel, icon: Tag, label: "Labels" },
                { id: "list" as SidePanel, icon: List, label: "All subnets" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                title={tab.label}
                onClick={() => setPanel(tab.id)}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                  panel === tab.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <tab.icon size={14} />
              </button>
            ))}
          </nav>

          {/* Content panel */}
          <div className="flex flex-1 overflow-hidden flex-col">
            {panel === "map" && (
              <AreaMap
                rootCidr={selectedBlock}
                subnets={blockSubnets}
                colorLabels={config.colorLabels}
                onAddSubnet={handleAddSubnet}
                onEditSubnet={(subnet) => { setEditingSubnet(subnet); setIsNewSubnet(false); }}
                onDeleteSubnet={handleDeleteSubnet}
              />
            )}
            {panel === "labels" && (
              <div className="p-5 max-w-lg">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-4">Color Labels</h2>
                <ColorLabelManager
                  colorLabels={config.colorLabels}
                  onChange={(labels) => updateConfig({ colorLabels: labels })}
                />
              </div>
            )}
            {panel === "list" && (
              <div className="p-5 max-w-2xl">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-4">
                  All Subnets in {selectedBlock}
                </h2>
                <SubnetList
                  subnets={blockSubnets}
                  colorLabels={config.colorLabels}
                  activeCidr={selectedBlock}
                  onEdit={(subnet) => { setEditingSubnet(subnet); setIsNewSubnet(false); }}
                  onDelete={handleDeleteSubnet}
                  onSelect={() => {}}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* No block selected — instruction overlay */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Network size={22} className="text-primary" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h2 className="text-base font-semibold text-foreground">Select a /16 block above</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Click any cell in the CG-NAT grid to open its address space and start planning subnets within it.
            </p>
          </div>
          {totalAllocated > 0 && (
            <div className="mt-2 px-3 py-1.5 rounded-full border border-border bg-secondary/30 text-xs text-muted-foreground">
              {totalAllocated} subnet{totalAllocated !== 1 ? "s" : ""} allocated across all blocks
            </div>
          )}
        </div>
      )}

      {/* Edit / create modal */}
      <SubnetEditModal
        subnet={editingSubnet}
        colorLabels={config.colorLabels}
        onSave={handleSaveSubnet}
        onClose={() => {
          setEditingSubnet(null);
          setPendingCidr(null);
          setIsNewSubnet(false);
        }}
        isNew={isNewSubnet}
      />
    </div>
  );
}
