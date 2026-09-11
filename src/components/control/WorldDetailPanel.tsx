"use client";

/// The slide-in panel every clicked castle opens into, styled the same way `AgentDetailPanel`
/// (task 12) slides over the root map: a translucent backdrop plus a fixed right-hand aside, so
/// clicking a castle never disturbs the camera or the map underneath it. Unlike `AgentDetailPanel`
/// this one is content-agnostic — the control panel's three castle kinds (the page's own subject, a
/// subname, a portfolio entry) each render their own content into it, all built from task 33's
/// existing read-only panels (`NameOverviewPanel`, `RolesSummary`, `RegistryPathPanel`).
export function WorldDetailPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close castle detail panel"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto bg-[#0b1020] p-5 text-white shadow-2xl shadow-black/50 transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
        {open ? children : null}
      </aside>
    </>
  );
}
