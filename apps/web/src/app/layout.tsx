import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Syne } from 'next/font/google';
import { Providers } from '@/components/layout/providers';
import { themeInitScript } from '@/components/layout/theme';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-jakarta', display: 'swap' });
const syne = Syne({ subsets: ['latin', 'latin-ext'], variable: '--font-syne', display: 'swap' });

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
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
