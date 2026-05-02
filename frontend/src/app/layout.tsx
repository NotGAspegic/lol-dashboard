import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Farsight — League of Legends Analytics",
  description:
    "Advanced League of Legends analytics with deep match analysis, gold curve visualization, vision tracking, and ML-powered tilt detection.",
  metadataBase: new URL("https://farsight-gg.vercel.app"),
  openGraph: {
    title: "Farsight — League of Legends Analytics",
    description:
      "Advanced League of Legends analytics with deep match analysis, gold curve visualization, vision tracking, and ML-powered tilt detection.",
    url: "https://farsight-gg.vercel.app",
    siteName: "Farsight",
    images: [
      {
        url: "/favicon/favicon.svg",
        width: 512,
        height: 512,
        alt: "Farsight logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Farsight — League of Legends Analytics",
    description:
      "Advanced League of Legends analytics with deep match analysis, gold curve visualization, vision tracking, and ML-powered tilt detection.",
    images: ["/favicon/favicon.svg"],
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/favicon/apple-touch-icon.png",
    shortcut: "/favicon/favicon.ico",
  },
  manifest: "/favicon/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
        <body
          className="min-h-screen antialiased"
          style={{ background: "#060E1A", fontFamily: "Inter, sans-serif" }}
        >
        <Providers>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6">
            {children}
          </main>
          <Footer />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
