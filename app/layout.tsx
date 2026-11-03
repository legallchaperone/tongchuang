import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "同窗",
  description: "和隔着时差的朋友一起专注学习：实时状态、番茄钟、目标与数据。",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "同窗", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#a8683a" }, { media: "(prefers-color-scheme: dark)", color: "#2a1a10" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        {/* Fusion Pixel Font (OFL-1.1), split by unicode-range so only used glyphs load */}
        <link rel="stylesheet" href="/fonts/fusion12/Fusion-Pixel-12px-Proportional-Simplified-Chinese.css" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
