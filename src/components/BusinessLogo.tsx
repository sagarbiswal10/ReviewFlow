import { useState } from 'react';
import { Store } from 'lucide-react';

interface BusinessLogoProps {
  src?: string;
  name: string;
  primaryColor?: string;
  sizeClass?: string;
}

export function BusinessLogo({
  src,
  name,
  primaryColor = '#0F766E',
  sizeClass = 'w-12 h-12',
}: BusinessLogoProps) {
  const [hasError, setHasError] = useState(false);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  if (src && !hasError) {
    return (
      <div
        className={`${sizeClass} rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0 flex items-center justify-center`}
      >
        <img
          src={src}
          alt={`${name} logo`}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl border border-slate-200 shrink-0 flex items-center justify-center text-white font-display font-semibold select-none`}
      style={{ backgroundColor: primaryColor }}
      aria-label={`${name} emblem`}
    >
      {initials ? <span>{initials}</span> : <Store className="w-5 h-5" />}
    </div>
  );
}
