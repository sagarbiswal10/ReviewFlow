import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { SpatialTilt } from '../ui/spatial-tilt';
import { ReviewFlowMark } from './ReviewFlowMark';

type ShowcaseMode = 'guest' | 'analytics';
type DraftTone = 'short' | 'detailed' | 'professional';

const SHOWCASE_PILLS = [
  'Balayage',
  'Haircut',
  'Keratin Treatment',
  'Studio Atmosphere',
  'Courteous Staff',
];

interface InteractiveShowcaseSectionProps {
  onTryDemo: () => void;
}

export function InteractiveShowcaseSection({ onTryDemo }: InteractiveShowcaseSectionProps) {
  const [mode, setMode] = useState<ShowcaseMode>('guest');
  const [selectedPills, setSelectedPills] = useState<string[]>([
    'Balayage',
    'Studio Atmosphere',
  ]);
  const [tone, setTone] = useState<DraftTone>('short');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [copiedToast, setCopiedToast] = useState(false);

  // Analytics & Token control interactive state
  const [qrTokenVer, setQrTokenVer] = useState(1);
  const [qrPaused, setQrPaused] = useState(false);
  const [tokenToast, setTokenToast] = useState<string | null>(null);

  const togglePill = (pill: string) => {
    setSelectedPills((prev) => {
      if (prev.includes(pill)) {
        return prev.length > 1 ? prev.filter((item) => item !== pill) : prev;
      }
      return [...prev, pill];
    });
  };

  const draftText = useMemo(() => {
    const joined = selectedPills.map((p) => p.toLowerCase()).join(', ');
    if (tone === 'short') {
      return phraseIdx % 2 === 0
        ? `Had a great visit at ReviewFlow today! I really enjoyed ${joined}. Would happily recommend.`
        : `Visited ReviewFlow today and loved the ${joined}. Smooth experience from start to finish.`;
    }
    if (tone === 'detailed') {
      return phraseIdx % 2 === 0
        ? `Stopped by ReviewFlow today and had a wonderful experience with ${joined}. Every step felt thoughtful, unhurried, and tailored to what I wanted. I will definitely be booking my next visit here.`
        : `I visited ReviewFlow for ${joined} and appreciated how seamless everything felt. The team took the time to listen carefully and the entire space felt welcoming and spotless.`;
    }
    return phraseIdx % 2 === 0
      ? `Excellent experience at ReviewFlow. Highlighted by ${joined} and attentive attention to detail throughout the appointment. Highly recommended for consistent quality.`
      : `ReviewFlow delivered a polished, reliable appointment focused on ${joined}. Clean environment, clear communication, and timely service.`;
  }, [selectedPills, tone, phraseIdx]);

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
    } catch {
      // Ignore clipboard permission errors
    }
    setCopiedToast(true);
    window.setTimeout(() => setCopiedToast(false), 2400);
  };

  const showTokenFeedback = (msg: string) => {
    setTokenToast(msg);
    window.setTimeout(() => setTokenToast(null), 2400);
  };

  return (
    <section id="showcase" className="relative w-full overflow-hidden">
      {/* Upper Warm Stone Intro Band */}
      <div className="rf-dot-grid-stone pt-20 lg:pt-24 pb-28 sm:pb-36">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl sm:text-5xl lg:text-[3.75rem] font-bold tracking-tight text-[#111114] leading-[1.02] max-w-2xl"
            >
              See the exact{' '}
              <span className="font-editorial text-[1.06em] font-normal">20-second</span>
              <br />
              customer journey.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-sm sm:text-base text-[#111114]/75 max-w-sm leading-relaxed"
            >
              Test the live guest experience below or switch tabs to explore multi-location
              analytics and QR token controls.
            </motion.p>
          </div>
        </div>
      </div>

      {/* Overlapping Dark Stage Seam */}
      <div className="rf-dot-grid-dark pb-20 lg:pb-24">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24">
          <SpatialTilt maxTilt={2.2} scale={1.005} glare={false} className="rounded-[28px]">
            <motion.div
              initial={{ opacity: 0, y: 36, rotateX: 8 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[28px] bg-[#141418] border border-white/10 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              {/* Showcase Window Header Bar */}
              <div className="px-5 sm:px-7 py-4 border-b border-white/8 flex flex-wrap items-center justify-between gap-4 bg-[#18181D]">
                <div className="flex items-center gap-3 min-w-0">
                  <ReviewFlowMark size="sm" />
                  <span className="text-white/30 text-sm">/</span>
                  <span className="font-display text-sm font-bold text-white truncate">
                    ReviewFlow
                  </span>
                  <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-md bg-white/8 border border-white/10 font-mono text-[10px] text-white/60">
                    Interactive Storefront
                  </span>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="inline-flex p-1 rounded-full bg-black/40 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setMode('guest')}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                        mode === 'guest'
                          ? 'bg-white text-[#111114]'
                          : 'text-white/65 hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Guest View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('analytics')}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                        mode === 'analytics'
                          ? 'bg-white text-[#111114]'
                          : 'text-white/65 hover:text-white'
                      }`}
                    >
                      <BarChart3 className="w-3 h-3" />
                      <span>Multi-Location</span>
                    </button>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#16A34A]/20 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-[10px] font-bold tracking-wider uppercase">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>VERIFIED QR</span>
                  </span>
                </div>
              </div>

              {/* Showcase Window Content */}
              {mode === 'guest' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12">
                  {/* Left: Guest Taps & Architecture Cards */}
                  <div className="lg:col-span-8 p-6 sm:p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-white/8 flex flex-col justify-between gap-8">
                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45 mb-2.5">
                        GUEST VIEW · STEP 3
                      </p>
                      <h3 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-6">
                        How was your visit today?
                      </h3>

                      {/* Interactive Service Pills */}
                      <div className="flex flex-wrap gap-2.5">
                        {SHOWCASE_PILLS.map((pill) => {
                          const active = selectedPills.includes(pill);
                          return (
                            <motion.button
                              key={pill}
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              onClick={() => togglePill(pill)}
                              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer border ${
                                active
                                  ? 'bg-white text-[#111114] border-white shadow-[0_6px_18px_rgba(255,255,255,0.16)]'
                                  : 'bg-[#1D1D23] text-white/70 border-white/10 hover:border-white/25 hover:text-white'
                              }`}
                            >
                              {pill}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3 Trust Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="rounded-xl bg-[#1A1A20] border border-white/8 p-4">
                        <Sparkles className="w-4 h-4 text-[#FF3D8B] mb-3" />
                        <p className="text-xs font-semibold text-white/90 leading-snug">
                          Never Fabricates Experiences
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#1A1A20] border border-white/8 p-4">
                        <Shield className="w-4 h-4 text-[#FACC15] mb-3" />
                        <p className="text-xs font-semibold text-white/90 leading-snug">
                          100% Policy-Safe Architecture
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#1A1A20] border border-white/8 p-4">
                        <Smartphone className="w-4 h-4 text-[#3B82F6] mb-3" />
                        <p className="text-xs font-semibold text-white/90 leading-snug">
                          Zero App Installs Required
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Live AI Draft Panel */}
                  <div className="lg:col-span-4 p-6 sm:p-8 flex flex-col justify-between gap-5 bg-[#121216]">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3.5">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                          PERSONALIZED GOOGLE DRAFT
                        </span>
                        <span className="text-[11px] font-semibold text-[#FF3D8B]">Editable</span>
                      </div>

                      {/* Tone Switcher */}
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#1B1B21] border border-white/8 mb-4">
                        {(
                          [
                            { id: 'short', label: 'Short' },
                            { id: 'detailed', label: 'Detailed' },
                            { id: 'professional', label: 'Professional' },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTone(item.id)}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              tone === item.id
                                ? 'bg-white text-[#111114] shadow-xs'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {/* Draft Text Box */}
                      <div className="rounded-xl bg-[#1B1B21] border border-white/10 p-4 mb-3 min-h-[126px]">
                        <p className="text-xs sm:text-[13px] text-white/88 leading-relaxed">
                          &ldquo;{draftText}&rdquo;
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-white/45 font-mono tabular-nums mb-4">
                        <span>{draftText.length} characters</span>
                        <button
                          type="button"
                          onClick={() => setPhraseIdx((n) => n + 1)}
                          className="inline-flex items-center gap-1 text-white/75 hover:text-[#FF3D8B] transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Rephrase</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={handleCopyDraft}
                        className="w-full py-3.5 px-4 rounded-xl bg-[#FF3D8B] hover:bg-[#ff267d] text-[#111114] font-bold text-xs sm:text-sm transition-all shadow-[0_10px_28px_-8px_rgba(255,61,139,0.55)] cursor-pointer flex items-center justify-center gap-2"
                      >
                        {copiedToast ? (
                          <>
                            <Check className="w-4 h-4 stroke-[2.5]" />
                            <span>Draft Copied! Ready for Google</span>
                          </>
                        ) : (
                          <span>Scan to Post: 18–24 Seconds</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={onTryDemo}
                        className="mt-3 w-full text-center text-[11px] text-white/50 hover:text-white/85 transition-colors cursor-pointer leading-snug"
                      >
                        Try the full real AI flow with our Stylish Hair Studio demo.
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2: MULTI-LOCATION ANALYTICS & TOKEN CONTROLS */
                <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FF3D8B] font-bold">
                          REGIONAL OPERATIONS
                        </span>
                        <h3 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                          Real-Time Scan &amp; Post Velocity
                        </h3>
                      </div>
                      <span className="font-mono text-xs text-white/60">
                        Last 30 Days · <strong className="text-[#4ADE80]">3 Locations Active</strong>
                      </span>
                    </div>

                    {/* Velocity Area Chart */}
                    <div className="rounded-2xl bg-[#1B1B21] border border-white/8 p-4">
                      <svg
                        className="w-full h-36 overflow-visible"
                        fill="none"
                        preserveAspectRatio="none"
                        viewBox="0 0 600 150"
                        aria-label="30 day QR scan and review conversion curve"
                      >
                        <defs>
                          <linearGradient id="darkVelocityGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#FF3D8B" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#FF3D8B" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0 125 C80 112, 125 65, 185 80 C245 95, 305 38, 385 48 C465 58, 525 18, 600 12 L600 150 L0 150 Z"
                          fill="url(#darkVelocityGrad)"
                        />
                        <path
                          d="M0 125 C80 112, 125 65, 185 80 C245 95, 305 38, 385 48 C465 58, 525 18, 600 12"
                          stroke="#FF3D8B"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <circle cx="185" cy="80" r="5" fill="#141418" stroke="#FF3D8B" strokeWidth="3" />
                        <circle cx="385" cy="48" r="5" fill="#141418" stroke="#FF3D8B" strokeWidth="3" />
                        <circle cx="600" cy="12" r="6" fill="#4ADE80" stroke="#141418" strokeWidth="2" />
                      </svg>
                      <div className="flex justify-between font-mono text-[11px] text-white/45 pt-2 border-t border-white/8">
                        <span>Week 1</span>
                        <span>Week 2</span>
                        <span>Week 3</span>
                        <span className="text-[#4ADE80]">Current</span>
                      </div>
                    </div>

                    {/* Storefront Table (ReviewFlow locations, no Lumina Studio) */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="font-mono text-[10px] uppercase tracking-wider text-white/45 border-b border-white/10">
                            <th className="pb-2.5">Location</th>
                            <th className="pb-2.5">Scans</th>
                            <th className="pb-2.5">Draft Copies</th>
                            <th className="pb-2.5">Conversion</th>
                            <th className="pb-2.5 text-right">Avg Rating</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8 text-white/85">
                          {[
                            {
                              name: 'ReviewFlow – Flagship Lounge',
                              scans: '1,480',
                              copies: '1,392',
                              rate: '94.1%',
                              rating: '4.94 ★',
                            },
                            {
                              name: 'ReviewFlow – Midtown Studio',
                              scans: '920',
                              copies: '874',
                              rate: '95.0%',
                              rating: '4.89 ★',
                            },
                            {
                              name: 'ReviewFlow – Westside Branch',
                              scans: '1,110',
                              copies: '1,029',
                              rate: '92.7%',
                              rating: '4.91 ★',
                            },
                          ].map((row) => (
                            <tr key={row.name} className="hover:bg-white/[0.03] transition-colors">
                              <td className="py-3 font-semibold text-white">{row.name}</td>
                              <td className="py-3 font-mono tabular-nums">{row.scans}</td>
                              <td className="py-3 font-mono tabular-nums">{row.copies}</td>
                              <td className="py-3 font-mono font-bold text-[#4ADE80] tabular-nums">
                                {row.rate}
                              </td>
                              <td className="py-3 text-right font-bold text-[#FACC15] tabular-nums">
                                {row.rating}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column Token Controls */}
                  <div className="lg:col-span-4 flex flex-col gap-4 justify-between">
                    <div className="rounded-2xl bg-[#1B1B21] border border-white/10 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display text-base font-bold text-white">
                          Instant Token Controls
                        </h4>
                        <Shield className="w-4 h-4 text-[#FF3D8B]" />
                      </div>
                      <p className="text-xs text-white/65 leading-relaxed">
                        Tabletop stand damaged or moved? Cycle tokens remotely or pause QR access in
                        one click without losing analytics.
                      </p>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            const next = qrTokenVer + 1;
                            setQrTokenVer(next);
                            showTokenFeedback(`Token rotated to revision v${next}.`);
                          }}
                          className="w-full py-2.5 px-3.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-semibold text-white flex items-center justify-between cursor-pointer transition-colors"
                        >
                          <span>Cycle QR Revision Token (v{qrTokenVer})</span>
                          <RefreshCw className="w-3.5 h-3.5 text-[#FF3D8B]" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            showTokenFeedback('Vector PNG & A4 PDF poster preview ready in portal.')
                          }
                          className="w-full py-2.5 px-3.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-semibold text-white flex items-center justify-between cursor-pointer transition-colors"
                        >
                          <span>Download Print Poster Kit</span>
                          <Download className="w-3.5 h-3.5 text-[#60A5FA]" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const next = !qrPaused;
                            setQrPaused(next);
                            showTokenFeedback(next ? 'In-store QR paused.' : 'In-store QR active.');
                          }}
                          className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                            qrPaused
                              ? 'bg-[#16A34A]/20 border-[#4ADE80]/30 text-[#4ADE80]'
                              : 'bg-red-500/15 border-red-400/25 text-red-300 hover:bg-red-500/25'
                          }`}
                        >
                          <span>{qrPaused ? 'Resume In-Store QR' : 'Pause In-Store QR'}</span>
                          {qrPaused ? (
                            <PlayCircle className="w-3.5 h-3.5" />
                          ) : (
                            <PauseCircle className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {tokenToast && (
                        <p className="font-mono text-[11px] text-[#4ADE80]">{tokenToast}</p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-[#2454FF] text-white p-5 border border-white/15">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/75 mb-1.5">
                        GOOGLE SEO IMPACT
                      </p>
                      <h4 className="font-display text-base font-bold mb-1.5">Local 3-Pack Boost</h4>
                      <p className="text-xs text-white/85 leading-relaxed mb-3">
                        Natural, service-specific customer reviews help Google index your storefront
                        for local searches.
                      </p>
                      <div className="font-mono text-xs bg-black/20 rounded-lg px-3 py-2">
                        <strong className="text-[#FACC15]">+284%</strong> Local Map Discovery
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Showcase Window Bottom Status Bar */}
              <div className="px-5 sm:px-7 py-3 border-t border-white/8 bg-[#121216] flex items-center justify-between gap-4">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  WHY CUSTOMERS COMPLETE THIS FLOW (94.2% RATE)
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4ADE80]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                  <span>LIVE</span>
                </span>
              </div>
            </motion.div>
          </SpatialTilt>

          <p className="mt-8 text-center text-xs sm:text-sm text-white/45 max-w-xl mx-auto leading-relaxed">
            When guests open a blank Google review window on their phone, writer&apos;s block
            stops them. ReviewFlow turns open-ended prompts into effortless quick taps.
          </p>
        </div>
      </div>
    </section>
  );
}
