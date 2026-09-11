"use client";

import { useEffect } from "react";
import { coversFixedElements, coveredBottom, visibleHeight } from "@/lib/viewport-cover";

/**
 * Keeps `--covered-bottom` on <html> equal to what the browser toolbar is
 * covering — see lib/viewport-cover.ts. Mounted once, in the root layout, and
 * renders nothing. Listens to the visual viewport rather than polling, and
 * the variable is only written when the number changes, so on a browser that
 * covers nothing this costs one listener and no repaints.
 */
export function ViewportCover() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Asked once: no browser changes what it does with fixed elements while
    // she is scrolling, and this used to be assumed true of all of them.
    const overlays = coversFixedElements(navigator.userAgent);
    let last = -1;
    let lastTall = -1;
    const update = () => {
      const px = coveredBottom({
        innerHeight: window.innerHeight, offsetTop: vv.offsetTop,
        height: vv.height, scale: vv.scale, overlays,
      });
      if (px !== last) {
        last = px;
        document.documentElement.style.setProperty("--covered-bottom", `${px}px`);
      }
      // And how tall the visible strip is, for sheets that fill it. Chrome on
      // iOS reports a `dvh` bigger than what is on screen, so a sheet sized in
      // `dvh` opens with its top clipped away above the address bar.
      const tall = visibleHeight({ height: vv.height, scale: vv.scale });
      if (tall !== null && tall !== lastTall) {
        lastTall = tall;
        document.documentElement.style.setProperty("--visual-height", `${tall}px`);
      }
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--covered-bottom");
      document.documentElement.style.removeProperty("--visual-height");
    };
  }, []);
  return null;
}
