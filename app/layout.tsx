import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/tab-bar";
import { Feedback } from "@/components/feedback";
import { InstallApp } from "@/components/install-app";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { SideNavGate } from "@/components/side-nav-gate";
import { DailyFact } from "@/components/daily-fact";
import { RestBar, RestProvider } from "@/components/rest-provider";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

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
      <body className="min-h-dvh bg-base text-text md:h-dvh md:overflow-hidden">
        {/*
          A flex row rather than a fixed sidebar plus a matching left padding.
          The two have to agree on a width, and when they disagree the content
          lands somewhere off to the right with no clue why — which is exactly
          what happened. Here the nav takes its width and the pane takes the
          rest, and there is nothing to keep in step.
        */}
        <RestProvider>
        <div className="md:flex md:h-dvh">
          <SideNavGate />
          <main className="md:min-w-0 md:flex-1 md:overflow-y-auto">
            {/*
              Above the pull-to-refresh container on purpose: the bar should
              stay put while the page underneath it is dragged, and it is in
              normal flow so it pushes the screen down rather than covering
              the first thing on it.
            */}
            <RestBar />
            <PullToRefresh>
              {/*
                The frame is the window; the measure is still a measure — but a
                27-inch screen was getting a 64rem column with a foot of empty
                either side. It widens in steps, and the screens that fill it
                lay out in more columns as it does.
              */}
              <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-4 md:max-w-5xl md:px-8 md:py-8 xl:max-w-6xl 2xl:max-w-[100rem] 2xl:px-12">
                {children}
                <DailyFact />
              </div>
            </PullToRefresh>
          </main>
        </div>
        </RestProvider>
        <RefreshOnFocus />
        <Feedback />
        <InstallApp />
        <TabBar />
      </body>
    </html>
  );
}
