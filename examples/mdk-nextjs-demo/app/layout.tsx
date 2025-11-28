import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "MDK Next.js Demo Checkout",
  description:
    "A minimal Lightning checkout example that runs on Vercel using @moneydevkit/nextjs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>{children}</body>
    </html>
  );
}
