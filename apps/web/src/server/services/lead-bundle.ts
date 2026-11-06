/**
 * A ficha do lead num só pedido (GET /leads/{id}/bundle): em vez de 20 a 30 pedidos
 * ao abrir, um. As partes são as mesmas funções que os GET de cada cartão usam, por
 * isso os dados são iguais; a web guarda cada uma na cache com a chave do cartão.
 */
import type { LeadStatus } from '@vndesign/core';
import type { ApiContext } from '../context';
import { prospectorAllowed } from '../prospector-access';
import { listActivities } from './activities';
import { listAudits } from './audits';
import { getBrandKit, listAccesses } from './brand-kit';
import { getBriefing } from './briefing';
import { listClientProjects } from './client-projects';
import { listClientRequests } from './client-requests';
import { listRenewals } from './renewals';
import { listCollaborators } from './collaborators';
import { listContracts } from './contracts';
import { getLaunchChecklist } from './launch';
import { getLead } from './leads';
import { listMeetings } from './meetings';
import { listPayments } from './payments';
import { getProjectInfo, getProjectTime, listDeliverables, listExpenses, listRevisions } from './project-tools';
import { listProposals } from './proposals';
import { listTasks } from './tasks';
import { getTestimonial } from './testimonials';

/** Antes de responder, um lead não tem projeto: as partes do projeto não se pedem. */
const EARLY: readonly LeadStatus[] = ['identificado', 'contactado', 'respondeu'];

type Part = (ctx: ApiContext, id: string) => Promise<unknown>;

const COMMERCIAL: Record<string, Part> = {
  tasks: listTasks,
  activities: listActivities,
  audits: listAudits,
  proposals: listProposals,
  meetings: listMeetings,
  // O kit da marca também aparece antes do projeto (GEO, perfil do Google).
  'brand-kit': getBrandKit,
};

const PROJECT: Record<string, Part> = {
  project: getProjectInfo,
  payments: listPayments,
  contracts: listContracts,
  'client-projects': listClientProjects,
  revisions: listRevisions,
  time: getProjectTime,
  deliverables: listDeliverables,
  expenses: listExpenses,
  launch: getLaunchChecklist,
  collaborators: listCollaborators,
  accesses: listAccesses,
  briefing: getBriefing,
  testimonial: getTestimonial,
  'client-requests': listClientRequests,
  renewals: listRenewals,
};

export async function leadBundle(ctx: ApiContext, id: string): Promise<{ lead: unknown; parts: Record<string, unknown> }> {
  const lead = await getLead(ctx, id);
  const wanted: Record<string, Part> = { ...COMMERCIAL };
  const isProject = lead.status === 'cliente' || !!lead.client_of || !!lead.project_completed_at || !EARLY.includes(lead.status);
  if (isProject) Object.assign(wanted, PROJECT);
  const entries = Object.entries(wanted).filter(([name]) => ctx.role !== 'prospector' || prospectorAllowed('GET', `/leads/${id}/${name}`));
  const results = await Promise.allSettled(entries.map(([, fn]) => fn(ctx, id)));
  const parts: Record<string, unknown> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') parts[entries[i]![0]] = r.value;
  });
  return { lead, parts };
}
