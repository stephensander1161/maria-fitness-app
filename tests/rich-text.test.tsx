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
