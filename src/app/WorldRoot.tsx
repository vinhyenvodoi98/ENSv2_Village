"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { zeroAddress } from "viem";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { ControlPanelWorldShell } from "@/components/control/ControlPanelWorldShell";
import { NameChildDetail, NameStateDetail } from "@/components/control/NameStateDetail";
import { Panel } from "@/components/control/Panel";
import { ActionButton } from "@/components/control/ui/ActionButton";
import { useNameTab } from "@/components/control/useNameTab";
import { WorldDetailPanel } from "@/components/control/WorldDetailPanel";
import { ClaimNameWizard } from "@/components/onboarding/ClaimNameWizard";
import { ScanLoadingModal } from "@/components/shared/ScanLoadingModal";
import { hasStoredClaim } from "@/lib/ens/useClaimName";
import { useEnsAvatars } from "@/lib/ens/useEnsAvatars";
import { useEnsName } from "@/lib/ens/useEnsName";
import { subnameRegistryOf, useNameChildren, type EnsChildName } from "@/lib/ens/useNameChildren";
import { useOwnedEthNames, useOwnedNamesScanProgress, type OwnedEthName } from "@/lib/ens/useOwnedEthNames";
import { usePortfolioSubnames } from "@/lib/ens/usePortfolioSubnames";
import { truncateAddress } from "@/lib/format";
import { createPortfolioFortressSource } from "@/world/adapters/ensControlWorldSource";
import type { RegisterMountainState } from "@/world/components/Register/RegisterMountainScenery";
import { WORLD_RADIUS } from "@/world/config/world.config";
import { selectSelectedFortressId } from "@/world/state/selectors";
import { useWorldStore } from "@/world/state/useWorldStore";
import { BuildBar } from "@/world/ui/BuildBar";

const WorldCanvas = dynamic(
  () => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas),
  { ssr: false }
);

/// `ETHRegistry.getStatus`'s `Status.REGISTERED` — the only status `useOwnedEthNames` should ever
/// hand back for a name that's actually still owned, but re-checked here rather than assumed, same
/// convention `AddressWorldPanel` uses.
const STATUS_REGISTERED = 2;

/// Client-only snapshots used below have nothing to subscribe to, so this tells
/// `useSyncExternalStore` there is no external event source to register.
function noopSubscribe(): () => void {
  return () => {};
}

/**
 * `/` used to render the fleet's own `AgentRegistry` namespace tree (task 29) with a bespoke chrome
 * of its own. This is the redesign: root shows the connected wallet's own `.eth` portfolio, drawn
 * on the identical map + identical slide-in drawer `/ens/[name]` renders for any other name — one
 * castle per name owned, ringed with nothing (a portfolio has no hierarchy between its entries,
 * same as `/address/[addr]`), and clicking one opens the exact same tabbed `NameStateDetail` a
 * castle at `/ens/[name]` opens. "Your kingdom" is no longer a special mode with its own detail
 * panel and its own empty-state wizardry; it's `ControlPanelWorldShell` with `address` defaulted to
 * whichever wallet is connected.
 *
 * Dropped along with the old chrome: the dev-only `DebugPanel`/perf HUD (still lives at
 * `/threejs`, the sandbox that's actually for iterating on the engine) and the preset switcher —
 * neither belongs on the screen a wallet owner actually operates their names from.
 */
export default function WorldRoot() {
  const { address, isConnected, chainId, status: connectionStatus } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const hasMounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isRestoringWallet =
    !hasMounted || connectionStatus === "connecting" || connectionStatus === "reconnecting";
  const isWrongNetwork = isConnected && chainId !== sepolia.id;

  // With wagmi's SSR-safe mode, the first browser render intentionally matches the server
  // snapshot. Its mount effect then restores the persisted connector. Keep the world visible
  // during that short bootstrap instead of flashing a false "Connect your wallet" panel.
  // Same `undefined` = "hasn't answered yet" convention `useOwnedEthNames` establishes everywhere
  // else it's read (task 31) — collapsing that into `[]` is what used to make a wallet's own
  // castle flash away mid-scan.
  const { data: names, isError: namesError, refetch: refetchNames } = useOwnedEthNames(address);
  const isScanning = isConnected && !isWrongNetwork && !namesError && names === undefined;
  const scanProgress = useOwnedNamesScanProgress(address);

  // Level-1 subnames of every owned name, scanned once names is known — the root map's own castles
  // ring outward one more hop, same as `/ens/[name]`'s subject does for its own children.
  const { data: subnamesByName } = usePortfolioSubnames(names);

  const avatarNames = useMemo(() => {
    const owned = names?.map((n) => n.name) ?? [];
    const children = [...(subnamesByName?.values() ?? [])].flatMap((list) => list.map((c) => c.fullName));
    return [...owned, ...children];
  }, [names, subnamesByName]);
  const { data: avatarsByName } = useEnsAvatars(avatarNames);

  const setMode = useWorldStore((state) => state.setMode);
  const syncFortresses = useWorldStore((state) => state.syncFortressesFromEns);
  const selectFortress = useWorldStore((state) => state.selectFortress);
  const selectedFortressId = useWorldStore(selectSelectedFortressId);

  const [claimOpen, setClaimOpen] = useState(false);
  const [tab, setTab] = useNameTab();

  // `useSyncExternalStore` re-reads `hasStoredClaim` on every commit (a re-render triggered by,
  // say, `setClaimOpen(false)` after a successful register is enough — no subscription needed for
  // that), and its server snapshot (`false`, matching `hasStoredClaim`'s own SSR guard) keeps the
  // first client render identical to the server-rendered markup so hydration never mismatches.
  const pendingClaim = useSyncExternalStore(
    noopSubscribe,
    () => hasStoredClaim(chainId, address),
    () => false
  );

  // Same "control panel" mode `/ens/[name]` and `/address/[addr]` set (BuildBar's read-mostly
  // hint, no spawn/build affordance) — root is no longer a separate mode with its own hint copy.
  useEffect(() => {
    setMode("control-panel");
    return () => setMode("ens");
  }, [setMode]);

  // One castle per name owned, scattered with no hierarchy between them — literally
  // `createPortfolioFortressSource`, the adapter `/address/[addr]` already uses for exactly this
  // shape of data (task 33's "the address is a portfolio").
  const fortressPlan = useMemo(() => {
    if (!names) return { fortresses: [], worldRadius: WORLD_RADIUS };
    const source = createPortfolioFortressSource(
      names.map((owned) => ({
        ensKey: `0x${owned.tokenId.toString(16)}`,
        label: owned.label,
        fullName: owned.name,
        derelict: owned.status !== STATUS_REGISTERED,
        children: (subnamesByName?.get(owned.name) ?? []).map((child) => ({
          ensKey: child.ensKey,
          label: child.label,
          fullName: child.fullName,
          hasResolver: !!child.resolver && child.resolver !== zeroAddress,
          hasSubregistry: !!child.subregistry && child.subregistry !== zeroAddress,
          derelict: child.status !== "registered",
        })),
      })),
      avatarsByName
    );
    return { fortresses: source.loadFortresses(), worldRadius: source.requiredWorldRadius() };
  }, [names, subnamesByName, avatarsByName]);

  useEffect(() => {
    syncFortresses(fortressPlan.fortresses, fortressPlan.worldRadius);
  }, [fortressPlan, syncFortresses]);

  const byKey = useMemo(() => {
    const map = new Map<string, OwnedEthName>();
    for (const owned of names ?? []) map.set(`0x${owned.tokenId.toString(16)}`, owned);
    return map;
  }, [names]);

  const selectedOwned = selectedFortressId ? (byKey.get(selectedFortressId) ?? null) : null;

  // Subname castles ringed around each owned name are only ever this shallow read-only card — same
  // "no `useEnsName` per castle" scope `NameWorldPanel` applies to its own children, here spread
  // across every owned name instead of one subject.
  const childByKey = useMemo(() => {
    const map = new Map<string, EnsChildName>();
    for (const children of subnamesByName?.values() ?? []) {
      for (const child of children) map.set(child.ensKey, child);
    }
    return map;
  }, [subnamesByName]);
  const selectedChild = !selectedOwned && selectedFortressId ? (childByKey.get(selectedFortressId) ?? null) : null;

  const closePanel = () => selectFortress(null);

  // Full read (roles, subnames, records…) only for whichever castle is actually clicked — same
  // "mount on demand" rule task 39 applied inside the drawer applies here one level up: with
  // several castles on the map, fetching every one of them up front would be exactly the
  // all-at-once-mount defect task 39 fixed, just moved from tabs to castles.
  const { data: state, isPending: isNamePending, isError: isNameError, error: nameError } = useEnsName(
    selectedOwned?.name ?? null
  );
  const isStale = !!state && state.name !== selectedOwned?.name;
  const resolvedState = isStale ? undefined : state;

  const { data: subnamesResult } = useNameChildren(resolvedState);
  const scanTarget = subnameRegistryOf(resolvedState);
  const subnames = subnamesResult?.registry === scanTarget ? subnamesResult : undefined;

  const detailAvatarNames = useMemo(
    () =>
      resolvedState
        ? [resolvedState.name, ...(subnames?.children.map((child) => child.fullName) ?? [])]
        : [],
    [resolvedState, subnames]
  );
  const { data: detailAvatarsByName } = useEnsAvatars(detailAvatarNames);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (claimOpen) setClaimOpen(false);
      else selectFortress(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [claimOpen, selectFortress]);

  const handleConnect = () => {
    const connector = connectors[0];
    if (connector) connect({ connector });
  };

  // Every branch has a defined behavior — no branch clicks out to silence — per task 40's state
  // table: disconnected/wrong-network route into the same connect/switch flows the empty-state
  // panel above already uses, scanning is inert, a stored pledge reopens the wizard mid-flow (it
  // recovers its own step from localStorage), and the normal case opens a fresh claim.
  const mountainState: RegisterMountainState = !isConnected
    ? { dormant: true, disabled: false, pending: false, ariaLabel: "Register new ENSv2 — connect a wallet first", caption: "Connect a wallet first" }
    : isWrongNetwork
      ? { dormant: true, disabled: false, pending: false, ariaLabel: "Register new ENSv2 — switch to Sepolia", caption: "Switch to Sepolia" }
      : isScanning
        ? { dormant: true, disabled: true, pending: false, ariaLabel: "Register new ENSv2 — scanning your names", caption: "Scanning your names…" }
        : pendingClaim
          ? { dormant: false, disabled: false, pending: true, ariaLabel: "Register new ENSv2 — a pledge is waiting, finish it", caption: "A pledge is waiting — finish it" }
          : { dormant: false, disabled: false, pending: false, ariaLabel: "Register new ENSv2 — claim another name", caption: "Claim another name" };

  const handleMountainClick = () => {
    if (!isConnected) {
      handleConnect();
      return;
    }
    if (isWrongNetwork) {
      switchChain({ chainId: sepolia.id });
      return;
    }
    if (isScanning) return;
    setClaimOpen(true);
  };

  return (
    <ControlPanelWorldShell showBackToWorld={false}>
      <WorldCanvas registerMountain={{ state: mountainState, onClick: handleMountainClick }} />
      <BuildBar />

      {!isConnected && !isRestoringWallet ? (
        <CenteredMessage>
          <Panel title="Connect your wallet" subtitle="See every .eth name you own as a castle on this map">
            <ActionButton label={isConnecting ? "Connecting…" : "Connect wallet"} enabled={!isConnecting} onClick={handleConnect} tone="primary" />
          </Panel>
        </CenteredMessage>
      ) : isWrongNetwork ? (
        <CenteredMessage>
          <Panel title="Wrong network">
            <p className="mb-3 text-sm text-white/60">This deployment reads Sepolia — switch networks to see your names.</p>
            <ActionButton
              label={isSwitching ? "Switching…" : "Switch to Sepolia"}
              enabled={!isSwitching}
              onClick={() => switchChain({ chainId: sepolia.id })}
              tone="primary"
            />
          </Panel>
        </CenteredMessage>
      ) : namesError ? (
        <CenteredMessage>
          <Panel title="Couldn't read your names">
            <p className="mb-3 text-sm text-red-300">The registrar read failed.</p>
            <ActionButton label="Retry" enabled onClick={() => refetchNames()} />
          </Panel>
        </CenteredMessage>
      ) : !isScanning && names?.length === 0 ? (
        <CenteredMessage>
          <Panel
            title="No names yet"
            subtitle={`${address ? truncateAddress(address) : "This wallet"} doesn't own a .eth name on this deployment`}
          >
            <ActionButton label="Claim a name" enabled onClick={() => setClaimOpen(true)} tone="primary" />
          </Panel>
        </CenteredMessage>
      ) : null}

      <ScanLoadingModal
        active={isScanning}
        progress={scanProgress}
        copy={{
          title: "Looking for your land",
          subject: address ? truncateAddress(address) : "",
          scanning: "Scanning .eth registrations",
          verifying: (found) => `Checking which of ${found} name${found === 1 ? "" : "s"} is yours`,
          hint: "ENSv2 has no owner index — every registration is replayed from registrar history, then ownership is checked on-chain.",
          slowHint:
            "The registrar has a long history on this deployment, so the scan runs in several passes. The map below stays usable.",
          chip: "Looking for your land",
          count: (found) => `${found} registrations seen`,
        }}
      />

      <WorldDetailPanel
        open={!!selectedOwned || !!selectedChild}
        onClose={closePanel}
        wide={!!selectedOwned && tab === "permissions"}
      >
        {selectedOwned ? (
          isNameError ? (
            <CenteredMessage>
              <Panel title="Could not read this name">
                <p className="text-sm text-red-300">{nameError?.message ?? "The registry read failed."}</p>
              </Panel>
            </CenteredMessage>
          ) : isNamePending || !resolvedState ? (
            <CenteredMessage>
              <Panel title="Resolving">
                <p className="text-sm text-white/40">Walking the registries for {selectedOwned.name}…</p>
              </Panel>
            </CenteredMessage>
          ) : (
            <NameStateDetail
              state={resolvedState}
              subnames={subnames}
              avatar={detailAvatarsByName?.[resolvedState.name]}
              tab={tab}
              onTabChange={setTab}
              targetFortressId={selectedOwned ? `0x${selectedOwned.tokenId.toString(16)}` : ""}
            />
          )
        ) : selectedChild ? (
          <NameChildDetail child={selectedChild} />
        ) : null}
      </WorldDetailPanel>

      <ClaimNameWizard
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        onClaimed={() => {
          refetchNames();
          setClaimOpen(false);
        }}
      />
    </ControlPanelWorldShell>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-md">{children}</div>
    </div>
  );
}
