import './globals.css';
import { Roboto, Open_Sans, Inter, Instrument_Serif } from 'next/font/google';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { GlassDevPanel } from '@/components/ui/ai-glass';
import { ScrollRestorationDisabler } from '@/components/ScrollRestorationDisabler';
import { TutorialProvider } from '@/components/tutorial-flyover';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
});

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata = {
  title: 'Logbook Writer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${openSans.variable} ${inter.variable} ${instrumentSerif.variable}`} style={{ backgroundColor: 'transparent' }}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/umd6txf.css" />
      </head>
      <body style={{ backgroundColor: 'transparent' }}>
        <ScrollRestorationDisabler />
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
        <TutorialProvider />
        <GlassDevPanel />
      </body>
    </html>
  );
}
