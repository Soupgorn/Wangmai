import { PolicyLinks } from "@/components/shared/policy-links";

export function SiteFooter() {
  return (
    <footer>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-5 text-xs text-muted-foreground">
        <p>A little less planning. A little more living.</p>
        <nav aria-label="Legal information"><PolicyLinks compact className="gap-x-3" /></nav>
      </div>
    </footer>
  );
}
