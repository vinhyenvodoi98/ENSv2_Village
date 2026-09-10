"use client";

import { zeroAddress } from "viem";
import type { LocalWildcardAgent, NamespaceNode } from "@/lib/ens";
import { explorerAddressUrl } from "@/lib/explorer";
import { truncateAddress } from "@/lib/format";
import { TierBadge } from "@/components/tree/TierBadge";
import type { SelectedAgent } from "@/components/tree/AgentSubtree";
import { LifecycleActions } from "@/components/lifecycle/LifecycleActions";
import { SpawnAgentForm } from "@/components/lifecycle/SpawnAgentForm";
import { DelegatePanel } from "@/components/permissions/DelegatePanel";
import { EscalationButton } from "@/components/permissions/EscalationButton";
import { PermissionMatrix } from "@/components/permissions/PermissionMatrix";
import { EventTimeline } from "./EventTimeline";
import { LadderProgress } from "./LadderProgress";
import { RecordTable } from "./RecordTable";
import { SovereignChildren } from "./SovereignChildren";

/// Task 12's detail panel: "the complete truth about one agent". Slides in from the right over
/// the tree (task 11) rather than replacing it, so clicking between agents never loses the
/// tree's scroll position or pulse animations.
export function AgentDetailPanel({
  node,
  directory,
  resolverIndex,
  onClose,
  onSelectChild,
  onSpawnedLocally,
  readOnly,
}: {
  node: NamespaceNode | null;
  directory: Map<string, NamespaceNode>;
  resolverIndex: Map<string, `0x${string}`>;
  onClose: () => void;
  onSelectChild: (agent: SelectedAgent) => void;
  /// Task 29: spawning a child *from the selected agent* lives in this panel, so the parent is
  /// never ambiguous. Omit to hide the section (e.g. a read-only embedding).
  onSpawnedLocally?: (agent: LocalWildcardAgent) => void;
  /// Task 31's showcase-kingdom viewer: every write control below (lifecycle actions,
  /// permissions) is disabled with a visible reason rather than silently missing — a viewer
  /// must never discover this isn't their kingdom only when a click does nothing.
  readOnly?: boolean;
}) {
  return (
    <>
      {node && (
        <button
          type="button"
          aria-label="Close agent detail panel"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-black/10 bg-white shadow-2xl transition-transform duration-200 dark:border-white/10 dark:bg-zinc-950",
          node ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {node && (
          <div className="flex flex-col gap-6 p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-2">
                <h2 className="break-all font-mono text-lg font-semibold">{node.fullName}</h2>
                <div className="flex items-center gap-2">
                  <TierBadge tier={node.tier} />
                  {node.revoked && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      revoked
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1 text-zinc-400 hover:bg-black/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">Owner</dt>
              <dd>
                <a
                  href={explorerAddressUrl(node.owner)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs hover:underline"
                >
                  {truncateAddress(node.owner)} ↗
                </a>
              </dd>

              <dt className="text-zinc-500 dark:text-zinc-400">Agent key</dt>
              <dd className="flex flex-col">
                <a
                  href={explorerAddressUrl(node.agentKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs hover:underline"
                >
                  {truncateAddress(node.agentKey)} ↗
                </a>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">the agent&apos;s own wallet — never the owner&apos;s</span>
              </dd>
            </dl>

            <Section title="Ownership ladder">
              <LadderProgress node={node} />
            </Section>

            {readOnly && (
              <p className="rounded-md border border-red-400/40 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300">
                Read-only — you don&apos;t own this kingdom, so nothing below can be changed.
              </p>
            )}

            <div className={readOnly ? "pointer-events-none opacity-50" : undefined}>
              <Section title="Lifecycle">
                <LifecycleActions node={node} />
              </Section>
            </div>

            {onSpawnedLocally && !readOnly && (
              <Section title="Spawn child agent">
                {/* Sits directly under "Lifecycle" on purpose: when this agent
                    isn't Sovereign yet the form blocks and points at promote,
                    which is the control immediately above. */}
                <SpawnAgentForm parent={node} onSpawnedLocally={onSpawnedLocally} />
              </Section>
            )}

            <Section title="Records">
              <RecordTable node={node} directory={directory} resolverIndex={resolverIndex} />
            </Section>

            {!node.isLocalPreview && node.resolver !== zeroAddress && (
              <div className={readOnly ? "pointer-events-none opacity-50" : undefined}>
                <Section title="Permissions (EACL)">
                  <PermissionMatrix node={node} />
                  <EscalationButton node={node} />
                  <DelegatePanel node={node} />
                </Section>
              </div>
            )}

            {node.tier === "Sovereign" && (
              <Section title="Sub-registry & child agents">
                <SovereignChildren node={node} onSelectChild={onSelectChild} />
              </Section>
            )}

            <Section title="Event timeline">
              <EventTimeline labelhash={node.labelhash} registry={node.registry} />
            </Section>
          </div>
        )}
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}
