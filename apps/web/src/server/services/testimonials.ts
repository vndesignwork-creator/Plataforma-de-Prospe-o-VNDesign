/**
 * Testemunhos dos clientes: no fim do projeto cria-se um link (/o/<código>) onde o
 * cliente dá uma nota de 1 a 5, escreve a opinião e diz se autoriza a publicação.
 * Os autorizados (e marcados "mostrar") entram no PDF da proposta; com nota alta,
 * a página sugere ao cliente deixar a mesma opinião no Google.
 */
import { randomBytes } from "node:crypto";
import {
  WorkspaceSettingsSchema,
  isTestimonialShowable,
  type Testimonial,
  type TestimonialListItem,
  type TestimonialSubmit,
} from "@vndesign/core";
import type { ApiContext } from "../context";
import { ApiError, fromPostgrest } from "../http";
import { createSupabaseAdminClient } from "../supabase-admin";
import { getLead } from "./leads";
import { alertUser } from "./push";

const SELECT =
  "id, lead_id, token, status, rating, quote, author_name, author_role, can_publish, featured, submitted_at, created_at";

export async function getTestimonial(
  ctx: ApiContext,
  leadId: string,
): Promise<Testimonial | null> {
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .select(SELECT)
    .eq("workspace_id", ctx.workspaceId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return (data as Testimonial | null) ?? null;
}

/** Cria o link do testemunho (ou devolve o que já existe: o cliente pode corrigir pelo mesmo link). */
export async function requestTestimonial(
  ctx: ApiContext,
  leadId: string,
): Promise<Testimonial> {
  await getLead(ctx, leadId);
  const existing = await getTestimonial(ctx, leadId);
  if (existing) return existing;
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      token: randomBytes(18).toString("base64url"),
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return data as Testimonial;
}

/** Apaga o testemunho do cliente (o link deixa de funcionar). */
export async function deleteTestimonial(
  ctx: ApiContext,
  leadId: string,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("lead_id", leadId)
    .select("id");
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, "Testemunho não encontrado");
}

async function withCompanies(
  ctx: ApiContext,
  rows: Testimonial[],
): Promise<TestimonialListItem[]> {
  const ids = [...new Set(rows.map((r) => r.lead_id))];
  if (!ids.length) return [];
  const { data, error } = await ctx.supabase
    .from("leads")
    .select("id, company_name")
    .eq("workspace_id", ctx.workspaceId)
    .in("id", ids);
  if (error) throw fromPostgrest(error);
  const names = new Map(
    (data ?? []).map((l) => [l.id as string, l.company_name as string]),
  );
  return rows.map((r) => ({ ...r, company_name: names.get(r.lead_id) ?? "" }));
}

/** Todos os testemunhos (recebidos primeiro, os mais recentes no topo). */
export async function listTestimonials(
  ctx: ApiContext,
): Promise<TestimonialListItem[]> {
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .select(SELECT)
    .eq("workspace_id", ctx.workspaceId)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw fromPostgrest(error);
  return withCompanies(ctx, (data ?? []) as Testimonial[]);
}

/** Mostrar (ou não) nas propostas. */
export async function updateTestimonial(
  ctx: ApiContext,
  id: string,
  patch: { featured: boolean },
): Promise<TestimonialListItem> {
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .update({ featured: patch.featured })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) throw new ApiError(404, "Testemunho não encontrado");
  return (await withCompanies(ctx, [data as Testimonial]))[0]!;
}

export async function deleteTestimonialById(
  ctx: ApiContext,
  id: string,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, "Testemunho não encontrado");
}

/** Para o PDF da proposta: até 2 testemunhos autorizados, com 4 ou 5 estrelas (os mais recentes). */
export async function proposalTestimonials(
  ctx: ApiContext,
  excludeLeadId?: string,
): Promise<
  { quote: string; rating: number; author: string; company: string }[]
> {
  const { data, error } = await ctx.supabase
    .from("testimonials")
    .select(SELECT)
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "recebido")
    .eq("can_publish", true)
    .eq("featured", true)
    .gte("rating", 4)
    .order("submitted_at", { ascending: false })
    .limit(10);
  if (error) throw fromPostgrest(error);
  const rows = ((data ?? []) as Testimonial[])
    .filter((t) => isTestimonialShowable(t) && t.lead_id !== excludeLeadId)
    .slice(0, 2);
  return (await withCompanies(ctx, rows)).map((t) => ({
    quote: t.quote!.trim(),
    rating: t.rating!,
    author: [t.author_name?.trim(), t.author_role?.trim()]
      .filter(Boolean)
      .join(", "),
    company: t.company_name,
  }));
}

// -----------------------------------------------------------------------------
// Página do cliente (sem sessão)
// -----------------------------------------------------------------------------

export interface PublicTestimonial {
  company_name: string;
  contact_name: string | null;
  brand: string;
  status: Testimonial["status"];
  rating: number | null;
  quote: string | null;
  author_name: string | null;
  author_role: string | null;
  can_publish: boolean;
  /** Link para avaliar no Google (a página só o mostra com 4 ou 5 estrelas). */
  google_review_url: string | null;
}

async function loadPublic(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("testimonials")
    .select(`${SELECT}, workspace_id, created_by`)
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const [{ data: ws }, { data: lead }] = await Promise.all([
    admin
      .from("workspaces")
      .select("settings")
      .eq("id", data.workspace_id)
      .maybeSingle(),
    admin
      .from("leads")
      .select(
        "company_name, contact_name, created_by, anonymized_at, archived_at",
      )
      .eq("id", data.lead_id)
      .maybeSingle(),
  ]);
  const settings = WorkspaceSettingsSchema.parse(ws?.settings ?? {});
  if (
    !lead ||
    lead.anonymized_at ||
    lead.archived_at ||
    !settings.features.projects ||
    !settings.features.testimonials
  )
    return null;
  return {
    testimonial: data as Testimonial & {
      workspace_id: string;
      created_by: string | null;
    },
    lead,
    settings,
  };
}

export async function getPublicTestimonial(
  token: string,
): Promise<PublicTestimonial | null> {
  const found = await loadPublic(token);
  if (!found) return null;
  const { testimonial: t, lead, settings } = found;
  const { data: sigs } = await createSupabaseAdminClient()
    .from("signatures")
    .select("full_name, company, user_id, is_default")
    .eq("workspace_id", t.workspace_id)
    .order("is_default", { ascending: false });
  const list = (sigs ?? []) as {
    full_name: string;
    company: string | null;
    user_id: string;
  }[];
  const sig = list.find((s) => s.user_id === lead.created_by) ?? list[0];
  return {
    company_name: lead.company_name as string,
    contact_name: (lead.contact_name as string | null) ?? null,
    brand: sig?.company || sig?.full_name || "VNDesign",
    status: t.status,
    rating: t.rating,
    quote: t.quote,
    author_name: t.author_name,
    author_role: t.author_role,
    can_publish: t.can_publish,
    google_review_url: settings.google_review_url || null,
  };
}

/** O cliente envia (ou corrige) o testemunho. Avisa quem trata do cliente. */
export async function submitTestimonial(
  token: string,
  input: TestimonialSubmit,
): Promise<{ google_review_url: string | null }> {
  const found = await loadPublic(token);
  if (!found) throw new ApiError(404, "Testemunho não encontrado");
  const { testimonial: t, lead, settings } = found;
  const first = t.status !== "recebido";
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("testimonials")
    .update({
      rating: input.rating,
      quote: input.quote,
      author_name: input.author_name,
      author_role: input.author_role,
      can_publish: input.can_publish,
      status: "recebido",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", t.id);
  if (error) throw fromPostgrest(error);

  if (first) {
    await admin.from("lead_activities").insert({
      workspace_id: t.workspace_id,
      lead_id: t.lead_id,
      type: "testimonial_received",
      payload: { rating: input.rating, can_publish: input.can_publish },
    });
    const notify = (lead.created_by as string | null) ?? t.created_by;
    if (notify) {
      await alertUser(t.workspace_id, notify, {
        kind: "client",
        leadId: t.lead_id,
        title: `⭐ Testemunho recebido · ${lead.company_name}`,
        body: `${"★".repeat(input.rating)}${"☆".repeat(5 - input.rating)} — “${input.quote.slice(0, 90)}${input.quote.length > 90 ? "…" : ""}”`,
        url: "/definicoes/testemunhos",
        tag: `testimonial-${t.id}`,
      }).catch(() => undefined);
    }
  }
  return {
    google_review_url:
      input.rating >= 4 ? settings.google_review_url || null : null,
  };
}
