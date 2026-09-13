import { isAddress, keccak256, namehash, toHex } from "viem";

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
  | { kind: "invalid"; reason: string }
  | { kind: "empty" };

/// A single label per DNS/ENS convention: alphanumeric, optionally hyphenated in the middle, never
/// leading/trailing with a hyphen or empty (which `"a..b".split(".")` would otherwise produce).
const ENS_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function isValidEnsNameShape(name: string): boolean {
  const labels = name.split(".");
  return labels.every((label) => ENS_LABEL_PATTERN.test(label));
}

/// The search box's one rule, from task 33: `0x` + 40 hex is an address (a portfolio of names),
/// anything else is a name. An address still has to go through a reverse lookup before it can be
/// turned into a single `/ens/[name]` — that's a chain read, so it lives in `useReverseName`, not
/// here.
///
/// Anything that merely *looks* like an attempted address (`0x…`) or an attempted name but doesn't
/// match either shape is rejected as `"invalid"` rather than silently sent through as a name lookup
/// that could never resolve — the caller uses this to keep the submit control disabled.
export function parseSearchInput(input: string): SearchTarget {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  if (/^0x/i.test(trimmed)) {
    // `isAddress` accepts all-lowercase/all-uppercase without a checksum (a pasted mis-cased
    // address is still unambiguously an address) but rejects mixed case with a wrong checksum,
    // catching the typo instead of quietly routing to a name lookup that cannot resolve.
    return isAddress(trimmed)
      ? { kind: "address", address: trimmed.toLowerCase() as `0x${string}` }
      : { kind: "invalid", reason: "Not a valid address — expected 0x followed by 40 hex characters." };
  }
  const name = normalizeName(trimmed);
  if (!name) return { kind: "empty" };
  return isValidEnsNameShape(name)
    ? { kind: "name", name }
    : { kind: "invalid", reason: "Not a valid ENS name — use letters, numbers, hyphens and dots." };
}

export function ensPath(name: string): string {
  return `/ens/${encodeURIComponent(normalizeName(name))}`;
}

export function addressPath(address: string): string {
  return `/address/${address.toLowerCase()}`;
}
