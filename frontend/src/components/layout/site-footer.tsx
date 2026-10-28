import { ApiStatus } from "@/components/api-status";
import { Brand } from "@/components/shared/brand";
import { PolicyLinks } from "@/components/shared/policy-links";

export function SiteFooter() {
  return (
    <footer>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4 py-[23px] text-[10px] text-muted-foreground">
        <Brand compact />
        <p className="max-[530px]:order-3 max-[530px]:w-full max-[530px]:text-center">A little less planning. A little more living.</p>
        <nav aria-label="Legal information"><PolicyLinks compact className="gap-x-3" /></nav>
      </div>
      {process.env.NODE_ENV === "development" && (
        <div aria-label="Development API connection" className="flex flex-wrap items-center justify-end gap-2 border-t py-3 text-[10px] text-muted-foreground"><span>Development</span><ApiStatus /></div>
      )}
    </footer>
  );
}
