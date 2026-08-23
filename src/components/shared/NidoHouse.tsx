import { P } from "@/lib/palette";

export function NidoHouse() {
  return (
    <svg viewBox="0 0 300 230" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[260px] mx-auto">
      <ellipse cx="150" cy="210" rx="120" ry="16" fill={P.border} />
      <rect x="75" y="120" width="150" height="90" rx="6" fill="#FFFFFF" />
      <path d="M60 126 L150 54 L240 126 Z" fill={P.brnDk} />
      <rect x="180" y="72" width="20" height="36" rx="4" fill={P.brn} />
      <path d="M177 76 Q187 64 199 76" stroke={P.sageLt} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      <rect x="128" y="152" width="44" height="58" rx="22" fill={P.brnDk} />
      <circle cx="163" cy="183" r="3" fill={P.bgL} />
      <rect x="86" y="136" width="40" height="34" rx="10" fill={P.sub} />
      <line x1="106" y1="136" x2="106" y2="170" stroke="#FFF" strokeWidth="1.5" />
      <line x1="86"  y1="153" x2="126" y2="153" stroke="#FFF" strokeWidth="1.5" />
      <rect x="174" y="136" width="40" height="34" rx="10" fill={P.sub} />
      <line x1="194" y1="136" x2="194" y2="170" stroke="#FFF" strokeWidth="1.5" />
      <line x1="174" y1="153" x2="214" y2="153" stroke="#FFF" strokeWidth="1.5" />
      <path d="M128 210 Q150 204 172 210" stroke={P.sub} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="160" r="16" fill={P.sage} />
      <path d="M30 210 Q46 190 62 210" fill={P.sageDk} />
      <circle cx="254" cy="160" r="16" fill={P.sub} stroke={P.border} strokeWidth="2" strokeDasharray="4 3" />
      <text x="254" y="165" textAnchor="middle" fill={P.muted} fontSize="14">?</text>
      <circle cx="72"  cy="204" r="9" fill={P.sageLt} />
      <rect   x="69"  y="204" width="6" height="14" rx="3" fill={P.sage} />
      <circle cx="228" cy="204" r="9" fill={P.sageLt} />
      <rect   x="225" y="204" width="6" height="14" rx="3" fill={P.sage} />
      <circle cx="35"  cy="80" r="3" fill={P.sageLt} opacity="0.6" />
      <circle cx="265" cy="70" r="2.5" fill={P.sageLt} opacity="0.5" />
      <circle cx="255" cy="100" r="2" fill={P.sageLt} opacity="0.4" />
    </svg>
  );
}
