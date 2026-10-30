"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  INTL_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_NAMES,
  translate,
  translateEnum,
  type Locale,
  type MessageKey,
  type Vars,
} from "./messages";

interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Translate an engine enum value (e.g. tEnum("status", "failed")); unknown values pass through. */
  tEnum: (prefix: string, value: string, vars?: Vars) => string;
  formatNumber: (n: number) => string;
  formatDate: (iso?: string) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  locale: initial,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLocaleState(next);
      // Server components (header, landing page) re-render with the new cookie.
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18n>(() => {
    const intl = INTL_LOCALE[locale];
    const numbers = new Intl.NumberFormat(intl);
    const dates = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short" });
    return {
      locale,
      t: (key, vars) => translate(locale, key, vars),
      tEnum: (prefix, v, vars) => translateEnum(locale, prefix, v, vars),
      formatNumber: (n) => numbers.format(n),
      formatDate: (iso) => (iso ? dates.format(new Date(iso)) : "—"),
      setLocale,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className="inline-flex h-8 items-center rounded-[3px] border border-border p-0.5 font-mono text-[11px]"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => l !== locale && setLocale(l)}
          aria-pressed={l === locale}
          aria-label={t("lang.switchTo", { lang: LOCALE_NAMES[l] })}
          title={LOCALE_NAMES[l]}
          className={
            l === locale
              ? "rounded-[2px] bg-text px-1.5 py-0.5 font-semibold text-bg"
              : "rounded-[2px] px-1.5 py-0.5 text-muted hover:text-text"
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
