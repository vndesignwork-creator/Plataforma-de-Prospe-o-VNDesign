'use client';

/**
 * Menu de datas para mudar várias coisas de uma vez ("Pôr em dia" no Hoje,
 * "Follow-up…" nas ações em massa): Hoje, Amanhã, Próxima semana, Escolher
 * data… e, opcionalmente, sem data. Os mesmos atalhos do prazo das tarefas.
 */
import { RESCHEDULE_TARGETS, RESCHEDULE_TARGET_LABELS, formatDate, rescheduleDate } from '@vndesign/core';
import { CalendarDays, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { DateInput } from './date-input';
import { Dialog } from './dialog';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from './dropdown';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const short = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function DateMenu({
  today,
  label,
  heading,
  triggerClassName,
  ariaLabel,
  clearLabel,
  onPick,
}: {
  today: string;
  label: ReactNode;
  heading: string;
  triggerClassName: string;
  ariaLabel?: string;
  /** Com texto (ex.: "Sem follow-up"), mostra a opção de tirar a data. */
  clearLabel?: string;
  onPick: (date: string | null) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState('');
  return (
    <>
      <DropdownRoot>
        <DropdownTrigger className={triggerClassName} aria-label={ariaLabel}>
          {label}
        </DropdownTrigger>
        <DropdownContent>
          <DropdownLabel>{heading}</DropdownLabel>
          {RESCHEDULE_TARGETS.map((t) => {
            const date = rescheduleDate(t, today);
            return (
              <DropdownItem key={t} onSelect={() => onPick(date)}>
                <span className="flex-1">{RESCHEDULE_TARGET_LABELS[t]}</span>
                <span className="text-xs text-muted tabular">{short(date)}</span>
              </DropdownItem>
            );
          })}
          <DropdownItem
            onSelect={() => {
              setValue('');
              setCustom(true);
            }}
          >
            <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
            Escolher data…
          </DropdownItem>
          {clearLabel ? (
            <>
              <DropdownSeparator />
              <DropdownItem onSelect={() => onPick(null)}>
                <X className="h-4 w-4 text-muted" aria-hidden />
                {clearLabel}
              </DropdownItem>
            </>
          ) : null}
        </DropdownContent>
      </DropdownRoot>
      {custom ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setCustom(false) : undefined)}
          title={heading}
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setCustom(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!value}
                onClick={() => {
                  setCustom(false);
                  onPick(value);
                }}
              >
                {value ? `Passar para ${formatDate(value)}` : 'Escolhe a data'}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Data</span>
            <DateInput value={value} onChange={setValue} min={today} aria-label="Data" />
          </label>
        </Dialog>
      ) : null}
    </>
  );
}
