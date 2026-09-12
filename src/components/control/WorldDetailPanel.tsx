"use client";

/// The slide-in panel every clicked castle opens into: a fixed right-hand aside plus an invisible
/// click-outside-to-close catcher — no dimming/blur over the map (task 41), since the castle it
/// describes is the same thing `CameraRig` just orbited/zoomed the camera onto; darkening it would
/// fight that same click's own camera move. Unlike `AgentDetailPanel` (task 12), the panel this
/// replaced, this one is content-agnostic — the control panel's three castle kinds (the page's own
/// subject, a subname, a portfolio entry) each render their own content into it, all built from
/// task 33's existing read-only panels (`NameOverviewPanel`, `RolesSummary`, `RegistryPathPanel`).
///
/// The aside itself never scrolls (task 39): it is a fixed-height flex column, and every content
/// kind rendered inside it — the tabbed subject view as much as a single compact card — owns its
/// own scroll container. `wide` is the one layout knob task 39 adds: the subject's Permissions tab
/// needs room for the role matrix that no other tab does, so it alone expands the drawer.
export function WorldDetailPanel({
  open,
  onClose,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Click-outside-to-close only — no dim/blur over the map. A castle's own detail panel
          shouldn't darken the map it's describing; the drawer sliding in over it is enough of a
          visual cue on its own. */}
      {open && (
        <button
          type="button"
          aria-label="Close castle detail panel"
          onClick={onClose}
          className="fixed inset-0 z-40"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden bg-[#0b1020] text-white shadow-2xl shadow-black/50 transition-[transform,max-width] duration-200",
          wide ? "max-w-3xl" : "max-w-md",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
        {open ? children : null}
      </aside>
    </>
  );
}
