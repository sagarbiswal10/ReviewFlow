import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Car,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Dumbbell,
  ExternalLink,
  Hospital,
  Hotel,
  Link2,
  Loader2,
  Mail,
  MessageSquareText,
  Nfc,
  PauseCircle,
  PlayCircle,
  Printer,
  QrCode,
  RefreshCw,
  Scale,
  Scissors,
  Shield,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Store,
  ThumbsUp,
  TrendingUp,
  Utensils,
  Waves,
  X,
  Zap,
  BarChart3,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BUSINESS_CATEGORIES, type BusinessCategory } from '../types';
import { HERO_TABLETOP_IMAGE } from '../data/categoryPresets';
import { WarpCarousel, type WarpCard } from './ui/warp-carousel';
import { LiquidNavbar, NimbusIcons, type LiquidNavItem } from './ui/liquid-glass-navbar';
import { SpatialTilt } from './ui/spatial-tilt';

import type { AuthActionableError } from '../utils/urlAndAuth';

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
type ShowcaseTab = 'mobile' | 'owner';
type SimulatorTone = 'warm' | 'concise' | 'detailed';

interface CategoryShowcaseMeta {
  badge: string;
  title: string;
  desc: string;
  tags: string[];
}

const CATEGORY_SHOWCASE_DATA: Record<BusinessCategory, CategoryShowcaseMeta> = {
  Restaurants: {
    badge: 'Selected: Fine Dining & Casual Restaurants',
    title: 'Pre-loaded with Food Quality, Ambiance, & Table Service Prompts',
    desc: 'Captures dine-in or takeaway favorites, standout dishes, server shout-outs, and atmosphere in natural first-person drafts.',
    tags: ['Signature Mains', 'Craft Drinks', 'Attentive Service', 'Warm Ambiance'],
  },
  'Hair Salons': {
    badge: 'Selected: Hair Salons & Color Studios',
    title: 'Pre-loaded with Stylist Tiers, Balayage, Cut, & Wash Prompts',
    desc: 'Eliminates setup time with out-of-the-box prompts for haircuts, hair styling, colour precision, keratin care, and studio atmosphere.',
    tags: ['Haircut & Styling', 'Hair Colour', 'Keratin Treatment', 'Studio Atmosphere'],
  },
  'Beauty Salons': {
    badge: 'Selected: Beauty & Skincare Studios',
    title: 'Pre-loaded with Facial, Nail, Brow & Lash Care Prompts',
    desc: 'Highlights sanitization standards, gentle technique, welcoming care, and appointment punctuality automatically.',
    tags: ['Facial & Skincare', 'Manicure & Pedicure', 'Brows & Lashes', 'Spotless Studio'],
  },
  Hotels: {
    badge: 'Selected: Boutique & Resort Hotels',
    title: 'Pre-loaded with Check-In, Comfort, & Hospitality Prompts',
    desc: 'Guests tap through smooth check-in, spotless rooms, morning breakfast, and concierge support in seconds.',
    tags: ['Seamless Check-In', 'Clean Rooms', 'Breakfast & Dining', 'Warm Hospitality'],
  },
  Spas: {
    badge: 'Selected: Day Spas & Wellness Studios',
    title: 'Pre-loaded with Massage, Aromatherapy, & Relaxation Prompts',
    desc: 'Designed for serene wellness visits, turning quiet relaxation highlights into descriptive local reviews.',
    tags: ['Deep Tissue Massage', 'Aromatherapy', 'Hydrotherapy', 'Calming Lounge'],
  },
  Gyms: {
    badge: 'Selected: Gyms & Boutique Fitness',
    title: 'Pre-loaded with Coaching, Equipment, & Facility Prompts',
    desc: 'Members tap strength zones, group classes, coach energy, and locker cleanliness to strengthen local search rankings.',
    tags: ['Strength Equipment', 'Group Classes', 'Motivating Coaches', 'Clean Facilities'],
  },
  Healthcare: {
    badge: 'Selected: Healthcare & Dental Clinics',
    title: 'Pre-loaded with Bedside Care, Clarity, & Clinic Prompts',
    desc: 'Thoughtful, compliant prompts tailored for clinics, dental practices, diagnostics, and patient follow-ups.',
    tags: ['Clear Explanations', 'Short Wait Time', 'Caring Team', 'Clean Clinic'],
  },
  'Retail Stores': {
    badge: 'Selected: Specialty Retail Stores',
    title: 'Pre-loaded with Merchandising, Staff Help, & Checkout Prompts',
    desc: 'Highlights curated product selection, attentive associates, and smooth in-store pickup or checkout.',
    tags: ['Curated Products', 'Helpful Staff', 'Easy Checkout', 'Organized Store'],
  },
  'Automobile Services': {
    badge: 'Selected: Automotive & Detailing',
    title: 'Pre-loaded with Honest Pricing, Turnaround, & Repair Prompts',
    desc: 'Turns routine maintenance, diagnostics, and detailing visits into high-trust reviews that reassure local drivers.',
    tags: ['Transparent Pricing', 'Ready on Time', 'Skilled Technicians', 'Detailing & Care'],
  },
  'Other Businesses': {
    badge: 'Selected: General & Local Service Studios',
    title: 'Pre-loaded with Universal Customer Experience Prompts',
    desc: 'Flexible starter questions ready for salons, creative studios, pet care, home services, and local storefronts.',
    tags: ['Friendly Team', 'High Quality Service', 'Prompt & Reliable', 'Great Value'],
  },
};

const FEATURE_WARP_CARDS: WarpCard[] = [
  {
    title: 'Visit-to-post\naverage',
    value: '20.4',
    unit: 's',
    footer: "Zero writer's block",
    detail: 'slider',
    labels: ['Scan', 'Post'],
    numeral: ['#5eead4', '#e0f2fe'],
    accent: '#5eead4',
    glow: '#0f766e',
    mesh: [
      '#042f2e', '#063b38', '#084743', '#094e49', '#063d3a', '#042b2a',
      '#06403c', '#0b5c55', '#0d6f67', '#0e786f', '#0a5e57', '#053533',
      '#09544e', '#0f766e', '#149085', '#15988d', '#0f766e', '#07433e',
      '#0d6a62', '#149085', '#1eb8aa', '#2dd4bf', '#179b8e', '#094f49',
      '#09544e', '#12857b', '#26cbbd', '#5eead4', '#22b3a6', '#0a534d',
      '#063d39', '#0d6860', '#199d90', '#29c4b5', '#15847a', '#063834',
      '#042826', '#084440', '#0e6961', '#127c72', '#094a44', '#032321',
    ],
  },
  {
    title: 'Tap-to-post\ncompletion',
    value: '94.2',
    unit: '%',
    footer: 'iOS Safari & Chrome',
    detail: 'ring',
    numeral: ['#bae6fd', '#f0fdf4'],
    accent: '#7dd3fc',
    glow: '#0284c7',
    mesh: [
      '#0f172a', '#142038', '#172947', '#162845', '#111d33', '#0c1322',
      '#15233d', '#1b3154', '#1e406d', '#1c3c66', '#162b4a', '#0f1b30',
      '#182e4f', '#1f4473', '#235993', '#21538a', '#193b63', '#11223b',
      '#133052', '#184e7c', '#1a759f', '#2596be', '#196488', '#0e2c47',
      '#0f2640', '#144468', '#166e8f', '#38bdf8', '#157094', '#0b253b',
      '#0b1b2e', '#10314b', '#145374', '#1d6f94', '#114461', '#081829',
      '#07111e', '#0b1e30', '#0e324a', '#113c57', '#0a2436', '#060e18',
    ],
  },
  {
    title: 'Industry\ntemplates',
    value: '10',
    footer: 'Pre-configured forms',
    detail: 'cross',
    labels: ['QR Kit', 'Tones', 'SEO'],
    numeral: ['#a7f3d0', '#ffffff'],
    accent: '#6ee7b7',
    glow: '#059669',
    mesh: [
      '#022c22', '#04382c', '#064738', '#064435', '#043328', '#02241c',
      '#043c30', '#075946', '#0a7159', '#096953', '#064c3c', '#032f25',
      '#075342', '#0b7a60', '#0f9676', '#0e8b6d', '#09624d', '#053d30',
      '#065041', '#0b7862', '#10b981', '#34d399', '#0d8a68', '#054436',
      '#053f34', '#096352', '#109c74', '#6ee7b7', '#0f785c', '#043429',
      '#042c24', '#07483c', '#0c735a', '#148f6e', '#0a5543', '#03231c',
      '#021c17', '#043129', '#074d40', '#095a4a', '#06362c', '#021712',
    ],
  },
  {
    title: 'Policy-safe\nguidelines',
    value: '100',
    unit: '%',
    footer: 'Equal-access review flow',
    detail: 'wave',
    numeral: ['#fde68a', '#f8fafc'],
    accent: '#5eead4',
    glow: '#0f766e',
    mesh: [
      '#1e293b', '#223146', '#253950', '#213347', '#1b2838', '#141e2b',
      '#1b2d3f', '#1f3e52', '#204e61', '#1c4657', '#173645', '#112430',
      '#132f3d', '#144b57', '#0f666c', '#115d63', '#10444b', '#0d2b31',
      '#0f2f38', '#10545b', '#0f766e', '#14b8a6', '#10625d', '#0a3332',
      '#162936', '#1c404b', '#1c6361', '#2dd4bf', '#175452', '#0f282a',
      '#1c2331', '#233140', '#26434b', '#225257', '#1a383f', '#121d26',
      '#141a24', '#19232f', '#1c2e38', '#19353c', '#13242b', '#0e131b',
    ],
  },
];

const FEATURE_WARP_LABELS = [
  '20.4s Visit-to-Post',
  '94.2% Completion',
  '10 Service Templates',
  '100% Policy Safe',
];

function renderCategoryIcon(category: BusinessCategory, active: boolean) {
  const cls = `w-6 h-6 transition-colors ${active ? 'text-[#005c55]' : 'text-slate-500 group-hover:text-[#005c55]'}`;
  switch (category) {
    case 'Restaurants':
      return <Utensils className={cls} />;
    case 'Hair Salons':
      return <Scissors className={cls} />;
    case 'Beauty Salons':
      return <Sparkles className={cls} />;
    case 'Hotels':
      return <Hotel className={cls} />;
    case 'Spas':
      return <Waves className={cls} />;
    case 'Gyms':
      return <Dumbbell className={cls} />;
    case 'Healthcare':
      return <Hospital className={cls} />;
    case 'Retail Stores':
      return <ShoppingBag className={cls} />;
    case 'Automobile Services':
      return <Car className={cls} />;
    default:
      return <Store className={cls} />;
  }
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
  const [authModalOpen, setAuthModalOpen] = useState(() => Boolean(initialAuthModalOpen && !user));
  const [authTab, setAuthTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [sendingPasswordSetup, setSendingPasswordSetup] = useState(false);
  const [dismissedAuthErrorSig, setDismissedAuthErrorSig] = useState<string | null>(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  useEffect(() => {
    if (user) {
      setAuthModalOpen(false);
    } else if (initialAuthModalOpen) {
      setAuthModalOpen(true);
    }
  }, [user, initialAuthModalOpen]);

  // Interactive Showcase State
  const [showcaseTab, setShowcaseTab] = useState<ShowcaseTab>('mobile');
  const [simStars, setSimStars] = useState(5);
  const [simServices, setSimServices] = useState<string[]>(['Balayage Color']);
  const [simTone, setSimTone] = useState<SimulatorTone>('warm');
  const [simPhraseIdx, setSimPhraseIdx] = useState(0);
  const [simCopyToast, setSimCopyToast] = useState(false);

  // Interactive Owner Cockpit Controls State
  const [simQrTokenVer, setSimQrTokenVer] = useState(1);
  const [simInflowPaused, setSimInflowPaused] = useState(false);
  const [simActionNote, setSimActionNote] = useState<string | null>(null);

  // Interactive Pillar & Category Explorer State
  const [simulatedScans, setSimulatedScans] = useState(148);
  const [scanJustTriggered, setScanJustTriggered] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategory>('Hair Salons');
  const [activeFeatureIdx, setActiveFeatureIdx] = useState(0);
  const [activeNavIdx, setActiveNavIdx] = useState(0);

  const navItems: LiquidNavItem[] = useMemo(
    () => [
      { label: 'Platform', href: '#top', icon: NimbusIcons.home, fx: 'glow' },
      { label: 'Interactive Showcase', href: '#interactive-cockpit', icon: NimbusIcons.globe, fx: 'spin' },
      { label: 'Capabilities', href: '#capabilities', icon: NimbusIcons.drop, fx: 'drop' },
      {
        label: 'Industries',
        href: '#industries',
        icon: <Store className="w-[17px] h-[17px]" />,
        fx: 'wave',
      },
    ],
    [],
  );

  useEffect(() => {
    const sectionIds = ['top', 'interactive-cockpit', 'capabilities', 'industries'];
    const handleScroll = () => {
      const y = window.scrollY + 180;
      let nextIdx = 0;
      sectionIds.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= y) {
          nextIdx = idx;
        }
      });
      setActiveNavIdx(nextIdx);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const toggleSimService = (service: string) => {
    setSimServices((prev) => {
      if (prev.includes(service)) {
        return prev.length > 1 ? prev.filter((item) => item !== service) : prev;
      }
      return [...prev, service];
    });
  };

  const simulatedDraftText = useMemo(() => {
    const joined = simServices.join(' and ').toLowerCase();
    if (simStars <= 3) {
      if (simTone === 'concise') {
        return `Visited Lumina Studio for ${joined}. Service was ${simStars === 3 ? 'average overall' : 'below what I hoped for'}, with a few areas that could be improved.`;
      }
      return `I stopped by Lumina Studio for ${joined} today. While the salon space was tidy, my overall visit felt ${simStars === 3 ? 'fairly average' : 'less consistent than expected'} and there is room to improve timing and communication.`;
    }

    if (simTone === 'warm') {
      return simPhraseIdx % 2 === 0
        ? `Had a great ${joined} session at Lumina Studio today! My stylist listened closely to what I wanted and achieved the natural look I had in mind. Warm studio vibe and attentive care.`
        : `Really pleased with my ${joined} at Lumina Studio. The consultation felt unhurried, the studio was spotless, and the final result came out just right.`;
    }
    if (simTone === 'concise') {
      return simPhraseIdx % 2 === 0
        ? `Great ${joined} at Lumina Studio. Punctual, clean salon, and skilled stylist. Happy to return.`
        : `Solid experience for ${joined} at Lumina Studio. Efficient service and natural results.`;
    }
    return simPhraseIdx % 2 === 0
      ? `Booked a visit for ${joined} at Lumina Studio in SoHo. The consultation was thorough, my stylist walked me through every step, and the final finish felt natural and well-paced. I will definitely book my next appointment here.`
      : `I visited Lumina Studio for ${joined} and appreciated how organized the entire appointment was. From a clear consultation to careful finishing touches, the local hair salon delivered a comfortable experience.`;
  }, [simServices, simStars, simTone, simPhraseIdx]);

  const handleSimulatedCopy = async () => {
    try {
      await navigator.clipboard.writeText(simulatedDraftText);
    } catch {
      // Clipboard fallback ignored cleanly
    }
    setSimCopyToast(true);
    setTimeout(() => setSimCopyToast(false), 2600);
  };

  const triggerSimulatedScan = () => {
    setSimulatedScans((prev) => prev + 1);
    setScanJustTriggered(true);
    setTimeout(() => setScanJustTriggered(false), 1600);
  };

  const triggerOwnerControlToast = (message: string) => {
    setSimActionNote(message);
    setTimeout(() => setSimActionNote(null), 2600);
  };

  const activeCategoryMeta = CATEGORY_SHOWCASE_DATA[selectedCategory];
  const parentErrorText = authActionError?.message || authError;
  const visibleParentError =
    parentErrorText && parentErrorText !== dismissedAuthErrorSig ? parentErrorText : null;
  const combinedError = localError || visibleParentError;

  const renderPrimaryWorkspaceCta = (label: string, extraClass = '') => {
    if (user && isAdmin && onOpenAdmin) {
      return (
        <button
          type="button"
          onClick={onOpenAdmin}
          className={`inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${extraClass}`}
        >
          <span>Open Business Management</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      );
    }
    if (user && hasClientAccess && onOpenPortal) {
      return (
        <button
          type="button"
          onClick={onOpenPortal}
          className={`inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${extraClass}`}
        >
          <span>Open Client Portal</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => openAuthModal('signup')}
        disabled={isSigningIn}
        className={`inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 ${extraClass}`}
      >
        <span>{label}</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    );
  };

  return (
    <div className="min-h-screen spatial-canvas text-[#131b2e] antialiased selection:bg-[#ccfbf1] selection:text-[#005c55] relative">
      {/* Subtle Spatial Ambient Light Fields & 3D Depth Horizon */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute inset-x-0 top-0 h-[620px] spatial-grid-plane opacity-75" />
        <div
          className="absolute -top-44 left-[8%] w-[560px] h-[560px] rounded-full opacity-55 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(20,184,166,0.18) 0%, rgba(20,184,166,0) 72%)',
          }}
        />
        <div
          className="absolute top-[18%] -right-32 w-[520px] h-[520px] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(56,189,248,0.16) 0%, rgba(56,189,248,0) 72%)',
          }}
        />
      </div>

      {/* Floating Minimalist Liquid Glass Navigation Bar */}
      <header className="sticky top-0 z-40 pt-3 pb-2 px-4 sm:px-6 lg:px-8">
        <div className="min-h-[62px] max-w-[1280px] mx-auto px-3.5 sm:px-5 py-1 flex items-center justify-between gap-4 sm:gap-6 rounded-full liquid-glass-nav ring-1 ring-slate-900/[0.04]">
          {/* Zone 1: Clean Brand Wordmark */}
          <a
            href="#top"
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 pl-1"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0f766e] to-[#005c55] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_4px_10px_rgba(15,118,110,0.28)]">
              <BadgeCheck className="w-4 h-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              ReviewFlow
            </span>
          </a>

          {/* Zone 2: Nimbus Liquid Glass Waterline Navigation */}
          <LiquidNavbar
            items={navItems}
            active={activeNavIdx}
            onChange={(idx) => setActiveNavIdx(idx)}
            tone="light"
            className="hidden lg:inline-flex shrink-0"
          />

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onTryDemo}
              className="hidden sm:inline-flex items-center justify-center px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 rounded-full bg-white/55 hover:bg-white/90 border border-white/75 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Try Demo
            </button>

            {user ? (
              <>
                {isAdmin && onOpenAdmin ? (
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="inline-flex items-center justify-center px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-b from-[#0f766e] to-[#005c55] rounded-full hover:brightness-105 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_16px_-4px_rgba(15,118,110,0.38)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span className="sm:hidden">Admin</span>
                    <span className="hidden sm:inline">Business Management</span>
                  </button>
                ) : hasClientAccess && onOpenPortal ? (
                  <button
                    type="button"
                    onClick={onOpenPortal}
                    className="inline-flex items-center justify-center px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-b from-[#0f766e] to-[#005c55] rounded-full hover:brightness-105 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_16px_-4px_rgba(15,118,110,0.38)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span className="sm:hidden">Portal</span>
                    <span className="hidden sm:inline">Client Portal</span>
                  </button>
                ) : null}
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center justify-center px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white/75 hover:bg-white border border-slate-200/90 rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Sign Out
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                disabled={isSigningIn}
                className="inline-flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-gradient-to-b from-[#0f766e] to-[#005c55] rounded-full hover:brightness-105 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_16px_-4px_rgba(15,118,110,0.38)] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10 w-full overflow-x-clip">
        {/* ==========================================
            SECTION 01: HERO STAGE
           ========================================== */}
        <section className="relative w-full pt-8 pb-16 lg:py-20">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            {authError && !authModalOpen && (
              <div
                role="alert"
                className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {authError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-12 lg:gap-x-12 items-center">
              {/* Left Column */}
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#005c55] mb-4">
                  Multi-Business Google Review Platform
                </p>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-slate-900 leading-[1.1] [text-wrap:balance] mb-6">
                  Turn everyday customer visits into{' '}
                  <span className="text-[#0f766e] relative inline-block">
                    authentic Google
                    <svg
                      className="absolute -bottom-1.5 left-0 w-full h-2 text-[#005c55]/30"
                      fill="none"
                      preserveAspectRatio="none"
                      viewBox="0 0 240 8"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 5.5Q60 1 120 5.5T239 5.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="3"
                      />
                    </svg>
                  </span>{' '}
                  reviews.
                </h1>

                <p className="text-base sm:text-lg text-slate-600 mb-8 max-w-xl leading-relaxed">
                  Customers often skip leaving reviews because staring at a blank text box feels like
                  work. With ReviewFlow, they scan your tactile QR stand, tap a few tailored
                  responses, and receive an authentic draft ready to post directly on Google in
                  under 20 seconds.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
                  {renderPrimaryWorkspaceCta(
                    'Sign In to Workspace',
                    'px-7 py-3.5 rounded-xl bg-gradient-to-b from-[#0f766e] to-[#005c55] text-white font-semibold text-sm sm:text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_24px_-6px_rgba(15,118,110,0.4)] hover:brightness-105 transition-all',
                  )}

                  <a
                    href="#interactive-cockpit"
                    className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl liquid-glass text-slate-900 font-semibold text-sm sm:text-base hover:bg-white/85 transition-all whitespace-nowrap shrink-0"
                  >
                    <Smartphone className="w-4 h-4 text-[#005c55]" />
                    <span>Try Live Customer Form</span>
                  </a>
                </div>

                {user && !isAdmin && (
                  <p className="mb-6 text-xs text-slate-600 leading-relaxed">
                    Signed in as <span className="font-mono text-slate-900">{user.email}</span>
                    {hasClientAccess
                      ? ' · Client Portal access is active for your account.'
                      : ' · No Client Portal business assigned to this Gmail yet. Ask your business manager to grant access.'}
                  </p>
                )}

                <div className="pt-6 border-t border-slate-200/80 flex flex-wrap items-center gap-y-2.5 gap-x-5 text-xs sm:text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#005c55]" />
                    <span>100% Policy-Compliant (No Gating)</span>
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-[#005c55]" />
                    <span>Printable PDF &amp; PNG Kit</span>
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#005c55]" />
                    <span>Instant AI Tone Generator</span>
                  </span>
                </div>
              </div>

              {/* Right Column: Spatial 3D Tabletop Standee Showcase Card */}
              <div className="lg:col-span-6 relative">
                <SpatialTilt maxTilt={5.5} scale={1.015} className="relative mx-auto max-w-[520px] lg:max-w-none rounded-3xl">
                  <div className="rounded-3xl overflow-visible liquid-glass p-3 spatial-preserve-3d">
                    <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 ring-1 ring-black/5">
                      {heroImageFailed ? (
                        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-white bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950">
                          <QrCode className="w-16 h-16 text-teal-400 mb-4" />
                          <p className="font-display text-xl font-bold tracking-tight">
                            Share Your Feedback
                          </p>
                          <p className="mt-1.5 text-sm text-slate-300">
                            Scan to leave a Google review
                          </p>
                        </div>
                      ) : (
                        <img
                          src={HERO_TABLETOP_IMAGE}
                          alt="Matte charcoal and brushed brass tabletop acrylic QR standee reading Share Your Feedback, Scan to Review Us on Google"
                          referrerPolicy="no-referrer"
                          onError={() => setHeroImageFailed(true)}
                          className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                        />
                      )}

                      {/* Bottom Floating Overlay Card (Spatial Z-Depth) */}
                      <div className="absolute bottom-3 left-3 right-3 p-3.5 sm:p-4 rounded-2xl bg-white/82 backdrop-blur-2xl border border-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_34px_rgba(15,23,42,0.18)] flex items-center justify-between gap-3 spatial-depth-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#f0fdfa]/90 border border-[#0f766e]/15 flex items-center justify-center text-[#005c55] shrink-0">
                            <Nfc className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              Tap NFC or Scan QR
                            </p>
                            <p className="text-xs text-slate-600 truncate">
                              Instant launch to tailored feedback flow
                            </p>
                          </div>
                        </div>
                        <div className="hidden sm:flex flex-col items-end shrink-0 tabular-nums">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[#005c55]">
                            Avg Draft Time
                          </span>
                          <span className="text-sm font-bold text-slate-900">1.8s</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Asymmetric Top-Left Callout (Elevated Spatial Z-Layer) */}
                  <div className="hidden sm:flex items-center gap-3 px-4 py-3 rounded-2xl liquid-glass-nav absolute -top-5 -left-5 spatial-depth-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0f766e] to-[#005c55] text-white flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Review Volume
                      </p>
                      <p className="text-sm font-extrabold text-slate-900 tabular-nums">
                        +3.8x Monthly
                      </p>
                    </div>
                  </div>

                  {/* Asymmetric Bottom-Right Callout (Elevated Spatial Z-Layer) */}
                  <div className="hidden sm:flex items-center gap-3 px-4 py-3 rounded-2xl liquid-glass-nav absolute -bottom-5 -right-4 spatial-depth-2">
                    <div className="w-10 h-10 rounded-full bg-[#6df5e1]/90 text-[#005048] flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <ThumbsUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Completion Ratio
                      </p>
                      <p className="text-sm font-extrabold text-slate-900 tabular-nums">
                        94.2% Tap-to-Post
                      </p>
                    </div>
                  </div>
                </SpatialTilt>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            PROOF METRICS STRIP
           ========================================== */}
        <section className="w-full py-10 bg-white/40 backdrop-blur-xl border-y border-white/75">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8 text-center">
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-[#005c55] tabular-nums">
                  12,400+
                </span>
                <span className="mt-1 text-xs sm:text-sm text-slate-500">
                  Tabletop Displays Deployed
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums">
                  20.4s
                </span>
                <span className="mt-1 text-xs sm:text-sm text-slate-500">
                  Average Visit-to-Post Time
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-[#005c55] tabular-nums">
                  100%
                </span>
                <span className="mt-1 text-xs sm:text-sm text-slate-500">
                  Google Policy Compliant
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums">
                  4.92 ★
                </span>
                <span className="mt-1 text-xs sm:text-sm text-slate-500">
                  Aggregate Storefront Rating
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 02: THE 4-STEP FRICTIONLESS PIPELINE
           ========================================== */}
        <section id="how-it-works" className="w-full py-20 lg:py-24">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-[#005c55] block mb-2">
                The Frictionless Pipeline
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight [text-wrap:balance] mb-4">
                How ReviewFlow turns casual visits into high-ranking Google reviews.
              </h2>
              <p className="text-base sm:text-lg text-slate-600">
                Traditional review forms fail because staring at an empty text box feels like work.
                Our sequenced flow removes writer&apos;s block in four simple steps.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  num: '01',
                  icon: <Link2 className="w-5 h-5" />,
                  title: 'Connect Google Link',
                  body: 'Register one or multiple storefronts, paste your Google Business Profile review URL, and upload your custom brand logo.',
                  footer: 'Instant sync',
                },
                {
                  num: '02',
                  icon: <QrCode className="w-5 h-5" />,
                  title: 'Print Branded QR',
                  body: 'Generate crisp dynamic QR codes with your center logo mark, customize colors, and export PNG or printable A4 PDF stands.',
                  footer: '300 DPI Export',
                },
                {
                  num: '03',
                  icon: <Sparkles className="w-5 h-5" />,
                  title: 'Customer Taps & Drafts',
                  body: 'Guests tap specific services they enjoyed. Our AI turns their exact selections into a natural, SEO-friendly first-person draft.',
                  footer: 'Natural tone variety',
                },
                {
                  num: '04',
                  icon: <MessageSquareText className="w-5 h-5" />,
                  title: 'Edit & Post on Google',
                  body: 'Guests edit freely with full control, tap copy once, and land directly on your Google listing to post manually.',
                  footer: '100% genuine posting',
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="group rounded-2xl liquid-glass spatial-card-3d p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <span className="font-mono text-2xl font-bold text-[#005c55]/35 group-hover:text-[#005c55] transition-colors tabular-nums">
                        {step.num}
                      </span>
                      <div className="w-10 h-10 rounded-full bg-white/75 border border-white/80 group-hover:bg-[#f0fdfa] text-[#005c55] flex items-center justify-center transition-colors shadow-sm">
                        {step.icon}
                      </div>
                    </div>
                    <h3 className="font-display text-lg font-semibold text-slate-900 mb-2.5">
                      {step.title}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
                  </div>
                  <div className="mt-8 pt-4 border-t border-slate-900/[0.06] flex items-center gap-1.5 text-xs font-bold text-[#005c55]">
                    <span>{step.footer}</span>
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 03: INTERACTIVE SHOWCASE COCKPIT
           ========================================== */}
        <section
          id="interactive-cockpit"
          className="w-full py-20 lg:py-24 bg-white/35 backdrop-blur-md border-y border-white/75"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-14">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#005c55] block mb-2">
                  Interactive Showcase
                </span>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
                  See the exact 20-second customer journey.
                </h2>
                <p className="text-base sm:text-lg text-slate-600 mt-2 max-w-2xl">
                  Test the live guest experience below or switch tabs to explore multi-location
                  analytics and QR token controls.
                </p>
              </div>

              {/* Segmented Tab Switcher */}
              <div className="inline-flex p-1.5 rounded-full liquid-glass-well self-start lg:self-auto">
                <button
                  type="button"
                  onClick={() => setShowcaseTab('mobile')}
                  className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    showcaseTab === 'mobile'
                      ? 'bg-white/95 text-[#005c55] shadow-sm'
                      : 'text-slate-700 hover:text-[#005c55]'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Customer Mobile Experience</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowcaseTab('owner')}
                  className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    showcaseTab === 'owner'
                      ? 'bg-white/95 text-[#005c55] shadow-sm'
                      : 'text-slate-700 hover:text-[#005c55]'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Multi-Location Analytics</span>
                </button>
              </div>
            </div>

            {showcaseTab === 'mobile' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                {/* Left: Interactive 3D Spatial Mobile Simulator */}
                <div className="lg:col-span-6 flex justify-center">
                  <SpatialTilt maxTilt={5} scale={1.012} className="w-full max-w-[360px] rounded-[40px]">
                    <div className="w-full rounded-[40px] bg-slate-900 p-3 shadow-[0_32px_64px_-22px_rgba(15,23,42,0.45)] ring-1 ring-white/25">
                      <div className="w-24 h-3.5 bg-slate-900 rounded-full mx-auto mb-2 flex items-center justify-center">
                        <div className="w-12 h-2 bg-black rounded-full" />
                      </div>

                      <div className="rounded-[32px] bg-white p-5 flex flex-col min-h-[560px] text-slate-900 relative overflow-hidden">
                      <div className="flex items-center justify-between mb-4 bg-[#f2f3ff] p-3 rounded-xl">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#0f766e] text-white flex items-center justify-center font-bold text-xs">
                            LS
                          </div>
                          <div>
                            <h3 className="text-sm font-bold leading-none text-slate-900">
                              Lumina Studio
                            </h3>
                            <span className="text-[11px] text-slate-500">SoHo, New York</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-[#005c55] bg-[#f0fdfa] px-2.5 py-0.5 rounded-full">
                          Verified QR
                        </span>
                      </div>

                      {/* Star Selector */}
                      <div className="mb-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          How was your visit today?
                        </p>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => setSimStars(rating)}
                              aria-label={`Rate ${rating} out of 5 stars`}
                              className="p-0.5 cursor-pointer transition-transform active:scale-95"
                            >
                              <Star
                                className={`w-7 h-7 ${
                                  rating <= simStars
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-slate-300'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Service Tags */}
                      <div className="mb-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          What did we do for you?
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            'Balayage Color',
                            'Precision Cut',
                            'Gloss Treatment',
                            'Scalp Therapy',
                          ].map((service) => {
                            const active = simServices.includes(service);
                            return (
                              <button
                                key={service}
                                type="button"
                                onClick={() => toggleSimService(service)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-[#f0fdfa] text-[#005c55] ring-1 ring-[#0f766e]/30'
                                    : 'bg-slate-100 text-slate-600 hover:bg-[#f0fdfa]'
                                }`}
                              >
                                {service}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Tone Presets */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Draft Tone
                          </span>
                          <span className="text-[11px] text-[#005c55] font-medium">
                            Tap to switch
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'warm', label: 'Warm' },
                              { id: 'concise', label: 'Concise' },
                              { id: 'detailed', label: 'Detailed' },
                            ] as { id: SimulatorTone; label: string }[]
                          ).map((tone) => (
                            <button
                              key={tone.id}
                              type="button"
                              onClick={() => setSimTone(tone.id)}
                              className={`py-1.5 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer ${
                                simTone === tone.id
                                  ? 'bg-[#f0fdfa] text-[#005c55] font-bold ring-1 ring-[#0f766e]/30'
                                  : 'bg-slate-100 text-slate-600 hover:bg-[#f0fdfa]'
                              }`}
                            >
                              {tone.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Generated Draft Box */}
                      <div className="rounded-xl bg-[#f2f3ff] p-3.5 mb-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-[#005c55] flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Personalized Google Draft</span>
                            </span>
                            <span className="text-[11px] text-slate-500">Editable</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            &ldquo;{simulatedDraftText}&rdquo;
                          </p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                          <span>{simulatedDraftText.length} characters</span>
                          <button
                            type="button"
                            onClick={() => setSimPhraseIdx((prev) => prev + 1)}
                            className="text-[#005c55] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Rephrase</span>
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSimulatedCopy}
                        className="w-full py-3 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Copy Draft &amp; Open Google</span>
                      </button>

                      {simCopyToast && (
                        <div className="absolute bottom-6 left-5 right-5 p-3 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-2 shadow-xl">
                          <CheckCircle2 className="w-4 h-4 text-[#80d5cb] shrink-0" />
                          <span>Copied to clipboard! Ready to paste on Google.</span>
                        </div>
                      )}
                    </div>
                    </div>
                  </SpatialTilt>
                </div>

                {/* Right: Flow Psychology Breakdown */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                  <div className="p-8 rounded-2xl liquid-glass spatial-card-3d">
                    <div className="w-12 h-12 rounded-xl bg-[#f0fdfa]/90 border border-[#0f766e]/15 text-[#005c55] flex items-center justify-center mb-5">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-slate-900 mb-3">
                      Why Customers Complete This Flow (94.2% Rate)
                    </h3>
                    <p className="text-sm sm:text-base text-slate-600 mb-6 leading-relaxed">
                      When guests open a blank Google review window on their phone, writer&apos;s
                      block stops them. ReviewFlow turns open-ended prompts into effortless quick
                      taps.
                    </p>

                    <div className="space-y-4">
                      {[
                        {
                          title: 'Never Fabricates Experiences',
                          desc: 'Drafts are built strictly from the services, sentiment, and comments selected by the guest.',
                        },
                        {
                          title: '100% Policy-Safe Architecture',
                          desc: 'No review gating or star filtering. Every guest has equal access to edit and post directly on Google.',
                        },
                        {
                          title: 'Zero App Installs Required',
                          desc: 'Runs directly in iOS Safari and Android Chrome from any camera QR scan or NFC tap.',
                        },
                      ].map((item) => (
                        <div key={item.title} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-[#f0fdfa]/90 border border-[#0f766e]/15 text-[#005c55] flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl liquid-glass-tint flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Zap className="w-7 h-7 text-[#005c55] shrink-0" />
                      <div>
                        <p className="font-display text-base font-bold text-[#005c55]">
                          Scan to Post: 18–24 Seconds
                        </p>
                        <p className="text-xs sm:text-sm text-slate-600">
                          Try the full real AI flow with our Stylish Hair Studio demo.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onTryDemo}
                      className="px-4 py-2.5 rounded-xl bg-white/85 backdrop-blur-md border border-white text-[#005c55] font-semibold text-xs sm:text-sm shadow-sm hover:bg-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <span>Open Live Demo</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* TAB VIEW 2: MULTI-LOCATION ANALYTICS & TOKEN CONTROLS */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 rounded-2xl liquid-glass spatial-card-3d p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#005c55]">
                        Regional Operations
                      </span>
                      <h3 className="font-display text-2xl font-bold text-slate-900 mt-1">
                        Real-Time Scan &amp; Post Velocity
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <span>Last 30 Days</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#005c55]">3 Locations Active</span>
                    </div>
                  </div>

                  {/* Clean SVG Velocity Area Chart */}
                  <div className="w-full h-52 mb-8 flex flex-col justify-end">
                    <svg
                      className="w-full h-40 overflow-visible"
                      fill="none"
                      preserveAspectRatio="none"
                      viewBox="0 0 600 160"
                      aria-label="30 day QR scan and review conversion growth curve"
                    >
                      <defs>
                        <linearGradient id="landingChartGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#0f766e" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0 130 C80 120, 120 70, 180 85 C240 100, 300 40, 380 50 C460 60, 520 20, 600 15 L600 160 L0 160 Z"
                        fill="url(#landingChartGradient)"
                      />
                      <path
                        d="M0 130 C80 120, 120 70, 180 85 C240 100, 300 40, 380 50 C460 60, 520 20, 600 15"
                        fill="none"
                        stroke="#0f766e"
                        strokeLinecap="round"
                        strokeWidth="3"
                      />
                      <circle cx="180" cy="85" fill="#ffffff" r="5" stroke="#0f766e" strokeWidth="3" />
                      <circle cx="380" cy="50" fill="#ffffff" r="5" stroke="#0f766e" strokeWidth="3" />
                      <circle cx="600" cy="15" fill="#0f766e" r="6" stroke="#ffffff" strokeWidth="2" />
                    </svg>
                    <div className="flex justify-between text-xs text-slate-400 pt-3 border-t border-slate-100 font-mono tabular-nums">
                      <span>Week 1</span>
                      <span>Week 2</span>
                      <span>Week 3</span>
                      <span className="text-[#005c55] font-semibold">Current</span>
                    </div>
                  </div>

                  {/* Storefront Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-slate-500 text-xs uppercase border-b border-slate-100">
                          <th className="pb-3 font-semibold">Location</th>
                          <th className="pb-3 font-semibold">Scans</th>
                          <th className="pb-3 font-semibold">Draft Copies</th>
                          <th className="pb-3 font-semibold">Conversion</th>
                          <th className="pb-3 font-semibold text-right">Avg Rating</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-900">
                        {[
                          {
                            name: 'Lumina Studio – SoHo Flagship',
                            scans: '1,480',
                            copies: '1,392',
                            rate: '94.1%',
                            rating: '4.94 ★',
                          },
                          {
                            name: 'Lumina Studio – Brooklyn Heights',
                            scans: '920',
                            copies: '874',
                            rate: '95.0%',
                            rating: '4.89 ★',
                          },
                          {
                            name: 'Lumina Studio – Greenwich Village',
                            scans: '1,110',
                            copies: '1,029',
                            rate: '92.7%',
                            rating: '4.91 ★',
                          },
                        ].map((row) => (
                          <tr key={row.name} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 font-semibold text-slate-900">{row.name}</td>
                            <td className="py-3.5 font-mono tabular-nums">{row.scans}</td>
                            <td className="py-3.5 font-mono tabular-nums">{row.copies}</td>
                            <td className="py-3.5 font-mono font-bold text-[#005c55] tabular-nums">
                              {row.rate}
                            </td>
                            <td className="py-3.5 text-right font-bold text-amber-500 tabular-nums">
                              {row.rating}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right Column Controls */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  <div className="rounded-2xl liquid-glass spatial-card-3d p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-display text-lg font-bold text-slate-900">
                        Instant Token Controls
                      </h4>
                      <Shield className="w-5 h-5 text-[#005c55]" />
                    </div>
                    <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                      Tabletop stand damaged or moved? Cycle tokens remotely or pause QR access in
                      one click without losing analytics.
                    </p>

                    <div className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = simQrTokenVer + 1;
                          setSimQrTokenVer(next);
                          triggerOwnerControlToast(`Token rotated to revision v${next}.`);
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-white/65 border border-white/80 text-slate-900 text-sm font-semibold hover:bg-[#f0fdfa] hover:text-[#005c55] transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span>Cycle QR Revision Token (v{simQrTokenVer})</span>
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          triggerOwnerControlToast('Vector PNG & A4 PDF poster preview ready in portal.')
                        }
                        className="w-full py-2.5 px-4 rounded-xl bg-white/65 border border-white/80 text-slate-900 text-sm font-semibold hover:bg-[#f0fdfa] hover:text-[#005c55] transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span>Download Print Poster Kit</span>
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextPaused = !simInflowPaused;
                          setSimInflowPaused(nextPaused);
                          triggerOwnerControlToast(
                            nextPaused ? 'QR code paused.' : 'QR code resumed and active.',
                          );
                        }}
                        className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                          simInflowPaused
                            ? 'bg-[#f0fdfa] text-[#005c55]'
                            : 'bg-red-50/90 text-red-800 hover:bg-red-100'
                        }`}
                      >
                        <span>
                          {simInflowPaused ? 'Resume In-Store QR' : 'Pause In-Store QR'}
                        </span>
                        {simInflowPaused ? (
                          <PlayCircle className="w-4 h-4" />
                        ) : (
                          <PauseCircle className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {simActionNote && (
                      <p className="mt-3 text-xs font-medium text-[#005c55]">{simActionNote}</p>
                    )}
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-[#0f766e]/95 to-[#005c55] backdrop-blur-xl border border-white/20 text-white p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_18px_36px_-14px_rgba(15,118,110,0.45)]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#9cf2e8] block mb-2">
                      Google SEO Impact
                    </span>
                    <h4 className="font-display text-lg font-bold mb-2">Local 3-Pack Boost</h4>
                    <p className="text-sm text-white/85 leading-relaxed mb-4">
                      Natural, service-specific customer reviews help Google index your storefront
                      for high-intent local Map searches.
                    </p>
                    <div className="flex items-center gap-2 font-mono text-xs bg-white/15 border border-white/15 px-3 py-2 rounded-lg tabular-nums">
                      <span className="text-[#9cf2e8] font-bold">+284%</span>
                      <span className="text-white/90">Local Map Discovery Impressions</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ==========================================
            SECTION 04: THREE CORE ARCHITECTURAL PILLARS + SPATIAL FEATURE CAROUSEL
           ========================================== */}
        <section id="capabilities" className="w-full py-20 lg:py-24">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-[#005c55] block mb-2">
                Engineered Precision
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight [text-wrap:balance] mb-4">
                Built for multi-location operators and independent studios.
              </h2>
              <p className="text-base sm:text-lg text-slate-600">
                Manage every storefront from one workspace with per-location analytics, custom
                question builders, and full brand controls.
              </p>
            </div>

            {/* Spatial AI WarpCarousel Feature Stage */}
            <SpatialTilt maxTilt={2.2} scale={1.006} glare={false} className="mb-10 rounded-3xl">
              <div className="rounded-3xl liquid-glass p-3 sm:p-4">
                <div className="relative w-full rounded-[22px] overflow-hidden border border-white/80 bg-[#edf3f8] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                  <WarpCarousel
                    cards={FEATURE_WARP_CARDS}
                    index={activeFeatureIdx}
                    onIndexChange={setActiveFeatureIdx}
                    step={1}
                    interval={4.2}
                    background="#edf3f8"
                    warp={0.9}
                    font='"Plus Jakarta Sans", system-ui, sans-serif'
                    ariaLabel="ReviewFlow spatial platform features"
                    style={{ height: 420 }}
                  />
                </div>
                <div className="mt-3 px-1 sm:px-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 p-1 rounded-full liquid-glass-well">
                    {FEATURE_WARP_LABELS.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setActiveFeatureIdx(idx)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer tabular-nums ${
                          activeFeatureIdx === idx
                            ? 'bg-white/95 text-[#005c55] shadow-sm'
                            : 'text-slate-600 hover:text-[#005c55]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                    Drag or click edges to explore
                  </span>
                </div>
              </div>
            </SpatialTilt>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              {/* Pillar 1 */}
              <div className="rounded-2xl liquid-glass spatial-card-3d p-7 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#f0fdfa]/90 border border-[#0f766e]/15 text-[#005c55] flex items-center justify-center mb-6">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 mb-3">
                    QR Studio &amp; Token Control
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                    Track real-time QR scans, rotate revision tokens on damaged stands, pause links
                    instantly, and export print-ready tabletop PDF posters.
                  </p>
                </div>

                <div className="p-4 rounded-xl liquid-glass-well flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-500 block">
                      Live QR Counter
                    </span>
                    <span className="text-xs font-bold text-[#005c55] tabular-nums">
                      {simulatedScans} verified scans
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={triggerSimulatedScan}
                    className="px-3 py-1.5 rounded-lg bg-white/90 border border-white text-slate-900 text-xs font-bold shadow-sm hover:bg-[#f0fdfa] hover:text-[#005c55] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {scanJustTriggered ? 'Scanned!' : 'Simulate Scan'}
                  </button>
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="rounded-2xl liquid-glass spatial-card-3d p-7 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#f0fdfa]/90 border border-[#0f766e]/15 text-[#005c55] flex items-center justify-center mb-6">
                    <SlidersHorizontal className="w-6 h-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 mb-3">
                    Dynamic Question Builder
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                    Start from industry templates or customize single-select, multi-select, and
                    optional comment prompts with effortless ordering.
                  </p>
                </div>

                <div className="p-4 rounded-xl liquid-glass-well flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-md bg-white/90 text-slate-700 text-xs font-medium shadow-sm">
                    Fast Turnaround
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white/90 text-slate-700 text-xs font-medium shadow-sm">
                    Courteous Staff
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-[#f0fdfa] text-[#005c55] text-xs font-semibold shadow-sm">
                    Clean Studio
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white/90 text-slate-500 text-xs font-medium shadow-sm">
                    + Custom Prompt
                  </span>
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="rounded-2xl liquid-glass spatial-card-3d p-7 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#f0fdfa]/90 border border-[#0f766e]/15 text-[#005c55] flex items-center justify-center mb-6">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 mb-3">
                    Authentic AI Review Drafts
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                    Drafts natural first-person reviews in Short, Detailed, or Professional tones
                    without inventing fake details or hiding honest criticism.
                  </p>
                </div>

                <div className="p-4 rounded-xl liquid-glass-well flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="w-4 h-4 text-[#005c55]" />
                    <span>Grounded in Answers</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#005c55] bg-white/90 px-2.5 py-1 rounded shadow-sm">
                    Zero Fabrication
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 05: 10 SERVICE CATEGORIES MATRIX
           ========================================== */}
        <section
          id="industries"
          className="w-full py-20 lg:py-24 bg-white/35 backdrop-blur-md border-y border-white/75"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#005c55] block mb-2">
                  Plug-and-Play Onboarding
                </span>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
                  Pre-configured forms across 10 service categories.
                </h2>
                <p className="text-base sm:text-lg text-slate-600 mt-2">
                  Click any category below to inspect tailored questions, SEO tags, and prompts.
                </p>
              </div>
              <button
                type="button"
                onClick={onTryDemo}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#005c55] hover:underline self-start cursor-pointer whitespace-nowrap"
              >
                <span>Preview Interactive Hair Salon Demo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* 10 Interactive Category Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 mb-10">
              {BUSINESS_CATEGORIES.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`group p-4 rounded-2xl spatial-card-3d transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                      active
                        ? 'liquid-glass-tint text-[#005c55] ring-2 ring-[#0f766e]/30'
                        : 'liquid-glass text-slate-900 hover:border-[#0f766e]/30'
                    }`}
                  >
                    <div className="mb-2">{renderCategoryIcon(category, active)}</div>
                    <span
                      className={`text-sm font-semibold ${
                        active ? 'text-[#005c55] font-bold' : 'text-slate-900 group-hover:text-[#005c55]'
                      }`}
                    >
                      {category}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Category Preview Card */}
            <div className="rounded-3xl liquid-glass spatial-card-3d p-7 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-[#005c55] mb-2">
                  {activeCategoryMeta.badge}
                </p>
                <h3 className="font-display text-2xl font-bold text-slate-900 mb-3">
                  {activeCategoryMeta.title}
                </h3>
                <p className="text-sm sm:text-base text-slate-600 mb-6 leading-relaxed">
                  {activeCategoryMeta.desc}
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeCategoryMeta.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-lg bg-white/75 border border-white/80 text-slate-700 text-xs font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-auto shrink-0 flex flex-col sm:flex-row lg:flex-col gap-3">
                {renderPrimaryWorkspaceCta(
                  'Deploy This Template',
                  'px-7 py-3.5 rounded-xl bg-gradient-to-b from-[#0f766e] to-[#005c55] text-white font-semibold text-sm hover:brightness-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_20px_-6px_rgba(15,118,110,0.4)] transition-all',
                )}
                <button
                  type="button"
                  onClick={onTryDemo}
                  className="px-7 py-3.5 rounded-xl bg-white/75 border border-white/90 text-slate-900 font-semibold text-sm text-center hover:bg-[#f0fdfa] hover:text-[#005c55] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Open Live Demo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 06: POLICY & FTC COMPLIANCE
           ========================================== */}
        <section className="w-full py-16">
          <div className="max-w-[1080px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl liquid-glass-tint spatial-card-3d p-7 lg:p-10 flex flex-col md:flex-row items-start gap-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0f766e] to-[#005c55] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Scale className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900 mb-2">
                  Strict Adherence to Google Review Policies &amp; FTC Guidelines
                </h3>
                <p className="text-sm sm:text-base text-slate-700 leading-relaxed mb-4">
                  ReviewFlow is engineered to comply with Google Business Profile policies. Our
                  platform never uses &ldquo;review gating&rdquo; (hiding negative ratings while
                  forwarding positive ones). Every customer receives equal, direct access to post
                  their honest thoughts on Google.
                </p>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#005c55]" />
                    <span>No star gating</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#005c55]" />
                    <span>No incentives for ratings</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#005c55]" />
                    <span>Full customer editorial control</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            SECTION 07: FINAL CONVERSION BANNER
           ========================================== */}
        <section className="w-full py-20 lg:py-24 bg-white/35 backdrop-blur-md border-t border-white/75">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <SpatialTilt maxTilt={2.2} scale={1.008} className="rounded-3xl">
              <div className="rounded-3xl bg-gradient-to-br from-[#0f766e] via-[#0d655e] to-[#042f2e] border border-white/25 text-white p-8 sm:p-12 lg:p-16 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_28px_60px_-20px_rgba(15,118,110,0.45)] relative overflow-hidden">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-28 -right-24 w-80 h-80 rounded-full opacity-35 blur-3xl"
                  style={{ background: 'radial-gradient(circle, #5eead4 0%, transparent 70%)' }}
                />
                <div className="relative max-w-2xl">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#9cf2e8] block mb-3">
                    Instant Storefront Deployment
                  </span>
                  <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight [text-wrap:balance] mb-5">
                    Ready to scale your local Google reviews this week?
                  </h2>
                  <p className="text-base sm:text-lg text-white/90 mb-9 leading-relaxed">
                    Create your workspace in minutes, connect your Google Business Profiles, and export
                    your custom printable QR display kit immediately.
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                    {renderPrimaryWorkspaceCta(
                      'Sign In to Get Started',
                      'px-7 py-4 rounded-xl bg-white text-slate-900 font-bold text-sm sm:text-base shadow-lg hover:bg-slate-100 transition-colors',
                    )}

                    <button
                      type="button"
                      onClick={onTryDemo}
                      className="px-7 py-4 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 text-white font-semibold text-sm sm:text-base hover:bg-white/25 transition-colors text-center cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Try Live Customer Demo
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm text-white/75 mt-6">
                    Instant digital QR generation · Printable PDF posters · Cancel anytime
                  </p>
                </div>
              </div>
            </SpatialTilt>
          </div>
        </section>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="relative z-10 w-full bg-white/45 backdrop-blur-xl border-t border-white/80 pt-14 pb-10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-slate-200/70">
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#0f766e] flex items-center justify-center text-white">
                  <BadgeCheck className="w-4 h-4" />
                </div>
                <span className="font-display text-lg font-bold text-slate-900">ReviewFlow</span>
              </div>
              <p className="text-sm text-slate-600 max-w-sm leading-relaxed">
                AI-powered Google review workflow and customizable QR feedback infrastructure for
                local businesses and multi-location brands.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 text-sm">
              <span className="font-bold text-slate-900 mb-1">Platform</span>
              <a href="#how-it-works" className="text-slate-600 hover:text-[#005c55] transition-colors">
                How It Works
              </a>
              <a
                href="#interactive-cockpit"
                className="text-slate-600 hover:text-[#005c55] transition-colors"
              >
                Interactive Showcase
              </a>
              <a href="#capabilities" className="text-slate-600 hover:text-[#005c55] transition-colors">
                Capabilities
              </a>
              <a href="#industries" className="text-slate-600 hover:text-[#005c55] transition-colors">
                Service Categories
              </a>
            </div>

            <div className="flex flex-col gap-2.5 text-sm">
              <span className="font-bold text-slate-900 mb-1">Get Started</span>
              <button
                type="button"
                onClick={onTryDemo}
                className="text-left text-slate-600 hover:text-[#005c55] transition-colors cursor-pointer"
              >
                Live Customer Demo
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signin')}
                className="text-left text-slate-600 hover:text-[#005c55] transition-colors cursor-pointer"
              >
                Workspace Sign In
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="text-left text-slate-600 hover:text-[#005c55] transition-colors cursor-pointer"
              >
                Create Business Account
              </button>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>ReviewFlow — Google Review Collection &amp; QR Feedback Platform</p>
            <p>Equal-access review drafts · Manual Google submission</p>
          </div>
        </div>
      </footer>

      {/* Authentication Modal: Google Sign-In + Email/Password */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-2xl rounded-2xl border border-white/80 w-full max-w-md p-6 sm:p-8 space-y-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_28px_60px_-15px_rgba(15,23,42,0.3)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
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
                <Loader2 className="w-4 h-4 animate-spin text-[#0f766e]" />
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
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20 focus:border-[#0f766e]"
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
                        className="text-xs font-medium text-[#005c55] hover:underline cursor-pointer"
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
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20 focus:border-[#0f766e]"
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
                          className="px-2.5 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#005c55] text-white font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
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
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
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
