import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
  translate,
  type Locale,
  type MessageKey,
  type Vars,
} from "./messages";

/** The visitor's locale: saved choice (cookie) first, then the browser's Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export async function getTranslator(): Promise<{
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
}> {
  const locale = await getLocale();
  return { locale, t: (key, vars) => translate(locale, key, vars) };
}
