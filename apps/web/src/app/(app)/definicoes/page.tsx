'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SETTINGS_SECTIONS } from '@/components/settings/settings-nav';
import { SettingsOverview } from '@/components/settings/settings-overview';

/**
 * /definicoes mostra todas as secções com o estado de cada uma. Os endereços
 * antigos com âncora (/definicoes#conta, #api…) vão para a página dessa secção.
 */
export default function SettingsIndex() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const section = SETTINGS_SECTIONS.find((s) => s.slug === hash)?.slug;
    if (section) router.replace(`/definicoes/${section}`);
  }, [router]);
  return <SettingsOverview />;
}
