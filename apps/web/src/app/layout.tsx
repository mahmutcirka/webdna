import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WebDNA", template: "%s · WebDNA" },
  description:
    "Open-source website intelligence: design systems, responsive behaviour, source analysis and evidence-based AI-origin indicators.",
};

// Applies a saved light theme before paint; dark is the default.
const themeScript = `try{if(localStorage.getItem("webdna-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.5 7h7M8.5 17h7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-text">
              <span className="text-accent">
                <Logo />
              </span>
              WebDNA
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/dashboard"
                className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                Dashboard
              </Link>
              <Link
                href="/compare"
                className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                Compare
              </Link>
              <Link
                href="/detectors"
                className="hidden rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text sm:inline-block"
              >
                Detectors
              </Link>
            </nav>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-faint sm:px-6">
            <span>WebDNA — open-source website analysis. Apache-2.0.</span>
            <span>AI-origin categories describe observable evidence, not certainty.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
