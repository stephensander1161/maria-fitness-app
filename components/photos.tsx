"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { daysBetween, prettyDate, today } from "@/lib/date";
import { deviceZone } from "@/lib/offline";
import type { PhotoPose, ProgressPhoto } from "@/lib/photos";

/**
 * Progress photos, built around the thing she actually asked for: two photos
 * side by side, month to month.
 *
 * Everything is inline — images arrive as data URIs in the page payload and go
 * back out as data URIs through /api/action. No upload endpoint, no external
 * host, nothing about her body leaves the page.
 */

/** Long edge in pixels. Big enough to see a waistline change on a phone, small
 *  enough that a year of weekly photos is a few megabytes in Postgres. */
const MAX_EDGE = 800;
const QUALITY = 0.75;
/** Matches the backstop in lib/tools/photos.ts (~300KB of JPEG). */
const MAX_BASE64_CHARS = 400_000;

const POSES: { key: PhotoPose; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

type Draft = { src: string; width: number; height: number; pose: PhotoPose | null; date: string };

export function ProgressPhotos({ photos, total }: { photos: ProgressPhoto[]; total?: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<PhotoPose | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pair, setPair] = useState<{ before: string; after: string } | null>(null);

  // Oldest first, so "before" and "after" read left to right.
  const shown = useMemo(() => {
    const list = filter === "all" ? photos : photos.filter((p) => p.pose === filter);
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  }, [photos, filter]);

  const byId = useMemo(() => new Map(shown.map((p) => [p.id, p])), [shown]);

  // Default comparison: her first photo against her latest. Any explicit pick
  // wins, but falls back the moment the filter hides what was chosen.
  const before = (pair && byId.get(pair.before)) ?? shown[0] ?? null;
  const after = (pair && byId.get(pair.after)) ?? shown[shown.length - 1] ?? null;
  const apart = before && after && before.id !== after.id ? monthsApart(before.date, after.date) : null;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setDraft({ ...(await shrink(file)), pose: null, date: today(deviceZone()) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ""; // so the same file can be re-picked
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await action<{ ok: boolean; error?: string }>("add_progress_photo", {
        image: draft.src,
        width: draft.width,
        height: draft.height,
        date: draft.date,
        ...(draft.pose ? { pose: draft.pose } : {}),
      });
      if (!res.ok) {
        setError(res.error ?? "That didn't save.");
        return;
      }
      setDraft(null);
      setPair(null);
      router.refresh();
    } catch {
      setError("That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await action("delete_progress_photo", { photoId: id });
      setSelected(null);
      setConfirmDelete(null);
      setPair(null);
      router.refresh();
    } catch {
      setError("That didn't delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Photos</h2>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-[13px] text-accent disabled:opacity-40"
        >
          {photos.length ? "Add" : "Start"}
        </button>
      </div>

      {/* accept="image/*" is what makes iOS offer Camera or Photo Library. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {error && (
        <p className="mb-3 rounded-lg border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">
          {error}
        </p>
      )}

      {draft && (
        <div className="mb-4 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI, nothing for the image optimiser to fetch */}
          <img
            src={draft.src}
            alt="New progress photo"
            className="mx-auto max-h-64 rounded-xl border border-line"
          />
          <div className="flex gap-2">
            {POSES.map((p) => (
              <button
                key={p.key}
                onClick={() => setDraft({ ...draft, pose: draft.pose === p.key ? null : p.key })}
                className={`flex-1 rounded-lg border py-2 text-[13px] ${
                  draft.pose === p.key
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            Same spot, same light, same time of day — that is what makes two photos
            months apart comparable. Location data is stripped before it is saved.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setDraft(null); setError(null); }}
              className="rounded-xl border border-line py-3 text-[14px] text-muted"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save photo"}
            </button>
          </div>
        </div>
      )}

      {photos.length === 0 && !draft && (
        <p className="text-[13px] leading-relaxed text-faint">
          One photo a month, same spot and same light. The scale argues with you;
          two photos side by side do not.
        </p>
      )}

      {photos.length > 0 && (
        <>
          {photos.some((p) => p.pose) && (
            <div className="mb-3 flex gap-1.5">
              {(["all", ...POSES.map((p) => p.key)] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => { setFilter(key); setPair(null); }}
                  className={`rounded-full px-3 py-1 text-[12px] ${
                    filter === key ? "bg-raised text-text" : "text-faint"
                  }`}
                >
                  {key === "all" ? "All" : POSES.find((p) => p.key === key)!.label}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 && (
            <p className="text-[13px] text-faint">Nothing at that angle yet.</p>
          )}

          {before && after && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Side label="Before" photo={before} />
                <Side label="After" photo={after} />
              </div>

              <p className="mt-2 text-center text-[12px] text-muted">
                {before.id === after.id
                  ? "One photo so far — add another next month and this becomes a comparison."
                  : apart}
              </p>

              {shown.length > 1 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Picker
                    label="Before"
                    value={before.id}
                    options={shown}
                    onChange={(id) => setPair({ before: id, after: after.id })}
                  />
                  <Picker
                    label="After"
                    value={after.id}
                    options={shown}
                    onChange={(id) => setPair({ before: before.id, after: id })}
                  />
                </div>
              )}
            </>
          )}

          {shown.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                All photos{total && total > photos.length ? ` · newest ${photos.length} of ${total}` : ""}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {[...shown].reverse().map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelected(selected === p.id ? null : p.id); setConfirmDelete(null); }}
                    className={`overflow-hidden rounded-lg border ${
                      selected === p.id ? "border-accent" : "border-line"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URI, nothing for the image optimiser to fetch */}
                    <img
                      src={p.src}
                      alt={`${p.pose ?? "Progress"} photo from ${p.date}`}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>

              {selected && byId.get(selected) && (
                <div className="mt-2 rounded-xl bg-raised p-3">
                  <p className="mb-2 text-[13px]">
                    {prettyDate(byId.get(selected)!.date)}
                    {byId.get(selected)!.pose && (
                      <span className="ml-1.5 text-[12px] text-faint">{byId.get(selected)!.pose}</span>
                    )}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setPair({ before: selected, after: after?.id ?? selected })}
                      className="rounded-lg border border-line py-2 text-[12px] text-muted"
                    >
                      Use as before
                    </button>
                    <button
                      onClick={() => setPair({ before: before?.id ?? selected, after: selected })}
                      className="rounded-lg border border-line py-2 text-[12px] text-muted"
                    >
                      Use as after
                    </button>
                    <button
                      onClick={() => (confirmDelete === selected ? remove(selected) : setConfirmDelete(selected))}
                      disabled={busy}
                      className="rounded-lg border border-miss/40 py-2 text-[12px] text-miss disabled:opacity-40"
                    >
                      {confirmDelete === selected ? "Sure?" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const Side = ({ label, photo }: { label: string; photo: ProgressPhoto }) => (
  <figure>
    {/* eslint-disable-next-line @next/next/no-img-element -- data URI, nothing for the image optimiser to fetch */}
    <img
      src={photo.src}
      alt={`${label}: ${photo.pose ?? "progress"} photo from ${photo.date}`}
      className="aspect-[3/4] w-full rounded-xl border border-line object-cover"
    />
    <figcaption className="mt-1.5 text-[12px] text-muted">
      <span className="text-faint">{label} · </span>
      {prettyDate(photo.date)}
    </figcaption>
  </figure>
);

const Picker = ({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: ProgressPhoto[];
  onChange: (id: string) => void;
}) => (
  <label className="block">
    <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-line bg-surface px-2 py-2 text-[13px] text-text"
    >
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {prettyDate(p.date)}{p.pose ? ` · ${p.pose}` : ""}
        </option>
      ))}
    </select>
  </label>
);

/** "3 months apart" reads better than a date range when the point is the gap. */
function monthsApart(from: string, to: string): string {
  const days = Math.abs(daysBetween(from, to));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} apart`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks apart`;
  }
  const months = Math.round(days / 30.4);
  return `${months} months apart`;
}

/**
 * Resize to MAX_EDGE on the long edge and re-encode as JPEG.
 *
 * Two things fall out of the canvas re-encode for free: a 4MB phone photo turns
 * into ~100KB of base64 that Postgres can hold for years, and every scrap of
 * EXIF goes with it — including the GPS coordinates of her bedroom, which phone
 * cameras attach by default and which must never reach the database.
 */
async function shrink(file: File): Promise<{ src: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser wouldn't resize that photo.");
  ctx.drawImage(img, 0, 0, width, height);

  let src = canvas.toDataURL("image/jpeg", QUALITY);
  // One more squeeze before giving up — busy backgrounds compress badly.
  if (src.length > MAX_BASE64_CHARS) src = canvas.toDataURL("image/jpeg", 0.6);
  if (src.length > MAX_BASE64_CHARS) {
    throw new Error(
      `That photo is still about ${Math.round(src.length * 0.75 / 1024)}KB after resizing. Try a normal camera photo rather than a screenshot or panorama.`,
    );
  }

  return { src, width, height };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo — try taking it again."));
    };
    // Browsers apply the EXIF orientation when drawing an <img> to a canvas, so
    // portrait photos from the phone don't land on their side.
    img.src = url;
  });
}
