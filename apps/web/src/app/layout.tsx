import type { Metadata, Viewport } from "next";
import {
  Dancing_Script,
  DM_Sans,
  Geist,
  Geist_Mono,
  Gugi,
  Instrument_Serif,
  JetBrains_Mono,
  Playfair_Display,
  Syne,
} from "next/font/google";
import "./globals.css";

import { getAbsoluteUrl, siteConfig } from "@/lib/site";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const gugi = Gugi({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-logo",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "block",
  variable: "--font-serif",
});

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  display: "block",
  variable: "--font-script",
});

const syne = Syne({
  subsets: ["latin"],
  display: "block",
  variable: "--font-display",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  style: ["italic"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#111111",
  width: "device-width",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.defaultTitle,
    template: siteConfig.titleTemplate,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  category: "jobs",
  keywords: [...siteConfig.keywords],
  openGraph: {
    type: "website",
    url: getAbsoluteUrl("/"),
    title: siteConfig.defaultTitle,
    description: siteConfig.description,
    siteName: siteConfig.name,
    locale: "pt_BR",
    images: [
      {
        url: getAbsoluteUrl(siteConfig.ogImage),
        width: 1200,
        height: 630,
        alt: "EarlyCV - monitoramento de vagas e adaptacao de curriculo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.description,
    images: [getAbsoluteUrl(siteConfig.ogImage)],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${jetBrainsMono.variable} ${gugi.variable} ${playfairDisplay.variable} ${dancingScript.variable} ${syne.variable} ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
