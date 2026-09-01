"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamCoach } from "@/lib/client";
import { RichText } from "./rich-text";
import { Boost } from "./boost";
import { FeedbackGlyph, FeedbackSheet } from "./feedback";

type Msg = { id: string; role: "user" | "assistant"; text: string };

const OPENERS = [
  "What am I doing today?",
  "How did last week go?",
  "I want to change my plan",
  "What should I eat today?",
];

export function Coach({ initialName }: { initialName: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const kicked = useRef(false);

  // Block body on purpose: an expression-bodied arrow hands its value back to
  // React as the effect's cleanup, and React then tries to call it.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, activity]);

  /** Shared streaming path for both a typed message and the opening turn. */
  const stream = useCallback(async (body: { message: string } | { kickoff: true }) => {
    let acc = "";
    let failed = false;
    try {
      for await (const event of streamCoach(body)) {
        if (event.type === "text") { acc += event.text; setStreaming(acc); setActivity(null); }
        else if (event.type === "tool") setActivity(event.status === "running" ? LABELS[event.name] ?? "working" : null);
        else if (event.type === "error") { setError(event.message); failed = true; }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection lost");
      failed = true;
    }

    if (acc.trim()) setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: acc }]);
    setStreaming("");
    setActivity(null);
    setBusy(false);
    // Delivered means the coach said something. A failure with no text at
    // all is the case where her message never landed.
    return acc.trim().length > 0 || !failed;
  }, []);

  const send = useCallback(
    async (text: string) => {
      setBusy(true);
      setError(null);
      setInput("");
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);

      const delivered = await stream({ message: text });
      if (!delivered) {
        // Nothing came back at all, so the server never heard it. Put her words
        // back in the box rather than making her remember what she typed —
        // this is the gym-with-bad-signal case the whole app is built around.
        setMessages((m) => m.slice(0, -1));
        setInput((current) => current || text);
      }
    },
    [stream],
  );

  // Load the transcript, and if there isn't one, let the coach open the
  // conversation itself — this app greets her, it doesn't wait to be prompted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/messages");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages.map((m: Msg) => ({ id: m.id, role: m.role, text: m.text })));
        setLoaded(true);
        if (data.messages.length === 0 && !kicked.current) {
          kicked.current = true;
          setBusy(true);
          void stream({ kickoff: true });
        }
      } catch {
        // This is the front door, and it used to fail in total silence: the
        // fetch rejected, nothing was caught, and she got "Hey, Maria" over an
        // empty screen with her history apparently gone. Say so instead.
        if (cancelled) return;
        setLoaded(true);
        setLoadFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [stream, reloadKey]);

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {initialName ? `Hey, ${initialName}` : "Coach"}
        </h1>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-faint">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <button
            onClick={() => setFeedback(true)}
            aria-label="Send feedback"
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted active:bg-raised"
          >
            <FeedbackGlyph />
          </button>
          <button
            onClick={() => setBoosting(true)}
            aria-label="Give me a boost"
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-accent active:bg-raised"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
            </svg>
          </button>
        </div>
      </header>

      {boosting && <Boost onClose={() => setBoosting(false)} />}
      {feedback && <FeedbackSheet path="/" onClose={() => setFeedback(false)} />}

      <div className="flex-1 space-y-3">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[15px] text-ink">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] text-[15px] text-text">
              <RichText>{m.text}</RichText>
            </div>
          ),
        )}

        {streaming && (
          <div className="max-w-[92%] text-[15px]">
            <RichText>{streaming}</RichText>
          </div>
        )}

        {activity && (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            {activity}…
          </div>
        )}

        {busy && !streaming && !activity && (
          <div className="flex gap-1.5 py-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-faint"
                style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}

        {loadFailed && (
          <div className="rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] text-muted">
            <p>Couldn&rsquo;t load your conversation — you may be offline.</p>
            <button
              onClick={() => { setLoadFailed(false); setReloadKey((k) => k + 1); }}
              className="mt-2 rounded-lg border border-line px-3 py-2 text-[13px] text-accent"
            >
              Try again
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-miss/40 bg-miss-soft px-3 py-2 text-sm text-miss">
            {error}
          </div>
        )}
        <div ref={bottom} />
      </div>

      {loaded && messages.length > 0 && !busy && (
        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {OPENERS.map((o) => (
            <button key={o} onClick={() => send(o)}
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-muted active:bg-raised">
              {o}
            </button>
          ))}
        </div>
      )}

      {/* Keeps the last message and the openers clear of the fixed composer. */}
      <div className="h-16" aria-hidden="true" />

      {/*
        A fixed bar with a solid ground of its own, like any messaging app. It
        used to be sticky with no backdrop, so the conversation showed through
        it and the send button sat on top of whatever bubble was underneath.
        `bottom` is the tab bar's height plus the safe area it pads itself with.
      */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) void send(input.trim()); }}
        className="fixed inset-x-0 z-40 border-t border-line/60 bg-base/95 backdrop-blur-xl"
        style={{ bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0.5rem))" }}
      >
        <div className="mx-auto flex max-w-lg gap-2 px-4 py-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell your coach anything…"
          disabled={busy}
          className="flex-1 rounded-full border border-line bg-surface px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-ink transition-opacity disabled:opacity-30"
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
        </div>
      </form>
    </div>
  );
}

const LABELS: Record<string, string> = {
  get_profile: "reading your profile", update_profile: "saving your details",
  log_weight: "logging your weigh-in", get_weight_history: "checking your weight trend",
  set_goal: "setting a milestone", list_goals: "reviewing your goals",
  achieve_goal: "marking a milestone hit", search_exercises: "searching exercises",
  get_exercise_guide: "pulling up the form guide", create_weekly_plan: "building your week",
  get_plan: "checking your plan", adjust_plan_day: "adjusting your plan",
  start_workout: "starting your session", log_set: "logging your set",
  finish_workout: "wrapping up", get_exercise_history: "looking up your history",
  get_week_review: "reviewing your week", create_meal_plan: "planning your meals",
  get_meal_plan: "checking your meals", swap_meal: "swapping that meal",
  log_meal: "logging your meal", get_day_nutrition: "totalling today's food",
  get_fact: "finding something worth knowing",
  lookup_food: "looking up the macros", find_recipes: "finding recipes",
  search_food_library: "searching the food library",
  get_nutrition_trend: "reviewing how you've been eating",
  get_recent_meals: "finding your usuals", remove_meal_log: "removing that entry",
  suggest_meals: "looking for something different", suggest_exercises: "finding you options",
  get_shopping_list: "building your shopping list",
  send_shopping_list_to_instacart: "sending your list to Instacart",
  log_measurement: "saving your measurement", get_measurements: "checking your measurements",
  get_measuring_guide: "pulling up the measuring guide",
  get_exercise_progression: "tracking your progression",
  add_exercise_to_day: "adding that to your day",
  remove_exercise_from_day: "taking that off your day",
  list_templates: "looking through the templates", suggest_template: "finding you a template",
  apply_template: "setting up your plan",
  add_progress_photo: "saving your photo", list_progress_photos: "finding your photos",
  delete_progress_photo: "deleting that photo",
  get_boost: "finding you a boost", get_coach_usage: "checking your coach usage",
  set_coach_budget: "updating your spend limit",
  submit_feedback: "passing that on", list_feedback: "reading your feedback",
};
