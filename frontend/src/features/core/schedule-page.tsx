"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Globe2, MousePointer2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCore } from "./core-provider";
import { BlockEditor, type EditorState } from "./block-editor";
import { layoutBlocks } from "./calendar-layout";
import { blockLabels, defaultBlockTitles } from "./block-labels";
import { addDays, clock, dateValue, formatDate, matchesDate, minutes, weekDates } from "./time";
import type { CoreSnapshot } from "./types";
import styles from "./core.module.css";
import { useBlockMotion } from "@/lib/motion";

function subscribe(callback: () => void) {
  const media = window.matchMedia("(max-width: 700px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const smallScreen = () => window.matchMedia("(max-width: 700px)").matches;
const serverScreen = () => false;

export function SchedulePage() {
  const { snapshot } = useCore();
  return snapshot ? <ScheduleView snapshot={snapshot} /> : null;
}

function ScheduleView({ snapshot }: { snapshot: CoreSnapshot }) {
  const { mode } = useCore();
  const compact = useSyncExternalStore(subscribe, smallScreen, serverScreen);
  const [selected, setSelected] = useState(snapshot.today);
  const [chosenView, setChosenView] = useState<"week" | "day" | null>(null);
  const view = chosenView ?? (compact ? "day" : "week");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const editorSequence = useRef(0);
  const currentEditor = useRef<EditorState | null>(null);
  const [notice, setNotice] = useState("");
  const [focused, setFocused] = useState({ day: 0, slot: 18 });
  const [drag, setDrag] = useState<{ day: number; first: number; last: number } | null>(null);
  const skipClick = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const dates = view === "week" ? weekDates(selected) : [selected];
  const own = snapshot.blocks.filter((block) => block.ownerId === snapshot.profile.id);
  const first = dates[0] ?? selected;
  const last = dates.at(-1) ?? selected;
  const gridColumns = `48px repeat(${dates.length}, minmax(0, 1fr))`;
  useBlockMotion(scroll, snapshot.blocks, `${view}:${first}`);
  useEffect(() => { scroll.current?.scrollTo({ top: 9 * 64 }); }, [view]);

  function showEditor(next: Omit<EditorState, "instanceKey">) {
    const instance = { ...next, instanceKey: ++editorSequence.current };
    currentEditor.current = instance; setEditor(instance);
  }
  function open(date: string, start: string, end: string, returnFocus: HTMLElement, weekly = false) {
    setNotice("");
    showEditor({ date, returnFocus, draft: { title: defaultBlockTitles.available, kind: "available", start, end, timing: weekly ? { type: "weekly", weekday: dateValue(date).dayOfWeek } : { type: "date", date } } });
  }
  function pointerSlot(event: PointerEvent<HTMLButtonElement>) {
    const top = event.currentTarget.parentElement?.getBoundingClientRect().top ?? event.clientY;
    return Math.max(0, Math.min(47, Math.floor((event.clientY - top) / 32)));
  }
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, day: number, slot: number) {
    let nextDay = day; let nextSlot = slot;
    if (event.key === "ArrowUp") nextSlot--;
    else if (event.key === "ArrowDown") nextSlot++;
    else if (event.key === "ArrowLeft") nextDay--;
    else if (event.key === "ArrowRight") nextDay++;
    else if (event.key === "Home") nextSlot = 0;
    else if (event.key === "End") nextSlot = 47;
    else return;
    event.preventDefault();
    nextDay = Math.max(0, Math.min(dates.length - 1, nextDay)); nextSlot = Math.max(0, Math.min(47, nextSlot));
    setFocused({ day: nextDay, slot: nextSlot });
    scroll.current?.querySelector<HTMLButtonElement>(`[data-day="${nextDay}"][data-slot-index="${nextSlot}"]`)?.focus();
  }
  function closeEditor(updated: boolean, instanceKey: number) {
    // An exiting editor must never clear a newer keyboard/pointer interaction.
    if (currentEditor.current?.instanceKey !== instanceKey) return;
    currentEditor.current = null; setEditor(null);
    setNotice(updated ? mode === "persistent" ? "Saved to your account." : "Preview updated. Changes reset on refresh." : "");
  }

  return <>
    <div className={styles.heading}>
      <div><h1>A week that feels like you.</h1><p>Make room for plans, people, and a little me time.</p></div>
      <Button ref={addButton} onClick={(event) => open(selected, "09:00", "10:00", event.currentTarget, true)}><Plus aria-hidden="true" />Add time</Button>
    </div>
    <div className={styles.hint}><MousePointer2 aria-hidden="true" /><span>Click a time slot or drag to add a block. Use Add time for a weekly routine. Your titles stay private.</span></div>
    {mode === "persistent" && dates.some((date) => own.some((block) => matchesDate(block, date) && !matchesDate(block, date, snapshot.profile.timezone))) && <p role="status" className="mb-3 text-xs text-muted-foreground">A recurring time is skipped or repeated by daylight saving in this view. That occurrence is not shown; choose a dated replacement at a valid time.</p>}
    <Card className="min-w-0 overflow-hidden">
      <div className={styles.toolbar}>
        <div><h2>{formatDate(first)}{view === "week" && ` – ${formatDate(last)}`}</h2><p>{dateValue(first).year}{dateValue(first).year !== dateValue(last).year && ` – ${dateValue(last).year}`}</p></div>
        <div className={styles.toolbarActions}>
          <div className={styles.segmented} aria-label="Calendar view"><button type="button" aria-pressed={view === "week"} onClick={() => setChosenView("week")}>Week</button><button type="button" aria-pressed={view === "day"} onClick={() => setChosenView("day")}>Day</button></div>
          <Button variant="outline" size="sm" onClick={() => setSelected(snapshot.today)}>Today</Button>
          <div className="inline-flex shrink-0" role="group" aria-label="Calendar navigation">
            <Button variant="ghost" size="icon" aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => setSelected(addDays(selected, view === "week" ? -7 : -1))}><ChevronLeft aria-hidden="true" /></Button>
            <Button variant="ghost" size="icon" aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => setSelected(addDays(selected, view === "week" ? 7 : 1))}><ChevronRight aria-hidden="true" /></Button>
          </div>
          <input type="date" aria-label="Jump to date" value={selected} onChange={(event) => { if (event.target.value) setSelected(event.target.value); }} className={cn(styles.input, "!w-[170px] !py-2")} />
        </div>
      </div>
      {own.length === 0 && <p className="border-b p-4 text-xs text-muted-foreground">A little room to begin. Add your first available or unavailable block.</p>}
      <div ref={scroll} className={styles.calendarScroll} aria-label="Scrollable calendar">
        <div key={`${view}:${first}`} className={cn(styles.calendarInner, "motion-week", view === "day" && styles.dayView)}>
          <div className={styles.dayHeaders} style={{ gridTemplateColumns: gridColumns }}><span aria-hidden="true" />{dates.map((date) => <button type="button" key={date} className={cn(date === selected && styles.selectedDay)} onClick={() => setSelected(date)} aria-label={`Select ${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}`} aria-pressed={date === selected}><span>{formatDate(date, { weekday: "short" })}</span><strong>{dateValue(date).day}</strong></button>)}</div>
          <div className={styles.timeGrid} style={{ gridTemplateColumns: gridColumns }} role="group" aria-label="Schedule time grid. Use arrow keys to navigate slots and Enter to add time.">
            <div className={styles.timeAxis} aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className={styles.hour}>{clock(hour * 60)}</div>)}</div>
            {dates.map((date, day) => <div key={date} className={styles.dayColumn}>
              {Array.from({ length: 48 }, (_, slot) => <button type="button" key={slot} data-day={day} data-slot-index={slot} className={styles.slot} tabIndex={Math.min(focused.day, dates.length - 1) === day && focused.slot === slot ? 0 : -1} aria-label={`Add time on ${formatDate(date, { weekday: "long", day: "numeric", month: "long" })} at ${clock(slot * 30)}`} onFocus={() => setFocused({ day, slot })} onKeyDown={(event) => moveFocus(event, day, slot)}
                onPointerDown={(event) => { if (event.pointerType !== "mouse" || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ day, first: slot, last: slot }); }}
                onPointerMove={(event) => { if (drag?.day === day && event.currentTarget.hasPointerCapture(event.pointerId)) setDrag({ ...drag, last: pointerSlot(event) }); }}
                onPointerCancel={() => setDrag(null)} onLostPointerCapture={() => setDrag(null)}
                onPointerUp={(event) => { if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const end = pointerSlot(event); event.currentTarget.releasePointerCapture(event.pointerId); skipClick.current = true; open(date, clock(Math.min(drag.first, end) * 30), clock((Math.max(drag.first, end) + 1) * 30), event.currentTarget); setDrag(null); }}
                onClick={(event) => { if (event.detail !== 0 && skipClick.current) { skipClick.current = false; return; } open(date, clock(slot * 30), clock((slot + 1) * 30), event.currentTarget); }} />)}
              {drag?.day === day && <div data-motion-selection aria-hidden="true" className={styles.selection} style={{ top: Math.min(drag.first, drag.last) * 32, height: (Math.abs(drag.last - drag.first) + 1) * 32 }}><span className={styles.selectionLabel}>{clock(Math.min(drag.first, drag.last) * 30)}–{clock((Math.max(drag.first, drag.last) + 1) * 30)}</span></div>}
              {layoutBlocks(own.filter((block) => matchesDate(block, date, mode === "persistent" ? snapshot.profile.timezone : undefined))).map(({ block, lane, lanes }) => <button type="button" key={block.id} className={styles.event} data-kind={block.kind} data-block-id={block.id} data-block-date={date} data-editing={editor?.id === block.id} aria-haspopup="dialog" style={{ top: minutes(block.start) / 60 * 64 + 3, height: Math.max(24, (minutes(block.end) - minutes(block.start)) / 60 * 64 - 6), left: `calc(${lane / lanes * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }} aria-label={`Edit ${block.title}, ${blockLabels[block.kind].toLowerCase()}, ${block.start} to ${block.end}${block.timing.type === "weekly" ? ", repeats weekly" : ", this date only"}`} title={`${block.title}\n${block.start}–${block.end}\n${blockLabels[block.kind]}${block.timing.type === "weekly" ? " · Weekly" : " · This date"}`} onClick={(event) => { setNotice(""); showEditor({ id: block.id, draft: block, date, returnFocus: event.currentTarget }); }}>
                <span className={styles.eventContent}>
                  <strong className={styles.eventTitle}>{block.title}</strong>
                  <span className={styles.eventTime}>{block.start}–{block.end}</span>
                  <span className={styles.eventStatus}>{block.kind === "available" ? "✓ " : ""}{blockLabels[block.kind]}{block.timing.type === "weekly" ? " · Weekly" : " · This date"}</span>
                </span>
              </button>)}
            </div>)}
          </div>
        </div>
      </div>
      <div className={styles.calendarFooter}><span className={styles.legend}>{blockLabels.available}</span><span className={styles.legend} data-kind="busy">{blockLabels.busy}</span><span role="status" aria-label="Current timezone" className="ml-auto inline-flex items-center gap-2"><Globe2 className="size-3.5" aria-hidden="true" />Timezone: {snapshot.profile.timezone}</span></div>
    </Card>
    <p className="mt-3 min-h-6 text-xs text-muted-foreground" role="status">{notice && <span className="motion-feedback"><CheckCircle2 aria-hidden="true" className="size-4" />{notice}</span>}</p>
    {editor && <BlockEditor key={editor.instanceKey} editor={editor} fallbackFocus={() => addButton.current} onClose={(updated = false) => closeEditor(updated, editor.instanceKey)} />}
  </>;
}
