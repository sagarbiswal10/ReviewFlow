import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  FileBarChart2,
  Languages,
  LayoutTemplate,
  MapPin,
  PauseCircle,
  PlayCircle,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { ReviewLanguage } from '../../types';
import { SpatialTilt } from '../ui/spatial-tilt';
import { ReviewFlowMark } from './ReviewFlowMark';

type ShowcaseMode = 'guest' | 'stands' | 'analytics';
type DraftTone = 'short' | 'detailed' | 'professional';
type TemplatePreviewId = 'midnight' | 'pulse' | 'editorial' | 'classic';

const SHOWCASE_PILLS = [
  'Balayage',
  'Haircut',
  'Keratin Treatment',
  'Studio Atmosphere',
  'Courteous Staff',
];

const LANGUAGE_TABS: { id: ReviewLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
  { id: 'mr', label: 'मराठी' },
  { id: 'hinglish', label: 'Hinglish' },
];

const TEMPLATE_SWATCHES: { id: TemplatePreviewId; label: string; accent: string }[] = [
  { id: 'midnight', label: 'Midnight Studio', accent: '#FF3D8B' },
  { id: 'pulse', label: 'Pulse Light', accent: '#2563EB' },
  { id: 'editorial', label: 'Warm Editorial', accent: '#F59E0B' },
  { id: 'classic', label: 'Classic Cards', accent: '#10B981' },
];

interface StandItem {
  id: string;
  code: string;
  name: string;
  placement: string;
  scans: number;
  redirects: number;
}

const INITIAL_STANDS: StandItem[] = [
  { id: 's1', code: 'RF-01', name: 'Stand 01 · Reception', placement: 'Reception Desk', scans: 412, redirects: 389 },
  { id: 's2', code: 'RF-02', name: 'Stand 02 · Billing', placement: 'Cash Counter', scans: 298, redirects: 274 },
  { id: 's3', code: 'RF-03', name: 'Stand 03 · Chairs', placement: 'Dining Table / Stations', scans: 184, redirects: 168 },
  { id: 's4', code: 'RF-04', name: 'Stand 04 · Exit', placement: 'Pickup Window', scans: 96, redirects: 85 },
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
  const [language, setLanguage] = useState<ReviewLanguage>('en');
  const [templatePreview, setTemplatePreview] = useState<TemplatePreviewId>('midnight');
  const [tone, setTone] = useState<DraftTone>('short');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [copiedToast, setCopiedToast] = useState(false);

  // 4 QR Stands interactive state
  const [stands, setStands] = useState<StandItem[]>(INITIAL_STANDS);
  const [lastScannedStandId, setLastScannedStandId] = useState<string | null>(null);

  // Analytics & PDF Weekly Report state
  const [qrTokenVer, setQrTokenVer] = useState(1);
  const [qrPaused, setQrPaused] = useState(false);
  const [tokenToast, setTokenToast] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

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

    if (language === 'hi') {
      if (tone === 'short') {
        return phraseIdx % 2 === 0
          ? `आज ReviewFlow में बहुत अच्छा अनुभव रहा! ${joined} काफी पसंद आया। ज़रूर दोबारा आऊँगा।`
          : `ReviewFlow पर आज की सेवा बेहतरीन थी, खासकर ${joined}। सभी को ज़रूर सुझाव दूँगा।`;
      }
      if (tone === 'detailed') {
        return `आज ReviewFlow विज़िट किया और ${joined} का अनुभव बेहद शानदार रहा। स्टाफ ने ध्यान से मेरी पसंद समझी और पूरा माहौल साफ-सुथरा और आरामदायक था।`;
      }
      return `ReviewFlow में बेहतरीन सेवा मिली। ${joined} का स्तर बहुत अच्छा था और पूरी टीम समय की पाबंद और सहयोगी रही।`;
    }

    if (language === 'mr') {
      if (tone === 'short') {
        return phraseIdx % 2 === 0
          ? `आज ReviewFlow मध्ये खूप छान अनुभव आला! ${joined} विशेष आवडले. नक्की पुन्हा येईन.`
          : `ReviewFlow मधील सेवा उत्तम होती, खास करून ${joined}. नक्कीच शिफारस करेन.`;
      }
      if (tone === 'detailed') {
        return `आज ReviewFlow ला भेट दिली आणि ${joined} चा अनुभव अतिशय समाधानकारक होता. टीमने प्रत्येक गोष्ट नीट समजावून सांगितली आणि वातावरण खूप प्रसन्न होते.`;
      }
      return `ReviewFlow मध्ये दर्जेदार सेवा मिळाली. ${joined} उत्तम होते आणि संपूर्ण अनुभव व्यावसायिक व वेळेत पूर्ण झाला.`;
    }

    if (language === 'hinglish') {
      if (tone === 'short') {
        return phraseIdx % 2 === 0
          ? `Aaj ReviewFlow mein visit bahut badhiya raha! ${joined} kaafi pasand aaya. Zaroor recommend karunga.`
          : `ReviewFlow ka experience kaafi smooth tha, specially ${joined}. Staff bhi kaafi helpful raha.`;
      }
      if (tone === 'detailed') {
        return `Aaj ReviewFlow visit kiya aur ${joined} ka experience sach mein kaafi accha laga. Team ne sab kuch dhyan se samjha aur poora setup clean aur comfortable tha.`;
      }
      return `ReviewFlow par service kaafi consistent aur timely rahi. ${joined} ki quality impressive thi aur overall visit smooth raha.`;
    }

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
  }, [selectedPills, tone, phraseIdx, language]);

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
    } catch {
      // Ignore clipboard permission errors
    }
    setCopiedToast(true);
    window.setTimeout(() => setCopiedToast(false), 2400);
  };

  const simulateStandScan = (standId: string) => {
    setStands((prev) =>
      prev.map((s) =>
        s.id === standId ? { ...s, scans: s.scans + 1, redirects: s.redirects + 1 } : s,
      ),
    );
    setLastScannedStandId(standId);
    window.setTimeout(() => setLastScannedStandId(null), 1000);
  };

  const totalStandScans = useMemo(
    () => stands.reduce((sum, s) => sum + s.scans, 0),
    [stands],
  );
  const topStand = useMemo(
    () => [...stands].sort((a, b) => b.scans - a.scans)[0],
    [stands],
  );

  const showTokenFeedback = (msg: string) => {
    setTokenToast(msg);
    window.setTimeout(() => setTokenToast(null), 2400);
  };

  const activeTemplateSwatch =
    TEMPLATE_SWATCHES.find((t) => t.id === templatePreview) ?? TEMPLATE_SWATCHES[0];

  const isLightGuestPreview = templatePreview === 'pulse' || templatePreview === 'editorial';

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
              Test multilingual review generation and form templates below, or switch tabs to
              explore 4-stand QR attribution and weekly PDF reports.
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
                      onClick={() => setMode('stands')}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                        mode === 'stands'
                          ? 'bg-white text-[#111114]'
                          : 'text-white/65 hover:text-white'
                      }`}
                    >
                      <QrCode className="w-3 h-3" />
                      <span>4 QR Stands</span>
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
                      <span>PDF &amp; Analytics</span>
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
                  {/* Left: Guest Taps + Template Switcher + Architecture Cards */}
                  <div
                    className={`lg:col-span-8 p-6 sm:p-8 lg:p-10 border-b lg:border-b-0 lg:border-r transition-colors duration-300 flex flex-col justify-between gap-7 ${
                      templatePreview === 'editorial'
                        ? 'bg-[#FAF7F2] text-[#111114] border-black/10'
                        : templatePreview === 'pulse'
                        ? 'bg-[#F8FAFC] text-[#111114] border-black/10'
                        : 'bg-[#141418] text-white border-white/8'
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <p
                          className={`font-mono text-[10px] font-semibold uppercase tracking-[0.22em] ${
                            isLightGuestPreview ? 'text-[#111114]/55' : 'text-white/45'
                          }`}
                        >
                          GUEST VIEW · {activeTemplateSwatch.label.toUpperCase()}
                        </p>

                        {/* Form Template Style Selector */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <LayoutTemplate
                            className={`w-3.5 h-3.5 ${
                              isLightGuestPreview ? 'text-[#111114]/50' : 'text-white/50'
                            }`}
                          />
                          {TEMPLATE_SWATCHES.map((tpl) => (
                            <button
                              key={tpl.id}
                              type="button"
                              onClick={() => setTemplatePreview(tpl.id)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer border ${
                                templatePreview === tpl.id
                                  ? 'bg-[#111114] text-white border-[#111114]'
                                  : isLightGuestPreview
                                  ? 'bg-white text-[#111114]/70 border-black/12 hover:border-black/30'
                                  : 'bg-[#1D1D23] text-white/65 border-white/10 hover:text-white'
                              }`}
                            >
                              {tpl.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <h3
                        className={`font-display text-2xl sm:text-3xl font-bold tracking-tight mb-6 ${
                          isLightGuestPreview ? 'text-[#111114]' : 'text-white'
                        }`}
                      >
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
                                  ? isLightGuestPreview
                                    ? 'bg-[#111114] text-white border-[#111114] shadow-md'
                                    : 'bg-white text-[#111114] border-white shadow-[0_6px_18px_rgba(255,255,255,0.16)]'
                                  : isLightGuestPreview
                                  ? 'bg-white text-[#111114]/75 border-black/15 hover:border-black/35'
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
                      <div
                        className={`rounded-xl p-4 border ${
                          isLightGuestPreview
                            ? 'bg-white border-black/10'
                            : 'bg-[#1A1A20] border-white/8'
                        }`}
                      >
                        <Sparkles className="w-4 h-4 text-[#FF3D8B] mb-3" />
                        <p
                          className={`text-xs font-semibold leading-snug ${
                            isLightGuestPreview ? 'text-[#111114]' : 'text-white/90'
                          }`}
                        >
                          4 Languages: EN · हिंदी · मराठी · Hinglish
                        </p>
                      </div>
                      <div
                        className={`rounded-xl p-4 border ${
                          isLightGuestPreview
                            ? 'bg-white border-black/10'
                            : 'bg-[#1A1A20] border-white/8'
                        }`}
                      >
                        <Shield className="w-4 h-4 text-[#FACC15] mb-3" />
                        <p
                          className={`text-xs font-semibold leading-snug ${
                            isLightGuestPreview ? 'text-[#111114]' : 'text-white/90'
                          }`}
                        >
                          100% Policy-Safe Architecture
                        </p>
                      </div>
                      <div
                        className={`rounded-xl p-4 border ${
                          isLightGuestPreview
                            ? 'bg-white border-black/10'
                            : 'bg-[#1A1A20] border-white/8'
                        }`}
                      >
                        <Smartphone className="w-4 h-4 text-[#3B82F6] mb-3" />
                        <p
                          className={`text-xs font-semibold leading-snug ${
                            isLightGuestPreview ? 'text-[#111114]' : 'text-white/90'
                          }`}
                        >
                          6 Switchable Form Templates
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Live Multilingual AI Draft Panel */}
                  <div className="lg:col-span-4 p-6 sm:p-8 flex flex-col justify-between gap-4 bg-[#121216]">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                          PERSONALIZED GOOGLE DRAFT
                        </span>
                        <span className="text-[11px] font-semibold text-[#FF3D8B]">Editable</span>
                      </div>

                      {/* Multilingual Language Selector */}
                      <div className="mb-3">
                        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-white/45 mb-1.5">
                          <Languages className="w-3 h-3 text-[#60A5FA]" />
                          <span>Review Language</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#1B1B21] border border-white/8">
                          {LANGUAGE_TABS.map((lang) => (
                            <button
                              key={lang.id}
                              type="button"
                              onClick={() => setLanguage(lang.id)}
                              className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                language === lang.id
                                  ? 'bg-[#2454FF] text-white shadow-xs'
                                  : 'text-white/60 hover:text-white'
                              }`}
                            >
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tone Switcher */}
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#1B1B21] border border-white/8 mb-3.5">
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
                      <div className="rounded-xl bg-[#1B1B21] border border-white/10 p-4 mb-3 min-h-[120px]">
                        <p className="review-text-multilingual text-xs sm:text-[13px] text-white/88 leading-relaxed">
                          &ldquo;{draftText}&rdquo;
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-white/45 font-mono tabular-nums mb-3">
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
              ) : mode === 'stands' ? (
                /* TAB 2: UP TO 4 TRACKABLE QR STANDS & ATTRIBUTION */
                <div className="p-6 sm:p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF3D8B]">
                        IN-STORE QR STANDS · 4 OF 4 ACTIVE
                      </span>
                      <h3 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                        Pinpoint where your most reviews come from.
                      </h3>
                      <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
                        Create up to 4 unique QR stands per storefront, paste them at counters,
                        tables, reception, or pickup windows, and see real-time scan &amp; review
                        attribution per placement.
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#1B1B21] border border-white/10 px-4 py-3 shrink-0">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-white/45">
                        TOP PERFORMING STAND
                      </p>
                      <p className="text-sm font-bold text-[#4ADE80] flex items-center gap-1.5 mt-0.5">
                        <Award className="w-4 h-4 text-[#FACC15]" />
                        <span>{topStand.placement}</span>
                        <span className="font-mono text-xs text-white/75">
                          ({Math.round((topStand.scans / totalStandScans) * 100)}%)
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stands.map((stand) => {
                      const sharePct = Math.round((stand.scans / totalStandScans) * 100);
                      const isTop = stand.id === topStand.id;
                      const justScanned = lastScannedStandId === stand.id;
                      return (
                        <div
                          key={stand.id}
                          className={`rounded-2xl p-5 border transition-all flex flex-col justify-between gap-4 ${
                            isTop
                              ? 'bg-[#1D1D24] border-[#FF3D8B]/60 shadow-[0_12px_30px_-10px_rgba(255,61,139,0.28)]'
                              : 'bg-[#19191F] border-white/10'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-white/80">
                                {stand.code}
                              </span>
                              {isTop && (
                                <span className="font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FF3D8B] text-[#111114]">
                                  #1 Source
                                </span>
                              )}
                            </div>

                            <h4 className="font-display text-base font-bold text-white">
                              {stand.name}
                            </h4>
                            <p className="text-xs text-white/55 flex items-center gap-1 mt-1">
                              <MapPin className="w-3 h-3 text-[#60A5FA]" />
                              <span>{stand.placement}</span>
                            </p>
                          </div>

                          <div className="space-y-2.5">
                            <div className="flex items-baseline justify-between font-mono tabular-nums">
                              <span
                                className={`text-2xl font-bold transition-colors ${
                                  justScanned ? 'text-[#FF3D8B]' : 'text-white'
                                }`}
                              >
                                {stand.scans}
                              </span>
                              <span className="text-[11px] text-[#4ADE80]">
                                {sharePct}% of scans
                              </span>
                            </div>

                            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isTop ? 'bg-[#FF3D8B]' : 'bg-[#2454FF]'
                                }`}
                                style={{ width: `${sharePct}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-white/50 font-mono">
                              <span>{stand.redirects} Google posts</span>
                              <button
                                type="button"
                                onClick={() => simulateStandScan(stand.id)}
                                className="text-white hover:text-[#FF3D8B] font-semibold cursor-pointer transition-colors"
                              >
                                {justScanned ? '+1 Logged!' : '+ Test Scan'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* TAB 3: WEEKLY PDF UPDATES, MULTI-LOCATION ANALYTICS & TOKEN CONTROLS */
                <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-7 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FF3D8B] font-bold">
                          WEEKLY PDF UPDATES &amp; ANALYTICS
                        </span>
                        <h3 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                          Real-Time Scan &amp; Post Velocity
                        </h3>
                      </div>
                      <span className="font-mono text-xs text-white/60">
                        Mon–Sun Cycle · <strong className="text-[#4ADE80]">PDF Auto-Ready</strong>
                      </span>
                    </div>

                    {/* Velocity Area Chart */}
                    <div className="rounded-2xl bg-[#1B1B21] border border-white/8 p-4">
                      <svg
                        className="w-full h-32 overflow-visible"
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

                    {/* Storefront Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="font-mono text-[10px] uppercase tracking-wider text-white/45 border-b border-white/10">
                            <th className="pb-2.5">Location</th>
                            <th className="pb-2.5">Top QR Stand</th>
                            <th className="pb-2.5">Scans</th>
                            <th className="pb-2.5 text-right">Conversion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8 text-white/85">
                          {[
                            { name: 'ReviewFlow – Flagship', stand: 'Reception Desk', scans: '1,480', rate: '94.1%' },
                            { name: 'ReviewFlow – Midtown', stand: 'Cash Counter', scans: '920', rate: '95.0%' },
                            { name: 'ReviewFlow – Westside', stand: 'Dining Table', scans: '1,110', rate: '92.7%' },
                          ].map((row) => (
                            <tr key={row.name} className="hover:bg-white/[0.03] transition-colors">
                              <td className="py-2.5 font-semibold text-white">{row.name}</td>
                              <td className="py-2.5 text-white/70">{row.stand}</td>
                              <td className="py-2.5 font-mono tabular-nums">{row.scans}</td>
                              <td className="py-2.5 text-right font-mono font-bold text-[#4ADE80] tabular-nums">
                                {row.rate}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Weekly A4 PDF Report Card + Token Controls */}
                  <div className="lg:col-span-5 flex flex-col gap-4 justify-between">
                    {/* Weekly PDF Update Preview Card */}
                    <div className="rounded-2xl bg-[#F5F3EE] text-[#111114] p-5 border border-black/15 rf-shadow-pink space-y-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-[#111114] text-white flex items-center justify-center">
                            <FileBarChart2 className="w-4 h-4 text-[#FF3D8B]" />
                          </div>
                          <div>
                            <p className="font-display text-xs font-bold leading-tight">
                              Weekly Performance Report
                            </p>
                            <p className="font-mono text-[9px] text-[#111114]/55">
                              Proper A4 PDF Format · Mon–Sun
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[#111114] text-white font-mono text-[9px] font-bold">
                          PDF
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-white p-2.5 border border-black/8">
                          <span className="font-mono text-[9px] text-[#111114]/50 block">
                            BEST STAND
                          </span>
                          <span className="font-bold text-[#111114]">Reception (412)</span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 border border-black/8">
                          <span className="font-mono text-[9px] text-[#111114]/50 block">
                            GOOGLE REDIRECTS
                          </span>
                          <span className="font-bold text-[#16A34A]">916 verified</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPdfNotice('Sample A4 PDF report ready in your Business Portal.');
                          window.setTimeout(() => setPdfNotice(null), 2600);
                        }}
                        className="w-full py-2 px-3 rounded-lg bg-[#111114] hover:bg-[#232329] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-[#FF3D8B]" />
                        <span>Download Weekly A4 PDF</span>
                      </button>

                      {pdfNotice && (
                        <p className="font-mono text-[10px] text-[#16A34A] font-semibold">
                          {pdfNotice}
                        </p>
                      )}
                    </div>

                    {/* Instant Token Controls */}
                    <div className="rounded-2xl bg-[#1B1B21] border border-white/10 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display text-sm font-bold text-white">
                          Instant Token Controls
                        </h4>
                        <Shield className="w-4 h-4 text-[#FF3D8B]" />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const next = qrTokenVer + 1;
                          setQrTokenVer(next);
                          showTokenFeedback(`Token rotated to revision v${next}.`);
                        }}
                        className="w-full py-2 px-3 rounded-lg bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-semibold text-white flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span>Cycle QR Revision Token (v{qrTokenVer})</span>
                        <RefreshCw className="w-3.5 h-3.5 text-[#FF3D8B]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !qrPaused;
                          setQrPaused(next);
                          showTokenFeedback(next ? 'In-store QR paused.' : 'In-store QR active.');
                        }}
                        className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
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

                      {tokenToast && (
                        <p className="font-mono text-[10px] text-[#4ADE80]">{tokenToast}</p>
                      )}
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
