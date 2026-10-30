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
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  ToggleRight,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
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

/** Outras palavras por que se procura cada secção (pesquisa das Definições e Ctrl+K). */
export const SETTINGS_KEYWORDS: Partial<Record<SettingsSection['slug'], string>> = {
  assinatura: 'nome email telefone rodapé portfólio logótipo cargo',
  email: 'smtp gmail enviar conta de email imap respostas limite diário remetente',
  lembretes: 'follow-up notificações resumo diário sequência multicanal horário de silêncio fim de semana push lembrete',
  funcionalidades: 'ligar desligar módulos pomodoro pagamentos projetos tempo dinheiro reuniões prospeção',
  servicos: 'serviços categorias componentes catálogo pacotes',
  propostas: 'pacotes preços pdf orçamento iva validade valor por hora calculadora',
  ia: 'ia claude chatgpt openai openrouter chave api inteligência artificial modelo',
  'listas-tarefas': 'modelos tarefas checklist',
  setores: 'sectores oportunidades argumentos',
  etiquetas: 'tags marcas renomear juntar',
  campos: 'campos personalizados extra nº de lojas faturação',
  'nao-contactar': 'rgpd bloquear lista negra opt-out',
  formulario: 'site bricks webhook contacto',
  api: 'token integração acesso externo',
  conta: 'palavra-passe password 2fa sessões segurança apagar fotografia avatar dois passos',
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Procurar nas Definições: escreve ("iva", "silêncio", "2fa"…) e vai direto à secção. */
export function SettingsSearch() {
  const sections = useSettingsSections();
  const router = useRouter();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = normalize(text.trim());
  const results = q
    ? sections.filter((s) => [s.label, s.description, SETTINGS_KEYWORDS[s.slug] ?? ''].some((t) => normalize(t).includes(q)))
    : [];

  function go(slug: string) {
    setText('');
    setOpen(false);
    router.push(`/definicoes/${slug}`);
  }

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input
        type="search"
        role="combobox"
        aria-expanded={open && !!q}
        aria-controls="definicoes-resultados"
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `definicoes-${results[active].slug}` : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            go(results[active].slug);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Procurar nas definições…"
        aria-label="Procurar nas definições"
        className="pl-9"
      />
      {open && q ? (
        <ul
          id="definicoes-resultados"
          role="listbox"
          aria-label="Secções encontradas"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card"
        >
          {results.length ? (
            results.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.slug}
                  id={`definicoes-${s.slug}`}
                  role="option"
                  aria-selected={i === active}
                  // onMouseDown: antes do blur do campo (que fecharia a lista).
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(s.slug);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm', i === active && 'bg-surface-2')}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-muted">{s.description}</span>
                  </span>
                </li>
              );
            })
          ) : (
            <li className="px-2 py-2 text-sm text-muted">Nada encontrado para “{text.trim()}”.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

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
        <div className="sticky top-6 flex flex-col gap-3">
          {SETTINGS_GROUPS.map((group) => {
            const items = sections.filter((s) => s.group === group.id);
            if (!items.length) return null;
            return (
              <div key={group.id}>
                <p className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted uppercase">{group.label}</p>
                {/* Cada grupo num cartão com contorno (o mesmo estilo dos grupos dos Scripts). */}
                <ul className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 text-sm">
                  {items.map(({ slug, label, icon: Icon }) => {
                    const href = `/definicoes/${slug}`;
                    const active = pathname === href;
                    return (
                      <li key={slug}>
                        <Link
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-10 items-center gap-2.5 rounded-lg px-2 transition-colors',
                            active ? 'bg-accent-soft font-medium text-accent-text' : 'hover:bg-surface-2',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                              active ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-muted',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </span>
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
