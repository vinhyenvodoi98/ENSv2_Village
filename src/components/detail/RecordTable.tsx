"use client";

import { useMemo } from "react";
import { zeroAddress } from "viem";
import {
  namespaceKey,
  useAgentRecords,
  useKeyWriters,
  useRecordParent,
  useWildcardRecord,
  type NamespaceNode,
} from "@/lib/ens";
import { truncateAddress } from "@/lib/format";

const RECORD_KEYS = ["status", "heartbeat", "last-output", "agent.endpoint", "agent.model", "avatar"] as const;

type SourceKind = "own" | "inherited" | "wildcard";

const SOURCE_STYLE: Record<SourceKind, string> = {
  own: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  inherited: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  wildcard: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

function SourceBadge({ kind, label }: { kind: SourceKind; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[kind]}`}>{label}</span>;
}

/// Task 12's record table: key, value, and source — `own` / `inherited from <parent>` /
/// `wildcard` — visually distinguished, not just labeled in text. A `Wildcard`-tier agent has no
/// `AgentResolver` node of its own yet (task 07: only attached on promotion), so its records
/// come from `WildcardStateStore` instead — a third source, not a degenerate case of the other
/// two.
export function RecordTable({
  node,
  directory,
  resolverIndex,
}: {
  node: NamespaceNode;
  directory: Map<string, NamespaceNode>;
  resolverIndex: Map<string, `0x${string}`>;
}) {
  if (node.tier === "Wildcard") {
    return <WildcardRecordTable node={node} />;
  }
  return <OwnResolverRecordTable node={node} directory={directory} resolverIndex={resolverIndex} />;
}

function WildcardRecordTable({ node }: { node: NamespaceNode }) {
  const { data, isLoading, error } = useWildcardRecord(node.labelhash);

  return (
    <RecordTableShell isLoading={isLoading} error={error}>
      {data && (
        <>
          <Row keyName="agent.tier" value="wildcard" source={<SourceBadge kind="wildcard" label="wildcard" />} />
          <Row
            keyName="agent.status"
            value={data.status || "(empty)"}
            source={<SourceBadge kind="wildcard" label="wildcard" />}
          />
          <Row
            keyName="signing key"
            value={data.wildcardKey === zeroAddress ? "(unassigned)" : truncateAddress(data.wildcardKey)}
            source={<SourceBadge kind="wildcard" label="wildcard" />}
          />
        </>
      )}
    </RecordTableShell>
  );
}

function OwnResolverRecordTable({
  node,
  directory,
  resolverIndex,
}: {
  node: NamespaceNode;
  directory: Map<string, NamespaceNode>;
  resolverIndex: Map<string, `0x${string}`>;
}) {
  // Task 13: any key `grantKeyWriter` has ever touched for this node is a real, writable record
  // key too (`AgentResolver._checkWrite`'s "any other key" / OPERATOR bucket) — shown here in
  // addition to the six the resolver knows by name, so a task-13 delegation is actually
  // "verified in the record panel" once the delegate writes to it, not just in the matrix.
  const { data: keyWriters } = useKeyWriters(node.resolver, node.labelhash);
  const keys = useMemo(() => {
    const known = new Set<string>(RECORD_KEYS);
    const custom = new Set<string>();
    for (const grant of keyWriters ?? []) if (!known.has(grant.key)) custom.add(grant.key);
    return [...RECORD_KEYS, ...[...custom].sort()];
  }, [keyWriters]);

  const { data, isLoading, error } = useAgentRecords(node.labelhash, keys, node.resolver);
  const hasInherited = data ? Object.values(data.records).some((r) => r.inherited) : false;
  const { data: parentLink } = useRecordParent(node.resolver, hasInherited ? node.labelhash : undefined);

  const parentLabel = (() => {
    if (!parentLink?.isSet) return undefined;
    const registry = resolverIndex.get(parentLink.parentResolver.toLowerCase());
    if (!registry) return "parent (outside this tree)";
    const parentNode = directory.get(namespaceKey(registry, parentLink.parentNode));
    return parentNode?.fullName ?? "parent (outside this tree)";
  })();

  return (
    <RecordTableShell isLoading={isLoading} error={error}>
      {data && (
        <>
          <Row
            keyName="addr"
            value={data.addr === zeroAddress ? "(unset)" : truncateAddress(data.addr)}
            source={<SourceBadge kind="own" label="own" />}
          />
          {keys.map((key) => {
            const record = data.records[key];
            const empty = record.value === "";
            const isCustom = !(RECORD_KEYS as readonly string[]).includes(key);
            return (
              <Row
                key={key}
                keyName={isCustom ? `${key} (delegated)` : key}
                value={empty ? "(empty)" : record.value}
                source={
                  record.inherited ? (
                    <SourceBadge kind="inherited" label={`inherited from ${parentLabel ?? "…"}`} />
                  ) : (
                    <SourceBadge kind="own" label="own" />
                  )
                }
              />
            );
          })}
        </>
      )}
    </RecordTableShell>
  );
}

function RecordTableShell({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[.03] text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[.04] dark:text-zinc-400">
          <tr>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {isLoading && (
            <tr>
              <td colSpan={3} className="px-3 py-3 text-zinc-500 dark:text-zinc-400">
                Reading records…
              </td>
            </tr>
          )}
          {error && (
            <tr>
              <td colSpan={3} className="px-3 py-3 text-red-500">
                {error.message}
              </td>
            </tr>
          )}
          {children}
        </tbody>
      </table>
    </div>
  );
}

function Row({ keyName, value, source }: { keyName: string; value: string; source: React.ReactNode }) {
  return (
    <tr>
      <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">{keyName}</td>
      <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs">{value}</td>
      <td className="px-3 py-2">{source}</td>
    </tr>
  );
}
