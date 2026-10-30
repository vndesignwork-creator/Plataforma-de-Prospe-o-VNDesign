import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Syne } from 'next/font/google';
import { Providers } from '@/components/layout/providers';
import { themeInitScript } from '@/components/layout/theme';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-jakarta', display: 'swap' });
const syne = Syne({ subsets: ['latin', 'latin-ext'], variable: '--font-syne', display: 'swap' });

/**
 * Entrada da app instalada (ícone no telemóvel): VN em cima, D e L por baixo, e a app surge por trás.
 * Uma vez por abertura (sessionStorage); no browser normal só com ?intro=1 (para experimentar).
 */
const introScript = `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;var f=/[?&]intro=1/.test(location.search);if(!(s||f)||(!f&&sessionStorage.getItem('vnd-intro')))return;sessionStorage.setItem('vnd-intro','1');var d=document.documentElement;d.dataset.intro='';setTimeout(function(){delete d.dataset.intro;},1900);}catch(e){}})();`;

export const metadata: Metadata = {
  title: { default: 'VNDesign Leads', template: '%s · VNDesign Leads' },
  description: 'Plataforma de prospeção de clientes da VNDesign',
  applicationName: 'VNDesign Leads',
  appleWebApp: { capable: true, title: 'VND Leads', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0d0d0d',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" data-theme="dark" className={`${jakarta.variable} ${syne.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
      </head>
      {/* Extensões do browser (ex.: ColorZilla) acrescentam atributos ao <body>: não é um erro da aplicação. */}
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        <div id="vnd-intro" aria-hidden>
          <span className="vn">VN</span>
          <span>
            <span className="d">D</span>
            <span className="l">L</span>
          </span>
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
