import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';

interface ReviewFlowMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ReviewFlowMark({ size = 'md', className = '' }: ReviewFlowMarkProps) {
  const dims =
    size === 'sm'
      ? { box: 'w-6 h-4', circle: 'w-3.5 h-3.5', right: 'left-2' }
      : size === 'lg'
      ? { box: 'w-9 h-6', circle: 'w-5 h-5', right: 'left-3.5' }
      : { box: 'w-7 h-5', circle: 'w-4 h-4', right: 'left-2.5' };

  return (
    <span className={`relative inline-flex items-center shrink-0 ${dims.box} ${className}`} aria-hidden="true">
      <span className={`absolute left-0 rounded-full bg-[#FF3D8B] ${dims.circle}`} />
      <span
        className={`absolute ${dims.right} rounded-full bg-[#2454FF] mix-blend-normal ring-1 ring-white/25 ${dims.circle}`}
      />
    </span>
  );
}

// Deterministic 11x11 stylized QR matrix (excluding 3x3 finder corners) for crisp vector rendering
const QR_MODULES: Array<[number, number]> = [
  [4, 0], [6, 0], [4, 1], [5, 1], [7, 1], [4, 2], [7, 2],
  [0, 4], [2, 4], [4, 4], [7, 4], [9, 4], [11, 4],
  [1, 5], [3, 5], [8, 5], [10, 5],
  [0, 6], [2, 6], [4, 6], [7, 6], [9, 6], [11, 6],
  [1, 7], [3, 7], [5, 7], [6, 7], [8, 7], [10, 7],
  [4, 8], [6, 8], [8, 8], [9, 8], [11, 8],
  [4, 9], [5, 9], [7, 9], [10, 9],
  [4, 10], [6, 10], [8, 10], [9, 10], [11, 10],
  [5, 11], [7, 11], [10, 11], [11, 11],
];

interface BrandedQrCardProps {
  label?: string;
  tone?: 'muted' | 'bright' | 'tilt';
  verified?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function BrandedQrCard({
  label = 'ReviewFlow',
  tone = 'bright',
  verified = false,
  className = '',
  style,
}: BrandedQrCardProps) {
  const surfaceClass =
    tone === 'muted'
      ? 'bg-[#B9B6AE] text-[#111114] rf-shadow-pink'
      : tone === 'tilt'
      ? 'bg-[#F5F3EE] text-[#111114] rf-shadow-dark-lg'
      : 'bg-[#FFFFFF] text-[#111114] rf-shadow-pink';

  return (
    <div
      style={style}
      className={`relative rounded-2xl p-4 sm:p-5 border border-[#111114]/15 select-none ${surfaceClass} ${className}`}
    >
      {verified && (
        <div className="absolute -top-3 -right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#16A34A] text-white text-[11px] font-bold shadow-lg border border-white/20 whitespace-nowrap">
          <Check className="w-3 h-3 stroke-[3]" />
          <span>Verified QR</span>
        </div>
      )}

      <p className="text-center font-mono text-[9px] sm:text-[10px] font-semibold tracking-[0.22em] uppercase text-[#111114]/60 mb-2.5">
        SCAN TO REVIEW
      </p>

      <div className="relative mx-auto w-[124px] h-[124px] sm:w-[144px] sm:h-[144px]">
        <svg viewBox="0 0 120 120" className="w-full h-full" aria-label={`QR Code for ${label}`}>
          {/* Top-left finder */}
          <rect x="4" y="4" width="30" height="30" rx="3" fill="none" stroke="#111114" strokeWidth="5" />
          <rect x="12" y="12" width="14" height="14" rx="1.5" fill="#FF3D8B" />

          {/* Top-right finder */}
          <rect x="86" y="4" width="30" height="30" rx="3" fill="none" stroke="#111114" strokeWidth="5" />
          <rect x="94" y="12" width="14" height="14" rx="1.5" fill="#FF3D8B" />

          {/* Bottom-left finder */}
          <rect x="4" y="86" width="30" height="30" rx="3" fill="none" stroke="#111114" strokeWidth="5" />
          <rect x="12" y="94" width="14" height="14" rx="1.5" fill="#FF3D8B" />

          {/* Data modules */}
          {QR_MODULES.map(([cx, cy]) => (
            <rect
              key={`${cx}-${cy}`}
              x={4 + cx * 9.3}
              y={4 + cy * 9.3}
              width="7.2"
              height="7.2"
              rx="1.2"
              fill="#111114"
            />
          ))}
        </svg>

        {/* Center ReviewFlow Emblem */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-9 h-9 rounded-lg bg-white shadow-sm border border-black/10 flex items-center justify-center">
            <ReviewFlowMark size="sm" />
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-center font-display text-xs sm:text-sm font-bold tracking-tight text-[#111114]">
        {label}
      </p>
    </div>
  );
}
