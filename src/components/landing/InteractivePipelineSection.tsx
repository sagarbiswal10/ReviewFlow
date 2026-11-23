import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Pause, Play, Smartphone, Star, ThumbsUp, Zap } from 'lucide-react';
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
    desc: 'Generate crisp dynamic QR codes with your center logo mark, customize colors, and export PNG or printable A4 PDF stands.',
    statusText: 'PRINTING BRANDED QR',
  },
  {
    num: '03',
    title: 'Customer Taps & Drafts',
    desc: 'Guests tap specific services they enjoyed. Our AI turns their exact selections into a natural, SEO-friendly first-person draft.',
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
  onSelectStep: (step: number) => void;
  autoPlay: boolean;
  onToggleAutoPlay: () => void;
}

export function InteractivePipelineSection({
  activeStep,
  onSelectStep,
  autoPlay,
  onToggleAutoPlay,
}: InteractivePipelineSectionProps) {
  const [typedChars, setTypedChars] = useState(0);
  const fullDraft =
    '"Had a great balayage color session at ReviewFlow today! My stylist listened closely and the warm studio vibe made it easy. Attentive care."';

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
    }, 24);
    return () => window.clearInterval(interval);
  }, [activeStep, fullDraft.length]);

  const currentMeta = PIPELINE_STEPS[activeStep] ?? PIPELINE_STEPS[0];
  const progressPercent = ((activeStep + 1) / PIPELINE_STEPS.length) * 100;

  return (
    <section
      id="pipeline"
      className="relative w-full py-20 lg:py-28 rf-dot-grid-stone border-t border-black/10 overflow-hidden"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Editorial Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-xl"
          >
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111114]/60 mb-3">
              01 — THE FRICTIONLESS PIPELINE
            </p>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-[#111114] leading-[1.03]">
              Scan. Tap.{' '}
              <span className="font-editorial text-[1.08em] font-normal">Post.</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-md flex flex-col items-start lg:items-end gap-3"
          >
            <p className="text-sm sm:text-base text-[#111114]/75 leading-relaxed lg:text-left">
              How ReviewFlow turns casual visits into high-ranking Google reviews. Our sequenced
              flow removes writer&apos;s block in four simple steps.
            </p>
            <button
              type="button"
              onClick={onToggleAutoPlay}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 hover:bg-white border border-black/15 text-xs font-mono font-semibold text-[#111114] shadow-xs transition-all cursor-pointer"
            >
              {autoPlay ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-[#FF3D8B]" />
                  <span>PAUSE FLOW</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-[#FF3D8B] fill-[#FF3D8B]" />
                  <span>PLAY FLOW</span>
                </>
              )}
            </button>
          </motion.div>
        </div>

        {/* 2-Column Interactive 3D Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-8 items-stretch">
          {/* Left: 4 Step Cards + Progress Bar */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-3">
            <div className="flex flex-col gap-3">
              {PIPELINE_STEPS.map((step, idx) => {
                const isActive = idx === activeStep;
                return (
                  <button
                    key={step.num}
                    type="button"
                    onClick={() => onSelectStep(idx)}
                    className={`group text-left w-full rounded-2xl p-5 transition-all duration-300 cursor-pointer border ${
                      isActive
                        ? 'bg-white border-[#FF3D8B] rf-shadow-pink -translate-y-0.5'
                        : 'bg-[#E3DFD6]/65 border-black/8 hover:bg-white/75 hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 mb-2">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums mt-1 transition-colors ${
                          isActive ? 'text-[#FF3D8B]' : 'text-[#111114]/40'
                        }`}
                      >
                        {step.num}
                      </span>
                      <h3
                        className={`font-display text-base sm:text-lg font-bold tracking-tight transition-colors ${
                          isActive ? 'text-[#111114]' : 'text-[#111114]/65 group-hover:text-[#111114]'
                        }`}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p
                      className={`text-xs sm:text-[13px] leading-relaxed transition-colors ${
                        isActive ? 'text-[#111114]/75' : 'text-[#111114]/45 group-hover:text-[#111114]/65'
                      }`}
                    >
                      {step.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Bottom Step Progress Bar */}
            <div className="pt-2">
              <div className="h-[3px] w-full rounded-full bg-black/10 overflow-hidden">
                <motion.div
                  className="h-full bg-[#FF3D8B] rounded-full"
                  initial={false}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
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
              <div className="relative h-full min-h-[540px] sm:min-h-[590px] rounded-[28px] rf-dot-grid-dark border border-white/10 p-5 sm:p-7 flex flex-col justify-between overflow-hidden shadow-[0_30px_70px_-20px_rgba(13,13,15,0.6)]">
                {/* Ambient glow */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 left-1/3 w-96 h-96 rounded-full opacity-20 blur-3xl"
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
                <div className="relative z-10 flex-1 flex items-center justify-center py-6">
                  <AnimatePresence mode="wait">
                    {/* STEP 01: CONNECT GOOGLE LINK */}
                    {activeStep === 0 && (
                      <motion.div
                        key="step-0"
                        initial={{ opacity: 0, rotateX: 12, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
                        exit={{ opacity: 0, rotateX: -10, y: -20, scale: 0.96 }}
                        transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full h-full flex flex-col justify-center items-start sm:px-4 gap-8"
                        style={{ perspective: 1200 }}
                      >
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1, duration: 0.45 }}
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
                            initial={{ opacity: 0, y: 30, rotateY: -16 }}
                            animate={{ opacity: 1, y: 0, rotateY: 0 }}
                            transition={{ delay: 0.16, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <BrandedQrCard label="ReviewFlow" tone="muted" />
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, x: 18 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.24, duration: 0.5 }}
                            className="max-w-xs space-y-3 text-left"
                          >
                            <span className="inline-block px-2.5 py-1 rounded-md bg-white/8 border border-white/10 font-mono text-[10px] uppercase tracking-widest text-[#FF3D8B]">
                              Storefront Linked
                            </span>
                            <p className="text-sm text-white/75 leading-relaxed">
                              Your Google Business Profile link binds instantly to a permanent,
                              re-printable QR token with your brand emblem at the center.
                            </p>
                          </motion.div>
                        </div>
                      </motion.div>
                    )}

                    {/* STEP 02: PRINT BRANDED QR */}
                    {activeStep === 1 && (
                      <motion.div
                        key="step-1"
                        initial={{ opacity: 0, rotateY: 14, scale: 0.95 }}
                        animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                        exit={{ opacity: 0, rotateY: -14, scale: 0.95 }}
                        transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-6 sm:gap-8 sm:px-4"
                        style={{ perspective: 1200 }}
                      >
                        <motion.div
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <BrandedQrCard label="ReviewFlow" tone="bright" />
                        </motion.div>

                        <div className="flex items-center gap-4">
                          {/* Tilted Phone Scanner Silhouette */}
                          <motion.div
                            initial={{ rotate: -14, scale: 0.9 }}
                            animate={{ rotate: -8, scale: 1 }}
                            transition={{ duration: 0.5 }}
                            className="w-12 h-20 rounded-xl bg-[#222228] border-2 border-white/25 flex flex-col items-center justify-between p-1.5 shadow-xl"
                          >
                            <div className="w-5 h-1 rounded-full bg-white/30" />
                            <Smartphone className="w-4 h-4 text-[#FF3D8B]" />
                            <div className="w-4 h-0.5 rounded-full bg-white/20" />
                          </motion.div>

                          {/* Guest Scanning Node */}
                          <motion.div
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.15, duration: 0.45 }}
                            className="flex flex-col items-center gap-2.5"
                          >
                            <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-tr from-[#FF3D8B] via-[#FACC15] to-[#2454FF] shadow-lg">
                              <div className="w-full h-full rounded-full bg-[#19191E] flex items-center justify-center font-display font-bold text-white text-lg border-2 border-[#0D0D0F]">
                                RF
                              </div>
                            </div>
                            <span className="px-3 py-1 rounded-md bg-[#FACC15] text-[#111114] font-mono text-[10px] font-bold tracking-wider uppercase rf-shadow-dark-sm">
                              GUEST · SCANNING
                            </span>
                          </motion.div>
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
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        className="relative w-full flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-6"
                      >
                        {/* Left: Mini QR Card with Verified Badge */}
                        <div className="hidden sm:flex flex-col items-center shrink-0 relative">
                          <BrandedQrCard
                            label="ReviewFlow"
                            tone="bright"
                            verified
                            className="scale-[0.82] origin-center"
                          />
                        </div>

                        {/* Connecting Line (QR -> Phone) */}
                        <div className="hidden lg:block w-10 h-0.5 bg-gradient-to-r from-[#FF3D8B] to-[#FF3D8B]/40 shrink-0 -mx-4" />

                        {/* Center: 3D Mobile Phone Frame (ReviewFlow — NO Lumina Studio!) */}
                        <motion.div
                          initial={{ rotateY: -6 }}
                          animate={{ rotateY: 0 }}
                          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                          className="w-full max-w-[272px] rounded-[34px] bg-[#ECE9E1] p-3.5 text-[#111114] border-[6px] border-[#1F1F25] shadow-[0_26px_60px_-15px_rgba(0,0,0,0.75)] shrink-0 relative"
                        >
                          {/* Dynamic Island Notch */}
                          <div className="w-20 h-3.5 rounded-full bg-[#111114] mx-auto mb-3" />

                          {/* Phone Header: ReviewFlow (NO Lumina Studio) */}
                          <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-black/8">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-[#111114] text-white flex items-center justify-center font-display font-bold text-[10px] shrink-0">
                                RF
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-[#111114] leading-tight truncate">
                                  ReviewFlow
                                </p>
                                <p className="text-[9px] text-[#111114]/55 truncate">
                                  Verified Storefront
                                </p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] text-[9px] font-bold shrink-0">
                              Verified QR
                            </span>
                          </div>

                          {/* Prompt */}
                          <p className="font-display text-xs font-bold text-[#111114] mb-2">
                            How was your visit today?
                          </p>

                          {/* Tap Chips */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            <span className="px-2.5 py-1 rounded-full bg-[#111114] text-white text-[10px] font-semibold">
                              Balayage
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-white text-[#111114]/70 border border-black/10 text-[10px] font-medium">
                              Haircut
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-[#111114] text-white text-[10px] font-semibold">
                              Warm vibe
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors duration-300 ${
                                activeStep === 3
                                  ? 'bg-[#111114] text-white'
                                  : 'bg-white text-[#111114]/70 border border-black/10'
                              }`}
                            >
                              Attentive care
                            </span>
                          </div>

                          {/* Draft Preview Box */}
                          <div className="rounded-xl bg-white p-2.5 border border-black/8 mb-3 min-h-[108px] flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between font-mono text-[8px] font-bold uppercase tracking-wider mb-1.5">
                                <span className="text-[#FF3D8B]">PERSONALIZED GOOGLE DRAFT</span>
                                <span className="text-[#111114]/40">EDITABLE</span>
                              </div>
                              {activeStep === 3 ? (
                                <p className="text-[10px] text-[#111114]/85 leading-relaxed">
                                  {fullDraft.slice(0, typedChars)}
                                  {typedChars < fullDraft.length && (
                                    <span className="inline-block w-1 h-3 bg-[#FF3D8B] ml-0.5 animate-pulse align-middle" />
                                  )}
                                </p>
                              ) : (
                                <p className="text-[10px] text-[#111114]/35 italic">
                                  Generating from your taps...
                                </p>
                              )}
                            </div>
                            <p className="font-mono text-[9px] text-[#111114]/45 mt-2 tabular-nums">
                              {activeStep === 3 ? `${Math.min(185, typedChars)} characters` : '0 characters'}
                            </p>
                          </div>

                          {/* Mobile Bottom CTA */}
                          <div
                            className={`w-full py-2.5 rounded-full text-center text-[11px] font-bold transition-colors duration-300 ${
                              activeStep === 3
                                ? 'bg-[#FF3D8B] text-[#111114] shadow-[0_6px_18px_rgba(255,61,139,0.45)]'
                                : 'bg-[#111114] text-white'
                            }`}
                          >
                            Copy &amp; Post on Google
                          </div>
                        </motion.div>

                        {/* Right: Floating Connected Telemetry Cards */}
                        <div className="flex flex-col gap-3 w-full md:w-[225px] shrink-0">
                          {/* Node 1: Guest Taps */}
                          <motion.div
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1, duration: 0.4 }}
                            className="rounded-xl bg-[#18181D] border border-white/10 p-3 shadow-lg"
                          >
                            <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/60 mb-2">
                              <ThumbsUp className="w-3 h-3 text-[#60A5FA]" />
                              <span>GUEST TAPS</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="px-2 py-0.5 rounded-full bg-[#FF3D8B] text-[#111114] text-[10px] font-bold">
                                Balayage
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[10px]">
                                Warm vibe
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[10px]">
                                Attentive care
                              </span>
                            </div>
                          </motion.div>

                          {/* Node 2: AI Tone (Step 4) */}
                          {activeStep === 3 && (
                            <motion.div
                              initial={{ opacity: 0, x: 18, y: 8 }}
                              animate={{ opacity: 1, x: 0, y: 0 }}
                              transition={{ delay: 0.22, duration: 0.42 }}
                              className="rounded-xl bg-[#18181D] border border-white/10 p-3 shadow-lg"
                            >
                              <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#FACC15] mb-1.5">
                                <Zap className="w-3 h-3" />
                                <span>AI TONE · SHORT</span>
                              </div>
                              <p className="text-[11px] text-white/70 leading-snug">
                                First-person draft built strictly from the guest&apos;s selections.
                                185 characters.
                              </p>
                            </motion.div>
                          )}

                          {/* Node 3: Posted on Google (Step 4) */}
                          {activeStep === 3 && (
                            <motion.div
                              initial={{ opacity: 0, x: 20, scale: 0.92 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ delay: 0.36, duration: 0.45 }}
                              className="rounded-xl bg-[#F5F3EE] text-[#111114] p-3 rf-shadow-pink border border-black/10"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-4 h-4 rounded-full bg-[#2454FF] text-white text-[9px] font-extrabold flex items-center justify-center">
                                    G
                                  </span>
                                  <span className="font-display text-xs font-bold">ReviewFlow</span>
                                </div>
                                <span className="font-mono text-[9px] text-[#111114]/50">
                                  just now
                                </span>
                              </div>
                              <div className="flex items-center gap-0.5 mb-1">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className="w-3 h-3 text-[#F59E0B] fill-[#F59E0B]"
                                  />
                                ))}
                              </div>
                              <p className="text-[10px] font-mono text-[#111114]/65">
                                Posted on Google · 18–24 s
                              </p>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Bottom Subtle Step Indicator Dots */}
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
                        onClick={() => onSelectStep(idx)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          idx === activeStep ? 'w-6 bg-[#FF3D8B]' : 'w-1.5 bg-white/25 hover:bg-white/50'
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
    </section>
  );
}
