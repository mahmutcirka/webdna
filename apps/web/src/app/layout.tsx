import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { I18nProvider, LanguageSwitcher } from "@/i18n/client";
import { getTranslator } from "@/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: { default: "WebDNA", template: "%s · WebDNA" },
    description: t("meta.description"),
  };
}

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getTranslator();
  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
          <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
              <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-text">
                <span className="text-accent">
                  <Logo />
                </span>
                WebDNA
              </Link>
              <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:gap-1">
                <Link
                  href="/dashboard"
                  className="shrink-0 rounded-md px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-text sm:px-2.5"
                >
                  {t("nav.dashboard")}
                </Link>
                <Link
                  href="/compare"
                  className="shrink-0 rounded-md px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-text sm:px-2.5"
                >
                  {t("nav.compare")}
                </Link>
                <Link
                  href="/detectors"
                  className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text sm:inline-block"
                >
                  {t("nav.detectors")}
                </Link>
              </nav>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-faint sm:px-6">
              <span>{t("footer.left")}</span>
              <span>{t("footer.right")}</span>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
