import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/tab-bar";
import { Feedback } from "@/components/feedback";

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
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-base text-text">
        <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-4">{children}</main>
        <Feedback />
        <TabBar />
      </body>
    </html>
  );
}
