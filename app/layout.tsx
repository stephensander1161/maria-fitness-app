import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/tab-bar";
import { Feedback } from "@/components/feedback";
import { InstallApp } from "@/components/install-app";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { CoachBubbleGate } from "@/components/coach-bubble-gate";
import { SideNavGate } from "@/components/side-nav-gate";
import { DailyFact } from "@/components/daily-fact";

export const metadata: Metadata = {
  title: "Coach",
  description: "Your strength and nutrition coach",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Coach" },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0e13",
  width: "device-width",
  initialScale: 1,
  // Deliberately not capped: the app leans on 10-13px text and she should
  // be able to zoom it. Inputs are 15px+, so there is no zoom-on-focus jump
  // to prevent here anyway.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Two layouts, not one that stretches.

        A phone scrolls the document: the whole page moves under the thumb and
        that is correct there. A desktop app owns the viewport — the window
        does not scroll, the panes inside it do — which is the difference
        between an application and a long web page. `md:h-dvh` plus
        `overflow-hidden` here makes the body a fixed frame; every scrolling
        region below says so for itself.
      */}
      <body className="min-h-dvh bg-base text-text md:h-dvh md:overflow-hidden md:pl-56">
        <SideNavGate />
        <PullToRefresh>
          {/*
            One column on a phone, offset past the sidebar and wider on a
            desktop. `md:pl-56` clears the fixed nav; the column itself stays
            readable rather than stretching to the window — 40rem of prose and
            cards is a comfortable measure, and the extra room goes to the
            margins.
          */}
          <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-4 md:h-dvh md:max-w-none md:overflow-y-auto md:px-8 md:py-8">
            {/* The frame is the window; the measure is still a measure. */}
            <div className="md:mx-auto md:max-w-5xl">
              {children}
              <DailyFact />
            </div>
          </main>
        </PullToRefresh>
        <CoachBubbleGate />
        <Feedback />
        <InstallApp />
        <TabBar />
      </body>
    </html>
  );
}
