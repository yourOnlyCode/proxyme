import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-900/10 bg-white/45 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="group inline-flex items-baseline gap-2">
          <span className="text-[18px] font-extrabold tracking-tight hoverTitle">proxyme</span>
          <span className="text-[11px] text-slate-600">legal</span>
        </Link>
        <nav className="flex items-center gap-4 text-[13px] font-semibold text-slate-600">
          <Link className="hover:text-slate-900 transition" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-slate-900 transition" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-slate-900 transition" href="/support">
            Support
          </Link>
        </nav>
      </div>
    </header>
  );
}

