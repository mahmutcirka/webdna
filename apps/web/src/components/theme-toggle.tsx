"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("webdna-theme", next);
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <button
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] border border-border text-muted hover:border-border-strong hover:text-text"
      aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
      title={t("theme.toggle")}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
