import type { Metadata } from "next";
import WorldClient from "./WorldClient";

export const metadata: Metadata = {
  title: "World",
  description: "AgentVillage 3D world",
};

export default function ThreeJsPage() {
  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden">
      <WorldClient />
    </div>
  );
}
