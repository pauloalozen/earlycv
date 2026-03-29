import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
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

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ea580c",
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
      className={`${dmSans.variable} ${jetBrainsMono.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
