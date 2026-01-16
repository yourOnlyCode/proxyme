export function OrbBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 -left-24 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.55),transparent_62%)] blur-2xl opacity-55" />
      <div className="absolute top-24 -right-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.50),transparent_62%)] blur-2xl opacity-45" />
      <div className="absolute -bottom-40 left-1/3 h-[680px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(168,85,247,0.55),transparent_60%)] blur-2xl opacity-48" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-white/70" />
    </div>
  );
}

