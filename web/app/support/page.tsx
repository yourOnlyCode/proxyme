import Link from 'next/link';

export default function SupportPage() {
  // Replace this with your real support inbox once you set up Cloudflare Email Routing.
  const supportEmail = 'support@proxyme.app';

  return (
    <article className="glass rounded-3xl p-7 md:p-10">
      <div className="text-[12px] text-slate-600 font-bold">Support</div>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">Contact us</h1>

      <p className="mt-5 text-[14px] leading-7 text-slate-700 max-w-2xl">
        If you need help with your account, want to report an issue, or have a privacy request, email us and we’ll get back to you.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <a
          className="glass rounded-2xl px-4 py-3 text-[13px] font-extrabold text-slate-900 hover:bg-white/80 transition"
          href={`mailto:${supportEmail}`}
        >
          Email support: {supportEmail}
        </a>

        <div className="text-[13px] text-slate-600 leading-6">
          Helpful links:{' '}
          <Link className="text-slate-800 hover:text-slate-950 underline" href="/privacy">
            Privacy Policy
          </Link>
          {' • '}
          <Link className="text-slate-800 hover:text-slate-950 underline" href="/terms">
            Terms
          </Link>
        </div>
      </div>
    </article>
  );
}

