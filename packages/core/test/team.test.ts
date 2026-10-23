import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_SETTINGS,
  LeadBulkActionSchema,
  LeadListQuerySchema,
  MEMBER_ROLE_LABELS,
  TeamAcceptSchema,
  TeamInviteCreateSchema,
  WorkspaceSettingsSchema,
  isAdminRole,
  isProspector,
} from '../src';

describe('equipa', () => {
  it('papéis: só dono e administrador gerem; o prospetor é à parte', () => {
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('prospector')).toBe(false);
    expect(isAdminRole('member')).toBe(false);
    expect(isProspector('prospector')).toBe(true);
    expect(isProspector(null)).toBe(false);
    expect(MEMBER_ROLE_LABELS.prospector).toBe('Prospetor');
  });

  it('convite: email em minúsculas, papel prospetor por omissão; nunca dono', () => {
    const v = TeamInviteCreateSchema.parse({ email: ' Paula@Exemplo.PT ' });
    expect(v).toMatchObject({ email: 'paula@exemplo.pt', role: 'prospector', send_email: true, name: null });
    expect(TeamInviteCreateSchema.safeParse({ email: 'a@b.pt', role: 'owner' }).success).toBe(false);
    expect(TeamInviteCreateSchema.safeParse({ email: 'nao-e-email' }).success).toBe(false);
  });

  it('aceitar: nome e palavra-passe com 8 caracteres', () => {
    expect(TeamAcceptSchema.safeParse({ name: 'Paula', password: '12345678' }).success).toBe(true);
    expect(TeamAcceptSchema.safeParse({ name: 'P', password: '12345678' }).success).toBe(false);
    expect(TeamAcceptSchema.safeParse({ name: 'Paula', password: '123' }).success).toBe(false);
  });

  it('limite semanal do gerador: 50 por omissão', () => {
    expect(DEFAULT_TEAM_SETTINGS.generation_weekly_limit).toBe(50);
    expect(WorkspaceSettingsSchema.parse({}).team.generation_weekly_limit).toBe(50);
  });

  it('responsável: filtro na lista e ação "atribuir" em conjunto', () => {
    expect(LeadListQuerySchema.parse({ assigned: 'me' }).assigned).toBe('me');
    expect(LeadListQuerySchema.parse({ assigned: 'none' }).assigned).toBe('none');
    expect(LeadListQuerySchema.safeParse({ assigned: 'outro' }).success).toBe(false);
    const id = '7d9f2c1e-8a1b-4c3d-9e4f-5a6b7c8d9e0f';
    expect(LeadBulkActionSchema.parse({ action: 'assign', ids: [id], assigned_to: null }).assigned_to).toBeNull();
  });
});
