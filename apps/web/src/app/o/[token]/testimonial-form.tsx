"use client";

/** Formulário do testemunho: estrelas (1 a 5), a opinião, o nome e a autorização para publicar. */
import { TESTIMONIAL_QUOTE_MAX } from "@vndesign/core";
import { CheckCircle2, Copy, Send, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Values = {
  rating: number | null;
  quote: string;
  author_name: string;
  author_role: string;
  can_publish: boolean;
};

const RATING_TEXT = ["", "Muito mau", "Mau", "Razoável", "Bom", "Excelente"];

export function TestimonialForm({
  token,
  initial,
  received,
  googleReviewUrl,
}: {
  token: string;
  initial: Values;
  received: boolean;
  googleReviewUrl: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(received);
  const [google, setGoogle] = useState<string | null>(googleReviewUrl);
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const local: Record<string, string> = {};
    if (!values.rating) local.rating = "Escolha de 1 a 5 estrelas.";
    if (values.quote.trim().length < 10)
      local.quote = "Escreva pelo menos uma frase.";
    if (!values.author_name.trim()) local.author_name = "Indique o seu nome.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/public/testimonials/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          author_role: values.author_role.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        data?: { google_review_url: string | null };
        detail?: string;
        title?: string;
        errors?: Record<string, string[]>;
      } | null;
      if (!res.ok) {
        if (body?.errors)
          setErrors(
            Object.fromEntries(
              Object.entries(body.errors).map(([k, v]) => [k, v[0] ?? ""]),
            ),
          );
        throw new Error(
          body?.detail ??
            body?.title ??
            "Não foi possível enviar. Tente outra vez.",
        );
      }
      setGoogle(body?.data?.google_review_url ?? null);
      setSent(true);
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar. Tente outra vez.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(values.quote.trim());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 font-medium text-success"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{" "}
          Recebido. Muito obrigado pela sua opinião!
        </p>
        {google ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="font-medium">
              Pode deixar a mesma opinião no Google?
            </p>
            <p className="text-sm text-muted">
              É o que mais ajuda um pequeno negócio a ser encontrado. Copie o
              texto e cole-o lá: leva 30 segundos.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={copyText} className="w-full">
                <Copy className="h-4 w-4" aria-hidden />{" "}
                {copied ? "Texto copiado" : "Copiar o meu texto"}
              </Button>
              <a
                href={google}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonClasses("primary", "md"), "w-full")}
              >
                <Star className="h-4 w-4" aria-hidden /> Avaliar no Google
              </a>
            </div>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
            Corrigir a minha opinião
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      noValidate
      aria-label="Formulário do testemunho"
    >
      <fieldset
        className="rounded-xl border border-border bg-surface p-4"
        aria-describedby={errors.rating ? "rating-error" : undefined}
      >
        <legend className="px-1 font-medium">
          De 1 a 5, como avalia o trabalho?
        </legend>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = (values.rating ?? 0) >= n;
            return (
              <label
                key={n}
                className="cursor-pointer rounded-md p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={values.rating === n}
                  onChange={() => set("rating", n)}
                  className="sr-only"
                  aria-label={`${n} estrela${n === 1 ? "" : "s"} (${RATING_TEXT[n]})`}
                />
                <Star
                  className={cn(
                    "h-9 w-9 transition-colors",
                    on ? "fill-accent text-accent" : "text-border-input",
                  )}
                  aria-hidden
                />
              </label>
            );
          })}
          {values.rating ? (
            <span className="ml-2 text-sm text-muted">
              {RATING_TEXT[values.rating]}
            </span>
          ) : null}
        </div>
        {errors.rating ? (
          <p id="rating-error" className="mt-1 text-sm text-danger">
            {errors.rating}
          </p>
        ) : null}
      </fieldset>

      <Field
        label="A sua opinião"
        hint="O que diria a alguém que está a pensar trabalhar connosco?"
        error={errors.quote}
        required
      >
        <Textarea
          rows={5}
          maxLength={TESTIMONIAL_QUOTE_MAX}
          value={values.quote}
          onChange={(e) => set("quote", e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="O seu nome" error={errors.author_name} required>
          <Input
            autoComplete="name"
            maxLength={120}
            value={values.author_name}
            onChange={(e) => set("author_name", e.target.value)}
          />
        </Field>
        <Field label="Cargo e empresa (opcional)" error={errors.author_role}>
          <Input
            autoComplete="organization-title"
            maxLength={120}
            placeholder="Ex.: Gerente, Café Central"
            value={values.author_role}
            onChange={(e) => set("author_role", e.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={values.can_publish}
          onChange={(e) => set("can_publish", e.target.checked)}
        />
        <span>
          Autorizo mostrar esta opinião, com o meu nome, em propostas, no site e
          nas redes sociais.
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={busy} className="max-sm:w-full">
          <Send className="h-4 w-4" aria-hidden /> Enviar
        </Button>
      </div>
    </form>
  );
}
