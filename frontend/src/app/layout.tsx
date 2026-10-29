import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const manrope = localFont({ src: "../assets/fonts/manrope-variable.ttf", variable: "--font-manrope", weight: "200 800", display: "swap" });
const notoSansThai = localFont({ src: "../assets/fonts/noto-sans-thai-variable.ttf", variable: "--font-noto-thai", weight: "100 900", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Wangmai", template: "%s | Wangmai" },
  description: "Find out who’s free, without asking everyone. Make a little time together with Wangmai (ว่างมั้ย?).",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${notoSansThai.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
