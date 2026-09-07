"use client";

import { useEffect } from "react";
import { coveredBottom } from "@/lib/viewport-cover";

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
    let last = -1;
    const update = () => {
      const px = coveredBottom({ innerHeight: window.innerHeight, offsetTop: vv.offsetTop, height: vv.height, scale: vv.scale });
      if (px === last) return;
      last = px;
      document.documentElement.style.setProperty("--covered-bottom", `${px}px`);
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
    };
  }, []);
  return null;
}
