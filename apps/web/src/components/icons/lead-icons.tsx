/**
 * Ícones de linha (lucide) para estados, canais, "Mobile?" e setores — no
 * lugar dos emojis da folha (que continuam no core para importar/exportar).
 */
import {
  LEAD_STATUS_META,
  sectorIconFor,
  type LeadChannel,
  type LeadStatus,
  type MobileStatus,
  type SectorIcon,
} from '@vndesign/core';
import {
  Baby,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  Camera,
  Car,
  CircleHelp,
  CirclePause,
  CircleX,
  Coffee,
  Dumbbell,
  FileText,
  Flower2,
  Globe,
  GraduationCap,
  Hammer,
  Hand,
  Handshake,
  HeartPulse,
  Hotel,
  House,
  Laptop,
  Leaf,
  Mail,
  MapPin,
  MessageCircle,
  Music,
  Paintbrush,
  PawPrint,
  Phone,
  Pill,
  Plane,
  Scale,
  Scissors,
  Send,
  Shirt,
  ShoppingBag,
  Smartphone,
  SmartphoneNfc,
  Stethoscope,
  Store,
  Target,
  Truck,
  Users,
  Utensils,
  Wine,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const STATUS_ICONS: Record<LeadStatus, LucideIcon> = {
  identificado: Target,
  contactado: Send,
  respondeu: MessageCircle,
  reuniao: CalendarClock,
  proposta_enviada: FileText,
  cliente: Handshake,
  sem_interesse: CircleX,
  em_pausa: CirclePause,
};

export const CHANNEL_ICONS: Record<LeadChannel, LucideIcon> = {
  email: Mail,
  telefone: Phone,
  instagram: Camera,
  linkedin: Briefcase,
  google_maps: MapPin,
  pessoal: Hand,
  outro: Globe,
};

export const MOBILE_ICONS: Record<MobileStatus, LucideIcon> = {
  sim: Smartphone,
  nao: X,
  parcial: SmartphoneNfc,
  desconhecido: CircleHelp,
};

export const SECTOR_ICON_COMPONENTS: Record<SectorIcon, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  wine: Wine,
  stethoscope: Stethoscope,
  'heart-pulse': HeartPulse,
  pill: Pill,
  house: House,
  'shopping-bag': ShoppingBag,
  store: Store,
  scale: Scale,
  hotel: Hotel,
  plane: Plane,
  wrench: Wrench,
  hammer: Hammer,
  car: Car,
  'graduation-cap': GraduationCap,
  scissors: Scissors,
  dumbbell: Dumbbell,
  camera: Camera,
  'paw-print': PawPrint,
  calculator: Calculator,
  truck: Truck,
  paintbrush: Paintbrush,
  laptop: Laptop,
  leaf: Leaf,
  shirt: Shirt,
  'flower-2': Flower2,
  baby: Baby,
  music: Music,
  users: Users,
  'building-2': Building2,
  briefcase: Briefcase,
};

type IconProps = { className?: string };
const base = 'inline-block h-4 w-4 shrink-0';

/** Ícone do estado, na cor do estado. */
export function StatusIcon({ status, className, colored = true }: IconProps & { status: LeadStatus; colored?: boolean }) {
  const Icon = STATUS_ICONS[status];
  return (
    <Icon
      className={cn(base, className)}
      style={colored ? { color: LEAD_STATUS_META[status].color } : undefined}
      aria-hidden
    />
  );
}

export function ChannelIcon({ channel, className }: IconProps & { channel: LeadChannel }) {
  const Icon = CHANNEL_ICONS[channel];
  return <Icon className={cn(base, className)} aria-hidden />;
}

export function MobileIcon({ mobile, className }: IconProps & { mobile: MobileStatus }) {
  const Icon = MOBILE_ICONS[mobile];
  return <Icon className={cn(base, className)} aria-hidden />;
}

export function SectorIconView({
  sector,
  className,
}: IconProps & { sector: { icon?: string | null; name?: string | null; slug?: string | null } }) {
  const Icon = SECTOR_ICON_COMPONENTS[sectorIconFor(sector)];
  return <Icon className={cn(base, className)} aria-hidden />;
}

