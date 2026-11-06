"use client";

/**
 * Testemunho do cliente: criar o link (/o/<código>), enviá-lo (WhatsApp, email ou
 * copiar) e ver a opinião recebida. Os autorizados aparecem nas propostas
 * (Definições → Testemunhos).
 */
import {
  formatDateTime,
  isTestimonialShowable,
  type Lead,
  type Testimonial,
} from "@vndesign/core";
import {
  Copy,
  ExternalLink,
  MessageCircle,
  Quote,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { SendEmailButton } from "@/components/email/send-email-dialog";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api-client";
import {
  useSignature,
  useTestimonial,
  useTestimonialAction,
} from "@/lib/queries";
import { whatsappUrl } from "@/lib/utils";
import { SectionHeader } from "./section-header";

const testimonialUrl = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/o/${token}`;

export function Stars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={`${rating} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`inline h-3.5 w-3.5 ${n <= rating ? "fill-accent text-accent" : "text-border-input"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

function useMessage(lead: Lead, testimonial: Testimonial | null | undefined) {
  const { data: signature } = useSignature();
  const url = testimonial ? testimonialUrl(testimonial.token) : null;
  const message = url
    ? `Olá${lead.contact_name ? ` ${lead.contact_name}` : ""}! Foi um gosto trabalhar convosco. Pode dizer-nos como correu? Leva 1 minuto e ajuda muito:\n${url}\n\nObrigado!\n${signature?.full_name ?? ""}`.trim()
    : "";
  return { url, message };
}

/** Os botões para enviar o link (também no fim de "Concluir projeto"). */
export function TestimonialRequest({
  lead,
  compact = false,
}: {
  lead: Lead;
  compact?: boolean;
}) {
  const { data: testimonial, isLoading } = useTestimonial(lead.id);
  const action = useTestimonialAction(lead.id);
  const { url, message } = useMessage(lead, testimonial);
  const wa = url ? whatsappUrl(lead.phone, message) : null;

  async function create() {
    try {
      await action.mutateAsync({});
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      toast.success("Link copiado.");
    } catch {
      toast.error(
        "Não foi possível copiar. Seleciona o link e copia manualmente.",
      );
    }
  }

  if (isLoading) return <Skeleton className="h-8" />;
  if (!testimonial) {
    return (
      <div className={compact ? "flex justify-end" : undefined}>
        <Button
          size="sm"
          variant="outline"
          onClick={create}
          loading={action.isPending}
        >
          <Quote className="h-3.5 w-3.5" aria-hidden /> Pedir testemunho
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses("outline", "sm")}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
        </a>
      ) : null}
      {lead.email ? (
        <SendEmailButton
          lead={lead}
          subject={`A sua opinião sobre o projeto — ${lead.company_name}`}
          body={message}
          template="Testemunho"
          label="Email"
          variant="outline"
        />
      ) : null}
      <Button size="sm" variant="outline" onClick={copy}>
        <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar link
      </Button>
      {!compact ? (
        <a
          href={url!}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses("ghost", "sm")}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver como o
          cliente
        </a>
      ) : null}
    </div>
  );
}

export function TestimonialSection({ lead }: { lead: Lead }) {
  const { data: testimonial, isLoading } = useTestimonial(lead.id);
  const action = useTestimonialAction(lead.id);
  const [confirm, setConfirm] = useState(false);
  const received = testimonial?.status === "recebido";

  return (
    <section
      aria-labelledby={`testimonial-${lead.id}`}
      className="border-t border-border px-4 py-3"
    >
      <SectionHeader
        id={`testimonial-${lead.id}`}
        icon={Quote}
        title="Testemunho"
        summary={
          testimonial ? (
            <Badge tone={received ? "success" : "warning"}>
              {received ? "Recebido" : "À espera do cliente"}
            </Badge>
          ) : null
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {!testimonial ? (
            <p className="text-sm text-muted">
              Um link para o cliente dar a opinião (1 a 5 estrelas). Com
              autorização, aparece nas tuas propostas.
            </p>
          ) : null}
          {received && testimonial ? (
            <figure className="rounded-lg border border-border bg-surface-2 p-3">
              <Stars rating={testimonial.rating ?? 0} />
              <blockquote className="mt-1 text-sm whitespace-pre-line break-words">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-1 text-xs text-muted">
                {[testimonial.author_name, testimonial.author_role]
                  .filter(Boolean)
                  .join(", ")}
                {testimonial.submitted_at
                  ? ` · ${formatDateTime(testimonial.submitted_at)}`
                  : ""}
              </figcaption>
              <p className="mt-2 text-xs text-muted">
                {!testimonial.can_publish
                  ? "O cliente não autorizou a publicação: fica só para ti."
                  : isTestimonialShowable(testimonial)
                    ? "Aparece nas propostas. "
                    : (testimonial.rating ?? 0) < 4
                      ? "Com menos de 4 estrelas, não aparece nas propostas. "
                      : "Escondido das propostas. "}
                <Link
                  href="/definicoes/testemunhos"
                  className="text-accent-text hover:underline"
                >
                  Gerir testemunhos
                </Link>
              </p>
            </figure>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TestimonialRequest lead={lead} />
            {testimonial ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setConfirm(true)}
                aria-label="Apagar o testemunho"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Apagar o testemunho?"
        description="O link deixa de funcionar e a opinião do cliente é apagada."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={action.isPending}
              onClick={async () => {
                try {
                  await action.mutateAsync({ remove: true });
                  setConfirm(false);
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
    </section>
  );
}
