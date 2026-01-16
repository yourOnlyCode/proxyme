export default function PrivacyPage() {
  return (
    <article className="glass rounded-3xl p-7 md:p-10">
      <div className="text-[12px] text-slate-600 font-bold">Last updated: 2026-01-16</div>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">Privacy Policy</h1>

      <section className="mt-6 space-y-3 text-[14px] leading-7 text-slate-700">
        <p>
          Proxyme is a social app with location-based discovery, messaging, clubs, events, and temporary statuses. This Privacy Policy explains what we
          collect, why we collect it, and your choices.
        </p>
      </section>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Age & date of birth</h2>
      <ul className="mt-3 list-disc pl-5 text-[14px] leading-7 text-slate-700 space-y-2">
        <li>We ask for your date of birth to determine which experience you are eligible for.</li>
        <li>We separate experiences by age group (13–17 vs 18+) so minors and adults do not see each other in discovery or connection flows.</li>
        <li>13–17 accounts are friendship-only. Romance intent is disabled for minors.</li>
      </ul>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">What we collect</h2>
      <ul className="mt-3 list-disc pl-5 text-[14px] leading-7 text-slate-700 space-y-2">
        <li>Account/profile information you provide (username, name, bio, photos, interests, preferences)</li>
        <li>Messages and shared content you send in chats</li>
        <li>Status content you post (including captions)</li>
        <li>Safety signals (blocks, reports, report reasons, optional details)</li>
        <li>Location signals used for discovery (if you enable Proxy)</li>
      </ul>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Location & Crossed Paths</h2>
      <ul className="mt-3 list-disc pl-5 text-[14px] leading-7 text-slate-700 space-y-2">
        <li>Proxy discovery uses device location when enabled.</li>
        <li>Crossed Paths only collects/updates when Proxy is ON and Crossed Paths history is enabled in settings.</li>
        <li>Crossed Paths stores a non-reversible “place fingerprint” (hashed key) for matching without storing raw coordinates in that history table.</li>
        <li>Crossed Paths displays a redacted label (venue name or street block) and is designed to show up to a week of history.</li>
      </ul>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Your choices</h2>
      <ul className="mt-3 list-disc pl-5 text-[14px] leading-7 text-slate-700 space-y-2">
        <li>You can turn Proxy and Crossed Paths history on/off in settings.</li>
        <li>You can block or report users at any time.</li>
        <li>You can edit your profile information in settings.</li>
      </ul>

      <h2 className="mt-8 text-[14px] font-extrabold uppercase tracking-wider text-slate-800">Contact</h2>
      <p className="mt-3 text-[14px] leading-7 text-slate-700">For privacy requests, contact support (see the Support page).</p>
    </article>
  );
}

