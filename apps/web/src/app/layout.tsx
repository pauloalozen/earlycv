import type { Metadata, Viewport } from "next";
import Script from "next/script";
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

const isProduction = process.env.NODE_ENV === "production";
const GTM_ID = "GTM-K3PZK9FJ";

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
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-white.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    other: [
      { rel: "manifest-icon", url: "/favicon-192x192.png", sizes: "192x192" },
      { rel: "manifest-icon", url: "/favicon-512x512.png", sizes: "512x512" },
    ],
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
      <head>
        {isProduction ? (
          <Script id="gtm" strategy="beforeInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        ) : null}
      </head>
      <body className="font-sans antialiased">
        {isProduction ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="gtm"
            />
          </noscript>
        ) : null}
        {children}
      </body>
    </html>
  );
}
