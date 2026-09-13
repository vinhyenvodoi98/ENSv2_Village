import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The one display face for every "royal charter" surface — tip dialog, claim wizard, and the
// right-hand control board all draw their headers from this so the medieval styling reads as one
// wardrobe instead of each screen guessing at its own serif.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

const deploymentHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ENSv2 Kingdom",
    template: "%s | ENSv2 Kingdom",
  },
  description:
    "Turn ENSv2 names into living medieval kingdoms. Explore castles, command archers and siege engines, and tip realms with ETH.",
  applicationName: "ENSv2 Kingdom",
  keywords: [
    "ENSv2",
    "ENS",
    "Ethereum Name Service",
    "Ethereum",
    "onchain kingdom",
    "Web3 game",
  ],
  category: "technology",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "ENSv2 Kingdom",
    title: "ENSv2 Kingdom — Your Name. Your Realm.",
    description:
      "Turn ENSv2 names into living medieval kingdoms. Explore castles, command archers and siege engines, and tip realms with ETH.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ENSv2 Kingdom — Your Name. Your Realm.",
    description:
      "See ENSv2 names become living kingdoms, then rally archers and siege engines to tip a realm with ETH.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
