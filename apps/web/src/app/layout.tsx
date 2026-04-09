import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { env } from '@/env';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'Scheduler — University Timetabling',
    template: '%s | Scheduler',
  },
  description: 'Multi-tenant university timetabling SaaS powered by constraint optimization.',
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  icons: { icon: '/favicon.ico' },
  robots: { index: false, follow: false }, // Block indexing until launched
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
