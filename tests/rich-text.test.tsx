import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "@/components/rich-text";

const render = (text: string) => renderToStaticMarkup(<RichText>{text}</RichText>);

describe("coach output links", () => {
  it("turns a bare https link into an anchor that opens in a new tab", () => {
    const html = render("Your cart: https://www.instacart.com/store/shopping_lists/abc123.");
    expect(html).toContain('<a href="https://www.instacart.com/store/shopping_lists/abc123" target="_blank" rel="noopener noreferrer"');
    // The full stop stays in the prose rather than breaking the link.
    expect(html).toContain("abc123</a>.");
  });

  it("renders markdown links with their label", () => {
    const html = render("[Open your cart](https://example.com/list) when ready.");
    expect(html).toContain('href="https://example.com/list"');
    expect(html).toContain(">Open your cart</a> when ready.");
  });

  it("only recognises https, so nothing else can ride in on an href", () => {
    const html = render("try javascript:alert(1) or http://plain.example");
    expect(html).not.toContain("<a ");
    expect(html).toContain("javascript:alert(1)");
  });

  it("never renders markup from the text itself", () => {
    const html = render('<img src=x onerror=alert(1)> **bold**');
    expect(html).toContain("&lt;img");
    expect(html).toContain("<strong");
  });
});

/**
 * The app's whole XSS boundary. Coach output is model text that has been
 * anywhere near a tool result, a food name, or something she typed — so the
 * rule is that it becomes React nodes and never HTML.
 */
describe("what a link can never be", () => {
  const schemes = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.test/phish",
    "http://insecure.test",
  ];

  it("never renders a link for anything but https", () => {
    for (const url of schemes) {
      const html = render(`Try ${url} now`);
      expect(html, url).not.toContain("<a ");
    }
  });

  it("never renders a markdown link for anything but https", () => {
    for (const url of schemes) {
      const html = render(`[click me](${url})`);
      expect(html, url).not.toContain("<a ");
    }
  });

  it("escapes markup rather than rendering it", () => {
    const html = render('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;");
  });

  it("does not let a label smuggle markup into a real link", () => {
    const html = render('[<img src=x onerror=alert(1)>](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("<img");
  });
});

describe("the boundary holds because nothing else renders HTML", () => {
  it("no file in the app uses dangerouslySetInnerHTML", async () => {
    // SECURITY.md's claim, checked. rich-text.tsx builds React nodes on
    // purpose; the moment anything anywhere reaches for innerHTML, coach
    // output has a second, unguarded path to the DOM.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
      }
      return out;
    };
    const offenders = [...walk("components"), ...walk("app"), ...walk("lib")]
      .filter((f) => /dangerouslySetInnerHTML/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
