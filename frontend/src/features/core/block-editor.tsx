"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useCore } from "./core-provider";
import { Field } from "./core-ui";
import { dateValue, WEEKDAYS } from "./time";
import type { BlockDraft } from "./types";
import styles from "./core.module.css";

export type EditorState = { draft: BlockDraft; id?: string; date: string; returnFocus: HTMLElement | null };

export function BlockEditor({ editor, onClose, fallbackFocus }: { editor: EditorState; onClose: (updated?: boolean) => void; fallbackFocus: () => HTMLElement | null }) {
  const { saveBlock, deleteBlock } = useCore();
  const [draft, setDraft] = useState<BlockDraft>(structuredClone(editor.draft));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(""); setPending(true);
    try { await saveBlock(draft, editor.id); onClose(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the preview. Please try again."); }
    finally { setPending(false); }
  }
  async function remove() {
    if (!editor.id) return;
    setPending(true); setError("");
    try { await deleteBlock(editor.id); onClose(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove this block."); }
    finally { setPending(false); }
  }
  return <Modal title={editor.id ? "Edit time" : "Make a little space"} description="Changes are for this preview only. Your block titles stay private." onClose={() => onClose()} returnFocus={editor.returnFocus} fallbackFocus={fallbackFocus}>
    <form className={styles.form} onSubmit={save}>
      <fieldset disabled={pending} className="grid gap-5">
        <fieldset><legend className="text-xs text-muted-foreground">Mark this time as</legend>
          <div className={styles.radioOptions}>{(["available", "busy"] as const).map((kind) => <label key={kind}><input type="radio" name="kind" value={kind} checked={draft.kind === kind} onChange={() => setDraft({ ...draft, kind })} />{kind === "available" ? "Available" : "Busy"}</label>)}</div>
        </fieldset>
        <Field label="Title"><input autoComplete="off" className={styles.input} value={draft.title} maxLength={80} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
        <Field label="Repeats"><select className={styles.input} value={draft.timing.type} onChange={(event) => setDraft({ ...draft, timing: event.target.value === "weekly" ? { type: "weekly", weekday: dateValue(editor.date).dayOfWeek } : { type: "date", date: editor.date } })}><option value="date">Does not repeat</option><option value="weekly">Every week</option></select></Field>
        {draft.timing.type === "weekly"
          ? <Field label="Day of week"><select className={styles.input} value={draft.timing.weekday} onChange={(event) => setDraft({ ...draft, timing: { type: "weekly", weekday: Number(event.target.value) } })}>{WEEKDAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></Field>
          : <Field label="Date"><input className={styles.input} type="date" required value={draft.timing.date} onChange={(event) => setDraft({ ...draft, timing: { type: "date", date: event.target.value } })} /></Field>}
        <div className={styles.twoColumns}>
          <Field label="Start time"><input className={styles.input} type="time" step={60} required value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></Field>
          <Field label="End time"><input className={styles.input} type="time" step={60} required value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></Field>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{draft.timing.type === "weekly" ? "Editing or deleting this block changes every weekly occurrence." : "This block applies to the selected date only."} Busy blocks take priority over availability.</p>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {confirmDelete && <div className={styles.deleteNotice}>
        <p>{draft.timing.type === "weekly" ? "Delete this repeating block from every week?" : "Delete this date-specific block?"}</p>
        <div className="flex flex-wrap gap-2"><Button disabled={pending} variant="outline" onClick={() => setConfirmDelete(false)}>Keep block</Button><Button disabled={pending} className="bg-destructive text-white hover:bg-destructive/90" onClick={remove}>Confirm delete</Button></div>
      </div>}
      <div className={styles.formActions}>
        {editor.id && !confirmDelete && <Button variant="ghost" className="mr-auto text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />Delete block</Button>}
        <Button variant="outline" disabled={pending} onClick={() => onClose()}>Cancel</Button>
        <Button type="submit" disabled={pending || confirmDelete}>{pending ? "Updating preview…" : editor.id ? "Save changes" : "Add block"}</Button>
      </div>
    </form>
  </Modal>;
}
