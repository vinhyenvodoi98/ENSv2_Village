import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddressPortfolio } from "@/components/control/AddressPortfolio";

/// An **index** of the names an address currently owns — deliberately not a detail page for any of
/// them (task 33: the address is a portfolio). Each row links into `/ens/[name]`, which is where a
/// name's own state and controls live.
export async function generateMetadata(props: PageProps<"/address/[addr]">): Promise<Metadata> {
  const { addr } = await props.params;
  return {
    title: `${addr} — ENS control panel`,
    description: `The ENSv2 names ${addr} currently owns on this deployment.`,
  };
}

export default async function AddressPage(props: PageProps<"/address/[addr]">) {
  const { addr } = await props.params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) notFound();
  return <AddressPortfolio address={addr.toLowerCase() as `0x${string}`} />;
}
