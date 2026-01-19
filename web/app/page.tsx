import { LandingCard } from '@/components/LandingCard';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto grid max-w-xl gap-6 py-6">
      <LandingCard />

      <section className="glass rounded-3xl p-6">
        <div className="text-[12px] uppercase tracking-wider text-slate-600 font-bold">Legal</div>
        <div className="mt-2 text-[14px] leading-6 text-slate-700">
          Looking for policies? Here are the official public pages:
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/privacy" className="glass rounded-2xl px-4 py-2 text-[13px] font-bold text-slate-900 hover:bg-white/80 transition">
            Privacy Policy
          </Link>
          <Link href="/terms" className="glass rounded-2xl px-4 py-2 text-[13px] font-bold text-slate-900 hover:bg-white/80 transition">
            Terms of Service
          </Link>
          <Link href="/support" className="glass rounded-2xl px-4 py-2 text-[13px] font-bold text-slate-900 hover:bg-white/80 transition">
            Support
          </Link>
        </div>
      </section>
    </div>
  );
}

