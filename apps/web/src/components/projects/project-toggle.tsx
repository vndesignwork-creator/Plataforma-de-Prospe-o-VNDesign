'use client';

/** "Concluir projeto" / "Reabrir projeto" (clientes): sai ou volta à lista de projetos em curso. */
import type { Lead } from '@vndesign/core';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { useSetProjectCompleted } from '@/lib/queries';

export function ProjectToggle({ lead, size = 'sm' }: { lead: Pick<Lead, 'id' | 'project_completed_at'>; size?: 'sm' | 'md' }) {
  const set = useSetProjectCompleted();
  const completed = !!lead.project_completed_at;

  async function toggle() {
    try {
      await set.mutateAsync({ leadId: lead.id, completed: !completed });
      toast.success(completed ? 'Projeto reaberto: volta aos projetos em curso.' : 'Projeto concluído. 🎉');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Button size={size} variant={completed ? 'ghost' : 'outline'} onClick={toggle} loading={set.isPending}>
      {completed ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
      {completed ? 'Reabrir projeto' : 'Concluir projeto'}
    </Button>
  );
}
