/** Composição estática (sem WebGL / economia de dados): mesma direção visual, só SVG. */
export function StaticCompass({ label = "Bússola RUMO" }: { label?: string }) {
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label={label} style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="sc-cer" cx="45%" cy="35%" r="70%"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e3e9f5" /></radialGradient>
        <linearGradient id="sc-met" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eef1f6" /><stop offset=".45" stopColor="#aab3c2" /><stop offset=".55" stopColor="#d9dee7" /><stop offset="1" stopColor="#8f99aa" /></linearGradient>
        <filter id="sc-sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#0B1F4D" floodOpacity=".18" /></filter>
      </defs>
      <g filter="url(#sc-sh)">
        <circle cx="200" cy="200" r="150" fill="url(#sc-met)" />
        <circle cx="200" cy="200" r="132" fill="url(#sc-cer)" />
        <circle cx="200" cy="200" r="104" fill="none" stroke="#c4ccda" strokeWidth="5" />
      </g>
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2, r1 = 118, r2 = i % 6 === 0 ? 108 : 113;
        return <line key={i} x1={200 + Math.sin(a) * r1} y1={200 - Math.cos(a) * r1} x2={200 + Math.sin(a) * r2} y2={200 - Math.cos(a) * r2} stroke="#52627A" strokeWidth={i % 6 === 0 ? 2 : 1} />;
      })}
      <path d="M200 92 L226 262 L200 238 Z" fill="#0B1F4D" />
      <path d="M200 92 L174 262 L200 238 Z" fill="#1F57FF" />
      <circle cx="200" cy="214" r="9" fill="#1F57FF" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}
