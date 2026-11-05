export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl border border-ink-950/10 bg-ink-850 shadow-[0_10px_30px_-16px_rgba(36,114,245,0.8)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} aria-hidden>
        <defs>
          <linearGradient id="openan-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4b96ff" />
            <stop offset="1" stopColor="#3fdcc6" />
          </linearGradient>
        </defs>
        <path d="M16 4.5 28.5 27.5h-6.9L16 16.4l-5.6 11.1H3.5z" fill="url(#openan-mark)" />
        <path d="M16 21.6h5.4l-2.7 5.3h-5.4z" fill="rgba(255,255,255,0.28)" />
      </svg>
    </span>
  );
}
