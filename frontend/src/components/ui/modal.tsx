"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./button";

export function Modal({ title, description, children, onClose, returnFocus, fallbackFocus, busy = false }: {
  title: string; description: string; children: ReactNode; onClose: () => void; returnFocus: HTMLElement | null; fallbackFocus: () => HTMLElement | null; busy?: boolean;
}) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); (returnFocus?.isConnected ? returnFocus : fallbackFocus())?.focus(); }} className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 text-foreground shadow-card sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <Dialog.Title className="text-xl font-semibold tracking-tight">{title}</Dialog.Title>
          <Dialog.Close asChild><Button disabled={busy} variant="ghost" size="icon" aria-label="Close editor" className="-mt-2 -mr-2"><X aria-hidden="true" /></Button></Dialog.Close>
        </div>
        <Dialog.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
