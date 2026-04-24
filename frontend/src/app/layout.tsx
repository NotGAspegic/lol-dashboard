import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Farsight — League of Legends Analytics",
  description: "Advanced League of Legends player analytics dashboard",
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
        </Providers>
      </body>
    </html>
  );
}