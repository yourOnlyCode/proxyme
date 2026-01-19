import type { Metadata } from 'next';
import './globals.css';
import { OrbBackground } from '@/components/OrbBackground';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'proxyme • legal',
  description: 'Privacy Policy, Terms of Service, and Support for proxyme.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="relative min-h-screen">
          <OrbBackground />
          <SiteHeader />
          <main className="relative mx-auto max-w-5xl px-5 pb-10 pt-28">{children}</main>
          <footer className="relative mx-auto max-w-5xl px-5 pb-10 pt-6 text-[12px] text-slate-600">
            <div className="glass rounded-2xl px-4 py-3">
              © {new Date().getFullYear()} proxyme • <span className="text-slate-800">support</span> via Cloudflare Email Routing
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

