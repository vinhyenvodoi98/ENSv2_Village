import type { Metadata } from "next";
import { ControlPanelLanding } from "@/components/control/ControlPanelLanding";

export const metadata: Metadata = {
  title: "ENS control panel",
  description: "Open any ENSv2 name and operate it: owner, expiry, resolver, subregistry and your roles.",
};

/// The way into the control panel when you don't have a name in the URL yet — the same search box
/// the shell carries, with nothing else claiming to know which name you care about.
export default function EnsIndexPage() {
  return <ControlPanelLanding />;
}
