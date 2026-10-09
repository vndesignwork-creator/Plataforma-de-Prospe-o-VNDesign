/**
 * POST /api/v1/leads/import — importação de leads em JSON pela API de
 * integração (por exemplo, a tarefa semanal de prospeção com o Claude).
 * Usa as mesmas regras da importação de ficheiros: conversão dos valores da
 * folha, duplicados (no pedido e na base de dados) e lista "não contactar".
 */
import {
  findBatchDuplicates,
  mapIntegrationLead,
  type ImportCommit,
  type IntegrationImport,
  type IntegrationImportItem,
  type IntegrationImportResult,
  type MapRowResult,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { commitImport, lookupConflicts } from './imports';
import { listSectors } from './sectors';

export const MAX_IDEMPOTENCY_KEY = 200;

type Item = ImportCommit['items'][number];

/** Resposta guardada de um pedido anterior com o mesmo Idempotency-Key. */
async function findReplay(ctx: ApiContext, key: string): Promise<IntegrationImportResult | null> {
  const { data, error } = await ctx.supabase
    .from('import_jobs')
    .select('options')
    .eq('workspace_id', ctx.workspaceId)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  const response = (data?.options as { response?: IntegrationImportResult } | undefined)?.response;
  return response ? { ...response, replayed: true } : null;
}

export async function importLeadsFromApi(
  ctx: ApiContext,
  input: IntegrationImport,
  idempotencyKey: string | null,
): Promise<{ status: number; body: IntegrationImportResult }> {
  if (idempotencyKey !== null && (idempotencyKey.length === 0 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY)) {
    throw new ApiError(400, 'Idempotency-Key inválido', `Usa entre 1 e ${MAX_IDEMPOTENCY_KEY} carateres.`);
  }
  if (idempotencyKey && !input.dry_run) {
    const replay = await findReplay(ctx, idempotencyKey);
    if (replay) return { status: 200, body: replay };
  }

  const sectors = await listSectors(ctx, true);
  const mapped: MapRowResult[] = input.leads.map((lead) => mapIntegrationLead(lead, sectors));
  const leads = mapped.map((m) => (m.ok ? m.value.lead : null));
  const inBatch = findBatchDuplicates(leads);
  const { dups, dnc } = await lookupConflicts(
    ctx,
    leads.map((l) => (l ? { company_name: l.company_name, website: l.website ?? null, email: l.email ?? null } : {})),
  );

  const results: IntegrationImportItem[] = [];
  const items: Item[] = [];
  mapped.forEach((m, index) => {
    const base = { index, would: input.dry_run, lead_id: null, number: null };
    if (!m.ok) {
      results.push({ ...base, result: 'invalid', company_name: null, errors: m.errors, warnings: m.warnings });
      return;
    }
    const lead = m.value.lead;
    const warnings = m.value.warnings.length ? { warnings: m.value.warnings } : {};
    const strong = dups.filter((d) => d.row_index === index && d.strength === 'strong');
    const duplicateOf = strong.map((d) => ({
      lead_id: d.lead_id,
      number: d.number,
      company_name: d.company_name,
      reasons: d.reasons as string[],
    }));

    if (dnc.some((d) => d.row_index === index)) {
      results.push({ ...base, result: 'blocked_dnc', company_name: lead.company_name, ...warnings });
      return;
    }
    if (input.on_duplicate !== 'create' && inBatch[index] !== null) {
      results.push({
        ...base,
        result: 'skipped_duplicate',
        company_name: lead.company_name,
        errors: [`Repetido no pedido (igual ao lead ${inBatch[index]! + 1}).`],
        ...warnings,
      });
      return;
    }
    if (strong.length && input.on_duplicate === 'skip') {
      results.push({
        ...base,
        result: 'skipped_duplicate',
        company_name: lead.company_name,
        lead_id: strong[0]!.lead_id,
        number: strong[0]!.number,
        duplicate_of: duplicateOf,
        ...warnings,
      });
      return;
    }
    const merge = strong.length > 0 && input.on_duplicate === 'merge';
    results.push({
      ...base,
      result: merge ? 'merged' : 'created',
      company_name: lead.company_name,
      lead_id: merge ? strong[0]!.lead_id : null,
      number: merge ? strong[0]!.number : null,
      ...(strong.length ? { duplicate_of: duplicateOf } : {}),
      ...warnings,
    });
    items.push({ index, action: merge ? 'merge' : 'create', target_id: merge ? strong[0]!.lead_id : null, lead });
  });

  let jobId: string | null = null;
  if (!input.dry_run) {
    let job;
    try {
      job = await commitImport(ctx, {
        source: 'api',
        filename: input.source || 'API',
        keep_numbers: false,
        items,
        options: { on_duplicate: input.on_duplicate },
        idempotency_key: idempotencyKey,
      });
    } catch (error) {
      // Dois pedidos em simultâneo com a mesma chave: devolve o que ganhou.
      if (idempotencyKey && error instanceof ApiError && error.status === 409) {
        const replay = await findReplay(ctx, idempotencyKey);
        if (replay) return { status: 200, body: replay };
      }
      throw error;
    }
    jobId = job.id;
    // O "não contactar" é verificado outra vez ao gravar: acerta o resultado.
    for (const r of job.report) {
      const item = results.find((x) => x.index === r.index)!;
      if (r.result === 'blocked') Object.assign(item, { result: 'blocked_dnc', lead_id: null, number: null });
      else Object.assign(item, { lead_id: r.lead_id, number: r.number });
    }
  }

  const count = (r: IntegrationImportItem['result']) => results.filter((x) => x.result === r).length;
  const body: IntegrationImportResult = {
    job_id: jobId,
    dry_run: input.dry_run,
    replayed: false,
    summary: {
      total: results.length,
      created: count('created'),
      merged: count('merged'),
      skipped_duplicate: count('skipped_duplicate'),
      blocked_dnc: count('blocked_dnc'),
      invalid: count('invalid'),
    },
    results,
  };

  if (jobId) {
    const { data: job } = await ctx.supabase.from('import_jobs').select('options').eq('id', jobId).single();
    await ctx.supabase
      .from('import_jobs')
      .update({ options: { ...(job?.options as object), response: body } })
      .eq('id', jobId);
  }
  return { status: input.dry_run || body.summary.created + body.summary.merged === 0 ? 200 : 201, body };
}
