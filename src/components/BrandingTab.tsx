import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import {
  BUSINESS_CATEGORIES,
  type Business,
  type BusinessCategory,
  type ReferenceReviewItem,
  type ReviewFlowMode,
  type ReviewLanguage,
  type ReviewStyle,
} from '../types';
import {
  DEFAULT_SEO_KEYWORDS_BY_CATEGORY,
  DEMO_BISTRO_LOGO,
  DEMO_SALON_LOGO,
} from '../data/categoryPresets';
import {
  buildWritingStyleProfile,
  getStarterReferenceReviewsForCategory,
} from '../data/realReviewDatasets';
import { auth } from '../firebase';
import {
  deleteBusiness,
  fetchContextualSeoKeywords,
  sanitizeSlug,
  updateBusiness,
} from '../services/businessService';
import {
  getAllowedLanguagesForTier,
  sanitizePackageTier,
  sanitizeReviewFlowMode,
} from '../utils/domainHelpers';
import { compressLogoFile } from '../utils/qrAndPdf';
import { sanitizeSeoKeywordPhrase } from '../utils/seoKeywordEngine';
import { sanitizeExternalUrl } from '../utils/urlAndAuth';
import { BusinessLogo } from './BusinessLogo';

interface BrandingTabProps {
  business: Business;
  isAdmin?: boolean;
  sectionMode?: 'all' | 'seo_library';
  onDeleted: () => void;
}

const LANGUAGE_TABS: { id: ReviewLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी (Hindi)' },
  { id: 'mr', label: 'मराठी (Marathi)' },
  { id: 'hinglish', label: 'Hinglish' },
];

export function BrandingTab({
  business,
  isAdmin = false,
  sectionMode = 'all',
  onDeleted,
}: BrandingTabProps) {
  const packageTier = sanitizePackageTier(business.packageTier);
  const canSwitchFlowMode = isAdmin || business.allowClientFlowModeSwitch !== false;
  const allowedLanguages = useMemo(
    () => getAllowedLanguagesForTier(packageTier),
    [packageTier],
  );

  const [reviewFlowMode, setReviewFlowMode] = useState<ReviewFlowMode>(
    sanitizeReviewFlowMode(business.reviewFlowMode),
  );
  const [name, setName] = useState(business.name);
  const [ownerName, setOwnerName] = useState(business.ownerName || '');
  const [category, setCategory] = useState<BusinessCategory>(business.category);
  const [slug, setSlug] = useState(business.slug);
  const [address, setAddress] = useState(business.address);
  const [locality, setLocality] = useState(business.locality || '');
  const [city, setCity] = useState(business.city || '');
  const [servicesOffered, setServicesOffered] = useState<string[]>(
    business.servicesOffered || [],
  );
  const [newService, setNewService] = useState('');
  const [productsOffered, setProductsOffered] = useState<string[]>(
    business.productsOffered || [],
  );
  const [newProduct, setNewProduct] = useState('');
  const [businessHighlights, setBusinessHighlights] = useState(
    business.businessHighlights || '',
  );
  const [phone, setPhone] = useState(business.phone);
  const [contactEmail, setContactEmail] = useState(business.contactEmail);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(business.googleReviewUrl);
  const [logoDataUrl, setLogoDataUrl] = useState(business.logoDataUrl);
  const [primaryColor, setPrimaryColor] = useState(business.branding.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(business.branding.secondaryColor);
  const [welcomeMessage, setWelcomeMessage] = useState(business.branding.welcomeMessage);
  const [thankYouMessage, setThankYouMessage] = useState(business.branding.thankYouMessage);
  const [defaultReviewStyle, setDefaultReviewStyle] = useState<ReviewStyle>(
    business.branding.defaultReviewStyle,
  );
  const [seoKeywords, setSeoKeywords] = useState<string[]>(
    business.seoKeywords && business.seoKeywords.length > 0
      ? business.seoKeywords
      : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[business.category] ?? [],
  );
  const [seoKeywordsByLanguage, setSeoKeywordsByLanguage] = useState<
    Partial<Record<ReviewLanguage, string[]>>
  >(business.seoKeywordsByLanguage || {});
  const [activeSeoLang, setActiveSeoLang] = useState<ReviewLanguage>('en');
  const [newKeyword, setNewKeyword] = useState('');
  const [seoNotice, setSeoNotice] = useState<string | null>(null);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);

  // Isolated per-business genuine reference review learning library
  const [referenceReviews, setReferenceReviews] = useState<ReferenceReviewItem[]>(
    business.referenceReviews || [],
  );
  const [refLanguage, setRefLanguage] = useState<ReviewLanguage>('en');
  const [refSentiment, setRefSentiment] = useState<ReferenceReviewItem['sentiment']>('positive');
  const [refText, setRefText] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDirtyRef = useRef(false);
  const lastBusinessIdRef = useRef(business.id);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEditSlug = isAdmin || auth.currentUser?.uid === business.ownerId;

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!allowedLanguages.includes(activeSeoLang)) {
      setActiveSeoLang('en');
    }
  }, [allowedLanguages, activeSeoLang]);

  useEffect(() => {
    const isBusinessChanged = lastBusinessIdRef.current !== business.id;
    if (!isBusinessChanged && isDirtyRef.current) {
      return;
    }
    lastBusinessIdRef.current = business.id;
    isDirtyRef.current = false;
    setReviewFlowMode(sanitizeReviewFlowMode(business.reviewFlowMode));
    setName(business.name);
    setOwnerName(business.ownerName || '');
    setCategory(business.category);
    setSlug(business.slug);
    setAddress(business.address);
    setLocality(business.locality || '');
    setCity(business.city || '');
    setServicesOffered(business.servicesOffered || []);
    setProductsOffered(business.productsOffered || []);
    setBusinessHighlights(business.businessHighlights || '');
    setPhone(business.phone);
    setContactEmail(business.contactEmail);
    setGoogleReviewUrl(business.googleReviewUrl);
    setLogoDataUrl(business.logoDataUrl);
    setPrimaryColor(business.branding.primaryColor);
    setSecondaryColor(business.branding.secondaryColor);
    setWelcomeMessage(business.branding.welcomeMessage);
    setThankYouMessage(business.branding.thankYouMessage);
    setDefaultReviewStyle(business.branding.defaultReviewStyle);
    setSeoKeywords(
      business.seoKeywords && business.seoKeywords.length > 0
        ? business.seoKeywords
        : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[business.category] ?? [],
    );
    setSeoKeywordsByLanguage(business.seoKeywordsByLanguage || {});
    setReferenceReviews(business.referenceReviews || []);
    if (isBusinessChanged) {
      setNewKeyword('');
      setNewService('');
      setNewProduct('');
      setRefText('');
      setSeoNotice(null);
      setConfirmDelete(false);
      setError(null);
      setSavedNotice(null);
    }
  }, [business]);

  const activeSeoList =
    activeSeoLang === 'en'
      ? seoKeywordsByLanguage.en && seoKeywordsByLanguage.en.length > 0
        ? seoKeywordsByLanguage.en
        : seoKeywords
      : seoKeywordsByLanguage[activeSeoLang] || [];

  const starterRefsAvailable = useMemo(
    () => getStarterReferenceReviewsForCategory(category),
    [category],
  );

  const styleSummary = useMemo(
    () =>
      buildWritingStyleProfile({
        language: refLanguage,
        referenceReviews,
      }),
    [refLanguage, referenceReviews],
  );

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressLogoFile(file);
      isDirtyRef.current = true;
      setLogoDataUrl(compressed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);

    if (!name.trim()) {
      setError('Business name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const nextSeoByLang: Partial<Record<ReviewLanguage, string[]>> = {
        ...seoKeywordsByLanguage,
        en: seoKeywords,
      };
      const nextSlug = await updateBusiness(
        business,
        {
          name: name.trim(),
          ownerName: ownerName.trim(),
          ...(canSwitchFlowMode ? { reviewFlowMode } : {}),
          category,
          ...(canEditSlug ? { slug: sanitizeSlug(slug || name) } : {}),
          address: address.trim(),
          locality: locality.trim(),
          city: city.trim(),
          servicesOffered,
          productsOffered,
          businessHighlights: businessHighlights.trim(),
          phone: phone.trim(),
          contactEmail: contactEmail.trim(),
          googleReviewUrl: sanitizeExternalUrl(
            googleReviewUrl,
            'https://www.google.com/maps',
          ),
          logoDataUrl,
          seoKeywords,
          seoKeywordsByLanguage: nextSeoByLang,
          referenceReviews,
          branding: {
            primaryColor,
            secondaryColor,
            welcomeMessage: welcomeMessage.trim(),
            thankYouMessage: thankYouMessage.trim(),
            defaultReviewStyle,
          },
        },
        { isAdmin },
      );
      isDirtyRef.current = false;
      setSlug(nextSlug);
      setSavedNotice('Business identity, contextual SEO keywords, and writing library saved.');
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateKeywords = async () => {
    if (!name.trim()) return;
    setIsGeneratingKeywords(true);
    setError(null);
    setSeoNotice(null);
    try {
      const result = await fetchContextualSeoKeywords({
        businessName: name.trim(),
        category,
        address: address.trim(),
        locality: locality.trim(),
        city: city.trim(),
        servicesOffered,
        productsOffered,
        businessHighlights: businessHighlights.trim(),
        packageTier,
      });
      isDirtyRef.current = true;
      setSeoKeywords(result.keywords);
      setSeoKeywordsByLanguage(result.keywordsByLanguage);
      setSeoNotice(
        packageTier === 'standard'
          ? 'Generated English contextual SEO suggestions (Standard Plan).'
          : 'Generated natural local SEO suggestions across English, Hindi, Marathi & Hinglish.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate SEO keywords.');
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const handleAddKeyword = () => {
    const clean = sanitizeSeoKeywordPhrase(newKeyword);
    if (!clean) {
      if (newKeyword.trim()) {
        setSeoNotice(
          'Superlative claims like "best", "top-rated", "#1", or "most popular" are blocked to keep keywords authentic.',
        );
      }
      return;
    }
    setSeoNotice(null);
    isDirtyRef.current = true;
    if (activeSeoLang === 'en') {
      if (!seoKeywords.some((k) => k.toLowerCase() === clean.toLowerCase())) {
        const updated = [...seoKeywords, clean].slice(0, 15);
        setSeoKeywords(updated);
        setSeoKeywordsByLanguage((prev) => ({ ...prev, en: updated }));
      }
    } else {
      const current = seoKeywordsByLanguage[activeSeoLang] || [];
      if (!current.some((k) => k.toLowerCase() === clean.toLowerCase())) {
        setSeoKeywordsByLanguage((prev) => ({
          ...prev,
          [activeSeoLang]: [...current, clean].slice(0, 10),
        }));
      }
    }
    setNewKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    isDirtyRef.current = true;
    if (activeSeoLang === 'en') {
      const updated = seoKeywords.filter((item) => item !== kw);
      setSeoKeywords(updated);
      setSeoKeywordsByLanguage((prev) => ({ ...prev, en: updated }));
    } else {
      setSeoKeywordsByLanguage((prev) => ({
        ...prev,
        [activeSeoLang]: (prev[activeSeoLang] || []).filter((item) => item !== kw),
      }));
    }
  };

  const handleAddServiceTag = () => {
    const clean = newService.trim().slice(0, 60);
    if (!clean) return;
    if (!servicesOffered.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      isDirtyRef.current = true;
      setServicesOffered((prev) => [...prev, clean].slice(0, 15));
    }
    setNewService('');
  };

  const handleAddProductTag = () => {
    const clean = newProduct.trim().slice(0, 60);
    if (!clean) return;
    if (!productsOffered.some((p) => p.toLowerCase() === clean.toLowerCase())) {
      isDirtyRef.current = true;
      setProductsOffered((prev) => [...prev, clean].slice(0, 15));
    }
    setNewProduct('');
  };

  const handleAddReferenceReview = () => {
    const clean = refText.trim().slice(0, 500);
    if (clean.length < 10) return;
    if (referenceReviews.some((r) => r.text.toLowerCase() === clean.toLowerCase())) {
      setRefText('');
      return;
    }
    isDirtyRef.current = true;
    const item: ReferenceReviewItem = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      language: refLanguage,
      sentiment: refSentiment,
      text: clean,
      source: 'Business-provided genuine review',
    };
    setReferenceReviews((prev) => [item, ...prev].slice(0, 25));
    setRefText('');
  };

  const handleLoadStarterDataset = () => {
    if (starterRefsAvailable.length === 0) return;
    const existingKeys = new Set(referenceReviews.map((r) => r.text.trim().toLowerCase()));
    const merged = [...referenceReviews];
    for (const item of starterRefsAvailable) {
      if (merged.length >= 25) break;
      if (!existingKeys.has(item.text.trim().toLowerCase())) {
        merged.push(item);
        existingKeys.add(item.text.trim().toLowerCase());
      }
    }
    isDirtyRef.current = true;
    setReferenceReviews(merged);
  };

  const handleDeleteBusiness = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteBusiness(business);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete business.');
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {sectionMode === 'seo_library'
                ? 'Business Identity, SEO & Real Review Library'
                : 'Business Profile & Google Review Link'}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {sectionMode === 'seo_library'
                ? `Configure owner details, locality, services, contextual SEO keywords, and isolated real customer review samples for ${business.name}.`
                : 'Update your public URL slug, contact details, and Google Business Profile link.'}
            </p>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{sectionMode === 'seo_library' ? 'Save SEO & Library' : 'Save Changes'}</span>
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {savedNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {savedNotice}
          </div>
        )}

        {sectionMode === 'all' && (
          <>
            {/* Logo Section */}
        <div className="flex flex-wrap items-center gap-5">
          <BusinessLogo
            src={logoDataUrl}
            name={name || business.name}
            primaryColor={primaryColor}
            sizeClass="w-16 h-16"
          />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  isDirtyRef.current = true;
                  setLogoDataUrl(DEMO_SALON_LOGO);
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Use Studio Emblem
              </button>
              <button
                type="button"
                onClick={() => {
                  isDirtyRef.current = true;
                  setLogoDataUrl(DEMO_BISTRO_LOGO);
                }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Use Bistro Emblem
              </button>
              {logoDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    isDirtyRef.current = true;
                    setLogoDataUrl('');
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Shown in your customer review header, QR center badge, and printable PDF poster.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Business Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                isDirtyRef.current = true;
                setName(e.target.value);
              }}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => {
                isDirtyRef.current = true;
                setCategory(e.target.value as BusinessCategory);
              }}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
            >
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Customer Review Slug
            </label>
            <div className="flex items-center h-10 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <span className="px-2.5 text-xs font-mono text-slate-500 border-r border-slate-200">
                /review/
              </span>
              <input
                type="text"
                value={slug}
                disabled={!canEditSlug}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                }}
                className="flex-1 h-full px-2.5 text-sm font-mono bg-white focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
              />
            </div>
            {!canEditSlug && (
              <p className="mt-1 text-[11px] text-slate-500">
                Public URL slugs can only be renamed by Business Management or the original owner.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Google Business Profile Review Link
            </label>
            <input
              type="url"
              value={googleReviewUrl}
              onChange={(e) => {
                isDirtyRef.current = true;
                setGoogleReviewUrl(e.target.value);
              }}
              placeholder="https://g.page/r/YOUR_PLACE_ID/review"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                isDirtyRef.current = true;
                setPhone(e.target.value);
              }}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => {
                isDirtyRef.current = true;
                setContactEmail(e.target.value);
              }}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Owner Name (Optional)
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => {
                isDirtyRef.current = true;
                setOwnerName(e.target.value);
              }}
              placeholder="e.g., Rahul"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Used only if a customer explicitly says they interacted with them.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Locality / Area
            </label>
            <input
              type="text"
              value={locality}
              onChange={(e) => {
                isDirtyRef.current = true;
                setLocality(e.target.value);
              }}
              placeholder="e.g., Andheri West, Vashi"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => {
                isDirtyRef.current = true;
                setCity(e.target.value);
              }}
              placeholder="e.g., Mumbai"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Complete Business Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => {
              isDirtyRef.current = true;
              setAddress(e.target.value);
            }}
            placeholder="Full shop address for accurate local context"
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
          />
        </div>

        {/* Services & Products Offered + Business Context */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Services Offered ({servicesOffered.length}/15)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {servicesOffered.map((svc) => (
                <span
                  key={svc}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-medium text-slate-800"
                >
                  <span>{svc}</span>
                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setServicesOffered((prev) => prev.filter((item) => item !== svc));
                    }}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={`Remove service ${svc}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddServiceTag();
                  }
                }}
                placeholder="e.g., Haircut, Keratin Treatment..."
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs"
              />
              <button
                type="button"
                onClick={handleAddServiceTag}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Products Offered ({productsOffered.length}/15)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {productsOffered.map((prod) => (
                <span
                  key={prod}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-medium text-slate-800"
                >
                  <span>{prod}</span>
                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setProductsOffered((prev) => prev.filter((item) => item !== prod));
                    }}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={`Remove product ${prod}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProduct}
                onChange={(e) => setNewProduct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProductTag();
                  }
                }}
                placeholder="e.g., Botanical Hair Serum..."
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs"
              />
              <button
                type="button"
                onClick={handleAddProductTag}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Important Business Information &amp; Identity Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={businessHighlights}
            onChange={(e) => {
              isDirtyRef.current = true;
              setBusinessHighlights(e.target.value.slice(0, 500));
            }}
            placeholder="Specialties, hygiene standards, walk-in hours, or helpful context for AI grounding (never fabricated if customer doesn't experience it)..."
            className="w-full p-3 rounded-lg border border-slate-200 text-sm resize-y"
          />
        </div>
      </div>

      {/* Customer QR Experience Mode Switcher */}
      {sectionMode === 'all' && (
      <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Customer QR Review Experience
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Choose whether scanning your QR shows 5+ instant tailored AI drafts or guided feedback questions first.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              packageTier === 'standard'
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-teal-100 text-teal-800'
            }`}
          >
            {packageTier === 'standard'
              ? '₹3,000 Standard Plan · English Only'
              : '₹4,000 Standard Plus · EN / HI / MR / Hinglish'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!canSwitchFlowMode}
            onClick={() => {
              isDirtyRef.current = true;
              setReviewFlowMode('ai_drafted_instant');
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              reviewFlowMode === 'ai_drafted_instant'
                ? 'border-teal-700 bg-teal-50/70 ring-1 ring-teal-700'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-bold text-slate-900">
              Instant AI-Drafted Reviews (5+ Options → Google)
            </p>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              {packageTier === 'standard'
                ? 'Guests see at least 5 tailored English drafts right away, can edit if they like, copy, and post directly on Google.'
                : 'Guests pick any language (English, Hindi, Marathi, Hinglish), choose from 5+ tailored drafts, and post directly on Google.'}
            </p>
          </button>

          <button
            type="button"
            disabled={!canSwitchFlowMode}
            onClick={() => {
              isDirtyRef.current = true;
              setReviewFlowMode('guided_questions');
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              reviewFlowMode === 'guided_questions'
                ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-bold text-slate-900">
              Guided Questions Mode (Questions → AI Draft)
            </p>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Guests tap answers to quick feedback questions first, then AI generates a personalized review from their experience.
            </p>
          </button>
        </div>

        {!canSwitchFlowMode && (
          <p className="text-xs text-slate-500">
            Mode switching is managed by Business Management permissions for your account.
          </p>
        )}
      </div>
      )}

      {/* Contextual SEO Keyword Engine */}
      <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Contextual SEO Keyword Engine
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  packageTier === 'standard'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-teal-100 text-teal-800'
                }`}
              >
                {packageTier === 'standard'
                  ? '₹3,000 Plan · English SEO Only'
                  : '₹4,000 Plan · EN / HI / MR / Hinglish SEO'}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Built from {name || business.name}, {category}, {locality || city || 'your locality'}, and services. Kept authentic without forced hype words like &quot;best&quot;, &quot;top-rated&quot;, or &quot;#1&quot;.
            </p>
          </div>
          <button
            type="button"
            disabled={isGeneratingKeywords || !name.trim()}
            onClick={handleRegenerateKeywords}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isGeneratingKeywords ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            )}
            <span>{isGeneratingKeywords ? 'Generating...' : 'Generate Contextual SEO'}</span>
          </button>
        </div>

        {/* Package-gated language tabs for SEO suggestions */}
        <div className="flex flex-wrap items-center gap-2">
          {LANGUAGE_TABS.filter((tab) => allowedLanguages.includes(tab.id)).map((tab) => {
            const active = activeSeoLang === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSeoLang(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          {packageTier === 'standard' && (
            <span className="text-xs text-slate-500 ml-1">
              Upgrade to Standard Plus in Business Management for Hindi, Marathi &amp; Hinglish SEO suggestions.
            </span>
          )}
        </div>

        {seoNotice && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
            {seoNotice}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {activeSeoList.length === 0 ? (
            <p className="text-xs text-slate-500">
              No keywords set for {activeSeoLang.toUpperCase()} yet. Click &quot;Generate Contextual SEO&quot; or add phrases below.
            </p>
          ) : (
            activeSeoList.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label={`Remove ${kw}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 max-w-md">
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
            placeholder={`Add authentic ${activeSeoLang.toUpperCase()} search keyword...`}
            className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
          />
          <button
            type="button"
            onClick={handleAddKeyword}
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Isolated Real Customer Review Learning Library */}
      <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-700 shrink-0" />
              <h2 className="font-display text-lg font-bold text-slate-900">
                Real Customer Review Writing Library ({referenceReviews.length}/25)
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              Isolated strictly to <span className="font-semibold text-slate-800">{name || business.name}</span>. AI studies natural sentence rhythm, everyday vocabulary, and conversational tone — never copying sentences verbatim.
            </p>
          </div>

          {starterRefsAvailable.length > 0 && (
            <button
              type="button"
              onClick={handleLoadStarterDataset}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
              <span>Import Curated {category} Dataset</span>
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-800">
              Distilled {LANGUAGE_TABS.find((t) => t.id === refLanguage)?.label} Style Profile
            </span>
            <span className="text-slate-500">
              {styleSummary.sampleCount} reference sample(s) · Avg {styleSummary.avgWordsPerSentence} words/sentence
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Style traits:{' '}
            <span className="font-medium text-slate-800">
              {styleSummary.toneTraits.join(' · ')}
            </span>
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Review Language
              </label>
              <select
                value={refLanguage}
                onChange={(e) => setRefLanguage(e.target.value as ReviewLanguage)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
              >
                {LANGUAGE_TABS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Experience Sentiment
              </label>
              <select
                value={refSentiment}
                onChange={(e) =>
                  setRefSentiment(e.target.value as ReferenceReviewItem['sentiment'])
                }
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
              >
                <option value="positive">Positive</option>
                <option value="neutral">Neutral / Mixed</option>
                <option value="negative">Negative / Critical</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              rows={2}
              value={refText}
              onChange={(e) => setRefText(e.target.value.slice(0, 500))}
              placeholder="Paste a real customer review in this language (min 10 characters) to teach conversational tone..."
              className="flex-1 p-3 rounded-lg border border-slate-200 text-xs resize-y"
            />
            <button
              type="button"
              onClick={handleAddReferenceReview}
              disabled={refText.trim().length < 10 || referenceReviews.length >= 25}
              className="sm:w-32 min-h-[40px] px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Sample</span>
            </button>
          </div>
        </div>

        {referenceReviews.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {referenceReviews.map((ref) => (
              <div
                key={ref.id}
                className="rounded-xl border border-slate-200 bg-white p-3 flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-700 uppercase">
                      {ref.language}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 font-semibold text-teal-800 capitalize">
                      {ref.sentiment}
                    </span>
                    {ref.source && (
                      <span className="text-slate-400 truncate">{ref.source}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{ref.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    isDirtyRef.current = true;
                    setReferenceReviews((prev) => prev.filter((item) => item.id !== ref.id));
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                  aria-label="Remove reference review"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Experience Branding */}
      {sectionMode === 'all' && (
        <>
      <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Customer Form Branding &amp; Messaging
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Customize colors, welcome prompt, thank-you message, and default AI review style.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Primary Color
            </label>
            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : '#0F766E'}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setPrimaryColor(e.target.value);
                }}
                className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setPrimaryColor(e.target.value);
                }}
                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Secondary Heading Color
            </label>
            <div className="flex items-center gap-2.5">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(secondaryColor) ? secondaryColor : '#0F172A'}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setSecondaryColor(e.target.value);
                }}
                className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setSecondaryColor(e.target.value);
                }}
                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Default Review Style
            </label>
            <select
              value={defaultReviewStyle}
              onChange={(e) => {
                isDirtyRef.current = true;
                setDefaultReviewStyle(e.target.value as ReviewStyle);
              }}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="short">Short &amp; Simple</option>
              <option value="detailed">Natural &amp; Detailed</option>
              <option value="professional">Professional</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Welcome Message
            </label>
            <textarea
              rows={3}
              maxLength={240}
              value={welcomeMessage}
              onChange={(e) => {
                isDirtyRef.current = true;
                setWelcomeMessage(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Thank-You Message
            </label>
            <textarea
              rows={3}
              maxLength={240}
              value={thankYouMessage}
              onChange={(e) => {
                isDirtyRef.current = true;
                setThankYouMessage(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Delete Business */}
      <div className="liquid-glass spatial-card-3d rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Remove Business Profile</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Permanently deletes {business.name} and deactivates /review/{business.slug}.
          </p>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Business</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteBusiness}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Delete</span>
            </button>
          </div>
        )}
      </div>
        </>
      )}
    </form>
  );
}
