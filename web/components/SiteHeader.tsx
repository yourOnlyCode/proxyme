import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="fixed top-4 left-1/2 z-30 w-[min(920px,calc(100%-32px))] -translate-x-1/2">
      <div className="glass rounded-full px-4 py-3 shadow-glass">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group inline-flex items-baseline gap-2">
            <span className="brand text-[18px] tracking-tight hoverTitle">proxyme</span>
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
      </div>
    </header>
  );
}

