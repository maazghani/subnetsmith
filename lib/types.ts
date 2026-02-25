/**
 * SubnetSmith — Shared Type Definitions
 */

export interface ColorLabel {
  id: string;
  label: string;
  color: string; // hex
}

export interface SubnetEntry {
  id: string;
  cidr: string;
  name: string;
  colorLabelId: string | null; // references ColorLabel.id
  parentCidr: string; // the CIDR block this was carved from
  notes?: string;
}

export interface CidrBlock {
  cidr: string;
  subnets: SubnetEntry[];
  /** Child CIDR blocks carved from this block */
  children: CidrBlock[];
}

export interface SubnetSmithConfig {
  id: string;
  name: string;
  rootCidr: string;
  subnets: SubnetEntry[];
  colorLabels: ColorLabel[];
  createdAt: string;
  updatedAt: string;
}

/** @deprecated use SubnetSmithConfig */
export type CleftConfig = SubnetSmithConfig;
/** @deprecated use SubnetSmithConfig */
export type NetsliceConfig = SubnetSmithConfig;

export const DEFAULT_COLOR_LABELS: ColorLabel[] = [
  { id: "pub", label: "Public", color: "#22d3ee" },
  { id: "priv", label: "Private", color: "#34d399" },
  { id: "mgmt", label: "Management", color: "#a78bfa" },
  { id: "db", label: "Database", color: "#f59e0b" },
  { id: "dmz", label: "DMZ", color: "#f87171" },
];

export const PRESET_COLORS = [
  "#22d3ee", // cyan
  "#34d399", // emerald
  "#a78bfa", // violet
  "#f59e0b", // amber
  "#f87171", // rose
  "#60a5fa", // blue
  "#fb923c", // orange
  "#a3e635", // lime
  "#e879f9", // fuchsia
  "#2dd4bf", // teal
];
