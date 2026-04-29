"use client";

import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav
      className="border-b sticky top-0 z-50 backdrop-blur-sm"
      style={{
        background: "rgba(10,22,40,0.85)",
        borderColor: "rgba(30,155,232,0.15)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <Image
            src="/farsight.png"
            alt="Farsight"
            width={28}
            height={28}
            className="rounded-sm group-hover:brightness-125 transition-all"
          />
          <span className="font-bold text-base tracking-tight text-white">
            Farsight
          </span>
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/draft"
            style={{ color: "#3A5070" }}
            className="hover:text-white transition-colors"
          >
            Draft
          </Link>
          <a
            aria-label="View source on GitHub"
            href="https://github.com/NotGAspegic/lol-dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3A5070" }}
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
