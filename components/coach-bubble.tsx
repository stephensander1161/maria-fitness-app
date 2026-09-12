"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { prettyDate, type ISODate } from "@/lib/date";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { useCoachThread, type Msg } from "@/lib/use-coach-thread";
import { useDialog } from "@/lib/use-dialog";
import { AllowanceNote, Composer, ThreadMessages } from "./coach-thread";
import { Boost } from "./boost";
import { FeedbackGlyph, FeedbackSheet } from "./feedback";

/**
 * The coach, on every screen, knowing which one she is on.
 *
 * It used to be a tab: to ask about the set she was looking at she had to
 * leave the set, arrive at a chat that knew nothing about it, and describe it
 * from memory. Now it opens over whatever she is doing and the server attaches
 * that screen's contents to her first message from it — the browser names the
 * page, the server reads what is on it, so the client can never put words in
 * the app's mouth.
 *
 * The thread is a real scroll container with the composer *outside* it. The
 * tab version grew the page instead, so the newest message sat under the fixed
 * composer and she had to scroll down to read what had just been said.
 */
import { isChromeless } from "@/lib/chromeless";

export function CoachBubble({
  name, float = false,
}: {
  name: string | null;
  /**
   * Whether to draw the floating button that opens it.
   *
   * Off. The companion at the bottom of every page *is* the button — that was
   * the whole point of replacing a chat bubble with somebody — and drawing
   * both would put two coach triggers on one screen, which is one too many.
   * The prop stays because a screen without a companion would need it.
   */
  float?: boolean;
}) {
  /*
    The path *and* its query, because the query is what says which day.

    Eat, Train and Progress all step back with `?d=`, and `usePathname()`
    drops it — so from Thursday's food the coach was handed Friday and
    answered about Friday. The server still reads what is on the screen; it
    just needs to be told which screen, and "/eat" and "/eat?d=2026-09-10"
    are two of them.
  */
  const only = usePathname();
  const search = useSearchParams().toString();
  const path = search ? `${only}?${search}` : only;
  const [open, setOpen] = useState(false);

  /**
   * The companion at the bottom of the page is the coach's face, and tapping
   * him opens the coach.
   *
   * He used to shout `coach:open` at a room with nobody in it, twice over.
   * The only listeners were the inline panels, which are not on every screen
   * and sit up in the header when they are. And this — the thing that should
   * have been listening — was written, exported, and then mounted precisely
   * nowhere: `CoachBubbleGate` had no caller at all, so on every screen in
   * the app there was no chat window to open.
   *
   * It is in the root layout now, and the companion is what opens it.
   */
  useEffect(() => {
    const come = () => setOpen(true);
    window.addEventListener("coach:open", come);
    return () => window.removeEventListener("coach:open", come);
  }, []);

  if (isChromeless(path)) return null;

  return (
    <>
      {!open && float && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask your coach"
          className="fixed right-4 z-50 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-lg shadow-scrim/50 transition-transform hover:scale-105 active:scale-95 md:bottom-8 md:right-8"
          // Above the tab bar on a phone; the tab bar is gone on a desktop, so
          // the inline style is overridden by the md: classes above.
          style={{ bottom: "calc(4.25rem + max(env(safe-area-inset-bottom), 0.5rem) + var(--covered-bottom, 0px))" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a10 10 0 0 1-2.6-.34L4 21l1.2-3.6A7.5 7.5 0 0 1 3 11c0-4.42 4.03-8 9-8Z" />
          </svg>
        </button>
      )}
      {open && <CoachSheet name={name} path={path} onClose={() => setOpen(false)} />}
    </>
  );
}

function CoachSheet({
  name, path, onClose,
}: { name: string | null; path: string; onClose: () => void }) {
  const router = useRouter();
  const {
    messages, setMessages, streaming, activity, busy, error, setError, errorCode,
    input, setInput, stream, send, replay, stop, allowance,
    conversationId, setConversationId,
  } = useCoachThread({
    // A turn that ran tools changed something the screen behind this is
    // showing — "log that set" should tick the set off underneath.
    onTurnEnd: ({ usedTools }) => { if (usedTools) router.refresh(); },
  });
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  /** The paging cursor and whether anything is behind it — see /api/messages. */
  const [oldestId, setOldestId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [boosting, setBoosting] = useState(false);
  /**
   * Starting fresh really is starting fresh: the transcript *is* the coach's
   * memory, so a "new chat" that left it in place would be a new window onto
   * the same conversation. Said plainly before it happens, because the one
   * thing worse than forgetting is forgetting silently.
   */
  const [clearing, setClearing] = useState(false);
  /**
   * Her past threads, and whether the list is showing.
   *
   * Fetched with the transcript rather than on its own: it is the other half
   * of the same screen, and a second round trip on every open of the sheet is
   * a second round trip on the commonest action in the app.
   */
  type Thread = { id: string; title: string | null; at: string; messages: number };
  const [threads, setThreads] = useState<Thread[]>([]);
  const [history, setHistory] = useState(false);
  /**
   * Which thread to load. `new` is a chat that does not exist yet.
   *
   * Opening the coach opens a new one — that is the whole point of this —
   * and the row is created by the first message, so opening and closing the
   * sheet leaves nothing behind.
   */
  const [want, setWant] = useState<string | "new">("new");
  const [feedback, setFeedback] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const kicked = useRef(false);
  /**
   * The screen she opened the sheet from.
   *
   * In a ref rather than in the effect's dependencies: the effect loads the
   * whole transcript, and re-running it because she navigated underneath an
   * open sheet would refetch her conversation for nothing. The greeting only
   * needs the path at the moment it fires.
   */
  const openedOn = useRef(path);
  useEffect(() => { openedOn.current = path; });
  const panel = useDialog(onClose);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, activity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/messages?conversation=${encodeURIComponent(want)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages.map((m: Msg) => ({ id: m.id, role: m.role, text: m.text })));
        setOldestId(data.oldestId ?? null);
        setHasMore(Boolean(data.hasMore));
        setThreads(data.conversations ?? []);
        setConversationId(want === "new" ? null : want);
        setLoaded(true);
        /*
          The one-time greeting, still one time.

          Every open is a new chat now, so "no messages on screen" is true
          every time and can no longer mean "never used this app". The server
          holds the real guard — `hasHistory` across her whole transcript,
          answering 409 — and this is the cheap half of it: an account with
          threads behind it never asks.
        */
        if (want === "new" && (data.conversations ?? []).length === 0 && !kicked.current) {
          kicked.current = true;
          // The screen she opened it from, so the greeting leads with what
          // is in front of her rather than with training every time.
          void stream({ kickoff: true, page: openedOn.current });
        }
      } catch {
        // This used to fail in total silence: the fetch rejected, nothing was
        // caught, and she got an empty screen with her history apparently gone.
        if (cancelled) return;
        setLoaded(true);
        setLoadFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setMessages, setConversationId, stream, reloadKey, want]);

  /**
   * The rest of the conversation, a page at a time.
   *
   * The scroll position is held by hand: prepending forty messages moves
   * everything she was reading down the screen, and a chat that jumps when it
   * loads is worse than one that does not load at all. The height difference
   * before and after is exactly how far to put it back.
   */
  async function loadOlder() {
    if (loadingOlder || !hasMore || !oldestId) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const heightBefore = el?.scrollHeight ?? 0;
    try {
      const res = await fetch(
        `/api/messages?before=${encodeURIComponent(oldestId)}&conversation=${encodeURIComponent(want)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setMessages((m) => [
        ...data.messages.map((x: Msg) => ({ id: x.id, role: x.role, text: x.text })),
        ...m,
      ]);
      setOldestId(data.oldestId ?? null);
      setHasMore(Boolean(data.hasMore));
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - heightBefore;
      });
    } catch {
      // Leave hasMore alone: the button stays, and she can try again.
    } finally {
      setLoadingOlder(false);
    }
  }

  /**
   * Her message, with the screen she sent it from — every time, not just the
   * first. Sending it once meant "why is the bench slipping?" was answered
   * from the progression list and the follow-up "and the squat?" had nothing
   * to answer from, so the coach either guessed or re-ran the tools.
   */
  const say = (text: string) => send(text, path);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Your coach"
      className="fixed inset-0 z-[80] flex flex-col justify-end bg-scrim/70 backdrop-blur-sm md:items-center md:justify-center md:p-6"
    >
      {/*
        A sheet from the bottom edge is right under a thumb and wrong under a
        mouse — on a wide screen it is a window in the middle of the screen.

        It used to dock to the right at reading width, on the theory that the
        page behind it was the point. In practice the answer is the point: a
        narrow column against the edge made long replies scroll for no reason
        while two thirds of a 1400px screen sat empty, and anything the coach
        had been asked *about* was behind the panel anyway. Wide and centred,
        capped so it never becomes a full-screen takeover on a very large
        monitor.
      */}
      <div
        ref={panel}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88dvh] w-full max-w-lg flex-col self-center rounded-t-3xl border-t border-line bg-base md:h-[min(52rem,90dvh)] md:w-[min(56rem,92vw)] md:max-w-none md:self-auto md:rounded-2xl md:border md:shadow-2xl md:shadow-scrim/60"
        data-no-pull-to-refresh=""
      >
        {clearing && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line/60 bg-raised px-4 py-2.5">
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
              Delete every chat? Your coach forgets all of it. Everything you have logged stays.
            </p>
            <button onClick={() => setClearing(false)} className="shrink-0 px-2 py-1.5 text-[12px] text-muted">
              Keep it
            </button>
            <button
              onClick={async () => {
                setClearing(false);
                try {
                  await action("forget_conversation", {});
                  setMessages([]);
                  setThreads([]);
                  kicked.current = false;
                  setWant("new");
                  setReloadKey((k) => k + 1);
                } catch (err) {
                  // The thread stays as it is and nothing was lost — but she
                  // asked for a fresh start and did not get one, so say so.
                  setError(actionMessage(err, "Couldn't clear the conversation — try again."));
                }
              }}
              className="shrink-0 rounded-lg bg-miss px-3 py-1.5 text-[12px] font-semibold text-on-accent"
            >
              Delete all
            </button>
          </div>
        )}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
          <h2 className="truncate text-[17px] font-semibold">
            {name ? `Hey, ${name}` : "Your coach"}
          </h2>
          <div className="flex items-center gap-2">
            {/*
              A new chat, and a way back to the old ones.

              The "+" used to *delete* the transcript — the only route to a
              clean thread was erasing everything that had ever been said, so
              nobody took it and every conversation ran on for months. It
              starts a thread now and costs nothing.
            */}
            <button
              onClick={() => { setHistory(false); kicked.current = true; setWant("new"); }}
              disabled={want === "new" && messages.length === 0}
              aria-label="New chat"
              title="New chat"
              className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted active:bg-raised disabled:opacity-40"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              onClick={() => setHistory(!history)}
              aria-expanded={history}
              aria-label="Past chats"
              title="Past chats"
              className={`grid size-9 place-items-center rounded-full border bg-surface active:bg-raised ${
                history ? "border-accent text-accent" : "border-line text-muted"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 8v4l2.5 2.5M3.5 12a8.5 8.5 0 1 0 2.2-5.7M3 4v4h4" />
              </svg>
            </button>
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
            <button onClick={onClose} aria-label="Close"
              className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted active:bg-raised">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        {/*
          Past chats, over the thread rather than beside it.

          A list is a different thing to read from a conversation, and on a
          phone there is no room for both. It closes the moment she picks one,
          so the answer to "where was that" is two taps and never a screen she
          has to get out of.
        */}
        {history && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {threads.length === 0 ? (
              <p className="py-8 text-center text-[13px] leading-relaxed text-faint">
                No past chats yet. This one gets saved the moment you say something.
              </p>
            ) : (
              <ul className="space-y-1">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => { setHistory(false); kicked.current = true; setWant(t.id); }}
                      aria-current={t.id === conversationId ? "true" : undefined}
                      className={`flex w-full items-baseline gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:bg-raised ${
                        t.id === conversationId ? "border-accent bg-accent-soft" : "border-line"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">
                          {t.title ?? "Untitled chat"}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-faint">
                          {t.messages} message{t.messages === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-faint tabular">
                        {prettyDate(new Date(t.at).toISOString().slice(0, 10) as ISODate)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {threads.length > 0 && (
              /* The destructive one, where a destructive one belongs: at the
                 bottom of the list of what it would destroy, rather than
                 behind the "+" that people press expecting a new chat. */
              <button
                onClick={() => { setHistory(false); setClearing(true); }}
                className="mt-4 w-full py-2 text-[12px] text-faint underline underline-offset-2"
              >
                Delete every chat
              </button>
            )}
          </div>
        )}

        {/* The scroll container. The composer sits outside it, which is the
            whole reason the last message is never hidden underneath. */}
        <div
          ref={scroller}
          hidden={history}
          onScroll={(e) => { if (e.currentTarget.scrollTop < 80) void loadOlder(); }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {/* The way back into everything she has said. A button as well as
              the scroll trigger: reaching the top of a long thread by
              flicking is not a thing anyone should have to do. */}
          {hasMore && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="rounded-full border border-edge px-3 py-1 text-[12px] text-muted disabled:opacity-50"
              >
                {loadingOlder ? "Loading…" : "Earlier messages"}
              </button>
            </div>
          )}
          {!loaded && !loadFailed && messages.length === 0 && !busy && (
            // Without this the sheet opened to a header, nothing, and a text
            // box — which reads as the whole conversation having gone.
            <div className="flex justify-center gap-1.5 py-10">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                  style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
          {loaded && !loadFailed && messages.length === 0 && !busy && !streaming && (
            // A clean box, not an empty room. This is now the commonest state
            // in the app — every open starts here.
            <p className="py-10 text-center text-[13px] leading-relaxed text-faint">
              New chat. Ask anything, or tell it what to log.
              {threads.length > 0 && <><br />Past chats are behind the clock.</>}
            </p>
          )}
          <ThreadMessages
            messages={messages}
            streaming={streaming}
            activity={activity}
            busy={busy}
            error={error}
            errorCode={errorCode}
            onReplay={(m) => void replay(m, path)}
          />

          {loadFailed && (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] text-muted">
              <p>Couldn&rsquo;t load your conversation — you may be offline.</p>
              <button
                onClick={() => { setLoadFailed(false); setReloadKey((k) => k + 1); }}
                className="mt-2 rounded-lg border border-line px-3 py-2 text-[13px] text-accent"
              >
                Try again
              </button>
            </div>
          )}
          <div ref={bottom} className="h-1" />
        </div>

        <div
          className="shrink-0 border-t border-line/60 px-4 pt-2.5"
          style={{ paddingBottom: "calc(max(env(safe-area-inset-bottom), 0.75rem) + var(--covered-bottom, 0px))" }}
        >
          <AllowanceNote leftPct={allowance} />
          <Composer
            onStop={stop} value={input} onChange={setInput} onSubmit={say} busy={busy} autoFocus />
        </div>
      </div>

      {boosting && <Boost onClose={() => setBoosting(false)} />}
      {feedback && <FeedbackSheet path={path} onClose={() => setFeedback(false)} />}
    </div>
  );
}
