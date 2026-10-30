import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { I18nProvider, LanguageSwitcher } from "@/i18n/client";
import { getTranslator } from "@/i18n/server";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: { default: "WebDNA", template: "%s · WebDNA" },
    description: t("meta.description"),
  };
}

// Applies a saved dark theme before paint; the light "paper" theme is the default.
const themeScript = `try{if(localStorage.getItem("webdna-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

/** Four base pairs as a tiny barcode: the WebDNA mark. */
function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="4.5" y="4.5" width="2" height="13" fill="currentColor" />
      <rect x="8.5" y="4.5" width="4" height="13" fill="var(--accent)" />
      <rect x="14" y="4.5" width="1.5" height="13" fill="currentColor" />
      <rect x="16.5" y="4.5" width="1" height="13" fill="currentColor" opacity=".5" />
    </svg>
  );
}

const NAV_LINK =
  "shrink-0 px-2 py-1.5 font-mono text-[12px] uppercase tracking-wider text-muted underline-offset-[6px] hover:text-text hover:underline sm:px-2.5";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getTranslator();
  return (
    <html lang={locale} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
          <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
              <Link
                href="/"
                aria-label="WebDNA"
                className="flex shrink-0 items-center gap-2.5 text-text"
              >
                <Logo />
                <span className="hidden items-baseline min-[420px]:flex">
                  <span className="font-serif text-[22px] leading-none italic">Web</span>
                  <span className="font-mono text-[13px] font-semibold tracking-wider">DNA</span>
                </span>
              </Link>
              <nav className="flex min-w-0 items-center overflow-x-auto">
                <Link href="/dashboard" className={NAV_LINK}>
                  {t("nav.dashboard")}
                </Link>
                <Link href="/compare" className={NAV_LINK}>
                  {t("nav.compare")}
                </Link>
                <Link href="/detectors" className={`${NAV_LINK} hidden sm:inline-block`}>
                  {t("nav.detectors")}
                </Link>
              </nav>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
            <div className="ruler" aria-hidden="true" />
          </header>
          <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
          <footer className="mt-10">
            <div className="ruler" aria-hidden="true" />
            <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-[auto_1fr] sm:items-end sm:px-6">
              <div className="flex items-center gap-3 text-text">
                <Logo />
                <span className="font-serif text-3xl italic leading-none">WebDNA</span>
              </div>
              <div className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed text-faint sm:items-end sm:text-right">
                <span>{t("footer.left")}</span>
                <span>{t("footer.right")}</span>
              </div>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
