import { keccak256, namehash, toHex } from "viem";

/// Pure name/address parsing for the control panel — no wagmi, no React, no chain reads, so the
/// routing rules in task 33 ("the name is the entity, the address is a portfolio") can be reasoned
/// about on their own.

/// ENSv2 keys a name's expiry, resolver, subregistry and every role by *label* inside its parent
/// registry — `LibLabel.id(label) == uint256(keccak256(bytes(label)))`. This is a plain labelhash,
/// not a namehash: the registry never sees the full name.
export function labelhash(label: string): bigint {
  return BigInt(keccak256(toHex(label)));
}

/// ENSIP-1 namehash of the full name — what a *resolver* keys its records (and its EACL resources)
/// by, as opposed to the registry's per-label ids.
export function nameNode(name: string): `0x${string}` {
  return namehash(name);
}

/// Lowercases and strips the stray dots/whitespace a pasted or hand-typed name arrives with. This
/// is deliberately *not* UTS-46 normalization (`ens-normalize`): the control panel resolves what
/// the user typed and shows a "not registered" state when nothing is there, rather than silently
/// rewriting their input into a different name than the one they asked about.
export function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

/// Labels leaf-first, the order a registry walk needs them reversed from: `a.b.eth` → `["a","b","eth"]`.
export function splitLabels(name: string): string[] {
  const normalized = normalizeName(name);
  return normalized ? normalized.split(".") : [];
}

export function parentName(name: string): string {
  return splitLabels(name).slice(1).join(".");
}

export function leafLabel(name: string): string {
  return splitLabels(name)[0] ?? "";
}

export type SearchTarget =
  | { kind: "address"; address: `0x${string}` }
  | { kind: "name"; name: string }
  | { kind: "empty" };

/// The search box's one rule, from task 33: `0x` + 40 hex is an address (a portfolio of names),
/// anything else is a name. An address still has to go through a reverse lookup before it can be
/// turned into a single `/ens/[name]` — that's a chain read, so it lives in `useReverseName`, not
/// here.
export function parseSearchInput(input: string): SearchTarget {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  // Matched on shape alone, not on EIP-55 checksum: a pasted all-lowercase or mis-cased address
  // is still unambiguously an address, and refusing it would only send the user to a name lookup
  // that cannot possibly resolve.
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { kind: "address", address: trimmed.toLowerCase() as `0x${string}` };
  }
  const name = normalizeName(trimmed);
  return name ? { kind: "name", name } : { kind: "empty" };
}

export function ensPath(name: string): string {
  return `/ens/${encodeURIComponent(normalizeName(name))}`;
}

export function addressPath(address: string): string {
  return `/address/${address.toLowerCase()}`;
}
