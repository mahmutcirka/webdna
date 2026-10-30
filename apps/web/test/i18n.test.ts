import { describe, expect, it } from "vitest";
import { STAGES, AI_CONCLUSION_LABELS, AI_ORIGIN_DISCLAIMER } from "@webdna/shared";
import {
  LOCALES,
  MESSAGES,
  localeFromAcceptLanguage,
  translate,
  translateEnum,
} from "../src/i18n/messages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("UI translations", () => {
  const en = MESSAGES.en;

  it.each(LOCALES)("%s defines exactly the English keys", (locale) => {
    expect(Object.keys(MESSAGES[locale]).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(LOCALES.filter((l) => l !== "en"))(
    "%s uses the same placeholders as English",
    (locale) => {
      for (const [key, value] of Object.entries(en)) {
        expect(placeholders(MESSAGES[locale][key as keyof typeof en]), key).toEqual(
          placeholders(value),
        );
      }
    },
  );

  it.each(LOCALES.filter((l) => l !== "en"))("%s has no empty translations", (locale) => {
    for (const [key, value] of Object.entries(MESSAGES[locale])) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("keeps English UI strings identical to the engine's canonical labels", () => {
    for (const s of STAGES) expect(translate("en", `stage.${s.id}` as never)).toBe(s.label);
    for (const [k, v] of Object.entries(AI_CONCLUSION_LABELS)) {
      expect(translate("en", `conclusion.${k}` as never)).toBe(v);
    }
    expect(translate("en", "ai.disclaimer")).toBe(AI_ORIGIN_DISCLAIMER);
  });

  it("fills placeholders and falls back for unknown enum values", () => {
    expect(translate("tr", "dash.count", { n: 3 })).toBe("3 tarama");
    expect(translateEnum("tr", "status", "failed")).toBe("başarısız");
    expect(translateEnum("tr", "status", "brand_new_state")).toBe("brand new state");
  });
});

describe("locale detection", () => {
  it.each([
    [undefined, "en"],
    ["", "en"],
    ["tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7", "tr"],
    ["en-GB,en;q=0.9,tr;q=0.8", "en"],
    ["de-DE,de;q=0.9", "en"],
    ["de-DE,tr;q=0.5", "tr"],
    ["en;q=0.1,tr;q=0.9", "tr"],
  ])("Accept-Language %s → %s", (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });
});
