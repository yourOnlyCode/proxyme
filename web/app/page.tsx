import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="glass rounded-3xl p-7 md:p-10">
        <div className="flex flex-col gap-4">
          <h1 className="text-[34px] md:text-[40px] font-extrabold tracking-tight">
            <span className="hoverTitle font-[LibertinusSans-Regular]">proxyme</span> legal
          </h1>
          <p className="text-slate-700 leading-7 max-w-2xl">
            This site hosts the public pages required for app store submission and user trust: Privacy Policy, Terms of Service, and Support.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
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
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-3xl p-6">
          <div className="text-[12px] uppercase tracking-wider text-slate-600 font-bold">Age</div>
          <div className="mt-2 text-slate-900 font-semibold">18+ with restricted 13–17</div>
          <div className="mt-2 text-[13px] leading-6 text-slate-700">
            Age gating is used to provide an age-appropriate experience and prevent minor/adult discovery overlap.
          </div>
        </div>
        <div className="glass rounded-3xl p-6">
          <div className="text-[12px] uppercase tracking-wider text-slate-600 font-bold">Location</div>
          <div className="mt-2 text-slate-900 font-semibold">Proxy + Crossed Paths</div>
          <div className="mt-2 text-[13px] leading-6 text-slate-700">
            Location features are optional and controlled in settings. Crossed Paths uses privacy-first matching.
          </div>
        </div>
        <div className="glass rounded-3xl p-6">
          <div className="text-[12px] uppercase tracking-wider text-slate-600 font-bold">Safety</div>
          <div className="mt-2 text-slate-900 font-semibold">Report + Block</div>
          <div className="mt-2 text-[13px] leading-6 text-slate-700">
            Users can report with reasons and block others. Reports are rate-limited server-side to reduce abuse.
          </div>
        </div>
      </section>
    </div>
  );
}

