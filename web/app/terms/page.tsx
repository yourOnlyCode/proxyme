export default function TermsPage() {
  return (
    <article className="glass rounded-3xl p-7 md:p-10">
      <div className="text-[12px] text-slate-600 font-bold">Last updated: 2026-01-16</div>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">Terms of Service</h1>

      <section className="mt-6 space-y-3 text-[14px] leading-7 text-slate-700">
        <p>
          These Terms govern your use of Proxyme. By using the app, you agree to follow these rules. This is a starter draft—before launch, review with
          counsel and tailor to your jurisdiction and product policies.
        </p>
      </section>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Eligibility</h2>
      <ul className="mt-3 list-disc pl-5 text-[14px] leading-7 text-slate-700 space-y-2">
        <li>You must be at least 13 years old to use Proxyme.</li>
        <li>13–17 accounts are restricted to a friendship-only experience.</li>
        <li>18+ accounts must not attempt to interact with minors.</li>
      </ul>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Safety & content</h2>
      <ul className="mt-3 list-disc pl-5 text-[14px] leading-7 text-slate-700 space-y-2">
        <li>No harassment, hate, sexual content involving minors, or illegal activity.</li>
        <li>Do not impersonate others or use offensive usernames.</li>
        <li>We may remove content or suspend accounts to protect the community.</li>
      </ul>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">User-generated content</h2>
      <p className="mt-3 text-[14px] leading-7 text-slate-700">
        You’re responsible for content you post or send. You grant Proxyme a license to host and display your content in order to operate the service.
      </p>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Termination</h2>
      <p className="mt-3 text-[14px] leading-7 text-slate-700">
        We may suspend or terminate access if you violate these Terms or for safety reasons.
      </p>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Contact</h2>
      <p className="mt-3 text-[14px] leading-7 text-slate-700">For support, see the Support page.</p>
    </article>
  );
}

