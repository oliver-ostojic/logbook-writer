import './globals.css';
import { Roboto, Open_Sans } from 'next/font/google';

const roboto = Roboto({ 
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
});

const openSans = Open_Sans({ 
  subsets: ['latin'],
  variable: '--font-open-sans',
});

export const metadata = {
  title: 'Logbook Writer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${openSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
