"use client";

import { useState, useEffect, useCallback } from "react";
import { nanoid } from "nanoid";
import {
  SubnetSmithConfig,
  SubnetEntry,
  ColorLabel,
  DEFAULT_COLOR_LABELS,
} from "@/lib/types";
import {
  normalizeCidr,
  getSubnetInfo,
  decodeConfig,
  encodeConfig,
  cidrContains,
} from "@/lib/subnet";
import { Toolbar } from "@/components/Toolbar";
import { CidrInput } from "@/components/CidrInput";
import { SubnetCanvas } from "@/components/SubnetCanvas";
import { ColorLabelManager } from "@/components/ColorLabelManager";
import { SubnetList } from "@/components/SubnetList";
import { cn } from "@/lib/utils";
import { Tag, List, LayoutGrid, X, ChevronLeft } from "lucide-react";

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "subnetsmith-v3";

function makeDefault(): SubnetSmithConfig {
  return {
    id: nanoid(),
    name: "My Network",
    rootCidr: "",
    subnets: [],
    colorLabels: DEFAULT_COLOR_LABELS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function load(): SubnetSmithConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SubnetSmithConfig) : null;
  } catch {
    return null;
  }
}

function save(config: SubnetSmithConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "canvas" | "labels" | "list";

export default function Page() {
  const [config, setConfig] = useState<SubnetSmithConfig>(makeDefault);
  const [hydrated, setHydrated] = useState(false);
  // Breadcrumb stack: first element is rootCidr, last is current scope
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("canvas");

  // Hydrate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("config");
    if (encoded) {
      const decoded = decodeConfig(encoded) as SubnetSmithConfig | null;
      if (decoded?.rootCidr) {
        setConfig(decoded);
        setBreadcrumbs([decoded.rootCidr]);
        setHydrated(true);
        return;
      }
    }
    const stored = load();
    if (stored) {
      setConfig(stored);
      if (stored.rootCidr) setBreadcrumbs([stored.rootCidr]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(config);
  }, [config, hydrated]);

  const update = useCallback(
    (partial: Partial<SubnetSmithConfig>) =>
      setConfig((prev) => ({
        ...prev,
        ...partial,
        updatedAt: new Date().toISOString(),
      })),
    [],
  );

  // ── Root CIDR set ──────────────────────────────────────────────────────────

  const handleRootCidr = (cidr: string) => {
    const norm = normalizeCidr(cidr);
    if (!norm) return;
    update({ rootCidr: norm, subnets: [] });
    setBreadcrumbs([norm]);
  };

  // ── Drill-down navigation ──────────────────────────────────────────────────

  const activeCidr = breadcrumbs[breadcrumbs.length - 1] ?? config.rootCidr;

  const drillDown = (cidr: string) => {
    setBreadcrumbs((prev) => [...prev, cidr]);
    setTab("canvas");
  };

  const navigateTo = (cidr: string) => {
    setBreadcrumbs((prev) => {
      const idx = prev.indexOf(cidr);
      return idx >= 0 ? prev.slice(0, idx + 1) : prev;
    });
  };

  const goBack = () => {
    setBreadcrumbs((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  // ── Subnet CRUD ────────────────────────────────────────────────────────────

  const addSubnet = (subnet: SubnetEntry) => {
    update({ subnets: [...config.subnets, subnet] });
  };

  const updateSubnet = (id: string, patch: Partial<SubnetEntry>) => {
    update({
      subnets: config.subnets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const deleteSubnet = (id: string) => {
    const target = config.subnets.find((s) => s.id === id);
    if (!target) return;
    const targetInfo = getSubnetInfo(target.cidr);
    // Cascade delete: remove the subnet and all subnets nested within it
    update({
      subnets: config.subnets.filter((s) => {
        if (s.id === id) return false;
        const si = getSubnetInfo(s.cidr);
        if (!si || !targetInfo) return true;
        return !(
          si.networkInt >= targetInfo.networkInt &&
          si.broadcastInt <= targetInfo.broadcastInt
        );
      }),
    });
    // If we were drilled into the deleted subnet, pop back
    setBreadcrumbs((prev) => {
      const idx = prev.indexOf(target.cidr);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasRoot = !!config.rootCidr;
  const isDeep = breadcrumbs.length > 1;

  // Subnets that are visible in the list tab (within active scope)
  const scopedSubnets = config.subnets.filter((s) => {
    if (!activeCidr) return false;
    return cidrContains(activeCidr, s.cidr);
  });

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Toolbar */}
      <Toolbar
        config={config}
        onNameChange={(name) => update({ name })}
        onImport={(imported) => {
          setConfig({ ...imported, id: nanoid() });
          setBreadcrumbs(imported.rootCidr ? [imported.rootCidr] : []);
        }}
        onClear={() => {
          update({ subnets: [] });
          setBreadcrumbs(config.rootCidr ? [config.rootCidr] : []);
        }}
      />

      {!hasRoot ? (
        /* ── No root set: show CIDR entry ───────────────────────────────────── */
        <CidrInput onConfirm={handleRootCidr} />
      ) : (
        /* ── Main workspace ─────────────────────────────────────────────────── */
        <div className="flex flex-1 overflow-hidden">
          {/* Slim left nav */}
          <nav className="w-11 shrink-0 flex flex-col items-center border-r border-border bg-card pt-3 gap-1">
            {(
              [
                { id: "canvas" as Tab, icon: LayoutGrid, label: "Subnet Map" },
                { id: "labels" as Tab, icon: Tag,         label: "Labels"     },
                { id: "list"   as Tab, icon: List,         label: "All Subnets"},
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                title={t.label}
                onClick={() => setTab(t.id)}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                  tab === t.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <t.icon size={14} />
              </button>
            ))}

            {/* Change root CIDR button */}
            <div className="flex-1" />
            <button
              title="Change root CIDR"
              onClick={() => {
                update({ rootCidr: "", subnets: [] });
                setBreadcrumbs([]);
              }}
              className="w-7 h-7 mb-3 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </nav>

          {/* Main content */}
          <div className="flex flex-1 overflow-hidden flex-col">
            {tab === "canvas" && (
              <>
                {/* Back button when drilled in */}
                {isDeep && (
                  <div className="flex items-center gap-2 px-5 pt-3 pb-0 shrink-0">
                    <button
                      onClick={goBack}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                    >
                      <ChevronLeft
                        size={13}
                        className="group-hover:-translate-x-0.5 transition-transform"
                      />
                      Back to{" "}
                      <span className="font-mono">
                        {breadcrumbs[breadcrumbs.length - 2]}
                      </span>
                    </button>
                  </div>
                )}

                <SubnetCanvas
                  rootCidr={activeCidr}
                  allSubnets={config.subnets}
                  colorLabels={config.colorLabels}
                  breadcrumbs={breadcrumbs}
                  onAddSubnet={addSubnet}
                  onUpdateSubnet={updateSubnet}
                  onDeleteSubnet={deleteSubnet}
                  onDrillDown={drillDown}
                />
              </>
            )}

            {tab === "labels" && (
              <div className="p-6 max-w-md">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">
                  Color Labels
                </h2>
                <p className="text-xs text-muted-foreground mb-5">
                  Assign labels to subnets to group them by purpose or environment.
                </p>
                <ColorLabelManager
                  colorLabels={config.colorLabels}
                  onChange={(labels) => update({ colorLabels: labels })}
                />
              </div>
            )}

            {tab === "list" && (
              <div className="p-6 max-w-2xl">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">
                  All Subnets
                </h2>
                <p className="text-xs text-muted-foreground mb-5">
                  {scopedSubnets.length} subnet{scopedSubnets.length !== 1 ? "s" : ""} within{" "}
                  <span className="font-mono text-foreground">{activeCidr}</span>
                </p>
                <SubnetList
                  subnets={scopedSubnets}
                  colorLabels={config.colorLabels}
                  activeCidr={activeCidr}
                  onEdit={(subnet) => {
                    setTab("canvas");
                  }}
                  onDelete={deleteSubnet}
                  onSelect={(cidr) => {
                    drillDown(cidr);
                    setTab("canvas");
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
