"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what lets her install this to her
 * home screen and stops the build assets being re-downloaded on gym wifi.
 *
 * Registration is deliberately quiet: it happens after load so it never
 * competes with the first render, and a failure is ignored because a browser
 * that will not take a service worker still runs the whole app fine.
 */
export function InstallApp() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
