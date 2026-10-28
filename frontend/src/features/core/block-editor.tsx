"use client";

import { useRef, useState, type FormEvent } from "react";
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
  const { saveBlock, deleteBlock, saveOccurrence, restoreOccurrence, snapshot, retry, mode } = useCore();
  const saved = snapshot?.blocks.find((block) => block.id === editor.id);
  const recurring = mode === "persistent" && editor.id && editor.draft.timing.type === "weekly";
  const [scope, setScope] = useState<"series" | "occurrence">("series");
  const pendingRef = useRef(false);
  const [draft, setDraft] = useState<BlockDraft>(structuredClone(editor.draft));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError(""); setPending(true);
    try {
      if (scope === "occurrence" && editor.id) await saveOccurrence(editor.id, editor.date, { ...draft, timing: { type: "date", date: editor.date } });
      else await saveBlock(draft, editor.id);
      onClose(true);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the preview. Please try again."); }
    finally { pendingRef.current = false; setPending(false); }
  }
  async function remove() {
    if (!editor.id || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true); setError("");
    try { if (scope === "occurrence") await saveOccurrence(editor.id, editor.date, null); else await deleteBlock(editor.id); onClose(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove this block."); }
    finally { pendingRef.current = false; setPending(false); }
  }
  async function restore(id: string, date: string) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError("");
    try { await restoreOccurrence(id, date); onClose(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not restore this occurrence."); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <Modal busy={pending} title={editor.id ? "Edit time" : "Make a little space"} description={mode === "persistent" ? "Changes are saved to your account. Your block titles stay private." : "Changes are for this preview only. Your block titles stay private."} onClose={() => onClose()} returnFocus={editor.returnFocus} fallbackFocus={fallbackFocus}>
    <form className={styles.form} onSubmit={save}>
      <fieldset disabled={pending} className="grid gap-5">
        {recurring && <Field label="Apply changes to"><select className={styles.input} value={scope} onChange={(event) => {
          const next = event.target.value as "series" | "occurrence"; setScope(next); setConfirmDelete(false);
          setDraft({ ...draft, timing: next === "occurrence" ? { type: "date", date: editor.date } : editor.draft.timing });
        }}><option value="series">Every weekly occurrence</option><option value="occurrence">This occurrence only</option></select></Field>}
        <fieldset><legend className="text-xs text-muted-foreground">Mark this time as</legend>
          <div className={styles.radioOptions}>{(["available", "busy"] as const).map((kind) => <label key={kind}><input type="radio" name="kind" value={kind} checked={draft.kind === kind} onChange={() => setDraft({ ...draft, kind })} />{kind === "available" ? "Available" : "Busy"}</label>)}</div>
        </fieldset>
        <Field label="Title"><input autoComplete="off" className={styles.input} value={draft.title} maxLength={80} required onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
        <Field label="Repeats"><select disabled={scope === "occurrence" || Boolean(saved?.exceptionFor)} className={styles.input} value={draft.timing.type} onChange={(event) => setDraft({ ...draft, timing: event.target.value === "weekly" ? { type: "weekly", weekday: dateValue(editor.date).dayOfWeek } : { type: "date", date: editor.date } })}><option value="date">Does not repeat</option><option value="weekly">Every week</option></select></Field>
        {draft.timing.type === "weekly"
          ? <Field label="Day of week"><select className={styles.input} value={draft.timing.weekday} onChange={(event) => setDraft({ ...draft, timing: { type: "weekly", weekday: Number(event.target.value) } })}>{WEEKDAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></Field>
          : <Field label="Date"><input readOnly={scope === "occurrence" || Boolean(saved?.exceptionFor)} className={styles.input} type="date" required value={draft.timing.date} onChange={(event) => setDraft({ ...draft, timing: { type: "date", date: event.target.value } })} /></Field>}
        <div className={styles.twoColumns}>
          <Field label="Start time"><input className={styles.input} type="time" step={60} required value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></Field>
          <Field label="End time"><input className={styles.input} type="time" step={60} required value={draft.end === "24:00" ? "00:00" : draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value === "00:00" ? "24:00" : event.target.value })} /></Field>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{draft.timing.type === "weekly" ? mode === "persistent" ? "Edits apply to this series; dated overrides remain unchanged. Deleting the series also removes its overrides." : "Editing or deleting this block changes every weekly occurrence." : "This block applies to the selected date only."} Busy blocks take priority over availability.</p>
        <p className="text-[11px] text-muted-foreground">End time 00:00 means midnight at the end of this day. Split other overnight blocks into two dates.</p>
        {mode === "persistent" && saved?.exceptionFor && <Button variant="outline" onClick={() => void restore(saved.exceptionFor!.id, saved.exceptionFor!.date)}>Restore recurring occurrence</Button>}
        {mode === "persistent" && saved?.excludedDates?.map((date) => <Button key={date} variant="outline" onClick={() => void restore(saved.id, date)}>Restore occurrence on {date}</Button>)}
      </fieldset>
      {error && <div role="alert"><p className={styles.error}>{error}</p>{mode === "persistent" && <Button variant="outline" onClick={() => { onClose(); retry(); }}>Reload saved schedule</Button>}</div>}
      {confirmDelete && <div className={styles.deleteNotice}>
        <p>{draft.timing.type === "weekly" ? "Delete this repeating block from every week?" : "Delete this date-specific block?"}</p>
        <div className="flex flex-wrap gap-2"><Button disabled={pending} variant="outline" onClick={() => setConfirmDelete(false)}>Keep block</Button><Button disabled={pending} className="bg-destructive text-white hover:bg-destructive/90" onClick={remove}>Confirm delete</Button></div>
      </div>}
      <div className={styles.formActions}>
        {editor.id && !confirmDelete && <Button variant="ghost" className="mr-auto text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />Delete block</Button>}
        <Button variant="outline" disabled={pending} onClick={() => onClose()}>Cancel</Button>
        <Button type="submit" disabled={pending || confirmDelete}>{pending ? mode === "persistent" ? "Saving…" : "Updating preview…" : editor.id ? "Save changes" : "Add block"}</Button>
      </div>
    </form>
  </Modal>;
}
