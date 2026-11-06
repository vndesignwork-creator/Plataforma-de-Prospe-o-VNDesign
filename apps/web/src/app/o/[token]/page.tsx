import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicTestimonial } from "@/server/services/testimonials";
import { TestimonialForm } from "./testimonial-form";

/*
 * Testemunho do cliente (link /o/<código>, sem login): nota de 1 a 5, a opinião
 * e a autorização para publicar. Pode voltar ao link e corrigir.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getPublicTestimonial((await params).token);
  return {
    title: { absolute: t ? `A sua opinião · ${t.brand}` : "A sua opinião" },
    robots: { index: false, follow: false },
  };
}

export default async function TestimonialPage({ params }: Props) {
  const token = (await params).token;
  const t = await getPublicTestimonial(token);
  if (!t) notFound();
  const brand = t.brand;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold tracking-tight">
          {brand.startsWith("VN") ? (
            <>
              <span className="text-accent">VN</span>
              {brand.slice(2)}
            </>
          ) : (
            brand
          )}
        </p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Como correu o projeto?
        </h1>
        <p className="text-muted">
          {t.contact_name ? `Olá ${t.contact_name}! ` : "Olá! "}
          Obrigado por ter trabalhado connosco. Leva 1 minuto e ajuda muito
          outros negócios a decidir.
        </p>
      </header>
      <TestimonialForm
        token={token}
        initial={{
          rating: t.rating,
          quote: t.quote ?? "",
          author_name: t.author_name ?? t.contact_name ?? "",
          author_role: t.author_role ?? t.company_name,
          can_publish: t.status === "recebido" ? t.can_publish : true,
        }}
        received={t.status === "recebido"}
        googleReviewUrl={t.rating && t.rating >= 4 ? t.google_review_url : null}
      />
    </main>
  );
}
