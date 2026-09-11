import type { Metadata } from "next";
import { NameWorldPanel } from "@/components/control/NameWorldPanel";
import { normalizeName } from "@/lib/ens/name";

/// The canonical route for one ENSv2 name. Settled in task 33's routing design: **the name is the
/// entity, the address is a portfolio** — `expiry`, `resolver`, `subregistry` and every role are
/// keyed by label inside a registry, and a name's owner can change by transfer, so an address-keyed
/// URL for a name breaks the moment it is sold. A whole dotted name (`sub.agentvillage.eth`) fits in
/// the one dynamic segment; the read layer splits it into labels itself.
export async function generateMetadata(props: PageProps<"/ens/[name]">): Promise<Metadata> {
  const { name } = await props.params;
  const normalized = normalizeName(decodeURIComponent(name));
  return {
    title: `${normalized} — ENS control panel`,
    description: `Owner, expiry, resolver, subregistry and your roles for ${normalized}, read live from the ENSv2 registry.`,
  };
}

export default async function EnsNamePage(props: PageProps<"/ens/[name]">) {
  const { name } = await props.params;
  return <NameWorldPanel name={normalizeName(decodeURIComponent(name))} />;
}
