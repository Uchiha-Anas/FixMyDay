"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "./primitives";
import { useAppData } from "@/lib/store";
import { deleteBlock, newId, upsertBlock } from "@/lib/app-actions";
import { overlaps, validatePlacement } from "@/lib/scheduler";
import { formatClock, toHHMM, toMinutes } from "@/lib/time";
import type { ScheduleBlock } from "@/lib/types";

export type BlockDraft = Omit<ScheduleBlock, "id"> & { id?: string };

/**
 * Create or edit a time block. Task blocks must fit working hours and may not
 * overlap anything. Events (existing commitments) may sit anywhere, but may
 * not overlap other events or locked blocks; overlaps with planner blocks are
 * allowed and surfaced as conflicts to resolve by re-planning.
 */
export function BlockEditorDialog({
  draft,
  onClose,
}: {
  draft: BlockDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{draft && <BlockForm key={draft.id ?? "new"} draft={draft} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function BlockForm({ draft, onClose }: { draft: BlockDraft; onClose: () => void }) {
  const data = useAppData();
  const [title, setTitle] = useState(draft.title);
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState(toHHMM(draft.startMin));
  const [end, setEnd] = useState(toHHMM(draft.endMin));
  const [locked, setLocked] = useState(draft.locked);
  const [error, setError] = useState<string | null>(null);
  const isEvent = draft.kind === "event";
  const isNew = !draft.id;

  function save() {
    if (!title.trim()) return setError("Add a title.");
    if (!date) return setError("Pick a date.");
    const startMin = toMinutes(start);
    let endMin = toMinutes(end);
    if (end === "00:00") endMin = 1440;
    const block: ScheduleBlock = {
      ...draft,
      id: draft.id ?? newId(),
      title: title.trim().slice(0, 200),
      date,
      startMin,
      endMin,
      locked: isEvent ? true : locked,
      source: isNew ? "manual" : draft.source,
    };
    const others = data.blocks.filter((b) => b.date === date && b.id !== block.id);
    const relevant = isEvent ? others.filter((b) => b.kind === "event" || b.locked) : others;
    const problem = validatePlacement(block, relevant, data.profile);
    if (problem) return setError(problem);

    upsertBlock(block);
    const softConflicts = isEvent ? others.filter((o) => !o.locked && o.kind !== "event" && overlaps(o, block)) : [];
    if (softConflicts.length) {
      toast.warning(`This overlaps ${softConflicts.length} planned block${softConflicts.length === 1 ? "" : "s"}.`, {
        description: "Regenerate the plan for that day to resolve it.",
      });
    } else {
      toast.success(isNew ? "Added to your schedule" : "Schedule updated");
    }
    onClose();
  }

  function remove() {
    if (!draft.id) return;
    const undo = deleteBlock(draft.id);
    onClose();
    toast("Removed from schedule", { description: draft.title, action: undo ? { label: "Undo", onClick: undo } : undefined });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle className="font-display text-2xl font-normal">
          {isNew ? (isEvent ? "Add event" : "Schedule task") : isEvent ? "Edit event" : "Reschedule"}
        </DialogTitle>
        <DialogDescription>
          {isEvent
            ? "Events are fixed commitments. The planner schedules tasks around them."
            : `Tasks can be placed within your working hours (${formatClock(toMinutes(data.profile.workStart))}–${formatClock(toMinutes(data.profile.workEnd))}).`}
        </DialogDescription>
      </DialogHeader>

      {isEvent ? (
        <Field label="Title" htmlFor="block-title">
          <Input id="block-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dentist appointment" autoFocus />
        </Field>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{title}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Date" htmlFor="block-date" className="col-span-3 sm:col-span-1">
          <Input id="block-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start" htmlFor="block-start">
          <Input id="block-start" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End" htmlFor="block-end">
          <Input id="block-end" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>

      {!isEvent && (
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
          <span>
            Lock this time
            <span className="block text-xs text-muted-foreground">Regenerating the plan keeps locked blocks in place.</span>
          </span>
          <Switch checked={locked} onCheckedChange={setLocked} />
        </label>
      )}

      {error && (
        <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}

      <DialogFooter className="flex-row items-center justify-between sm:justify-between">
        {draft.id ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2 /> Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </DialogFooter>
    </form>
  );
}
