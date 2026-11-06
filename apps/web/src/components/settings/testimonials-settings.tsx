"use client";

/**
 * Definições → Testemunhos: as opiniões que os clientes deixaram (link /o/…, pedido
 * no projeto). Os autorizados com 4 ou 5 estrelas podem aparecer no PDF da proposta
 * (até 2, os mais recentes marcados "Mostrar nas propostas").
 */
import {
  formatDate,
  isTestimonialShowable,
  type TestimonialListItem,
} from "@vndesign/core";
import { Copy, Quote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Stars } from "@/components/projects/testimonial-section";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api-client";
import {
  useSettings,
  useTestimonials,
  useUpdateTestimonial,
} from "@/lib/queries";

function copy(text: string, done: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Não foi possível copiar."),
  );
}

function Row({
  t,
  onDelete,
}: {
  t: TestimonialListItem;
  onDelete: () => void;
}) {
  const update = useUpdateTestimonial();
  const allowed = t.can_publish && (t.rating ?? 0) >= 4;
  const author = [t.author_name, t.author_role].filter(Boolean).join(", ");
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Stars rating={t.rating ?? 0} />
        <Link
          href={`/leads/${t.lead_id}#projeto`}
          className="min-w-0 truncate font-medium hover:underline"
        >
          {t.company_name}
        </Link>
        {t.submitted_at ? (
          <span className="text-xs text-muted">
            {formatDate(t.submitted_at.slice(0, 10))}
          </span>
        ) : null}
        {!t.can_publish ? (
          <Badge>Sem autorização para publicar</Badge>
        ) : isTestimonialShowable(t) ? (
          <Badge tone="success">Nas propostas</Badge>
        ) : null}
      </div>
      <blockquote className="text-sm whitespace-pre-line break-words">
        “{t.quote}”
      </blockquote>
      {author ? <p className="text-xs text-muted">— {author}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label
          className={`mr-auto inline-flex items-center gap-2 text-sm ${allowed ? "" : "text-muted"}`}
        >
          <Switch
            checked={allowed && t.featured}
            disabled={!allowed || update.isPending}
            label={`Mostrar o testemunho de ${t.company_name} nas propostas`}
            onCheckedChange={(featured) =>
              update.mutate(
                { id: t.id, featured },
                { onError: (e) => toast.error(errorMessage(e)) },
              )
            }
          />
          {allowed
            ? "Mostrar nas propostas"
            : (t.rating ?? 0) < 4
              ? "Só 4 ou 5 estrelas vão para as propostas"
              : "Só com autorização do cliente"}
        </label>
        <span className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              copy(
                `“${t.quote ?? ""}”${author ? `\n— ${author}` : ""}`,
                "Texto copiado.",
              )
            }
          >
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar texto
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onDelete}
            aria-label={`Apagar o testemunho de ${t.company_name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </span>
      </div>
    </li>
  );
}

export function TestimonialsSettings() {
  const { data, isLoading } = useTestimonials();
  const { data: settings } = useSettings();
  const update = useUpdateTestimonial();
  const [remove, setRemove] = useState<TestimonialListItem | null>(null);
  const received = (data ?? []).filter((t) => t.status === "recebido");
  const waiting = (data ?? []).filter((t) => t.status !== "recebido");
  const average = received.length
    ? received.reduce((sum, t) => sum + (t.rating ?? 0), 0) / received.length
    : null;
  const off =
    settings &&
    (!settings.features.projects || !settings.features.testimonials);

  return (
    <>
      <Card>
        <CardHeader
          title="Testemunhos dos clientes"
          description="Pede o testemunho no projeto (separador Cliente) ou ao concluí-lo. Com autorização do cliente e 4 ou 5 estrelas, os 2 mais recentes marcados aparecem no PDF da proposta."
        />
        {off ? (
          <p className="px-4 pb-3 text-sm text-warning">
            Os testemunhos estão desligados. Liga-os em{" "}
            <Link href="/definicoes/funcionalidades" className="underline">
              Funcionalidades
            </Link>
            .
          </p>
        ) : null}
        {isLoading ? (
          <div className="px-4 pb-4">
            <Skeleton className="h-16" />
          </div>
        ) : received.length ? (
          <>
            <p className="px-4 pb-2 text-sm text-muted">
              {received.length} testemunho{received.length === 1 ? "" : "s"} ·
              média {average!.toFixed(1).replace(".", ",")} de 5
            </p>
            <ul
              aria-label="Testemunhos recebidos"
              className="divide-y divide-border border-t border-border"
            >
              {received.map((t) => (
                <Row key={t.id} t={t} onDelete={() => setRemove(t)} />
              ))}
            </ul>
          </>
        ) : (
          <p className="flex items-center gap-2 px-4 pb-4 text-sm text-muted">
            <Quote className="h-4 w-4 shrink-0" aria-hidden /> Ainda não há
            testemunhos. Pede o primeiro quando concluíres um projeto.
          </p>
        )}
      </Card>

      {waiting.length ? (
        <Card>
          <CardHeader
            title={`À espera de resposta (${waiting.length})`}
            description="O link já foi criado; o cliente ainda não respondeu."
            as="h3"
          />
          <ul
            aria-label="Testemunhos à espera"
            className="divide-y divide-border border-t border-border"
          >
            {waiting.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-2 px-4 py-2"
              >
                <Link
                  href={`/leads/${t.lead_id}#projeto`}
                  className="min-w-0 truncate text-sm hover:underline"
                >
                  {t.company_name}
                </Link>
                <span className="text-xs text-muted">
                  pedido a {formatDate(t.created_at.slice(0, 10))}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copy(
                        `${window.location.origin}/o/${t.token}`,
                        "Link copiado.",
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar link
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setRemove(t)}
                    aria-label={`Apagar o pedido de testemunho de ${t.company_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Dialog
        open={!!remove}
        onOpenChange={(o) => (!o ? setRemove(null) : undefined)}
        title="Apagar o testemunho?"
        description={
          remove
            ? `${remove.company_name}: o link deixa de funcionar${remove.status === "recebido" ? " e a opinião é apagada" : ""}.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemove(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={async () => {
                try {
                  await update.mutateAsync({ id: remove!.id, remove: true });
                  setRemove(null);
                  toast.success("Testemunho apagado.");
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              Apagar
            </Button>
          </>
        }
      />
    </>
  );
}
