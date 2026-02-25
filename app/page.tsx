"use client";

import { useState, useEffect, useCallback } from "react";
import { nanoid } from "nanoid";
import { SubnetSmithConfig, SubnetEntry, ColorLabel, DEFAULT_COLOR_LABELS } from "@/lib/types";
import { normalizeCidr, getSubnetInfo, decodeConfig } from "@/lib/subnet";
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
  Tag,
  List,
  AlertCircle,
  X,
  PanelLeftClose,
  PanelLeft,
  Hammer,
  ArrowRight,
} from "lucide-react";

const STORAGE_KEY = "subnetsmith-config";

function makeDefault(): SubnetSmithConfig {
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

type SidebarTab = "build" | "labels" | "list";

export default function SubnetSmithPage() {
  const [config, setConfig] = useState<SubnetSmithConfig>(makeDefault);
  const [cidrInput, setCidrInput] = useState("");
  const [cidrError, setCidrError] = useState<string | null>(null);
  const [activeCidr, setActiveCidr] = useState<string | null>(null);
  const [selectedChildPrefix, setSelectedChildPrefix] = useState<number | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [editingSubnet, setEditingSubnet] = useState<SubnetEntry | null>(null);
  const [isNewSubnet, setIsNewSubnet] = useState(false);
  const [pendingSlotCidr, setPendingSlotCidr] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("build");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("config");
    if (encoded) {
      const decoded = decodeConfig(encoded) as SubnetSmithConfig | null;
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

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(config);
  }, [config, hydrated]);

  const updateConfig = useCallback((partial: Partial<SubnetSmithConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...partial,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleCidrSubmit = () => {
    const normalized = normalizeCidr(cidrInput.trim());
    if (!normalized) {
      setCidrError("Invalid CIDR — try 10.0.0.0/16");
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
    setSidebarTab("build");
  };

  const handlePlaceSubnet = (slotCidr: string) => {
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
    const toDelete = config.subnets.filter((s) => {
      if (s.id === id) return true;
      const si = getSubnetInfo(s.cidr);
      if (!si || !subnetInfo) return false;
      return si.networkInt >= subnetInfo.networkInt && si.broadcastInt <= subnetInfo.broadcastInt;
    });
    updateConfig({ subnets: config.subnets.filter((s) => !toDelete.find((d) => d.id === s.id)) });
  };

  const effectiveActiveCidr = activeCidr ?? (config.rootCidr || null);

  // Derive current "step" for guided flow
  const step = !config.rootCidr ? 1 : !activeCidr ? 2 : !selectedChildPrefix ? 3 : 4;

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
          <aside className="w-72 shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">

            {/* Tab nav — only shown once CIDR is set */}
            <div className="flex border-b border-border shrink-0">
              {([
                { id: "build" as SidebarTab, icon: Hammer, label: "Build" },
                { id: "labels" as SidebarTab, icon: Tag, label: "Labels" },
                { id: "list" as SidebarTab, icon: List, label: "Subnets" },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
                    sidebarTab === tab.id
                      ? "text-primary border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setSidebarTab(tab.id)}
                >
                  <tab.icon size={12} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {sidebarTab === "build" ? (
                <div className="p-4 space-y-5">

                  {/* Step 1: Set root CIDR */}
                  <StepSection
                    number={1}
                    title="Set your IP range"
                    active={step === 1}
                    done={!!config.rootCidr}
                  >
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={cidrInput}
                          onChange={(e) => { setCidrInput(e.target.value); setCidrError(null); }}
                          placeholder="e.g. 10.0.0.0/16"
                          className={cn(
                            "h-8 text-xs font-mono bg-input border-border text-foreground",
                            cidrError ? "border-destructive" : "",
                          )}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCidrSubmit(); }}
                        />
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
                      <div className="flex flex-wrap gap-1">
                        {["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map((preset) => (
                          <button
                            key={preset}
                            className={cn(
                              "text-xs font-mono px-1.5 py-0.5 rounded border transition-colors",
                              config.rootCidr === preset
                                ? "border-primary/60 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
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
                  </StepSection>

                  {/* Step 2: Select a block from the map */}
                  <StepSection
                    number={2}
                    title="Click a block in the map"
                    active={step === 2}
                    done={step > 2}
                    disabled={!config.rootCidr}
                    hint="Click the large block in the map area to select it."
                  >
                    {activeCidr ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/10 border border-primary/30">
                        <Network size={11} className="text-primary shrink-0" />
                        <span className="text-xs font-mono text-primary font-semibold truncate">{activeCidr}</span>
                        <button
                          className="ml-auto p-0.5 rounded hover:bg-white/10"
                          onClick={() => { setActiveCidr(null); setSelectedChildPrefix(null); }}
                        >
                          <X size={10} className="text-muted-foreground" />
                        </button>
                      </div>
                    ) : config.rootCidr ? (
                      <button
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                        onClick={() => {
                          setActiveCidr(config.rootCidr);
                          setSidebarTab("build");
                        }}
                      >
                        <Network size={11} />
                        <span className="font-mono">{config.rootCidr}</span>
                        <ArrowRight size={10} className="ml-auto" />
                      </button>
                    ) : null}
                  </StepSection>

                  {/* Step 3: Pick a size */}
                  <StepSection
                    number={3}
                    title="Choose a subnet size"
                    active={step === 3}
                    done={step > 3}
                    disabled={!activeCidr}
                    hint="Pick a prefix length. Smaller number = bigger subnet."
                  >
                    {activeCidr && (
                      <SubnetSizePicker
                        parentCidr={effectiveActiveCidr!}
                        selectedPrefix={selectedChildPrefix}
                        onSelectPrefix={setSelectedChildPrefix}
                      />
                    )}
                  </StepSection>

                  {/* Step 4: Click a slot */}
                  <StepSection
                    number={4}
                    title="Click a slot to name it"
                    active={step === 4}
                    done={false}
                    disabled={!selectedChildPrefix}
                    hint="Slots appear in the map. Click any empty one to name and save it."
                  >
                    {selectedChildPrefix && activeCidr && (
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        The map now shows all{" "}
                        <span className="text-foreground font-mono">/{selectedChildPrefix}</span>{" "}
                        slots inside{" "}
                        <span className="text-foreground font-mono">{activeCidr}</span>.
                        Click any empty slot to create a named subnet.
                      </div>
                    )}
                  </StepSection>

                </div>
              ) : sidebarTab === "labels" ? (
                <div className="p-4">
                  <ColorLabelManager
                    colorLabels={config.colorLabels}
                    onChange={(labels) => updateConfig({ colorLabels: labels })}
                  />
                </div>
              ) : (
                <div className="p-4">
                  <SubnetList
                    subnets={config.subnets}
                    colorLabels={config.colorLabels}
                    activeCidr={activeCidr}
                    onEdit={(subnet) => { setEditingSubnet(subnet); setIsNewSubnet(false); }}
                    onDelete={handleDeleteSubnet}
                    onSelect={(cidr) => { setActiveCidr(cidr); setSidebarTab("build"); }}
                  />
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Sidebar toggle */}
        <button
          className="absolute bottom-4 z-30 flex items-center justify-center w-5 h-8 rounded-r-md bg-card border border-l-0 border-border text-muted-foreground hover:text-foreground transition-colors"
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

// ─── Step Section ────────────────────────────────────────────────────────────

interface StepSectionProps {
  number: number;
  title: string;
  active: boolean;
  done: boolean;
  disabled?: boolean;
  hint?: string;
  children?: React.ReactNode;
}

function StepSection({ number, title, active, done, disabled, hint, children }: StepSectionProps) {
  return (
    <div className={cn("space-y-2", disabled && "opacity-40 pointer-events-none")}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
            done
              ? "bg-primary text-primary-foreground"
              : active
              ? "bg-primary/20 text-primary border border-primary/50"
              : "bg-muted text-muted-foreground border border-border",
          )}
        >
          {done ? <ChevronRight size={10} /> : number}
        </span>
        <span className={cn("text-xs font-semibold", active ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground")}>
          {title}
        </span>
      </div>
      {(active || done) && hint && !children && (
        <p className="text-xs text-muted-foreground leading-relaxed pl-7">{hint}</p>
      )}
      {(active || done) && children && (
        <div className="pl-7">{children}</div>
      )}
    </div>
  );
}

// ─── Welcome Screen ──────────────────────────────────────────────────────────

function WelcomeScreen({ onSelectPreset }: { onSelectPreset: (cidr: string) => void }) {
  const examples = [
    { cidr: "10.0.0.0/16", label: "Standard VPC", desc: "65K hosts · AWS/GCP default" },
    { cidr: "172.16.0.0/12", label: "RFC 1918 Large", desc: "1M hosts · private range" },
    { cidr: "100.64.0.0/10", label: "Carrier Grade NAT", desc: "4M hosts · RFC 6598" },
    { cidr: "192.168.0.0/24", label: "Small Office", desc: "254 hosts · home/SMB" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-3 max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto">
          <Hammer size={26} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          subnet<span className="text-primary">smith</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Visually carve IP address space into named, color-coded subnets. Start by picking a range below or enter one in the left panel.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {examples.map((ex) => (
          <button
            key={ex.cidr}
            className="group rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 p-4 text-left transition-all duration-150"
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
        or type a custom CIDR in the Build tab on the left
      </p>
    </div>
  );
}
