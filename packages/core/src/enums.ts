/**
 * Valores fixos do domínio (iguais aos enums do Postgres) com os rótulos em
 * pt-PT e os emojis usados na folha "Leads_Prospeccao_VNDesign".
 */

export const LEAD_STATUSES = [
  'identificado',
  'contactado',
  'respondeu',
  'reuniao',
  'proposta_enviada',
  'cliente',
  'sem_interesse',
  'em_pausa',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Categoria usada no dashboard: ativo (em pipeline), ganho, perdido ou pausado. */
export type StatusCategory = 'active' | 'won' | 'lost' | 'paused';

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; emoji: string; category: StatusCategory; color: string }
> = {
  identificado: { label: 'Identificado', emoji: '🔍', category: 'active', color: '#8a8a8a' },
  contactado: { label: 'Contactado', emoji: '📧', category: 'active', color: '#4f8ff7' },
  respondeu: { label: 'Respondeu', emoji: '💬', category: 'active', color: '#a879f2' },
  reuniao: { label: 'Reunião', emoji: '📞', category: 'active', color: '#e8b33a' },
  proposta_enviada: { label: 'Proposta enviada', emoji: '📄', category: 'active', color: '#ef5c32' },
  cliente: { label: 'Cliente', emoji: '🤝', category: 'won', color: '#3fb67b' },
  sem_interesse: { label: 'Sem interesse', emoji: '❌', category: 'lost', color: '#e5484d' },
  em_pausa: { label: 'Em pausa', emoji: '⏸️', category: 'paused', color: '#6b7280' },
};

export const LEAD_CHANNELS = [
  'email',
  'telefone',
  'instagram',
  'linkedin',
  'google_maps',
  'pessoal',
  'outro',
] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export const LEAD_CHANNEL_META: Record<LeadChannel, { label: string; emoji: string }> = {
  email: { label: 'Email', emoji: '📧' },
  telefone: { label: 'Telefone', emoji: '📞' },
  instagram: { label: 'Instagram', emoji: '📱' },
  linkedin: { label: 'LinkedIn', emoji: '💼' },
  google_maps: { label: 'Google Maps', emoji: '🗺️' },
  pessoal: { label: 'Pessoal', emoji: '👋' },
  outro: { label: 'Outro', emoji: '🌐' },
};

export const MOBILE_STATUSES = ['sim', 'nao', 'parcial', 'desconhecido'] as const;
export type MobileStatus = (typeof MOBILE_STATUSES)[number];

export const MOBILE_STATUS_META: Record<MobileStatus, { label: string; emoji: string }> = {
  sim: { label: 'Sim', emoji: '✅' },
  nao: { label: 'Não', emoji: '❌' },
  parcial: { label: 'Parcial', emoji: '⚡' },
  desconhecido: { label: '--', emoji: '' },
};

export const ACTIVITY_TYPES = [
  'created',
  'updated',
  'status_changed',
  'note',
  'email_copied',
  'email_mailto',
  'email_sent',
  'call_logged',
  'template_used',
  'audit_run',
  'ai_email_generated',
  'proposal_generated',
  'imported',
  'merged',
  'follow_up_scheduled',
  'follow_up_done',
  'anonymized',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Tipos de atividade que o utilizador (ou a app) pode registar diretamente. */
export const MANUAL_ACTIVITY_TYPES = [
  'note',
  'email_copied',
  'email_mailto',
  'email_sent',
  'call_logged',
  'template_used',
] as const satisfies readonly ActivityType[];
export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  created: 'Lead criado',
  updated: 'Lead editado',
  status_changed: 'Estado alterado',
  note: 'Nota',
  email_copied: 'Email copiado',
  email_mailto: 'Email aberto no cliente de email',
  email_sent: 'Email enviado',
  call_logged: 'Chamada registada',
  template_used: 'Mensagem enviada',
  audit_run: 'Site analisado',
  ai_email_generated: 'Email gerado com IA',
  proposal_generated: 'Proposta gerada',
  imported: 'Importado',
  merged: 'Duplicados juntados',
  follow_up_scheduled: 'Follow-up agendado',
  follow_up_done: 'Follow-up feito',
  anonymized: 'Dados anonimizados',
};

export const TEMPLATE_KINDS = [
  'cold_email',
  'follow_up',
  'call_script',
  'social_dm',
  'linkedin',
  'short_message',
  'general_email',
  'proposal_structure',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  cold_email: 'Email frio',
  follow_up: 'Follow-up (3 dias)',
  call_script: 'Guião de chamada',
  social_dm: 'DM Instagram/Facebook',
  linkedin: 'Mensagem LinkedIn',
  short_message: 'Mensagem curta',
  general_email: 'Email geral',
  proposal_structure: 'Estrutura de proposta',
};

/** Motivos devolvidos por find_lead_duplicates() e respetivo texto. */
export const DUPLICATE_REASON_LABELS: Record<string, string> = {
  website: 'mesmo website',
  email: 'mesmo email',
  name: 'mesmo nome',
  email_domain: 'domínio do email coincide',
  similar_name: 'nome semelhante',
};

/** Campos de um lead pela ordem das colunas da folha (com o rótulo pt-PT). */
export const LEAD_FIELD_LABELS = {
  number: '#',
  company_name: 'Empresa',
  sector_id: 'Setor',
  website: 'Website',
  city: 'Cidade',
  address: 'Morada',
  problems: 'Problemas',
  pagespeed: 'PageSpeed',
  mobile: 'Mobile?',
  email: 'Email',
  phone: 'Telefone',
  contact_name: 'Contacto',
  status: 'Estado',
  channel: 'Canal',
  first_contact_on: '1.º contacto',
  last_follow_up_on: 'Último follow-up',
  next_action_text: 'Próxima ação',
  next_action_on: 'Data da próxima ação',
  estimated_value: 'Valor estimado (€)',
  notes: 'Notas',
  approach_angle: 'Ângulo de abordagem',
  source_url: 'Fonte',
  suggested_on: 'Sugerido em',
  email_subject: 'Assunto do email',
  email_body: 'Email de prospeção',
} as const;
export type LeadField = keyof typeof LEAD_FIELD_LABELS;

// -----------------------------------------------------------------------------
// Ícones dos setores (ícones de linha "lucide"; a app móvel usa os mesmos nomes)
// -----------------------------------------------------------------------------
export const SECTOR_ICONS = {
  utensils: 'Restauração',
  coffee: 'Café / pastelaria',
  wine: 'Bar / vinhos',
  stethoscope: 'Saúde / clínica',
  'heart-pulse': 'Bem-estar',
  pill: 'Farmácia',
  house: 'Imobiliária',
  'shopping-bag': 'Comércio',
  store: 'Loja',
  scale: 'Advocacia',
  hotel: 'Turismo / alojamento',
  plane: 'Viagens',
  wrench: 'Serviços técnicos',
  hammer: 'Obras / construção',
  car: 'Automóvel / oficina',
  'graduation-cap': 'Educação / formação',
  scissors: 'Cabeleireiro / estética',
  dumbbell: 'Desporto / ginásio',
  camera: 'Fotografia',
  'paw-print': 'Animais',
  calculator: 'Contabilidade',
  truck: 'Transportes',
  paintbrush: 'Design / arte',
  laptop: 'Tecnologia',
  leaf: 'Jardinagem / agricultura',
  shirt: 'Moda',
  'flower-2': 'Florista',
  baby: 'Infância',
  music: 'Música / eventos',
  users: 'Associações',
  'building-2': 'Empresas',
  briefcase: 'Serviços / outro',
} as const;
export type SectorIcon = keyof typeof SECTOR_ICONS;
export const SECTOR_ICON_KEYS = Object.keys(SECTOR_ICONS) as SectorIcon[];

const SECTOR_ICON_KEYWORDS: [RegExp, SectorIcon][] = [
  [/restaura|tasca|pizz|sushi|comida|snack/, 'utensils'],
  [/cafe|pastel|padaria|confeit/, 'coffee'],
  [/\bbar\b|vinho|cerveja/, 'wine'],
  [/saude|clinic|medic|dent|fisio|psico|veterin/, 'stethoscope'],
  [/bem-estar|spa|massag|yoga/, 'heart-pulse'],
  [/farmac/, 'pill'],
  [/imobil|casa|habita/, 'house'],
  [/comerc|loja|retalho|mercad/, 'shopping-bag'],
  [/advog|jurid|solicit|notar/, 'scale'],
  [/turism|hotel|alojament|hostel|guest/, 'hotel'],
  [/viage/, 'plane'],
  [/tecnic|repara|canaliz|eletric|climatiz/, 'wrench'],
  [/obra|constru|remodel|carpint/, 'hammer'],
  [/auto|oficina|mecan|carro/, 'car'],
  [/educa|forma|escola|explica|ensino/, 'graduation-cap'],
  [/cabel|barbear|estetic|beleza|unha/, 'scissors'],
  [/ginasi|desport|fitness|pilates|crossfit/, 'dumbbell'],
  [/fotograf|video/, 'camera'],
  [/anima|pet|canil/, 'paw-print'],
  [/contab|financ|seguro/, 'calculator'],
  [/transport|mudanc|logist/, 'truck'],
  [/design|arte|atelier/, 'paintbrush'],
  [/tecnolog|informat|software/, 'laptop'],
  [/jardin|agric/, 'leaf'],
  [/moda|roupa|boutique/, 'shirt'],
  [/flor/, 'flower-2'],
  [/infan|crianc|creche|bebe/, 'baby'],
  [/music|evento|festa/, 'music'],
  [/associa|clube|igreja/, 'users'],
];

/** Ícone do setor: o escolhido nas Definições ou um sugerido pelo nome. */
export function sectorIconFor(sector: { icon?: string | null; name?: string | null; slug?: string | null }): SectorIcon {
  if (sector.icon && sector.icon in SECTOR_ICONS) return sector.icon as SectorIcon;
  const text = `${sector.slug ?? ''} ${sector.name ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return SECTOR_ICON_KEYWORDS.find(([re]) => re.test(text))?.[1] ?? 'briefcase';
}
