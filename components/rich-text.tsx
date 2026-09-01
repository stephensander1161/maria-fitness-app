import { Fragment, type ReactNode } from "react";

/**
 * The coach writes light markdown — bold, bullets, the odd numbered list.
 * A dependency-free renderer that builds React nodes (never raw HTML) keeps
 * model output structurally unable to inject anything.
 *
 * Bare https links become anchors, because a tool can hand back a URL (the
 * Instacart cart) and a link she cannot tap is a link she has to retype. Only
 * the https scheme is recognised, so nothing else can ride in on an href.
 */
const LINK = /(\[[^\]\n]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s<>"'()]+)/g;

function anchor(href: string, label: string, key: string) {
  return (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
      {label}
    </a>
  );
}

function linkify(text: string, key: string): ReactNode[] {
  return text.split(LINK).map((part, i) => {
    const k = `${key}-${i}`;
    // Markdown form: [label](https://…)
    const md = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    if (md) return anchor(md[2], md[1], k);
    if (!part.startsWith("https://")) return <Fragment key={k}>{part}</Fragment>;
    // A sentence-ending full stop or comma belongs to the prose, not the link.
    const trail = part.match(/[.,;:!?]+$/)?.[0] ?? "";
    const href = part.slice(0, part.length - trail.length);
    return <Fragment key={k}>{anchor(href, href, k)}{trail}</Fragment>;
  });
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="rounded bg-raised px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{linkify(part, String(i))}</Fragment>;
  });
}

export function RichText({ children }: { children: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 space-y-1 pl-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-accent" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of children.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/) ?? line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    if (line.trim() === "") continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="mt-2 font-semibold text-text">{inline(heading[1])}</p>
      ) : (
        <p key={blocks.length} className="my-1 first:mt-0 last:mb-0">{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="leading-relaxed">{blocks}</div>;
}
