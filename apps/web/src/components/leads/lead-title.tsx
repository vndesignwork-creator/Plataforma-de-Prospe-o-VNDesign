/**
 * Nome de um lead nas listas: num projeto com nome (cliente que voltou ou primeiro
 * projeto com nome), o nome do projeto em primeiro plano e a empresa discreta ao lado;
 * sem nome de projeto, só a empresa. (O mesmo que o título da ficha.)
 */
export function LeadTitle({ lead }: { lead: { company_name: string; project_title?: string | null } }) {
  if (!lead.project_title) return <>{lead.company_name}</>;
  return (
    <>
      {lead.project_title} <span className="font-normal text-muted">· {lead.company_name}</span>
    </>
  );
}
