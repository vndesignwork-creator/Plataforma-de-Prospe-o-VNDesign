'use client';

import {
  Ban,
  BellRing,
  Building2,
  ChevronLeft,
  FileText,
  FormInput,
  KeyRound,
  Layers,
  ListChecks,
  Mail,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  Tag,
  ToggleRight,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/lib/queries';
import { PROSPECTOR_SETTINGS } from '@/lib/role-access';
import { cn } from '@/lib/utils';

export type SettingsGroup = 'perfil' | 'email' | 'negocio' | 'leads' | 'plataforma';

export const SETTINGS_GROUPS: { id: SettingsGroup; label: string }[] = [
  { id: 'perfil', label: 'O meu perfil' },
  { id: 'email', label: 'Email e contactos' },
  { id: 'negocio', label: 'Negócio' },
  { id: 'leads', label: 'Organizar leads' },
  { id: 'plataforma', label: 'Plataforma' },
];

/** Secções das Definições: cada uma é uma página (/definicoes/<slug>), arrumadas por grupo. */
export const SETTINGS_SECTIONS = [
  { slug: 'assinatura', label: 'Assinatura', group: 'perfil', icon: PenLine, description: 'O teu nome, contactos e portefólio no fim dos emails.' },
  { slug: 'conta', label: 'Conta', group: 'perfil', icon: UserCog, description: 'Nome, fotografia, palavra-passe e sessões.' },
  { slug: 'email', label: 'Email de envio', group: 'email', icon: Mail, description: 'A conta que envia os emails e lê as respostas.' },
  { slug: 'lembretes', label: 'Follow-up e lembretes', group: 'email', icon: BellRing, description: 'Dias até ao follow-up, sequência, resumo diário e notificações.' },
  { slug: 'nao-contactar', label: 'Não contactar', group: 'email', icon: Ban, description: 'Emails e domínios que nunca recebem contactos.' },
  { slug: 'servicos', label: 'Serviços', group: 'negocio', icon: Layers, description: 'O que vendes: serviços, categorias e componentes.' },
  { slug: 'propostas', label: 'Propostas', group: 'negocio', icon: FileText, description: 'Pacotes, preços e textos do PDF da proposta.' },
  { slug: 'formulario', label: 'Formulário do site', group: 'negocio', icon: FormInput, description: 'Os contactos do formulário do teu site entram como leads.' },
  { slug: 'setores', label: 'Setores', group: 'leads', icon: Building2, description: 'Restauração, saúde, imobiliária…' },
  { slug: 'etiquetas', label: 'Etiquetas', group: 'leads', icon: Tag, description: 'Marcas livres para filtrar os leads.' },
  { slug: 'campos', label: 'Campos personalizados', group: 'leads', icon: SlidersHorizontal, description: 'Campos extra na ficha do lead.' },
  { slug: 'listas-tarefas', label: 'Listas de tarefas', group: 'leads', icon: ListChecks, description: 'Modelos de tarefas para leads e projetos.' },
  { slug: 'funcionalidades', label: 'Funcionalidades', group: 'plataforma', icon: ToggleRight, description: 'Ligar ou desligar partes da plataforma.' },
  { slug: 'ia', label: 'Inteligência artificial', group: 'plataforma', icon: Sparkles, description: 'Fornecedores e chaves da IA.' },
  { slug: 'api', label: 'Acesso externo (API)', group: 'plataforma', icon: KeyRound, description: 'Chaves para outras apps usarem a plataforma.' },
] as const satisfies readonly { slug: string; label: string; group: SettingsGroup; icon: LucideIcon; description: string }[];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** As secções que este utilizador vê (o prospetor só vê a assinatura e a conta). */
export function useSettingsSections(): SettingsSection[] {
  const role = useRole();
  return SETTINGS_SECTIONS.filter((s) => role !== 'prospector' || PROSPECTOR_SETTINGS.has(s.slug));
}

export function SettingsNav() {
  const pathname = usePathname();
  const sections = useSettingsSections();
  const current = sections.find((s) => pathname === `/definicoes/${s.slug}`);
  return (
    <>
      {/* Telemóvel e tablet: a lista de secções está em /definicoes; aqui só o caminho de volta. */}
      {current ? (
        <Link href="/definicoes" className="inline-flex min-h-10 items-center gap-1 self-start text-sm text-muted hover:text-fg lg:hidden">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Definições
        </Link>
      ) : null}
      <nav aria-label="Secções das definições" className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-4">
          {SETTINGS_GROUPS.map((group) => {
            const items = sections.filter((s) => s.group === group.id);
            if (!items.length) return null;
            return (
              <div key={group.id}>
                <p className="mb-1 px-3 text-xs font-medium tracking-wide text-muted uppercase">{group.label}</p>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {items.map(({ slug, label, icon: Icon }) => {
                    const href = `/definicoes/${slug}`;
                    const active = pathname === href;
                    return (
                      <li key={slug}>
                        <Link
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-9 items-center gap-2.5 rounded-lg px-3 transition-colors',
                            active ? 'bg-accent-soft font-medium text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="truncate">{label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}
