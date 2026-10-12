import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IP/Sentinel — Live IP Health Intelligence",
  description: "Real-time public reputation and connectivity checks for your visible IP.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
