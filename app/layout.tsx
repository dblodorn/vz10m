import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

const mono = localFont({ src: "./fonts/AA_Knif-mono.woff", weight: "400", variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "VZ-10M",
  description: "A browser editor and librarian for the Casio VZ-10M, over Web MIDI SysEx.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
