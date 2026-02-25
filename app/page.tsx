"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { nanoid } from "nanoid";
import { NetsliceConfig, SubnetEntry, ColorLabel, DEFAULT_COLOR_LABELS } from "@/lib/types";
import { normalizeCidr, getSubnetInfo, decodeConfig, parseCidr } from "@/lib/subnet";
import { cn } from "@/lib/utils";
import { Toolbar } from "@/components/Toolbar";
import { SubnetMap } from "@/components/SubnetMap";
import { SubnetSizePicker } from "@/components/SubnetSizePicker";
import { SubnetEditModal } from "@/components/SubnetEditModal";
import { ColorLabelManager } from "@/components/ColorLabelManager";
import { SubnetList } from "@/components/SubnetList";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Network,
  ChevronRight,
  Layers,
  Tag,
  List,
  AlertCircle,
  X,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

const STORAGE_KEY = "netslice-config";

function makeDefault(): NetsliceConfig {
  return {
    id: nanoid(),
    name: "My VPC Plan",
    rootCidr: "",
    subnets: [],
    colorLabels: DEFAULT_COLOR_LABELS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadFromStorage(): NetsliceConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NetsliceConfig;
  } catch {
    return null;
  }
}

function saveToStorage(config: NetsliceConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

type SidebarTab = "carve" | "labels" | "list";

export default function NetslicePage() {
  const [config, setConfig] = useState<NetsliceConfig>(makeDefault);
  const [cidrInput, setCidrInput] = useState("");
  const [cidrError, setCidrError] = useState<string | null>(null);
  const [activeCidr, setActiveCidr] = useState<string | null>(null);
  const [selectedChildPrefix, setSelectedChildPrefix] = useState<number | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [editingSubnet, setEditingSubnet] = useState<SubnetEntry | null>(null);
  const [isNewSubnet, setIsNewSubnet] = useState(false);
  const [pendingSlotCidr, setPendingSlotCidr] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("carve");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("config");
    if (encoded) {
      const decoded = decodeConfig(encoded) as NetsliceConfig | null;
      if (decoded?.rootCidr) {
        setConfig(decoded);
        setCidrInput(decoded.rootCidr);
        setHydrated(true);
        return;
      }
    }
    const stored = loadFromStorage();
    if (stored?.rootCidr) {
      setConfig(stored);
      setCidrInput(stored.rootCidr);
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(config);
  }, [config, hydrated]);

  const updateConfig = useCallback((partial: Partial<NetsliceConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...partial,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleCidrSubmit = () => {
    const normalized = normalizeCidr(cidrInput.trim());
    if (!normalized) {
      setCidrError("Invalid CIDR — use format like 10.0.0.0/16");
      return;
    }
    setCidrError(null);
    updateConfig({ rootCidr: normalized, subnets: [] });
    setCidrInput(normalized);
    setActiveCidr(null);
    setSelectedChildPrefix(null);
  };

  const handleBlockClick = (cidr: string) => {
    setActiveCidr((prev) => (prev === cidr ? null : cidr));
    setSelectedChildPrefix(null);
    setSidebarTab("carve");
  };

  const handlePlaceSubnet = (slotCidr: string) => {
    // Open name modal
    const placeholder: SubnetEntry = {
      id: nanoid(),
      cidr: slotCidr,
      name: "",
      colorLabelId: config.colorLabels[0]?.id ?? null,
      parentCidr: activeCidr ?? config.rootCidr,
    };
    setPendingSlotCidr(slotCidr);
    setEditingSubnet(placeholder);
    setIsNewSubnet(true);
  };

  const handleSaveSubnet = (updated: Partial<SubnetEntry> & { id: string }) => {
    if (isNewSubnet) {
      const full: SubnetEntry = {
        id: updated.id,
        cidr: pendingSlotCidr!,
        name: updated.name ?? "Unnamed",
        colorLabelId: updated.colorLabelId ?? null,
        parentCidr: activeCidr ?? config.rootCidr,
        notes: updated.notes,
      };
      updateConfig({ subnets: [...config.subnets, full] });
    } else {
      updateConfig({
        subnets: config.subnets.map((s) =>
          s.id === updated.id ? { ...s, ...updated } : s,
        ),
      });
    }
    setEditingSubnet(null);
    setPendingSlotCidr(null);
    setIsNewSubnet(false);
  };

  const handleDeleteSubnet = (id: string) => {
    const subnet = config.subnets.find((s) => s.id === id);
    if (!subnet) return;
    const subnetInfo = getSubnetInfo(subnet.cidr);
    // Also delete any subnets contained within this one
    const toDelete = config.subnets.filter((s) => {
      if (s.id === id) return true;
      const si = getSubnetInfo(s.cidr);
      if (!si || !subnetInfo) return false;
      return si.networkInt >= subnetInfo.networkInt && si.broadcastInt <= subnetInfo.broadcastInt;
    });
    updateConfig({ subnets: config.subnets.filter((s) => !toDelete.find((d) => d.id === s.id)) });
  };

  const effectiveActiveCidr = activeCidr ?? (config.rootCidr || null);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Toolbar
        config={config}
        onNameChange={(name) => updateConfig({ name })}
        onImport={(imported) => {
          setConfig({ ...imported, id: nanoid() });
          setCidrInput(imported.rootCidr);
          setActiveCidr(null);
          setSelectedChildPrefix(null);
        }}
        onClear={() => {
          updateConfig({ subnets: [] });
          setActiveCidr(null);
          setSelectedChildPrefix(null);
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        {sidebarOpen && (
          <aside className="w-72 shrink-0 flex flex-col border-r border-border bg-card overflow-y-auto">
            {/* CIDR input */}
            <div className="p-4 border-b border-border space-y-2">
              <label className="text-xs font-semibold text-foreground">Root CIDR Range</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={cidrInput}
                    onChange={(e) => { setCidrInput(e.target.value); setCidrError(null); }}
                    placeholder="e.g. 10.0.0.0/16"
                    className={cn(
                      "h-8 text-xs font-mono bg-input border-border text-foreground pr-2",
                      cidrError ? "border-destructive" : "",
                    )}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCidrSubmit(); }}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                  onClick={handleCidrSubmit}
                >
                  Set
                </Button>
              </div>
              {cidrError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle size={10} />
                  {cidrError}
                </p>
              )}
              {/* Quick presets */}
              <div className="flex flex-wrap gap-1">
                {["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"].map((preset) => (
                  <button
                    key={preset}
                    className={cn(
                      "text-xs font-mono px-1.5 py-0.5 rounded border transition-colors",
                      config.rootCidr === preset
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-white/20 hover:text-foreground",
                    )}
                    onClick={() => {
                      setCidrInput(preset);
                      setCidrError(null);
                      const normalized = normalizeCidr(preset);
                      if (normalized) {
                        updateConfig({ rootCidr: normalized, subnets: [] });
                        setActiveCidr(null);
                        setSelectedChildPrefix(null);
                      }
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Active context */}
            {config.rootCidr && (
              <div className="px-4 py-2 border-b border-border bg-background/30">
                <div className="flex items-center gap-1.5">
                  <Network size={10} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Carving within:</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {activeCidr && activeCidr !== config.rootCidr ? (
                    <>
                      <button
                        className="text-xs font-mono text-muted-foreground hover:text-foreground"
                        onClick={() => { setActiveCidr(null); setSelectedChildPrefix(null); }}
                      >
                        {config.rootCidr}
                      </button>
                      <ChevronRight size={10} className="text-muted-foreground" />
                      <span className="text-xs font-mono text-primary font-semibold">{activeCidr}</span>
                      <button
                        className="ml-auto p-0.5 rounded hover:bg-white/10"
                        onClick={() => { setActiveCidr(null); setSelectedChildPrefix(null); }}
                        aria-label="Go back to root"
                      >
                        <X size={10} className="text-muted-foreground" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-mono text-foreground font-semibold">{config.rootCidr}</span>
                  )}
                </div>
              </div>
            )}

            {/* Tab nav */}
            {config.rootCidr && (
              <div className="flex border-b border-border">
                {([
                  { id: "carve", icon: Layers, label: "Carve" },
                  { id: "labels", icon: Tag, label: "Labels" },
                  { id: "list", icon: List, label: "Subnets" },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 py-2 text-xs transition-colors",
                      sidebarTab === tab.id
                        ? "text-primary border-b-2 border-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setSidebarTab(tab.id)}
                  >
                    <tab.icon size={11} />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Tab content */}
            <div className="flex-1 p-4 overflow-y-auto">
              {!config.rootCidr ? (
                <div className="text-center py-8 space-y-2">
                  <Network size={24} className="text-muted-foreground mx-auto" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter a CIDR range above to start planning your IP space
                  </p>
                </div>
              ) : sidebarTab === "carve" ? (
                effectiveActiveCidr ? (
                  <SubnetSizePicker
                    parentCidr={effectiveActiveCidr}
                    selectedPrefix={selectedChildPrefix}
                    onSelectPrefix={setSelectedChildPrefix}
                  />
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <Layers size={24} className="text-muted-foreground mx-auto" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Click on a block in the map to select it, then pick a size here to carve
                    </p>
                  </div>
                )
              ) : sidebarTab === "labels" ? (
                <ColorLabelManager
                  colorLabels={config.colorLabels}
                  onChange={(labels) => updateConfig({ colorLabels: labels })}
                />
              ) : (
                <SubnetList
                  subnets={config.subnets}
                  colorLabels={config.colorLabels}
                  activeCidr={activeCidr}
                  onEdit={(subnet) => { setEditingSubnet(subnet); setIsNewSubnet(false); }}
                  onDelete={handleDeleteSubnet}
                  onSelect={(cidr) => { setActiveCidr(cidr); setSidebarTab("carve"); }}
                />
              )}
            </div>
          </aside>
        )}

        {/* Sidebar toggle */}
        <button
          className="absolute left-0 bottom-4 z-30 translate-x-1 flex items-center justify-center w-5 h-8 rounded-r-md bg-card border border-l-0 border-border text-muted-foreground hover:text-foreground transition-colors"
          style={{ left: sidebarOpen ? "288px" : "0px" }}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
        </button>

        {/* Main map area */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {config.rootCidr ? (
            <SubnetMap
              rootCidr={config.rootCidr}
              allSubnets={config.subnets}
              colorLabels={config.colorLabels}
              selectedChildPrefix={selectedChildPrefix}
              hoveredSlot={hoveredSlot}
              activeCidr={effectiveActiveCidr}
              onHoverSlot={setHoveredSlot}
              onPlaceSubnet={handlePlaceSubnet}
              onEditSubnet={(subnet) => { setEditingSubnet(subnet); setIsNewSubnet(false); }}
              onDeleteSubnet={handleDeleteSubnet}
              onBlockClick={handleBlockClick}
            />
          ) : (
            <WelcomeScreen onSelectPreset={(cidr) => {
              setCidrInput(cidr);
              const normalized = normalizeCidr(cidr);
              if (normalized) {
                updateConfig({ rootCidr: normalized });
                setActiveCidr(null);
                setSelectedChildPrefix(null);
              }
            }} />
          )}
        </main>
      </div>

      {/* Edit/Create modal */}
      <SubnetEditModal
        subnet={editingSubnet}
        colorLabels={config.colorLabels}
        onSave={handleSaveSubnet}
        onClose={() => { setEditingSubnet(null); setPendingSlotCidr(null); setIsNewSubnet(false); }}
        isNew={isNewSubnet}
      />
    </div>
  );
}

function WelcomeScreen({ onSelectPreset }: { onSelectPreset: (cidr: string) => void }) {
  const examples = [
    { cidr: "10.0.0.0/16", label: "Standard VPC", desc: "65K hosts · common AWS default" },
    { cidr: "172.16.0.0/12", label: "RFC 1918 Large", desc: "1M hosts · private range" },
    { cidr: "100.64.0.0/10", label: "Carrier Grade NAT", desc: "4M hosts · RFC 6598" },
    { cidr: "192.168.0.0/24", label: "Small Office", desc: "254 hosts · home/SMB" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-3 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto">
          <Network size={30} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          net<span className="text-primary">slice</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Visually carve IP address space into subnets. Plan VPC networks, assign labels, and share your designs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {examples.map((ex) => (
          <button
            key={ex.cidr}
            className="group rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 p-4 text-left transition-all duration-150"
            onClick={() => onSelectPreset(ex.cidr)}
          >
            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
              {ex.label}
            </div>
            <div className="text-xs font-mono text-primary mt-1">{ex.cidr}</div>
            <div className="text-xs text-muted-foreground mt-1">{ex.desc}</div>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        or enter a custom CIDR in the left panel
      </p>
    </div>
  );
}
