"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

type Intent = { word: string; color: string };

const INTENTS: Intent[] = [
  { word: 'adventure', color: '#FBBF24' },
  { word: 'spark', color: '#F472B6' },
  { word: 'collaboration', color: '#60A5FA' },
  { word: 'bestie', color: '#FBBF24' },
  { word: 'connection', color: '#F472B6' },
  { word: 'opportunity', color: '#60A5FA' },
  { word: 'squad mate', color: '#FBBF24' },
  { word: 'love story', color: '#F472B6' },
  { word: 'breakthrough', color: '#60A5FA' },
];

function isMobileUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function LandingCard() {
  const wordMeasureRef = useRef<HTMLSpanElement | null>(null);

  const [intentIndex, setIntentIndex] = useState(0);
  const [wordOpacity, setWordOpacity] = useState(1);
  const [underlineWidth, setUnderlineWidth] = useState<number>(60);
  const [deepLinkHref, setDeepLinkHref] = useState<string>('proxybusiness://');

  const intent = INTENTS[intentIndex] ?? INTENTS[0]!;

  const computedDeepLink = useMemo(() => deepLinkHref, [deepLinkHref]);

  useEffect(() => {
    const measure = () => {
      const el = wordMeasureRef.current;
      if (!el) return;
      const w = Math.ceil(el.getBoundingClientRect().width);
      setUnderlineWidth(Math.max(44, w));
    };

    // init after paint
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [intent.word]);

  useEffect(() => {
    const timer = setInterval(() => {
      setWordOpacity(0);
      setTimeout(() => {
        setIntentIndex((i) => (i + 1) % INTENTS.length);
        setWordOpacity(1);
      }, 380);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Mirror the old web-landing behavior: if we land here with OAuth params (?code=... or tokens),
    // deep-link back into the native app so it can finish exchangeCodeForSession.
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search || '');
    const rawHash = window.location.hash || '';
    const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      for (const [k, v] of hashParams.entries()) {
        if (!params.has(k)) params.set(k, v);
      }
    }

    const hasOAuthParams = params.has('code') || params.has('error') || params.has('access_token');
    const deepLinkBase = 'proxybusiness://auth/callback';
    setDeepLinkHref(hasOAuthParams ? `${deepLinkBase}?${params.toString()}` : 'proxybusiness://');
  }, []);

  useEffect(() => {
    // Try to open the app automatically on mobile (similar to web-landing behavior).
    if (!isMobileUserAgent()) return;
    const hasOAuthParams = computedDeepLink.startsWith('proxybusiness://auth/callback?');
    const delay = hasOAuthParams ? 200 : 900;
    const t = setTimeout(() => {
      window.location.href = computedDeepLink;
    }, delay);
    return () => clearTimeout(t);
  }, [computedDeepLink]);

  return (
    <section className="glass rounded-3xl p-7 md:p-10 text-center">
      <div className="brand text-[44px] leading-none tracking-tight hoverTitle">proxyme</div>

      <div className="mt-4 grid gap-2 justify-items-center text-[18px] leading-tight text-slate-700">
        <div>your next</div>

        {/* Measurement span (kept in flow but invisible to avoid layout shift). */}
        <span
          ref={wordMeasureRef}
          className="absolute left-[-9999px] top-[-9999px] whitespace-nowrap text-[24px] font-extrabold"
          aria-hidden
        >
          {intent.word}
        </span>

        <div
          className="text-[24px] font-extrabold text-slate-900 transition-opacity duration-200"
          style={{ opacity: wordOpacity }}
        >
          {intent.word}
        </div>

        <div
          className="h-[4px] rounded-full transition-[width,background-color] duration-700"
          style={{ width: underlineWidth, backgroundColor: intent.color }}
        />
        <div>is one tap away</div>
      </div>

      <p className="mt-5 text-[15px] leading-7 text-slate-700">
        Open the app to continue. If you don’t have Proxyme installed yet, download it below.
      </p>

      <div className="mt-6 grid gap-4 justify-items-center">
        <a
          href={computedDeepLink}
          className="w-full max-w-[260px] rounded-2xl px-5 py-3 text-[18px] font-semibold text-white shadow-[0_18px_55px_rgba(37,99,235,0.22),0_14px_46px_rgba(2,6,23,0.12)] transition hover:-translate-y-[1px]"
          style={{
            backgroundImage:
              'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.00) 45%), linear-gradient(180deg, rgba(37, 99, 235, 0.92) 0%, rgba(37, 99, 235, 0.74) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.32)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          Open Proxyme
        </a>

        <div className="flex w-full max-w-[360px] items-center justify-center gap-4">
          <a
            className="flex-1 transition hover:-translate-y-[1px]"
            href="https://apps.apple.com/app/proxyme"
            target="_blank"
            rel="noreferrer"
            aria-label="Download on the App Store"
          >
            {/* Using Apple-hosted badge to avoid storing assets in this repo */}
            <img
              className="block h-[54px] w-full object-contain [filter:drop-shadow(0_18px_44px_rgba(2,6,23,0.16))]"
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
              alt="Download on the App Store"
            />
          </a>
          <a
            className="flex-1 transition hover:-translate-y-[1px]"
            href="https://play.google.com/store/apps/details?id=com.proxy-social.app"
            target="_blank"
            rel="noreferrer"
            aria-label="Get it on Google Play"
          >
            <img
              className="block h-[54px] w-full object-contain scale-[1.34] origin-center [filter:drop-shadow(0_18px_44px_rgba(2,6,23,0.16))]"
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              alt="Get it on Google Play"
            />
          </a>
        </div>

        <div className="text-[12px] leading-5 text-slate-600 max-w-[420px]">
          If “Open Proxyme” doesn’t work, your browser may not support deep links—use the store buttons instead.
        </div>
      </div>
    </section>
  );
}

