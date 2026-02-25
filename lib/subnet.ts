/**
 * Netslice — Subnet Math Utilities
 * Pure functions for CIDR parsing, splitting, and IP math.
 */

export interface SubnetInfo {
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
  prefix: number;
  networkInt: number;
  broadcastInt: number;
}

/** Convert dotted-decimal IP to 32-bit integer */
export function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

/** Convert 32-bit integer to dotted-decimal IP */
export function intToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

/** Parse a CIDR string like "10.0.0.0/16" into base IP and prefix length */
export function parseCidr(cidr: string): { ip: string; prefix: number } | null {
  const match = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!match) return null;
  const ip = match[1];
  const prefix = parseInt(match[2], 10);
  if (prefix < 0 || prefix > 32) return null;
  const octets = ip.split(".").map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return { ip, prefix };
}

/** Normalize a CIDR to its network address (e.g. 10.0.1.5/16 -> 10.0.0.0/16) */
export function normalizeCidr(cidr: string): string | null {
  const parsed = parseCidr(cidr);
  if (!parsed) return null;
  const mask = parsed.prefix === 0 ? 0 : (0xffffffff << (32 - parsed.prefix)) >>> 0;
  const networkInt = (ipToInt(parsed.ip) & mask) >>> 0;
  return `${intToIp(networkInt)}/${parsed.prefix}`;
}

/** Get full subnet info for a CIDR block */
export function getSubnetInfo(cidr: string): SubnetInfo | null {
  const parsed = parseCidr(cidr);
  if (!parsed) return null;
  const mask = parsed.prefix === 0 ? 0 : (0xffffffff << (32 - parsed.prefix)) >>> 0;
  const networkInt = (ipToInt(parsed.ip) & mask) >>> 0;
  const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;
  const totalHosts = Math.pow(2, 32 - parsed.prefix);
  const usableHosts = parsed.prefix >= 31 ? totalHosts : Math.max(0, totalHosts - 2);
  const normalizedCidr = `${intToIp(networkInt)}/${parsed.prefix}`;
  return {
    cidr: normalizedCidr,
    networkAddress: intToIp(networkInt),
    broadcastAddress: intToIp(broadcastInt),
    firstHost: parsed.prefix >= 31 ? intToIp(networkInt) : intToIp(networkInt + 1),
    lastHost: parsed.prefix >= 31 ? intToIp(broadcastInt) : intToIp(broadcastInt - 1),
    totalHosts,
    usableHosts,
    prefix: parsed.prefix,
    networkInt,
    broadcastInt,
  };
}

/** Get valid subnet sizes that fit within a parent CIDR (child prefix > parent prefix) */
export function getValidChildPrefixes(parentPrefix: number): number[] {
  const result: number[] = [];
  for (let p = parentPrefix + 1; p <= 32; p++) {
    result.push(p);
  }
  return result;
}

/**
 * Split a parent CIDR into equal-sized slots of `childPrefix` bits.
 * Returns the CIDR string for each slot.
 */
export function splitCidr(parentCidr: string, childPrefix: number): string[] {
  const info = getSubnetInfo(parentCidr);
  if (!info) return [];
  if (childPrefix <= info.prefix || childPrefix > 32) return [];
  const count = Math.pow(2, childPrefix - info.prefix);
  const blockSize = Math.pow(2, 32 - childPrefix);
  const slots: string[] = [];
  for (let i = 0; i < count; i++) {
    const networkInt = (info.networkInt + i * blockSize) >>> 0;
    slots.push(`${intToIp(networkInt)}/${childPrefix}`);
  }
  return slots;
}

/** Human-readable host count label */
export function formatHostCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

/** Subnet size label like /24 = "256 hosts" */
export function subnetSizeLabel(prefix: number): string {
  const hosts = Math.pow(2, 32 - prefix);
  return formatHostCount(hosts);
}

/** Check if a child CIDR is contained within a parent CIDR */
export function cidrContains(parentCidr: string, childCidr: string): boolean {
  const parent = getSubnetInfo(parentCidr);
  const child = getSubnetInfo(childCidr);
  if (!parent || !child) return false;
  return child.networkInt >= parent.networkInt && child.broadcastInt <= parent.broadcastInt;
}

/** Check if two CIDR blocks overlap */
export function cidrsOverlap(a: string, b: string): boolean {
  const ai = getSubnetInfo(a);
  const bi = getSubnetInfo(b);
  if (!ai || !bi) return false;
  return ai.networkInt <= bi.broadcastInt && bi.networkInt <= ai.broadcastInt;
}

/** Encode config to base64url for shareable link */
export function encodeConfig(config: unknown): string {
  try {
    const json = JSON.stringify(config);
    return btoa(encodeURIComponent(json))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch {
    return "";
  }
}

/** Decode config from base64url */
export function decodeConfig(encoded: string): unknown | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(atob(padded));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
