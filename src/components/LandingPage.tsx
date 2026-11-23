import { useEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';
import {
  AnimatePresence,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  ArrowRight,
  Check,
  Copy,
  Gift,
  ListChecks,
  Loader2,
  Mail,
  Menu,
  Pencil,
  Play,
  QrCode,
  Shield,
  ShieldCheck,
  Star,
  Wand2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BUSINESS_CATEGORIES, type BusinessCategory } from '../types';
import type { AuthActionableError } from '../utils/urlAndAuth';
import { SpatialTilt } from './ui/spatial-tilt';
import { BrandedQrCard, ReviewFlowMark } from './landing/ReviewFlowMark';
import { InteractivePipelineSection } from './landing/InteractivePipelineSection';
import { InteractiveShowcaseSection } from './landing/InteractiveShowcaseSection';

interface LandingPageProps {
  user?: User | null;
  hasClientAccess?: boolean;
  isAdmin?: boolean;
  onGoogleSignIn: () => Promise<void> | void;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onTryDemo: () => void;
  onOpenPortal?: () => void;
  onOpenAdmin?: () => void;
  onSignOut?: () => void;
  initialAuthModalOpen?: boolean;
  isSigningIn: boolean;
  authError: string | null;
  authActionError?: AuthActionableError | null;
}

type AuthTab = 'signin' | 'signup' | 'reset';
type FeatureTone = 'short' | 'detailed' | 'pro';

interface CategoryShowcaseMeta {
  badge: string;
  title: string;
  desc: string;
  tags: string[];
}

const CATEGORY_SHOWCASE_DATA: Record<BusinessCategory, CategoryShowcaseMeta> = {
  'Hair Salons': {
    badge: 'SELECTED: HAIR SALONS & COLOR STUDIOS',
    title: 'Pre-Loaded with Stylist Tiers, Balayage, Cut, & Wash Prompts',
    desc: 'Eliminates setup time with out-of-the-box prompts for haircuts, hair styling, colour precision, keratin care, and studio atmosphere.',
    tags: ['HAIRCUT & STYLING', 'HAIR COLOUR', 'KERATIN TREATMENT', 'STUDIO ATMOSPHERE'],
  },
  Restaurants: {
    badge: 'SELECTED: FINE DINING & CASUAL RESTAURANTS',
    title: 'Pre-Loaded with Food Quality, Ambiance, & Table Service Prompts',
    desc: 'Captures dine-in or takeaway favorites, standout dishes, server shout-outs, and atmosphere in natural first-person drafts.',
    tags: ['SIGNATURE MAINS', 'CRAFT DRINKS', 'ATTENTIVE SERVICE', 'WARM AMBIANCE'],
  },
  'Beauty Salons': {
    badge: 'SELECTED: BEAUTY & SKINCARE STUDIOS',
    title: 'Pre-Loaded with Facial, Nail, Brow & Lash Care Prompts',
    desc: 'Highlights sanitization standards, gentle technique, welcoming care, and appointment punctuality automatically.',
    tags: ['FACIAL & SKINCARE', 'MANICURE & PEDICURE', 'BROWS & LASHES', 'SPOTLESS STUDIO'],
  },
  Hotels: {
    badge: 'SELECTED: BOUTIQUE & RESORT HOTELS',
    title: 'Pre-Loaded with Check-In, Comfort, & Hospitality Prompts',
    desc: 'Guests tap through smooth check-in, spotless rooms, morning breakfast, and concierge support in seconds.',
    tags: ['SEAMLESS CHECK-IN', 'CLEAN ROOMS', 'BREAKFAST & DINING', 'WARM HOSPITALITY'],
  },
  Spas: {
    badge: 'SELECTED: DAY SPAS & WELLNESS STUDIOS',
    title: 'Pre-Loaded with Massage, Aromatherapy, & Relaxation Prompts',
    desc: 'Designed for serene wellness visits, turning quiet relaxation highlights into descriptive local reviews.',
    tags: ['DEEP TISSUE MASSAGE', 'AROMATHERAPY', 'HYDROTHERAPY', 'CALMING LOUNGE'],
  },
  Gyms: {
    badge: 'SELECTED: GYMS & BOUTIQUE FITNESS',
    title: 'Pre-Loaded with Coaching, Equipment, & Facility Prompts',
    desc: 'Members tap strength zones, group classes, coach energy, and locker cleanliness to strengthen local search rankings.',
    tags: ['STRENGTH EQUIPMENT', 'GROUP CLASSES', 'MOTIVATING COACHES', 'CLEAN FACILITIES'],
  },
  Healthcare: {
    badge: 'SELECTED: HEALTHCARE & DENTAL CLINICS',
    title: 'Pre-Loaded with Bedside Care, Clarity, & Clinic Prompts',
    desc: 'Thoughtful, compliant prompts tailored for clinics, dental practices, diagnostics, and patient follow-ups.',
    tags: ['CLEAR EXPLANATIONS', 'SHORT WAIT TIME', 'CARING TEAM', 'CLEAN CLINIC'],
  },
  'Retail Stores': {
    badge: 'SELECTED: SPECIALTY RETAIL STORES',
    title: 'Pre-Loaded with Merchandising, Staff Help, & Checkout Prompts',
    desc: 'Highlights curated product selection, attentive associates, and smooth in-store pickup or checkout.',
    tags: ['CURATED PRODUCTS', 'HELPFUL STAFF', 'EASY CHECKOUT', 'ORGANIZED STORE'],
  },
  'Automobile Services': {
    badge: 'SELECTED: AUTOMOTIVE & DETAILING',
    title: 'Pre-Loaded with Honest Pricing, Turnaround, & Repair Prompts',
    desc: 'Turns routine maintenance, diagnostics, and detailing visits into high-trust reviews that reassure local drivers.',
    tags: ['TRANSPARENT PRICING', 'READY ON TIME', 'SKILLED TECHNICIANS', 'DETAILING & CARE'],
  },
  'Other Businesses': {
    badge: 'SELECTED: GENERAL & LOCAL SERVICE STUDIOS',
    title: 'Pre-Loaded with Universal Customer Experience Prompts',
    desc: 'Flexible starter questions ready for creative studios, pet care, home services, and local storefronts.',
    tags: ['FRIENDLY TEAM', 'HIGH QUALITY SERVICE', 'PROMPT & RELIABLE', 'GREAT VALUE'],
  },
};

const ONBOARDING_CATEGORY_ORDER: BusinessCategory[] = [
  'Hair Salons',
  'Restaurants',
  'Healthcare',
  'Spas',
  'Gyms',
  'Automobile Services',
  'Beauty Salons',
  'Hotels',
  'Retail Stores',
  'Other Businesses',
];

const NAV_LINKS = [
  { label: 'Pipeline', href: '#pipeline' },
  { label: 'Showcase', href: '#showcase' },
  { label: 'Features', href: '#features' },
  { label: 'Onboarding', href: '#onboarding' },
  { label: 'Policy', href: '#policy' },
];

const MARQUEE_ITEMS = [
  'NO STAR GATING',
  'NO INCENTIVES FOR RATINGS',
  'FULL CUSTOMER EDITORIAL CONTROL',
  'ZERO APP INSTALLS',
];

function AnimatedKpiNumber({
  target,
  decimals = 0,
  suffix = '',
}: {
  target: number;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    const start = performance.now();
    const duration = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(target * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target]);

  return (
    <span ref={ref} className="tabular-nums">
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display)}
      {suffix}
    </span>
  );
}

export function LandingPage({
  user = null,
  hasClientAccess = false,
  isAdmin = false,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onResetPassword,
  onTryDemo,
  onOpenPortal,
  onOpenAdmin,
  onSignOut,
  initialAuthModalOpen = false,
  isSigningIn,
  authError,
  authActionError = null,
}: LandingPageProps) {
  // Smooth scroll Lenis instance
  const lenisRef = useRef<Lenis | null>(null);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(() => Boolean(initialAuthModalOpen && !user));
  const [authTab, setAuthTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [sendingPasswordSetup, setSendingPasswordSetup] = useState(false);
  const [dismissedAuthErrorSig, setDismissedAuthErrorSig] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Scroll-reactive UI state
  const [pinkHeaderCta, setPinkHeaderCta] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  // 3D Hero mouse parallax state
  const [heroTilt, setHeroTilt] = useState({ rx: 0, ry: 0 });

  // Interactive Pipeline state
  const [pipelineStep, setPipelineStep] = useState(0);
  const [pipelineAutoPlay, setPipelineAutoPlay] = useState(false);

  // Interactive Features card state
  const [simulatedScans, setSimulatedScans] = useState(148);
  const [scanPulse, setScanPulse] = useState(false);
  const [activeBuilderChips, setActiveBuilderChips] = useState<string[]>(['FAST TURNAROUND']);
  const [featureTone, setFeatureTone] = useState<FeatureTone>('short');

  // Interactive Onboarding Category state
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategory>('Hair Salons');

  // Scroll progress bar & Hero 3D Parallax
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 24, restDelta: 0.001 });
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const badgeLeftY = useTransform(heroScroll, [0, 1], [0, -70]);
  const badgeRightTopY = useTransform(heroScroll, [0, 1], [0, -95]);
  const badgeRightBotY = useTransform(heroScroll, [0, 1], [0, -45]);
  const heroTitleY = useTransform(heroScroll, [0, 1], [0, 32]);

  useEffect(() => {
    if (user) {
      setAuthModalOpen(false);
    } else if (initialAuthModalOpen) {
      setAuthModalOpen(true);
    }
  }, [user, initialAuthModalOpen]);

  // Initialize Lenis silky smooth scroll
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
    });
    lenisRef.current = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Pause Lenis scroll when auth modal is open
  useEffect(() => {
    if (!lenisRef.current) return;
    if (authModalOpen) {
      lenisRef.current.stop();
    } else {
      lenisRef.current.start();
    }
  }, [authModalOpen]);

  // Switch top-right CTA pill color between black and pink based on scroll position (matches screenshots)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setPinkHeaderCta(y > 2100 && y < 6200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-advance pipeline steps when enabled
  useEffect(() => {
    if (!pipelineAutoPlay) return;
    const timer = window.setInterval(() => {
      setPipelineStep((prev) => (prev + 1) % 4);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [pipelineAutoPlay]);

  const scrollToSection = (selector: string) => {
    setMobileMenuOpen(false);
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { offset: -64, duration: 1.25 });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleWatchFlow = () => {
    setPipelineStep(0);
    setPipelineAutoPlay(true);
    scrollToSection('#pipeline');
  };

  const handleHeroPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setHeroTilt({ rx: -ny * 7, ry: nx * 9 });
  };

  const handleHeroPointerLeave = () => {
    setHeroTilt({ rx: 0, ry: 0 });
  };

  const openAuthModal = (initialTab: AuthTab = 'signin') => {
    setAuthTab(initialTab);
    setLocalError(null);
    setInfoMessage(null);
    setDismissedAuthErrorSig(authActionError?.message || authError || null);
    setAuthModalOpen(true);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoMessage(null);
    setDismissedAuthErrorSig(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (authTab === 'reset') {
      try {
        await onResetPassword(cleanEmail);
        setInfoMessage(
          `Password setup & reset link sent to ${cleanEmail}. Check your inbox and spam folder — once you set a password via that link, you can sign in with email & password too.`,
        );
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Unable to send password reset email.');
      }
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    try {
      if (authTab === 'signup') {
        await onEmailSignUp(cleanEmail, password);
      } else {
        await onEmailSignIn(cleanEmail, password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  const handleQuickPasswordSetupLink = async () => {
    const targetEmail = (authActionError?.email || email).trim().toLowerCase();
    if (!targetEmail) {
      setAuthTab('reset');
      setLocalError(null);
      return;
    }
    setSendingPasswordSetup(true);
    setLocalError(null);
    setInfoMessage(null);
    try {
      await onResetPassword(targetEmail);
      setDismissedAuthErrorSig(authActionError?.message || authError || null);
      setInfoMessage(
        `Password setup link sent to ${targetEmail}. Open the link in your inbox to set a password on your existing Google-linked account, then sign in with Email & Password anytime.`,
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to send password setup link.');
    } finally {
      setSendingPasswordSetup(false);
    }
  };

  const triggerSimulatedScan = () => {
    setSimulatedScans((n) => n + 1);
    setScanPulse(true);
    window.setTimeout(() => setScanPulse(false), 900);
  };

  const toggleBuilderChip = (chip: string) => {
    setActiveBuilderChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip],
    );
  };

  const activeCategoryMeta = CATEGORY_SHOWCASE_DATA[selectedCategory];
  const parentErrorText = authActionError?.message || authError;
  const visibleParentError =
    parentErrorText && parentErrorText !== dismissedAuthErrorSig ? parentErrorText : null;
  const combinedError = localError || visibleParentError;

  const handlePrimaryAction = () => {
    if (user && isAdmin && onOpenAdmin) {
      onOpenAdmin();
      return;
    }
    if (user && hasClientAccess && onOpenPortal) {
      onOpenPortal();
      return;
    }
    openAuthModal('signup');
  };

  const primaryCtaText =
    user && isAdmin && onOpenAdmin
      ? 'Business Management'
      : user && hasClientAccess && onOpenPortal
      ? 'Client Portal'
      : 'Get started';

  return (
    <div className="min-h-screen bg-[#F3F1EC] text-[#111114] antialiased selection:bg-[#FF3D8B] selection:text-white relative">
      {/* Top Scroll Progress Line */}
      <motion.div
        style={{ scaleX }}
        aria-hidden="true"
        className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#FF3D8B] via-[#2454FF] to-[#FACC15] origin-left z-50 pointer-events-none"
      />

      {/* ==========================================
          STICKY FROSTED EDITORIAL NAVBAR
         ========================================== */}
      <header className="sticky top-0 z-40 w-full bg-[#F3F1EC]/80 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('#top');
            }}
            className="flex items-center gap-2.5 shrink-0"
          >
            <ReviewFlowMark size="md" />
            <span className="font-display text-lg font-bold tracking-tight text-[#111114]">
              ReviewFlow
            </span>
          </a>

          {/* Center Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#111114]/75">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(link.href);
                }}
                className="hover:text-[#111114] transition-colors whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden lg:inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#111114]/65 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span>ZERO APP INSTALLS</span>
            </span>

            {user && onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-full border border-black/15 bg-white/70 hover:bg-white text-xs font-semibold text-[#111114] transition-colors cursor-pointer"
              >
                Sign out
              </button>
            )}

            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isSigningIn}
              className={`inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                pinkHeaderCta
                  ? 'bg-[#FF3D8B] text-[#111114] hover:bg-[#ff267d] shadow-[0_8px_20px_-6px_rgba(255,61,139,0.55)]'
                  : 'bg-[#111114] text-white hover:bg-[#232329]'
              }`}
            >
              <span>{primaryCtaText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg border border-black/10 bg-white/60 text-[#111114] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-black/10 bg-[#F3F1EC] px-4 py-4 space-y-2 overflow-hidden"
            >
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(link.href);
                  }}
                  className="block py-2 text-sm font-semibold text-[#111114]/80 hover:text-[#111114]"
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onTryDemo();
                }}
                className="w-full py-2.5 rounded-xl bg-white border border-black/15 text-xs font-bold text-[#111114] cursor-pointer"
              >
                Open Live Customer Demo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main id="top" className="w-full overflow-x-clip">
        {/* ==========================================
            HERO STAGE: 3D FLOATING EDITORIAL CONSTELLATION
           ========================================== */}
        <section
          ref={heroRef}
          onPointerMove={handleHeroPointerMove}
          onPointerLeave={handleHeroPointerLeave}
          className="relative w-full rf-dot-grid-light pt-12 sm:pt-16 lg:pt-20 pb-14 lg:pb-16 overflow-hidden"
          style={{ perspective: 1400 }}
        >
          {/* Corner Registration Marks (matches Screenshot 1) */}
          <div
            aria-hidden="true"
            className="hidden sm:flex items-center justify-center w-5 h-5 rounded-full border border-black/20 text-black/30 text-[10px] font-mono absolute top-14 left-8 select-none"
          >
            +
          </div>
          <div
            aria-hidden="true"
            className="hidden sm:flex items-center justify-center w-5 h-5 rounded-full border border-black/20 text-black/30 text-[10px] font-mono absolute top-14 right-8 select-none"
          >
            +
          </div>

          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative">
            {authError && !authModalOpen && (
              <div
                role="alert"
                className="max-w-xl mx-auto mb-8 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 text-center"
              >
                {authError}
              </div>
            )}

            {/* 3D Interactive Parallax Constellation */}
            <div
              className="relative flex flex-col items-center text-center transition-transform duration-300 ease-out"
              style={{
                transformStyle: 'preserve-3d',
                transform: `rotateX(${heroTilt.rx.toFixed(2)}deg) rotateY(${heroTilt.ry.toFixed(2)}deg)`,
              }}
            >
              {/* Floating 3D Pill Left: VISIT-TO-POST 18-24 SEC */}
              <motion.div
                style={{ y: badgeLeftY }}
                initial={{ opacity: 0, x: -30, rotate: -4 }}
                animate={{ opacity: 1, x: 0, rotate: -1.5 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="hidden md:block absolute left-2 lg:left-4 top-[54%] z-20"
              >
                <div className="rf-float-badge-a px-3.5 py-2 rounded-xl bg-[#FF3D8B] text-[#111114] border border-[#111114] rf-shadow-dark text-left">
                  <p className="font-mono text-[10px] font-bold tracking-wider uppercase leading-tight">
                    VISIT-TO-POST
                  </p>
                  <p className="font-mono text-[10px] font-semibold tracking-wider uppercase leading-tight">
                    18-24 SEC
                  </p>
                </div>
              </motion.div>

              {/* Floating 3D Pill Right Upper: SCAN · TAP / EDIT · POST */}
              <motion.div
                style={{ y: badgeRightTopY }}
                initial={{ opacity: 0, x: 30, rotate: 4 }}
                animate={{ opacity: 1, x: 0, rotate: 1.5 }}
                transition={{ duration: 0.7, delay: 0.28 }}
                className="hidden md:block absolute right-2 lg:right-6 top-[32%] z-20"
              >
                <div className="rf-float-badge-b px-3.5 py-2 rounded-xl bg-[#2454FF] text-white border border-[#111114] rf-shadow-dark text-left">
                  <p className="font-mono text-[10px] font-bold tracking-wider uppercase leading-tight">
                    SCAN · TAP
                  </p>
                  <p className="font-mono text-[10px] font-semibold tracking-wider uppercase leading-tight">
                    EDIT · POST
                  </p>
                </div>
              </motion.div>

              {/* Floating 3D Pill Right Lower: NO REVIEW GATING */}
              <motion.div
                style={{ y: badgeRightBotY }}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.36 }}
                className="hidden md:block absolute right-6 lg:right-14 bottom-[14%] z-20"
              >
                <div className="rf-float-badge-a inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FACC15] text-[#111114] border border-[#111114] rf-shadow-dark font-mono text-[10px] font-bold tracking-wider uppercase">
                  <Shield className="w-3.5 h-3.5 fill-[#111114] text-[#FACC15]" />
                  <span>NO REVIEW GATING</span>
                </div>
              </motion.div>

              {/* Eyebrow Pill */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/85 border border-black/10 shadow-xs mb-8"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3D8B]" />
                <span className="font-mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111114]/75">
                  MULTI-BUSINESS GOOGLE REVIEW PLATFORM
                </span>
              </motion.div>

              {/* Massive 3D Headline */}
              <motion.div style={{ y: heroTitleY }}>
                <motion.h1
                  initial={{ opacity: 0, y: 26, rotateX: 14 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display font-bold tracking-[-0.04em] text-[#111114] leading-[0.95] text-[3.3rem] sm:text-[5rem] lg:text-[6.25rem]"
                >
                  <span className="block">Reviews in</span>
                  <span className="block font-editorial rf-3d-chromatic text-[1.12em] tracking-[-0.02em] mt-1">
                    20 seconds.
                  </span>
                </motion.h1>
              </motion.div>

              {/* Subheadline */}
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.14 }}
                className="mt-7 max-w-xl text-sm sm:text-base text-[#111114]/70 leading-relaxed"
              >
                Customers often skip leaving reviews because staring at a blank text box feels like
                work. With ReviewFlow, they scan your tactile QR stand, tap a few tailored
                responses, and receive an authentic draft ready to post directly on Google in under
                20 seconds.
              </motion.p>

              {/* Hero CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.22 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-3.5"
              >
                <button
                  type="button"
                  onClick={() => scrollToSection('#showcase')}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#111114] hover:bg-[#232329] text-white text-sm font-semibold shadow-[0_14px_30px_-10px_rgba(17,17,20,0.45)] transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  <span>Try Live Customer Form</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleWatchFlow}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-white hover:bg-white/95 border border-black/12 text-[#111114] text-sm font-semibold shadow-xs transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-full bg-[#111114] text-white flex items-center justify-center">
                    <Play className="w-2.5 h-2.5 fill-white ml-0.5" />
                  </span>
                  <span>Watch the flow</span>
                </button>
              </motion.div>

              {user && !isAdmin && (
                <p className="mt-4 text-xs text-[#111114]/65">
                  Signed in as <span className="font-mono text-[#111114]">{user.email}</span>
                  {hasClientAccess
                    ? ' · Client Portal access is active.'
                    : ' · No Client Portal business assigned yet.'}
                </p>
              )}

              {/* Bottom Micro Trust Line */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.34 }}
                className="mt-9 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[#111114]/45 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
              >
                <span>100% POLICY-COMPLIANT (NO GATING)</span>
                <span aria-hidden="true">•</span>
                <span>PRINTABLE PDF &amp; PNG KIT</span>
                <span aria-hidden="true">•</span>
                <span>INSTANT AI TONE GENERATOR</span>
              </motion.p>
            </div>
          </div>
        </section>

        {/* ==========================================
            DARK KPI STRIP + HOT PINK MARQUEE RIBBON
           ========================================== */}
        <section className="relative w-full">
          {/* Dark 4-Stat Band */}
          <div className="bg-gradient-to-b from-[#F3F1EC] via-[#F3F1EC] via-45% to-[#0D0D0F] to-45% px-4 sm:px-6 lg:px-8 pb-7">
            <motion.div
              initial={{ opacity: 0, y: 26, rotateX: 12 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-[1160px] mx-auto rounded-2xl bg-[#111114] border border-white/10 shadow-[0_24px_50px_-15px_rgba(13,13,15,0.45)] overflow-hidden"
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
                <div className="p-6 sm:p-7">
                  <p className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                    <AnimatedKpiNumber target={2.4} decimals={1} suffix="k" />
                    <span className="text-[#FF3D8B]">+</span>
                  </p>
                  <p className="mt-1.5 text-xs text-white/55">Tabletop Displays Deployed</p>
                </div>

                <div className="p-6 sm:p-7">
                  <p className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                    <AnimatedKpiNumber target={20} />{' '}
                    <span className="text-[#FF3D8B] text-2xl sm:text-3xl font-semibold">s</span>
                  </p>
                  <p className="mt-1.5 text-xs text-white/55">Average Visit-to-Post Time</p>
                </div>

                <div className="p-6 sm:p-7">
                  <p className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                    <AnimatedKpiNumber target={100} />
                    <span className="text-[#FF3D8B]">%</span>
                  </p>
                  <p className="mt-1.5 text-xs text-white/55">Google Policy Compliant</p>
                </div>

                <div className="p-6 sm:p-7">
                  <p className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight inline-flex items-center gap-1.5">
                    <AnimatedKpiNumber target={4.9} decimals={1} />
                    <Star className="w-6 h-6 text-[#FF3D8B] fill-[#FF3D8B]" />
                  </p>
                  <p className="mt-1.5 text-xs text-white/55">Aggregate Storefront Rating</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Hot Pink Infinite Marquee */}
          <div className="w-full bg-[#FF3D8B] text-[#111114] border-y border-black/15 py-3 overflow-hidden select-none">
            <div className="rf-marquee-track font-display text-sm sm:text-base font-bold uppercase tracking-wide">
              {[0, 1, 2, 3].map((copyIdx) => (
                <div key={copyIdx} className="flex items-center gap-8 pr-8 shrink-0">
                  {MARQUEE_ITEMS.map((item) => (
                    <span key={`${copyIdx}-${item}`} className="inline-flex items-center gap-8">
                      <span className="text-[#111114] text-base leading-none">✸</span>
                      <span>{item}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 01: THE FRICTIONLESS PIPELINE
           ========================================== */}
        <InteractivePipelineSection
          activeStep={pipelineStep}
          onSelectStep={(step) => {
            setPipelineAutoPlay(false);
            setPipelineStep(step);
          }}
          autoPlay={pipelineAutoPlay}
          onToggleAutoPlay={() => setPipelineAutoPlay((v) => !v)}
        />

        {/* ==========================================
            SECTION 02: INTERACTIVE 20-SECOND SHOWCASE
           ========================================== */}
        <InteractiveShowcaseSection onTryDemo={onTryDemo} />

        {/* ==========================================
            SECTION 03: ENGINEERED PRECISION (DARK 3D CARDS)
           ========================================== */}
        <section
          id="features"
          className="relative w-full rf-dot-grid-dark py-20 lg:py-28 border-t border-white/8"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-2xl mb-14"
            >
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45 mb-3">
                03 — ENGINEERED PRECISION
              </p>
              <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.04] mb-5">
                Built for multi-location operators and{' '}
                <span className="font-editorial text-[#FF3D8B] text-[1.08em] font-normal">
                  independent studios.
                </span>
              </h2>
              <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-xl">
                Manage every storefront from one workspace with per-location analytics, custom
                question builders, and full brand controls.
              </p>
            </motion.div>

            {/* 3 Interactive 3D Dark Bento Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: QR Studio & Token Control */}
              <SpatialTilt maxTilt={4} scale={1.012} glare={false} className="rounded-2xl">
                <div className="h-full rounded-2xl bg-[#141418] border border-white/10 p-7 flex flex-col justify-between gap-8 hover:border-[#FF3D8B]/45 transition-colors">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-[#FF3D8B]/15 text-[#FF3D8B] flex items-center justify-center mb-5">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-white mb-2.5">
                      QR Studio &amp; Token Control
                    </h3>
                    <p className="text-xs sm:text-sm text-white/55 leading-relaxed">
                      Track real-time QR scans, rotate revision tokens on damaged stands, pause
                      links instantly, and export print-ready tabletop PDF posters.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={triggerSimulatedScan}
                    className="w-full text-left rounded-xl bg-[#1D1D23] hover:bg-[#24242C] border border-white/8 px-4 py-3.5 flex items-center gap-4 transition-colors cursor-pointer group"
                  >
                    <span
                      className={`font-display text-2xl font-bold tabular-nums transition-colors ${
                        scanPulse ? 'text-[#FF3D8B]' : 'text-white'
                      }`}
                    >
                      {simulatedScans}
                    </span>
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/50 leading-relaxed flex-1">
                      <p>LIVE QR COUNTER</p>
                      <p className="group-hover:text-white/80 transition-colors">
                        {scanPulse ? 'SCAN LOGGED!' : 'VERIFIED SCANS · TAP TO TEST'}
                      </p>
                    </div>
                  </button>
                </div>
              </SpatialTilt>

              {/* Card 2: Dynamic Question Builder */}
              <SpatialTilt maxTilt={4} scale={1.012} glare={false} className="rounded-2xl">
                <div className="h-full rounded-2xl bg-[#141418] border border-white/10 p-7 flex flex-col justify-between gap-8 hover:border-[#2454FF]/55 transition-colors">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-[#2454FF]/15 text-[#60A5FA] flex items-center justify-center mb-5">
                      <ListChecks className="w-4 h-4" />
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-white mb-2.5">
                      Dynamic Question Builder
                    </h3>
                    <p className="text-xs sm:text-sm text-white/55 leading-relaxed">
                      Start from industry templates or customize single-select, multi-select, and
                      optional comment prompts with effortless ordering.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {['FAST TURNAROUND', 'COURTEOUS STAFF', 'CLEAN STUDIO'].map((chip) => {
                      const active = activeBuilderChips.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => toggleBuilderChip(chip)}
                          className={`px-2.5 py-1.5 rounded-full font-mono text-[9px] font-semibold tracking-wider uppercase transition-all cursor-pointer border ${
                            active
                              ? 'bg-[#2454FF] text-white border-[#2454FF]'
                              : 'bg-[#1D1D23] text-white/65 border-white/10 hover:text-white'
                          }`}
                        >
                          {chip}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => openAuthModal('signup')}
                      className="px-2.5 py-1.5 rounded-full font-mono text-[9px] font-semibold tracking-wider uppercase border border-dashed border-white/25 text-white/55 hover:text-white hover:border-white/50 transition-colors cursor-pointer"
                    >
                      + CUSTOM PROMPT
                    </button>
                  </div>
                </div>
              </SpatialTilt>

              {/* Card 3: Authentic AI Review Drafts */}
              <SpatialTilt maxTilt={4} scale={1.012} glare={false} className="rounded-2xl">
                <div className="h-full rounded-2xl bg-[#141418] border border-white/10 p-7 flex flex-col justify-between gap-8 hover:border-[#FACC15]/45 transition-colors">
                  <div>
                    <div className="w-9 h-9 rounded-lg bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center mb-5">
                      <Wand2 className="w-4 h-4" />
                    </div>
                    <h3 className="font-display text-lg sm:text-xl font-bold text-white mb-2.5">
                      Authentic AI Review Drafts
                    </h3>
                    <p className="text-xs sm:text-sm text-white/55 leading-relaxed">
                      Drafts natural first-person reviews in Short, Detailed, or Professional tones
                      without inventing fake details or hiding honest criticism.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-[#1D1D23] border border-white/8">
                    {(
                      [
                        { id: 'short', label: 'SHORT' },
                        { id: 'detailed', label: 'DETAILED' },
                        { id: 'pro', label: 'PRO' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFeatureTone(item.id)}
                        className={`py-2 rounded-lg font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer ${
                          featureTone === item.id
                            ? 'bg-white text-[#111114] shadow-xs'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SpatialTilt>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 04: PLUG-AND-PLAY ONBOARDING (10 CATEGORIES)
           ========================================== */}
        <section
          id="onboarding"
          className="relative w-full py-20 lg:py-28 rf-dot-grid-stone border-t border-black/10"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Left Copy */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-5"
              >
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#111114]/55 mb-3">
                  04 — PLUG-AND-PLAY ONBOARDING
                </p>
                <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#111114] leading-[1.03] mb-5">
                  Pre-configured forms across{' '}
                  <span className="font-editorial text-[1.08em] font-normal">
                    10 service categories.
                  </span>
                </h2>
                <p className="text-sm sm:text-base text-[#111114]/68 leading-relaxed mb-6">
                  Click any category below to inspect tailored questions, SEO tags, and prompts.
                </p>

                <button
                  type="button"
                  onClick={onTryDemo}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#111114] hover:text-[#FF3D8B] transition-colors cursor-pointer"
                >
                  <span>Preview Interactive Hair Salon Demo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>

              {/* Right Elevated Interactive Category Card */}
              <div className="lg:col-span-7">
                <SpatialTilt maxTilt={3} scale={1.008} glare={false} className="rounded-3xl">
                  <div className="rounded-3xl bg-[#FBFBF9] border border-black/10 p-6 sm:p-8 shadow-[0_24px_60px_-20px_rgba(17,17,20,0.12)]">
                    {/* Category Pills */}
                    <div className="flex flex-wrap gap-2 mb-7">
                      {ONBOARDING_CATEGORY_ORDER.map((category) => {
                        const active = selectedCategory === category;
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setSelectedCategory(category)}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                              active
                                ? 'bg-[#111114] text-white border-[#111114] shadow-sm'
                                : 'bg-[#EEECE6] text-[#111114]/75 border-transparent hover:border-black/15 hover:text-[#111114]'
                            }`}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>

                    {/* Dynamic Category Detail */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={selectedCategory}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                      >
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#111114]/45 mb-2">
                          {activeCategoryMeta.badge}
                        </p>
                        <h3 className="font-display text-xl sm:text-2xl font-bold text-[#111114] leading-snug mb-3">
                          {activeCategoryMeta.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#111114]/65 leading-relaxed mb-6">
                          {activeCategoryMeta.desc}
                        </p>

                        {/* Color-Coded Tags (matches Screenshot 10) */}
                        <div className="flex flex-wrap items-center gap-2">
                          {activeCategoryMeta.tags.map((tag, idx) => {
                            const tagStyle =
                              idx === 0
                                ? 'bg-[#FF3D8B] text-[#111114]'
                                : idx === 1
                                ? 'bg-[#2454FF] text-white'
                                : idx === 2
                                ? 'bg-[#FACC15] text-[#111114]'
                                : 'bg-[#EAE7DF] text-[#111114]/75';
                            return (
                              <span
                                key={tag}
                                className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold tracking-wider uppercase ${tagStyle}`}
                              >
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </SpatialTilt>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 05: POLICY & FTC COMPLIANCE (COBALT BLUE)
           ========================================== */}
        <section id="policy" className="relative w-full rf-dot-grid-blue py-20 lg:py-28 text-white">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Left Copy */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
                  05 — POLICY
                </p>
                <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.05] mb-6">
                  Strict adherence to{' '}
                  <span className="font-editorial text-[1.08em] font-normal">
                    Google review policies &amp; FTC guidelines.
                  </span>
                </h2>
                <p className="text-sm sm:text-base text-white/85 leading-relaxed max-w-lg mb-7">
                  ReviewFlow is engineered to comply with Google Business Profile policies. Our
                  platform never uses &ldquo;review gating&rdquo; (hiding negative ratings while
                  forwarding positive ones). Every customer receives equal, direct access to post
                  their honest thoughts on Google.
                </p>

                <div className="flex flex-wrap gap-2.5">
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/14 border border-white/20 text-xs font-semibold">
                    <Star className="w-3.5 h-3.5 fill-white" />
                    <span>No star gating</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/14 border border-white/20 text-xs font-semibold">
                    <Gift className="w-3.5 h-3.5" />
                    <span>No incentives for ratings</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/14 border border-white/20 text-xs font-semibold">
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Full customer editorial control</span>
                  </span>
                </div>
              </motion.div>

              {/* Right Interactive 3D Compliance Architecture Diagram */}
              <div className="lg:col-span-6">
                <SpatialTilt maxTilt={3.5} scale={1.01} glare={false} className="rounded-3xl">
                  <motion.div
                    initial={{ opacity: 0, y: 26 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="rounded-3xl bg-white/[0.08] backdrop-blur-md border border-white/20 p-6 sm:p-8 shadow-[0_28px_60px_-20px_rgba(10,20,70,0.5)]"
                  >
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-5 mb-6">
                      {/* Every Guest White Card */}
                      <div className="w-full sm:w-[190px] rounded-2xl bg-[#F5F3EE] text-[#111114] p-4 rf-shadow-dark border border-[#111114] shrink-0">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#111114]/55 mb-2.5">
                          EVERY GUEST
                        </p>
                        <div className="space-y-1.5 mb-2.5">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#EAE6DC] text-xs font-semibold">
                            <Star className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B]" />
                            <span>Any rating</span>
                          </div>
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#EAE6DC] text-xs font-semibold">
                            <Pencil className="w-3.5 h-3.5 text-[#FF3D8B]" />
                            <span>Edit freely</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#111114] text-white text-xs font-semibold">
                          <Copy className="w-3.5 h-3.5" />
                          <span>Tap copy once</span>
                        </div>
                      </div>

                      {/* Animated Direct Connector */}
                      <div className="flex sm:flex-col items-center justify-center gap-1.5 shrink-0">
                        <div className="relative flex items-center justify-center">
                          <svg
                            width="66"
                            height="20"
                            viewBox="0 0 66 20"
                            className="hidden sm:block"
                            aria-hidden="true"
                          >
                            <line
                              x1="0"
                              y1="10"
                              x2="66"
                              y2="10"
                              stroke="rgba(255,255,255,0.5)"
                              strokeWidth="1.5"
                              className="rf-dash-animated"
                            />
                          </svg>
                          <div className="sm:absolute w-7 h-7 rounded-full bg-[#FACC15] text-[#111114] flex items-center justify-center shadow-md">
                            <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </div>
                        </div>
                        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-white/75">
                          DIRECT
                        </span>
                      </div>

                      {/* Google Listing Target Box */}
                      <div className="w-full sm:w-[190px] rounded-2xl border border-dashed border-white/40 bg-white/[0.06] p-5 text-center shrink-0">
                        <span className="font-display text-2xl font-bold text-white block mb-1.5">
                          G
                        </span>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                          GOOGLE LISTING
                        </p>
                        <p className="text-xs text-white/65 mt-0.5">Post manually.</p>
                      </div>
                    </div>

                    {/* Bottom Dark Compliance Strip */}
                    <div className="rounded-xl bg-[#163299]/80 border border-white/15 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
                      <span className="inline-flex items-center gap-2 text-white/85">
                        <ShieldCheck className="w-4 h-4 text-[#FACC15]" />
                        <span>Review gating</span>
                      </span>
                      <span className="font-bold text-[#FACC15]">never</span>
                    </div>
                  </motion.div>
                </SpatialTilt>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 06: FINAL HOT PINK CONVERSION BANNER
           ========================================== */}
        <section className="w-full bg-[#0D0D0F] pt-14 pb-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1220px] mx-auto">
            <SpatialTilt maxTilt={2.2} scale={1.006} glare={false} className="rounded-[32px]">
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-[32px] bg-[#FF3D8B] text-[#111114] overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-white/15 shadow-[0_32px_70px_-20px_rgba(255,61,139,0.3)]"
              >
                {/* Left Copy */}
                <div className="lg:col-span-6 p-8 sm:p-12 lg:p-14 flex flex-col justify-between gap-8">
                  <div>
                    <p className="font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#111114]/70 mb-3">
                      INSTANT STOREFRONT DEPLOYMENT
                    </p>
                    <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#111114] leading-[1.02] mb-5">
                      Your storefront,{' '}
                      <span className="font-editorial text-[1.08em] font-normal block sm:inline">
                        live in minutes.
                      </span>
                    </h2>
                    <p className="text-sm sm:text-base text-[#111114]/80 leading-relaxed max-w-md">
                      Create your workspace in minutes, connect your Google Business Profiles, and
                      export your custom printable QR display kit immediately.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <button
                      type="button"
                      onClick={handlePrimaryAction}
                      disabled={isSigningIn}
                      className="inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-full bg-[#111114] hover:bg-[#232329] text-white text-xs sm:text-sm font-bold transition-all hover:-translate-y-0.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <span>
                        {user && isAdmin && onOpenAdmin
                          ? 'Open Business Management'
                          : user && hasClientAccess && onOpenPortal
                          ? 'Open Client Portal'
                          : 'Create your workspace'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className="font-mono text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-[#111114]/70 leading-relaxed">
                      INSTANT DIGITAL QR GENERATION · PRINTABLE PDF POSTERS · CANCEL ANYTIME
                    </p>
                  </div>
                </div>

                {/* Right Black-Dot Pink Matrix + 3D Tilted ReviewFlow QR Standee */}
                <div className="lg:col-span-6 rf-dot-grid-pink p-10 sm:p-14 flex items-center justify-center relative min-h-[300px]">
                  <motion.div
                    whileHover={{ rotate: 0, scale: 1.04, y: -4 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="-rotate-2"
                  >
                    <BrandedQrCard label="ReviewFlow" tone="tilt" />
                  </motion.div>
                </div>
              </motion.div>
            </SpatialTilt>
          </div>
        </section>
      </main>

      {/* ==========================================
          DARK EDITORIAL FOOTER
         ========================================== */}
      <footer className="w-full bg-[#0D0D0F] text-white pt-10 pb-10 px-4 sm:px-6 lg:px-8 border-t border-white/8">
        <div className="max-w-[1220px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12 border-b border-white/10">
            <div className="md:col-span-6 space-y-3">
              <div className="flex items-center gap-2.5">
                <ReviewFlowMark size="md" />
                <span className="font-display text-lg font-bold tracking-tight text-white">
                  ReviewFlow
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/50">
                Multi-Business Google Review Platform.
              </p>
            </div>

            <div className="md:col-span-3 flex flex-col gap-2.5 text-xs sm:text-sm">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 mb-1">
                PRODUCT
              </span>
              {NAV_LINKS.slice(0, 3).map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(link.href);
                  }}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="md:col-span-3 flex flex-col gap-2.5 text-xs sm:text-sm">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 mb-1">
                COMPANY
              </span>
              {NAV_LINKS.slice(3).map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(link.href);
                  }}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="text-left text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                {user ? 'Open workspace' : 'Get started'}
              </button>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            <p>© 2025 REVIEWFLOW</p>
            <p>EQUAL-ACCESS REVIEW DRAFTS · MANUAL GOOGLE SUBMISSION</p>
          </div>
        </div>
      </footer>

      {/* ==========================================
          AUTHENTICATION MODAL: GOOGLE + EMAIL/PASSWORD
         ========================================== */}
      {authModalOpen && (
        <div
          data-lenis-prevent
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-black/10 w-full max-w-md p-6 sm:p-8 space-y-6 shadow-[0_28px_70px_-15px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#111114]">
                  {authTab === 'signin'
                    ? 'Sign in to ReviewFlow'
                    : authTab === 'signup'
                    ? 'Create your workspace'
                    : 'Reset your password'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Access your business portal, QR codes, and review analytics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close sign in dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              disabled={isSigningIn}
              onClick={onGoogleSignIn}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {isSigningIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#FF3D8B]" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-3 text-xs text-slate-400">or use email</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signin');
                  setLocalError(null);
                  setInfoMessage(null);
                  setDismissedAuthErrorSig(authActionError?.message || authError || null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === 'signin'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Email Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signup');
                  setLocalError(null);
                  setInfoMessage(null);
                  setDismissedAuthErrorSig(authActionError?.message || authError || null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Work or Business Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@business.com"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3D8B]/25 focus:border-[#FF3D8B]"
                />
              </div>

              {authTab !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="auth-password"
                      className="text-xs font-medium text-slate-700"
                    >
                      Password
                    </label>
                    {authTab === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('reset');
                          setLocalError(null);
                          setInfoMessage(null);
                          setDismissedAuthErrorSig(authActionError?.message || authError || null);
                        }}
                        className="text-xs font-medium text-[#2454FF] hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF3D8B]/25 focus:border-[#FF3D8B]"
                  />
                </div>
              )}

              {combinedError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 space-y-2.5"
                >
                  <p className="leading-relaxed">{combinedError}</p>
                  {(authActionError?.suggestGoogleSignIn || authActionError?.suggestPasswordReset) && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {authActionError.suggestGoogleSignIn && (
                        <button
                          type="button"
                          disabled={isSigningIn}
                          onClick={onGoogleSignIn}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-100/60 text-slate-800 font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Continue with Google
                        </button>
                      )}
                      {authActionError.suggestPasswordReset && (
                        <button
                          type="button"
                          disabled={sendingPasswordSetup || isSigningIn}
                          onClick={handleQuickPasswordSetupLink}
                          className="px-2.5 py-1.5 rounded-lg bg-[#111114] hover:bg-[#232329] text-white font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                        >
                          {sendingPasswordSetup ? 'Sending link...' : 'Send Password Setup Link'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {infoMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
                  {infoMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#111114] hover:bg-[#232329] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span>
                  {authTab === 'signin'
                    ? 'Sign In with Email'
                    : authTab === 'signup'
                    ? 'Create Verified Account'
                    : 'Send Reset Link'}
                </span>
              </button>

              {authTab === 'reset' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setLocalError(null);
                  }}
                  className="w-full text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Back to sign in
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
