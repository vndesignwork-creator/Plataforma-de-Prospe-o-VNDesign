"use client";

/**
 * Fundo das Definições: a versão da plataforma aberta neste ecrã (a mesma de /api/version)
 * e se já é a publicada — para confirmar uma atualização, também no telemóvel.
 */
import { Check, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CLIENT_BUILD,
  CLIENT_BUILD_TIME,
  checkServer,
} from "@/lib/app-version";

type State = "checking" | "latest" | "new-version" | "unknown";

function formatBuildTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
}

export function AppVersion() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let alive = true;
    void checkServer().then((s) => {
      if (!alive) return;
      if (s.status !== "ok" || !s.build || !CLIENT_BUILD) setState("unknown");
      else setState(s.build === CLIENT_BUILD ? "latest" : "new-version");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!CLIENT_BUILD) return null;
  const when = formatBuildTime(CLIENT_BUILD_TIME);

  return (
    <section
      aria-label="Versão da plataforma"
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right text-xs text-muted"
    >
      <span>
        Versão <code className="font-mono text-fg tabular">{CLIENT_BUILD}</code>
        {when ? ` · publicada a ${when}` : ""}
      </span>
      {state === "latest" ? (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="h-3.5 w-3.5" aria-hidden /> É a mais recente
        </span>
      ) : state === "new-version" ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1 rounded font-medium text-accent-text underline-offset-2 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Há uma versão nova:
          atualizar
        </button>
      ) : null}
    </section>
  );
}
