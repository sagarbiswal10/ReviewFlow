import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react';
import { ArrowDown, Pause, Play, Star, ThumbsUp, Zap } from 'lucide-react';
import { SpatialTilt } from '../ui/spatial-tilt';
import { BrandedQrCard, ReviewFlowMark } from './ReviewFlowMark';

interface PipelineStep {
  num: string;
  title: string;
  desc: string;
  statusText: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    num: '01',
    title: 'Connect Google Link',
    desc: 'Register one or multiple storefronts, paste your Google Business Profile review URL, and upload your custom brand logo.',
    statusText: 'LINKING STOREFRONT',
  },
  {
    num: '02',
    title: 'Print Branded QR',
    desc: 'Generate up to 4 placement QR stands with your center logo mark, customize colors, and export PNG or printable A4 PDF stands.',
    statusText: 'PRINTING BRANDED QR',
  },
  {
    num: '03',
    title: 'Customer Taps & Drafts',
    desc: 'Guests pick a language (English, Hindi, Marathi, or Hinglish) and tap services. AI turns their exact taps into a natural draft.',
    statusText: 'VERIFIED · DRAFTING',
  },
  {
    num: '04',
    title: 'Edit & Post on Google',
    desc: 'Guests edit freely with full control, tap copy once, and land directly on your Google listing to post manually.',
    statusText: 'POSTING ON GOOGLE',
  },
];

interface InteractivePipelineSectionProps {
  activeStep: number;
  onStepChange: (step: number) => void;
  onJumpToStep: (step: number, trackEl: HTMLElement | null) => void;
  autoPlay: boolean;
  onToggleAutoPlay: () => void;
}

export function InteractivePipelineSection({
  activeStep,
  onStepChange,
  onJumpToStep,
  autoPlay,
  onToggleAutoPlay,
}: InteractivePipelineSectionProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [typedChars, setTypedChars] = useState(0);
  const fullDraft =
    '"Had a great balayage color session at ReviewFlow today! My stylist listened closely and the warm studio vibe made it easy. Attentive care."';

  // Scroll-driven progress across the pinned track (steps 01 -> 04 before releasing to next section)
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 28,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    if (typeof window === 'undefined') return;
    // Only drive step via scroll on desktop/tablet where the sticky track is active
    if (window.innerWidth < 1024) return;
    if (latest <= 0.005 || latest >= 0.995) {
      // Allow exact boundary clamping cleanly
      const boundaryStep = latest >= 0.995 ? 3 : 0;
      if (boundaryStep !== activeStep) {
        onStepChange(boundaryStep);
      }
      return;
    }
    const nextStep = Math.min(3, Math.max(0, Math.floor(latest * 4)));
    if (nextStep !== activeStep) {
      onStepChange(nextStep);
    }
  });

  useEffect(() => {
    if (activeStep !== 3) {
      setTypedChars(0);
      return;
    }
    setTypedChars(0);
    const interval = window.setInterval(() => {
      setTypedChars((prev) => {
        if (prev >= fullDraft.length) {
          window.clearInterval(interval);
          return prev;
        }
        return prev + 4;
      });
    }, 22);
    return () => window.clearInterval(interval);
  }, [activeStep, fullDraft.length]);

  const currentMeta = PIPELINE_STEPS[activeStep] ?? PIPELINE_STEPS[0];
  const mobileProgressPercent = ((activeStep + 1) / PIPELINE_STEPS.length) * 100;

  return (
    <section
      id="pipeline"
      ref={trackRef}
      className="relative w-full rf-dot-grid-stone border-t border-black/10 lg:h-[340vh]"
    >
      {/* Sticky Pinned Viewport Stage on Desktop (completes 01 -> 04 on scroll before scrolling down) */}
      <div className="lg:sticky lg:top-16 lg:min-h-[calc(100vh-4rem)] flex items-center py-10 lg:py-5 overflow-hidden">
        <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Editorial Header */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6 lg:mb-6">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-2.5">
                <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/80 border border-black/10 font-mono text-[10px] font-semibold text-[#111114]/70">
                  {activeStep === 3 ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                      <span>FLOW COMPLETE · SCROLL DOWN</span>
                      <ArrowDown className="w-3 h-3 text-[#16A34A]" />
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF3D8B] animate-pulse" />
                      <span>SCROLL TO ADVANCE STEPS ({activeStep + 1}/4)</span>
                    </>
                  )}
                </span>
              </div>

              <h2 className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-[#111114] leading-[1.02]">
                Scan. Tap.{' '}
                <span className="font-editorial text-[1.08em] font-normal">Post.</span>
              </h2>
            </div>

            <div className="max-w-md flex flex-col items-start lg:items-end gap-2.5">
              <p className="text-sm text-[#111114]/75 leading-relaxed lg:text-left">
                How ReviewFlow turns casual visits into high-ranking Google reviews. Our sequenced
                flow removes writer&apos;s block in four simple steps.
              </p>
              <button
                type="button"
                onClick={onToggleAutoPlay}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/85 hover:bg-white border border-black/15 text-xs font-mono font-semibold text-[#111114] shadow-xs transition-all cursor-pointer"
              >
                {autoPlay ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-[#FF3D8B]" />
                    <span>PAUSE AUTO-SCROLL</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-[#FF3D8B] fill-[#FF3D8B]" />
                    <span>AUTO-PLAY FLOW</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 2-Column Interactive 3D Stage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* Left: 4 Step Cards + Scroll-Synced Progress Bar */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-2.5">
              <div className="flex flex-col gap-2.5">
                {PIPELINE_STEPS.map((step, idx) => {
                  const isActive = idx === activeStep;
                  const isCompleted = idx < activeStep;
                  return (
                    <button
                      key={step.num}
                      type="button"
                      onClick={() => onJumpToStep(idx, trackRef.current)}
                      className={`group text-left w-full rounded-2xl p-4 sm:p-4.5 transition-all duration-300 cursor-pointer border ${
                        isActive
                          ? 'bg-white border-[#FF3D8B] rf-shadow-pink -translate-y-0.5'
                          : isCompleted
                          ? 'bg-white/60 border-black/12 hover:bg-white/85'
                          : 'bg-[#E3DFD6]/65 border-black/8 hover:bg-white/75 hover:border-black/20'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 mb-1.5">
                        <span
                          className={`font-mono text-xs font-bold tabular-nums mt-0.5 transition-colors ${
                            isActive
                              ? 'text-[#FF3D8B]'
                              : isCompleted
                              ? 'text-[#16A34A]'
                              : 'text-[#111114]/40'
                          }`}
                        >
                          {step.num}
                        </span>
                        <h3
                          className={`font-display text-base font-bold tracking-tight transition-colors ${
                            isActive
                              ? 'text-[#111114]'
                              : 'text-[#111114]/65 group-hover:text-[#111114]'
                          }`}
                        >
                          {step.title}
                        </h3>
                      </div>
                      <p
                        className={`text-xs leading-relaxed transition-colors ${
                          isActive
                            ? 'text-[#111114]/75'
                            : 'text-[#111114]/45 group-hover:text-[#111114]/65'
                        }`}
                      >
                        {step.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Step Progress Bar (scroll-linked on desktop, step-linked on mobile) */}
              <div className="pt-2">
                <div className="h-[3px] w-full rounded-full bg-black/10 overflow-hidden hidden lg:block">
                  <motion.div
                    className="h-full bg-[#FF3D8B] rounded-full origin-left"
                    style={{ scaleX: smoothProgress }}
                  />
                </div>
                <div className="h-[3px] w-full rounded-full bg-black/10 overflow-hidden lg:hidden">
                  <motion.div
                    className="h-full bg-[#FF3D8B] rounded-full"
                    initial={false}
                    animate={{ width: `${mobileProgressPercent}%` }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            </div>

            {/* Right: 3D Live Pipeline Canvas */}
            <div className="lg:col-span-8">
              <SpatialTilt
                maxTilt={3.2}
                scale={1.008}
                glare={false}
                className="h-full rounded-[28px]"
              >
                <div className="relative h-full min-h-[580px] sm:min-h-[640px] lg:min-h-[650px] rounded-[28px] rf-dot-grid-dark border border-white/10 p-5 sm:p-6 flex flex-col justify-between overflow-hidden shadow-[0_30px_70px_-20px_rgba(13,13,15,0.6)]">
                  {/* Ambient glow */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 left-1/3 w-96 h-96 rounded-full opacity-20 blur-3xl transition-all duration-500"
                    style={{
                      background:
                        activeStep === 3
                          ? 'radial-gradient(circle, #FF3D8B 0%, transparent 70%)'
                          : 'radial-gradient(circle, #2454FF 0%, transparent 70%)',
                    }}
                  />

                  {/* Top Pipeline Chrome Bar */}
                  <div className="relative z-10 flex items-center justify-between gap-4">
                    <span className="font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                      REVIEWFLOW / LIVE PIPELINE
                    </span>
                    <div className="inline-flex items-center gap-2 font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4ADE80]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                      <span>{currentMeta.statusText}</span>
                    </div>
                  </div>

                  {/* Animated 3D Stage Body */}
                  <div className="relative z-10 flex-1 flex items-center justify-center py-4">
                    <AnimatePresence mode="wait">
                      {/* STEP 01: CONNECT GOOGLE LINK */}
                      {activeStep === 0 && (
                        <motion.div
                          key="step-0"
                          initial={{ opacity: 0, rotateX: 12, y: 24, scale: 0.96 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
                          exit={{ opacity: 0, rotateX: -10, y: -20, scale: 0.96 }}
                          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                          className="w-full h-full flex flex-col justify-center items-start sm:px-4 gap-7"
                          style={{ perspective: 1200 }}
                        >
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.08, duration: 0.4 }}
                            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#18181D] border border-white/12 shadow-lg"
                          >
                            <span className="w-5 h-5 rounded-full bg-white text-[#111114] flex items-center justify-center text-xs font-extrabold">
                              G
                            </span>
                            <span className="font-mono text-xs sm:text-sm text-white/85">
                              g.page/reviewflow/review
                            </span>
                          </motion.div>

                          <div className="flex flex-col sm:flex-row items-center gap-8 w-full">
                            <motion.div
                              initial={{ opacity: 0, y: 26, rotateY: -16 }}
                              animate={{ opacity: 1, y: 0, rotateY: 0 }}
                              transition={{ delay: 0.14, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            >
                              <BrandedQrCard label="ReviewFlow" tone="muted" />
                            </motion.div>

                            <motion.div
                              initial={{ opacity: 0, x: 18 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.2, duration: 0.45 }}
                              className="max-w-xs space-y-3 text-left"
                            >
                              <span className="inline-block px-2.5 py-1 rounded-md bg-white/8 border border-white/10 font-mono text-[10px] uppercase tracking-widest text-[#FF3D8B]">
                                Storefront Linked
                              </span>
                              <p className="text-sm text-white/75 leading-relaxed">
                                Your Google Business Profile link binds instantly to trackable QR
                                stands with your brand emblem at the center.
                              </p>
                            </motion.div>
                          </div>
                        </motion.div>
                      )}

                      {/* STEP 02: PRINT BRANDED QR (UP TO 4 STANDS) */}
                      {activeStep === 1 && (
                        <motion.div
                          key="step-1"
                          initial={{ opacity: 0, rotateY: 14, scale: 0.95 }}
                          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                          exit={{ opacity: 0, rotateY: -14, scale: 0.95 }}
                          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                          className="w-full flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-6 sm:px-4"
                          style={{ perspective: 1200 }}
                        >
                          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-7">
                            <motion.div
                              animate={{ y: [0, -6, 0] }}
                              transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                              className="hidden sm:block"
                            >
                              <BrandedQrCard label="ReviewFlow" tone="bright" />
                            </motion.div>

                            {/* Realistic 6.9-inch iPhone Pro Max Camera Scanner */}
                            <motion.div
                              initial={{ rotate: -5, y: 12, scale: 0.95 }}
                              animate={{ rotate: -1.5, y: 0, scale: 1 }}
                              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                              className="relative w-[240px] sm:w-[258px] rounded-[46px] bg-gradient-to-b from-[#4B4B55] via-[#27272E] to-[#131318] p-[3px] shadow-[0_32px_80px_-14px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.28)] shrink-0"
                            >
                              {/* Left Titanium Buttons: Action + Volume Up + Volume Down */}
                              <div className="absolute -left-[4px] top-20 w-[3px] h-5 rounded-l bg-[#60606B]" />
                              <div className="absolute -left-[4px] top-28 w-[3px] h-10 rounded-l bg-[#60606B]" />
                              <div className="absolute -left-[4px] top-41 w-[3px] h-10 rounded-l bg-[#60606B]" />
                              {/* Right Titanium Buttons: Side Power + Camera Control */}
                              <div className="absolute -right-[4px] top-30 w-[3px] h-14 rounded-r bg-[#60606B]" />
                              <div className="absolute -right-[4px] bottom-28 w-[3px] h-11 rounded-r bg-[#60606B]" />

                              {/* Ultra-thin black OLED display bezel */}
                              <div className="rounded-[43px] bg-[#040406] p-[6px]">
                                <div className="rounded-[37px] bg-gradient-to-b from-[#0E131E] via-[#0B0F17] to-[#080A10] px-4 pt-3 pb-3 flex flex-col justify-between min-h-[470px] sm:min-h-[490px] border border-white/10 overflow-hidden relative">
                                  {/* Status bar + Dynamic Island */}
                                  <div className="grid grid-cols-3 items-center px-1">
                                    <span className="text-[11px] font-semibold text-white/90 tabular-nums text-left">
                                      9:41
                                    </span>
                                    <div className="mx-auto w-[78px] h-[20px] rounded-full bg-black border border-white/15 flex items-center justify-end pr-2 shadow-inner">
                                      <span className="w-2.5 h-2.5 rounded-full bg-[#111827] ring-1 ring-blue-400/25 flex items-center justify-center">
                                        <span className="w-1 h-1 rounded-full bg-indigo-400/50" />
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5">
                                      <span className="text-[9px] font-bold text-white/80">5G</span>
                                      <div className="w-4 h-2.5 rounded-[3px] border border-white/55 p-[1px]">
                                        <div className="w-full h-full bg-[#4ADE80] rounded-[1px]" />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Live iOS Camera QR Scanner Frame */}
                                  <div className="my-4 flex flex-col items-center">
                                    <p className="font-mono text-[9px] uppercase tracking-widest text-white/50 mb-4">
                                      Camera · QR Auto-Detect
                                    </p>
                                    <div className="relative w-36 h-36 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center p-4">
                                      <span className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#FF3D8B] rounded-tl" />
                                      <span className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#FF3D8B] rounded-tr" />
                                      <span className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#FF3D8B] rounded-bl" />
                                      <span className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#FF3D8B] rounded-br" />

                                      <motion.div
                                        animate={{ y: [-40, 40, -40] }}
                                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                        className="absolute left-3 right-3 h-[2px] bg-[#FF3D8B] shadow-[0_0_12px_#FF3D8B]"
                                      />

                                      <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-[#FF3D8B] via-[#FACC15] to-[#2454FF] shadow-lg">
                                        <div className="w-full h-full rounded-full bg-[#16161B] flex items-center justify-center font-display font-bold text-white text-base">
                                          RF
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-5 px-3.5 py-1.5 rounded-full bg-[#FACC15] text-[#111114] font-mono text-[9px] font-bold tracking-wider uppercase shadow-lg">
                                      reviewflow.app ↗
                                    </div>
                                    <p className="text-[10px] text-white/55 mt-2">
                                      Tap banner to start in seconds
                                    </p>
                                  </div>

                                  {/* Bottom iOS Home Indicator */}
                                  <div className="w-24 h-1 rounded-full bg-white/35 mx-auto" />
                                </div>
                              </div>
                            </motion.div>
                          </div>

                          {/* 4 Placement Stand Attribution Preview */}
                          <div className="w-full sm:w-[210px] rounded-2xl bg-[#18181D] border border-white/10 p-3.5 space-y-2">
                            <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#FF3D8B]">
                              4 PLACEMENT STANDS
                            </p>
                            {[
                              { name: 'Reception Desk', pct: '44%' },
                              { name: 'Cash Counter', pct: '31%' },
                              { name: 'Dining Table', pct: '16%' },
                              { name: 'Pickup Window', pct: '9%' },
                            ].map((stand) => (
                              <div key={stand.name} className="space-y-1">
                                <div className="flex justify-between text-[10px] text-white/80 font-medium">
                                  <span>{stand.name}</span>
                                  <span className="font-mono text-[#4ADE80]">{stand.pct}</span>
                                </div>
                                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#FF3D8B]"
                                    style={{ width: stand.pct }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* STEP 03 & 04: MOBILE PHONE MOCKUP + FLOW NODES */}
                      {(activeStep === 2 || activeStep === 3) && (
                        <motion.div
                          key={`step-${activeStep}`}
                          initial={{ opacity: 0, y: 18, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -18, scale: 0.97 }}
                          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                          className="relative w-full flex flex-col md:flex-row items-center justify-center gap-6 sm:gap-8 lg:px-4"
                        >
                          {/* Center-Left: Realistic 6.9-inch iPhone Pro Max Titanium Frame */}
                          <motion.div
                            initial={{ rotateY: -6 }}
                            animate={{ rotateY: 0 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="relative w-full max-w-[322px] sm:max-w-[338px] rounded-[50px] bg-gradient-to-b from-[#52525E] via-[#282830] to-[#131318] p-[3.5px] shadow-[0_36px_90px_-14px_rgba(0,0,0,0.92),inset_0_1px_1.5px_rgba(255,255,255,0.3)] shrink-0"
                          >
                            {/* Left Titanium Hardware Buttons: Action + Volume Up + Volume Down */}
                            <div className="hidden sm:block absolute -left-[4.5px] top-24 w-[3.5px] h-6 rounded-l-sm bg-[#6B6B76]" />
                            <div className="hidden sm:block absolute -left-[4.5px] top-34 w-[3.5px] h-11 rounded-l-sm bg-[#6B6B76]" />
                            <div className="hidden sm:block absolute -left-[4.5px] top-48 w-[3.5px] h-11 rounded-l-sm bg-[#6B6B76]" />
                            {/* Right Titanium Hardware Buttons: Side Power + Camera Control */}
                            <div className="hidden sm:block absolute -right-[4.5px] top-36 w-[3.5px] h-16 rounded-r-sm bg-[#6B6B76]" />
                            <div className="hidden sm:block absolute -right-[4.5px] bottom-32 w-[3.5px] h-12 rounded-r-sm bg-[#6B6B76]" />

                            {/* Razor-thin Black OLED Display Bezel */}
                            <div className="rounded-[46.5px] bg-[#040406] p-[6.5px]">
                              {/* Tall 6.9-inch Edge-to-Edge OLED Screen */}
                              <div className="relative rounded-[40px] bg-[#F5F2EA] px-4 pt-3 pb-3 text-[#111114] min-h-[545px] sm:min-h-[565px] flex flex-col justify-between border border-black/15 overflow-hidden">
                                {/* Top Micro Speaker Slit */}
                                <div className="w-12 h-[2px] rounded-full bg-black/15 mx-auto -mt-1.5 mb-1.5" />

                                <div className="flex-1 flex flex-col">
                                  {/* Phone Status Bar + Centered Dynamic Island */}
                                  <div className="grid grid-cols-3 items-center px-0.5 pb-3">
                                    <span className="text-[11px] font-bold text-[#111114] tabular-nums text-left">
                                      9:41
                                    </span>
                                    <div className="mx-auto w-[96px] h-[22px] rounded-full bg-[#09090C] flex items-center justify-end pr-2 shadow-inner ring-1 ring-black/20">
                                      <span className="w-3 h-3 rounded-full bg-[#111827] ring-1 ring-blue-400/25 flex items-center justify-center">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/45" />
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5">
                                      <div className="flex items-end gap-[1.5px]">
                                        <span className="w-[2px] h-1.5 rounded-full bg-[#111114]" />
                                        <span className="w-[2px] h-2 rounded-full bg-[#111114]" />
                                        <span className="w-[2px] h-2.5 rounded-full bg-[#111114]" />
                                        <span className="w-[2px] h-3 rounded-full bg-[#111114]" />
                                      </div>
                                      <span className="text-[9px] font-bold text-[#111114]">5G</span>
                                      <div className="w-4.5 h-2.5 rounded-[3px] border border-[#111114]/75 p-[1px]">
                                        <div className="w-full h-full rounded-[1px] bg-[#16A34A]" />
                                      </div>
                                    </div>
                                  </div>

                                  {/* App Header: ReviewFlow */}
                                  <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-black/10">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-7 h-7 rounded-lg bg-[#111114] text-white flex items-center justify-center font-display font-bold text-xs shrink-0">
                                        RF
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-[#111114] leading-tight truncate">
                                          ReviewFlow
                                        </p>
                                        <p className="text-[10px] text-[#111114]/55 truncate">
                                          Verified Storefront
                                        </p>
                                      </div>
                                    </div>
                                    <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] text-[10px] font-bold shrink-0">
                                      Verified QR
                                    </span>
                                  </div>

                                  {/* Full-Width 4-Language Pill Bar */}
                                  <div className="grid grid-cols-4 gap-1.5 mb-3.5">
                                    {['EN', 'हिंदी', 'मराठी', 'Hinglish'].map((lang, lIdx) => (
                                      <span
                                        key={lang}
                                        className={`py-1 rounded-lg text-[9.5px] font-semibold text-center ${
                                          lIdx === 0
                                            ? 'bg-[#2454FF] text-white shadow-xs'
                                            : 'bg-white/90 text-[#111114]/70 border border-black/10'
                                        }`}
                                      >
                                        {lang}
                                      </span>
                                    ))}
                                  </div>

                                  {/* Prompt + Flush 2x2 Selection Chips */}
                                  <p className="font-display text-[13.5px] font-bold text-[#111114] mb-2">
                                    How was your visit today?
                                  </p>

                                  <div className="grid grid-cols-2 gap-1.5 mb-3.5">
                                    <span className="px-2.5 py-1.5 rounded-xl bg-[#111114] text-white text-[10px] font-semibold text-center">
                                      Balayage
                                    </span>
                                    <span className="px-2.5 py-1.5 rounded-xl bg-white text-[#111114]/75 border border-black/10 text-[10px] font-medium text-center">
                                      Haircut
                                    </span>
                                    <span className="px-2.5 py-1.5 rounded-xl bg-[#111114] text-white text-[10px] font-semibold text-center">
                                      Warm vibe
                                    </span>
                                    <span
                                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-semibold text-center transition-colors duration-300 ${
                                        activeStep === 3
                                          ? 'bg-[#111114] text-white'
                                          : 'bg-white text-[#111114]/75 border border-black/10'
                                      }`}
                                    >
                                      Attentive care
                                    </span>
                                  </div>

                                  {/* Draft Card (fills clean mid height with crisp header & footer divider) */}
                                  <div className="flex-1 rounded-2xl bg-white p-3.5 border border-black/10 flex flex-col justify-between shadow-xs mb-3">
                                    <div>
                                      <div className="flex items-center justify-between font-mono text-[8.5px] font-bold uppercase tracking-wider mb-2">
                                        <span className="text-[#FF3D8B]">PERSONALIZED GOOGLE DRAFT</span>
                                        <span className="text-[#111114]/45">EDITABLE</span>
                                      </div>
                                      {activeStep === 3 ? (
                                        <p className="text-[11px] text-[#111114]/85 leading-relaxed">
                                          {fullDraft.slice(0, typedChars)}
                                          {typedChars < fullDraft.length && (
                                            <span className="inline-block w-1 h-3.5 bg-[#FF3D8B] ml-0.5 animate-pulse align-middle" />
                                          )}
                                        </p>
                                      ) : (
                                        <p className="text-[11px] text-[#111114]/45 italic leading-relaxed">
                                          Generating a natural review directly from your tapped selections...
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-black/8 font-mono text-[9px] text-[#111114]/50 tabular-nums">
                                      <span>
                                        {activeStep === 3
                                          ? `${Math.min(185, typedChars)} characters`
                                          : '0 characters'}
                                      </span>
                                      <span>Ready for Google</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Bottom Action Dock */}
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div className="py-1.5 rounded-xl border border-black/12 bg-white text-center text-[10px] font-semibold text-[#111114]/75">
                                      Edit Review
                                    </div>
                                    <div className="py-1.5 rounded-xl border border-black/12 bg-white text-center text-[10px] font-semibold text-[#111114]/75">
                                      Regenerate
                                    </div>
                                  </div>

                                  <div
                                    className={`w-full py-2.5 rounded-full text-center text-[11px] font-bold transition-colors duration-300 ${
                                      activeStep === 3
                                        ? 'bg-[#FF3D8B] text-[#111114] shadow-[0_8px_22px_rgba(255,61,139,0.45)]'
                                        : 'bg-[#111114] text-white'
                                    }`}
                                  >
                                    Copy &amp; Post on Google
                                  </div>

                                  {/* Bottom iOS Home Indicator */}
                                  <div className="w-28 h-1 rounded-full bg-[#111114]/35 mx-auto mt-1.5" />
                                </div>
                              </div>
                            </div>
                          </motion.div>

                          {/* Right: Floating Connected Telemetry Cards */}
                          <div className="flex flex-col gap-3 w-full md:w-[235px] shrink-0">
                            <motion.div
                              initial={{ opacity: 0, x: 16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.08, duration: 0.36 }}
                              className="rounded-xl bg-[#18181D] border border-white/10 p-3.5 shadow-lg"
                            >
                              <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/60 mb-2">
                                <ThumbsUp className="w-3 h-3 text-[#60A5FA]" />
                                <span>GUEST TAPS</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <span className="px-2 py-0.5 rounded-full bg-[#FF3D8B] text-[#111114] text-[9px] font-bold">
                                  Balayage
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[9px]">
                                  Warm vibe
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[9px]">
                                  Attentive care
                                </span>
                              </div>
                            </motion.div>

                            {activeStep === 3 && (
                              <motion.div
                                initial={{ opacity: 0, x: 18, y: 8 }}
                                animate={{ opacity: 1, x: 0, y: 0 }}
                                transition={{ delay: 0.18, duration: 0.38 }}
                                className="rounded-xl bg-[#18181D] border border-white/10 p-3.5 shadow-lg"
                              >
                                <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#FACC15] mb-1.5">
                                  <Zap className="w-3 h-3" />
                                  <span>MULTILINGUAL · SHORT</span>
                                </div>
                                <p className="text-[11px] text-white/75 leading-snug">
                                  English, Hindi, Marathi &amp; Hinglish drafts built strictly from
                                  guest selections.
                                </p>
                              </motion.div>
                            )}

                            {activeStep === 3 && (
                              <motion.div
                                initial={{ opacity: 0, x: 20, scale: 0.92 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                transition={{ delay: 0.3, duration: 0.4 }}
                                className="rounded-xl bg-[#F5F3EE] text-[#111114] p-3 rf-shadow-pink border border-black/10"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded-full bg-[#2454FF] text-white text-[9px] font-extrabold flex items-center justify-center">
                                      G
                                    </span>
                                    <span className="font-display text-xs font-bold">
                                      ReviewFlow
                                    </span>
                                  </div>
                                  <span className="font-mono text-[9px] text-[#111114]/50">
                                    just now
                                  </span>
                                </div>
                                <div className="flex items-center gap-0.5 mb-1">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className="w-2.5 h-2.5 text-[#F59E0B] fill-[#F59E0B]"
                                    />
                                  ))}
                                </div>
                                <p className="text-[9.5px] font-mono text-[#111114]/65">
                                  Posted on Google · In seconds
                                </p>
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Bottom Step Indicator Dots */}
                  <div className="relative z-10 flex items-center justify-between pt-2 border-t border-white/8">
                    <div className="flex items-center gap-2">
                      <ReviewFlowMark size="sm" />
                      <span className="font-mono text-[10px] text-white/45 uppercase tracking-wider">
                        Step {currentMeta.num} of 04
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {PIPELINE_STEPS.map((s, idx) => (
                        <button
                          key={s.num}
                          type="button"
                          aria-label={`Jump to step ${s.num}`}
                          onClick={() => onJumpToStep(idx, trackRef.current)}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            idx === activeStep
                              ? 'w-6 bg-[#FF3D8B]'
                              : 'w-1.5 bg-white/25 hover:bg-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </SpatialTilt>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
