import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  BUSINESS_CATEGORIES,
  type BusinessCategory,
  type EnabledFeatures,
  type PackageTier,
  type ReviewFlowMode,
  type ReviewLanguage,
} from '../types';
import {
  createCategoryQuestions,
  DEFAULT_ENABLED_FEATURES,
  DEMO_BISTRO_LOGO,
  DEMO_SALON_LOGO,
} from '../data/categoryPresets';
import { getStarterReferenceReviewsForCategory } from '../data/realReviewDatasets';
import {
  createBusiness,
  fetchContextualSeoKeywords,
  generateRandomToken,
  sanitizeSlug,
} from '../services/businessService';
import { sanitizePackageTier } from '../utils/domainHelpers';
import { getPublicAppUrl } from '../utils/apiClient';
import { compressLogoFile } from '../utils/qrAndPdf';
import { sanitizeExternalUrl } from '../utils/urlAndAuth';
import { BusinessLogo } from './BusinessLogo';

interface OnboardingModalProps {
  ownerId: string;
  userEmail: string;
  isAdmin?: boolean;
  canClose: boolean;
  onClose: () => void;
  onCreated: (businessId: string) => void;
}

export function OnboardingModal({
  ownerId,
  userEmail,
  isAdmin = false,
  canClose,
  onClose,
  onCreated,
}: OnboardingModalProps) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState<BusinessCategory>('Hair Salons');
  const [clientEmail, setClientEmail] = useState(isAdmin ? '' : userEmail);
  const [clientAccessLevel, setClientAccessLevel] = useState<'read_only' | 'qr_and_questions' | 'full'>('full');
  const [packageTier, setPackageTier] = useState<PackageTier>('standard_plus');
  const [reviewFlowMode, setReviewFlowMode] = useState<ReviewFlowMode>('ai_drafted_instant');
  const [allowClientFlowModeSwitch, setAllowClientFlowModeSwitch] = useState<boolean>(true);
  const [enabledFeatures, setEnabledFeatures] = useState<EnabledFeatures>({
    ...DEFAULT_ENABLED_FEATURES,
  });
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(userEmail);
  const [website, setWebsite] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0F766E');
  const [seoKeywords, setSeoKeywords] = useState<string[]>([]);
  const [seoKeywordsByLanguage, setSeoKeywordsByLanguage] = useState<
    Partial<Record<ReviewLanguage, string[]>>
  >({});
  const [newKeyword, setNewKeyword] = useState('');
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [keywordsTouched, setKeywordsTouched] = useState(false);
  const lastAutoKeyRef = useRef('');
  const keywordRequestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewQuestions = useMemo(() => createCategoryQuestions(category), [category]);
  const previewSlug = useMemo(() => {
    const raw = slug.trim() || name.trim();
    return raw ? sanitizeSlug(raw) : 'your-business';
  }, [slug, name]);
  const publicBaseUrl = useMemo(() => getPublicAppUrl(), []);

  useEffect(() => {
    if (!canClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canClose, onClose]);

  const runAutoKeywordGeneration = async (
    targetName: string,
    targetCategory: BusinessCategory,
    targetAddress: string,
    targetLocality: string = locality,
    targetCity: string = city,
    targetTier: PackageTier = packageTier,
  ) => {
    const cleanName = targetName.trim();
    if (cleanName.length < 2) return;
    const requestSeq = keywordRequestSeqRef.current + 1;
    keywordRequestSeqRef.current = requestSeq;
    setIsGeneratingKeywords(true);
    try {
      const result = await fetchContextualSeoKeywords({
        businessName: cleanName,
        category: targetCategory,
        address: targetAddress,
        locality: targetLocality,
        city: targetCity,
        packageTier: sanitizePackageTier(targetTier),
      });
      if (!mountedRef.current || requestSeq !== keywordRequestSeqRef.current) return;
      setSeoKeywords(result.keywords);
      setSeoKeywordsByLanguage(result.keywordsByLanguage);
      lastAutoKeyRef.current = `${cleanName.toLowerCase()}|${targetCategory}|${targetAddress.trim().toLowerCase()}|${targetLocality.trim().toLowerCase()}|${targetCity.trim().toLowerCase()}|${targetTier}`;
    } finally {
      if (mountedRef.current && requestSeq === keywordRequestSeqRef.current) {
        setIsGeneratingKeywords(false);
      }
    }
  };

  useEffect(() => {
    const cleanName = name.trim();
    if (cleanName.length < 3 || keywordsTouched) return;
    const signature = `${cleanName.toLowerCase()}|${category}|${address.trim().toLowerCase()}|${locality.trim().toLowerCase()}|${city.trim().toLowerCase()}|${packageTier}`;
    if (signature === lastAutoKeyRef.current) return;

    const timer = setTimeout(() => {
      runAutoKeywordGeneration(cleanName, category, address, locality, city, packageTier);
    }, 650);
    return () => clearTimeout(timer);
  }, [name, category, address, locality, city, packageTier, keywordsTouched]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) {
      setSlug(val.trim() ? sanitizeSlug(val) : '');
    }
  };

  const applySamplePreset = (preset: 'salon' | 'restaurant') => {
    setKeywordsTouched(false);
    setError(null);
    if (preset === 'salon') {
      setName('Stylish Hair Studio');
      setOwnerName('Aarav Sharma');
      setSlug('stylish-hair-studio');
      setSlugTouched(true);
      setCategory('Hair Salons');
      setAddress('240 Mercer Street, Suite 2B');
      setPhone('(555) 234-8910');
      setGoogleReviewUrl('https://search.google.com/local/writereview');
      setLogoDataUrl(DEMO_SALON_LOGO);
      setPrimaryColor('#0F766E');
    } else {
      setName('Mashoor Bistro');
      setOwnerName('Priya Nair');
      setSlug('mashoor-restaurant');
      setSlugTouched(true);
      setCategory('Restaurants');
      setAddress('88 Oakwood Avenue');
      setPhone('(555) 782-4412');
      setGoogleReviewUrl('https://search.google.com/local/writereview');
      setLogoDataUrl(DEMO_BISTRO_LOGO);
      setPrimaryColor('#14532D');
    }
  };

  const handleAddKeyword = () => {
    const clean = newKeyword.trim().slice(0, 60);
    if (!clean) return;
    setKeywordsTouched(true);
    if (!seoKeywords.some((k) => k.toLowerCase() === clean.toLowerCase())) {
      setSeoKeywords((prev) => [...prev, clean].slice(0, 15));
    }
    setNewKeyword('');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressLogoFile(file);
      setLogoDataUrl(compressed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process uploaded logo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Business Name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalKeywords = seoKeywords;
      let finalKeywordsByLang = seoKeywordsByLanguage;
      if (finalKeywords.length === 0) {
        const contextual = await fetchContextualSeoKeywords({
          businessName: name.trim(),
          category,
          address: address.trim(),
          locality: locality.trim(),
          city: city.trim(),
          packageTier: isAdmin ? packageTier : 'standard_plus',
        });
        finalKeywords = contextual.keywords;
        finalKeywordsByLang = contextual.keywordsByLanguage;
      }

      const effectiveTier: PackageTier = isAdmin ? packageTier : 'standard_plus';
      const starterRefs = getStarterReferenceReviewsForCategory(category);
      const normalizedSlug = sanitizeSlug(slug || name);
      const businessId = await createBusiness(ownerId, {
        ownerName: ownerName.trim(),
        packageTier: effectiveTier,
        reviewFlowMode: isAdmin ? reviewFlowMode : 'ai_drafted_instant',
        allowClientFlowModeSwitch: isAdmin ? allowClientFlowModeSwitch : true,
        clientEmail: isAdmin ? clientEmail : userEmail,
        clientAccessLevel: isAdmin ? clientAccessLevel : 'full',
        enabledFeatures: isAdmin ? enabledFeatures : undefined,
        name: name.trim(),
        slug: normalizedSlug,
        category,
        address: address.trim(),
        locality: locality.trim(),
        city: city.trim(),
        phone: phone.trim(),
        contactEmail: (contactEmail || userEmail).trim(),
        website: website.trim() ? sanitizeExternalUrl(website, '') : '',
        googleReviewUrl: sanitizeExternalUrl(googleReviewUrl, 'https://www.google.com/maps'),
        logoDataUrl,
        branding: {
          primaryColor,
          secondaryColor: '#0F172A',
          welcomeMessage: `Thanks for visiting ${name.trim()}! Tap a few quick options and we will draft a personalized review for you.`,
          thankYouMessage: `Thank you for supporting ${name.trim()}. We appreciate your time!`,
          defaultReviewStyle: 'short',
        },
        qrConfig: {
          isActive: true,
          fgColor: '#0F172A',
          bgColor: '#FFFFFF',
          token: generateRandomToken(),
          includeLogo: Boolean(logoDataUrl),
        },
        questions: createCategoryQuestions(category),
        seoKeywords: finalKeywords,
        seoKeywordsByLanguage: finalKeywordsByLang,
        referenceReviews: starterRefs,
      });

      onCreated(businessId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 spatial-canvas text-slate-900 overflow-y-auto">
      {/* Sticky Workspace Header */}
      <header className="sticky top-0 z-30 h-16 liquid-glass-nav border-b border-white/75 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-bold text-slate-900 whitespace-nowrap shrink-0">
                ReviewFlow
              </span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-medium text-slate-600 truncate">New Business Setup</span>
            </div>
          </div>

          <button
            type="submit"
            form="onboarding-business-form"
            disabled={isSubmitting}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Create Business &amp; QR</span>
          </button>
        </div>
      </header>

      {/* Main Full-Page Workspace */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-8">
        {/* Page Title & Quick Sample Loader */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Register a New Business Profile
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Enter your storefront details, Google review destination, and brand style to launch a live customer QR page and AI review drafter.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Quick samples:
            </span>
            <button
              type="button"
              onClick={() => applySamplePreset('salon')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Stylish Hair Studio
            </button>
            <button
              type="button"
              onClick={() => applySamplePreset('restaurant')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Mashoor Bistro
            </button>
          </div>
        </div>

        {/* 12-Column SaaS Grid: Form Left, Live Preview Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            id="onboarding-business-form"
            onSubmit={handleSubmit}
            className="lg:col-span-7 liquid-glass rounded-2xl divide-y divide-slate-200/70"
          >
            {/* Section 1: Business Identity */}
            <section className="p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  01. Business Identity &amp; Brand
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Displayed on your customer review form header, QR center badge, and printable poster.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                <div className="flex items-center gap-4 min-w-0">
                  <BusinessLogo
                    src={logoDataUrl}
                    name={name || 'Business'}
                    primaryColor={primaryColor}
                    sizeClass="w-16 h-16"
                  />
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="min-h-[36px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Logo</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </label>
                      {logoDataUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoDataUrl('')}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer whitespace-nowrap"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, WebP, or GIF recommended (max 5 MB).</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <label htmlFor="onboarding-primary-color" className="text-xs font-medium text-slate-700 whitespace-nowrap">
                    Brand Color
                  </label>
                  <input
                    id="onboarding-primary-color"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
                  />
                  <span className="font-mono text-xs text-slate-500 tabular-nums uppercase">
                    {primaryColor}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label htmlFor="onboarding-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Business Name *
                  </label>
                  <input
                    id="onboarding-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g., ABC Hair Salon"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-category" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Industry Category *
                  </label>
                  <select
                    id="onboarding-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  >
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-slug" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Public Review URL Slug *
                  </label>
                  <div className="flex items-center h-10 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 focus-within:ring-2 focus-within:ring-teal-700/20 focus-within:border-teal-700">
                    <span className="px-2.5 text-xs font-mono text-slate-500 border-r border-slate-200 shrink-0">
                      /review/
                    </span>
                    <input
                      id="onboarding-slug"
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                      }}
                      placeholder="abc-hair-salon"
                      className="flex-1 min-w-0 h-full px-2.5 text-sm font-mono bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-owner" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Owner Name (Optional)
                  </label>
                  <input
                    id="onboarding-owner"
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g., Rohan Mehta"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Google Link & Contact Details */}
            <section className="p-6 sm:p-8 space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  02. Google Review Destination &amp; Contact
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Customers are sent directly to this link after copying their personalized draft.
                </p>
              </div>

              <div>
                <label htmlFor="onboarding-google-url" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Google Business Profile Review Link
                </label>
                <input
                  id="onboarding-google-url"
                  type="url"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/YOUR_PLACE_ID/review"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Leave blank to start with Google Maps; you can update your direct review link anytime in Branding.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label htmlFor="onboarding-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Business Contact Email
                  </label>
                  <input
                    id="onboarding-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="owner@business.com"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <input
                    id="onboarding-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-locality" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Locality / Area
                  </label>
                  <input
                    id="onboarding-locality"
                    type="text"
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="e.g., Andheri West, Vashi"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-city" className="block text-xs font-medium text-slate-700 mb-1.5">
                    City
                  </label>
                  <input
                    id="onboarding-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g., Mumbai"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-address" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Street Address
                  </label>
                  <input
                    id="onboarding-address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Shop no., street, landmark"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="onboarding-website" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Website (Optional)
                  </label>
                  <input
                    id="onboarding-website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://mybusiness.com"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Local SEO Keywords */}
            <section className="p-6 sm:p-8 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    03. Local Search Keywords
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    AI naturally weaves relevant phrases into drafted customer reviews to support local Maps visibility.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isGeneratingKeywords || name.trim().length < 2}
                  onClick={() => {
                    setKeywordsTouched(false);
                    runAutoKeywordGeneration(name, category, address, locality, city, packageTier);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                  <span>{isGeneratingKeywords ? 'Generating...' : 'Auto-Generate'}</span>
                </button>
              </div>

              {seoKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {seoKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setKeywordsTouched(true);
                          setSeoKeywords((prev) => prev.filter((item) => item !== kw));
                        }}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label={`Remove ${kw}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  placeholder="Add custom keyword (e.g., keratin treatment)..."
                  className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </section>

            {/* Section 4 (Admin Only): Customer Client Portal Access */}
            {isAdmin && (
              <section className="p-6 sm:p-8 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    04. Customer Client Portal Access (Gmail)
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Add the customer&apos;s Gmail address here. Whenever they sign in with this Gmail account, they will automatically see the Landing Page and get Client Portal access for this business.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="min-w-0">
                    <label htmlFor="onboarding-client-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Customer Gmail Address
                    </label>
                    <input
                      id="onboarding-client-email"
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="customer@gmail.com"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="onboarding-client-tier" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Client Access Level
                    </label>
                    <select
                      id="onboarding-client-tier"
                      value={clientAccessLevel}
                      onChange={(e) =>
                        setClientAccessLevel(e.target.value as 'read_only' | 'qr_and_questions' | 'full')
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                    >
                      <option value="read_only">Read-Only (View QR &amp; Stats)</option>
                      <option value="qr_and_questions">QR &amp; Questions Editor</option>
                      <option value="full">Full Self-Service</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="onboarding-package-tier" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Plan Permissions (₹3,000 / ₹4,000)
                    </label>
                    <select
                      id="onboarding-package-tier"
                      value={packageTier}
                      onChange={(e) => setPackageTier(e.target.value as PackageTier)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                    >
                      <option value="standard">₹3,000 Plan · Standard (English 5+ AI Drafts)</option>
                      <option value="standard_plus">₹4,000 Plan · Standard Plus (All 4 Languages 5+ AI Drafts)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="min-w-0">
                    <label htmlFor="onboarding-flow-mode" className="block text-xs font-medium text-slate-700 mb-1.5">
                      QR Scan Experience Mode
                    </label>
                    <select
                      id="onboarding-flow-mode"
                      value={reviewFlowMode}
                      onChange={(e) => setReviewFlowMode(e.target.value as ReviewFlowMode)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                    >
                      <option value="ai_drafted_instant">5+ Ready AI Reviews → Direct Post to Google</option>
                      <option value="guided_questions">Guided Questions → Custom AI Draft</option>
                    </select>
                  </div>
                  <label className="min-w-0 px-3 py-2 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2 text-xs font-medium text-slate-700 cursor-pointer self-end h-10">
                    <span>Allow client to switch mode later</span>
                    <input
                      type="checkbox"
                      checked={allowClientFlowModeSwitch}
                      onChange={(e) => setAllowClientFlowModeSwitch(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-700"
                    />
                  </label>
                </div>

                <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-800">
                    Enabled Portal Features for This Business
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        { key: 'formTemplates', label: 'Customer Form Templates' },
                        { key: 'customQuestions', label: 'Custom Question Builder' },
                        { key: 'qrStudio', label: 'QR Studio & Styling' },
                        { key: 'brandingSettings', label: 'Branding & Google Link' },
                        { key: 'aiReviewDrafts', label: 'AI Review Drafts' },
                        { key: 'pdfPosterExport', label: 'Printable A4 PDF Posters' },
                        { key: 'analyticsView', label: 'Client Analytics View' },
                        { key: 'inStoreQrStands', label: 'In-Store QR Stands' },
                        { key: 'gbpAutoReply', label: 'GBP AI Auto Reply' },
                        { key: 'weeklyReports', label: 'Weekly Reports' },
                      ] as const
                    ).map((feat) => (
                      <label
                        key={feat.key}
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50"
                      >
                        <span>{feat.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(enabledFeatures[feat.key])}
                          onChange={(e) =>
                            setEnabledFeatures((prev) => ({
                              ...prev,
                              [feat.key]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 rounded border-slate-300 text-teal-700"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Error + Bottom Action Footer */}
            <div className="p-6 sm:p-8 bg-slate-50/70 rounded-b-2xl space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3">
                {canClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[42px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[42px] px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Register Business &amp; Generate QR</span>
                </button>
              </div>
            </div>
          </form>

          {/* Right Column: Sticky Live Preview & Provisioning Summary */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
            {/* Live Customer Form Preview Card */}
            <div className="liquid-glass spatial-card-3d rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-900">
                  Live Customer Review Preview
                </span>
                <span className="font-mono text-xs text-slate-500 truncate max-w-[210px]">
                  /review/{previewSlug}
                </span>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3.5">
                  <BusinessLogo
                    src={logoDataUrl}
                    name={name || 'Business'}
                    primaryColor={primaryColor}
                    sizeClass="w-12 h-12"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold text-slate-900 truncate">
                      {name.trim() || 'Your Business Name'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {category}
                      {address.trim() ? ` · ${address.trim()}` : ''}
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Thanks for visiting {name.trim() || 'our business'}! Tap a few quick options and we will draft a personalized review for you.
                </p>

                {/* Preview of first 2 category preset questions */}
                <div className="space-y-4 pt-3 border-t border-slate-100">
                  {previewQuestions.slice(0, 2).map((q, idx) => (
                    <div key={q.id} className="space-y-2">
                      <p className="text-xs font-semibold text-slate-800">
                        {idx + 1}. {q.prompt}
                      </p>
                      {q.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.slice(0, 4).map((opt, optIdx) => {
                            const selected = optIdx === 0;
                            return (
                              <span
                                key={opt}
                                style={
                                  selected
                                    ? {
                                        backgroundColor: primaryColor,
                                        borderColor: primaryColor,
                                        color: '#FFFFFF',
                                      }
                                    : undefined
                                }
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 ${
                                  selected
                                    ? ''
                                    : 'border-slate-200 bg-slate-50 text-slate-700'
                                }`}
                              >
                                {selected && <Check className="w-3 h-3" />}
                                <span>{opt}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <div
                    style={{ backgroundColor: primaryColor }}
                    className="w-full h-10 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-2 opacity-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Review Draft</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Included Capabilities Summary */}
            <div className="liquid-glass spatial-card-3d rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Ready Immediately on Save
                </h3>
                <QrCode className="w-4 h-4 text-teal-700 shrink-0" />
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600">Customer URL</span>
                  <span className="font-mono text-slate-900 truncate max-w-[230px]">
                    {publicBaseUrl ? `${publicBaseUrl}/review/${previewSlug}` : `/review/${previewSlug}`}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600">Preset Form Questions</span>
                  <span className="font-medium text-slate-900 tabular-nums">
                    {previewQuestions.length} tailored questions
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600">QR Exports Included</span>
                  <span className="font-medium text-slate-900">PNG &amp; A4 Printable PDF</span>
                </div>
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-slate-600">Google Destination</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-900 truncate max-w-[200px]">
                    <span>{googleReviewUrl.trim() ? 'Custom Link Set' : 'Google Maps Default'}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
