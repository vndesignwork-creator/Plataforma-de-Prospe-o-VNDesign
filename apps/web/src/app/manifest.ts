import type { MetadataRoute } from 'next';

/** Manifesto da PWA: instalar no telemóvel (Chrome → "Adicionar ao ecrã principal"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'VNDesign Leads',
    short_name: 'VND Leads',
    description: 'Prospeção de clientes da VNDesign: leads, follow-ups e scripts de contacto.',
    lang: 'pt-PT',
    dir: 'ltr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0d0d0d',
    theme_color: '#0d0d0d',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Novo lead', url: '/leads/novo', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Leads', url: '/leads', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Kanban', url: '/kanban', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
