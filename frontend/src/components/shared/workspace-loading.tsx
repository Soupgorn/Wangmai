/** Static skeletons preserve layout without motion or exposing account data. */
export function WorkspaceLoading({ label = "Loading your workspace…" }: { label?: string }) {
  return <div role="status" aria-label={label} className="mx-auto w-full max-w-[1280px] space-y-6 p-4 sm:p-8">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-3"><div className="h-8 w-2/3 max-w-sm rounded-sm bg-muted" /><div className="h-4 w-4/5 max-w-lg rounded-sm bg-muted" /></div>
    <div aria-hidden="true" className="h-[360px] rounded-lg border bg-card" />
  </div>;
}
