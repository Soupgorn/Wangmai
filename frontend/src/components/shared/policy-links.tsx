"use client";

import { useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PolicyNotice({ kind, short = false }: { kind: "privacy" | "terms"; short?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const title = kind === "privacy" ? "Privacy policy" : "Terms of service";
  const label = short ? (kind === "privacy" ? "Privacy" : "Terms") : title;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="rounded-xs underline decoration-border underline-offset-4 hover:text-foreground">{label}</button>
      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[calc(100%-3rem)] max-w-sm rounded-xl border bg-card p-6 text-left text-foreground shadow-card backdrop:bg-foreground/20">
        <div className="mb-4 flex items-start justify-between gap-5">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" className="-mt-2 -mr-2" aria-label={`Close ${title.toLowerCase()}`} onClick={() => dialog.current?.close()}><X aria-hidden="true" /></Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">Our {title.toLowerCase()} will be available before sign-in opens. You can explore the public pages without creating an account.</p>
        <Button variant="outline" className="mt-6" onClick={() => dialog.current?.close()}>Back to Wangmai</Button>
      </dialog>
    </>
  );
}
export function PolicyLinks({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center justify-center gap-x-1", className)}>
      <PolicyNotice kind={compact ? "privacy" : "terms"} short={compact} />
      {!compact && <span>and</span>}
      <span><PolicyNotice kind={compact ? "terms" : "privacy"} short={compact} />{!compact && "."}</span>
    </span>
  );
}
