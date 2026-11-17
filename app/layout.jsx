import localFont from "next/font/local";
import "./globals.css";

const mono = localFont({ src: "./fonts/AA_Knif-mono.woff", weight: "400", variable: "--font-ui", display: "swap" });

export const metadata = {
  title: "VZ-10M",
  description: "A browser editor and librarian for the Casio VZ-10M, over Web MIDI SysEx.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
