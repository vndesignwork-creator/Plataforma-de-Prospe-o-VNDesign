import { CollabProjectView } from '@/components/collab/collab-portal';

export default async function CollaboratorProjectPage({ params }: { params: Promise<{ leadId: string }> }) {
  return <CollabProjectView leadId={(await params).leadId} />;
}
