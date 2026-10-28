import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wangmai — ว่างมั้ย?",
  description: "Personal schedules and availability, brought together.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
