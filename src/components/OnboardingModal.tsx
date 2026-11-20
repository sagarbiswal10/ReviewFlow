import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  BUSINESS_CATEGORIES,
  type BusinessCategory,
  type BusinessProvisioningSummary,
} from '../types';
import {
  createCategoryQuestions,
  DEMO_BISTRO_LOGO,
  DEMO_SALON_LOGO,
} from '../data/categoryPresets';
import {
  createBusiness,
  fetchAutoSeoKeywords,
  generateRandomToken,
  sanitizeSlug,
} from '../services/businessService';
import {
  connectBusinessGeminiKey,
  connectCustomerFirebase,
  fetchProvisioningStatus,
  startProvisioning,
  validateGeminiKey,
} from '../services/infrastructureService';
import { compressLogoFile } from '../utils/qrAndPdf';
import { BusinessLogo } from './BusinessLogo';

interface OnboardingModalProps {
  ownerId: string;
  userEmail: string;
  isAdmin?: boolean;
  canClose: boolean;
  onClose: () => void;
  onCreated: (businessId: string) => void;
}

type OnboardingStep = 1 | 2 | 3 | 4;

export function OnboardingModal({
  ownerId,
  userEmail,
  isAdmin = false,
  canClose,
  onClose,
  onCreated,
}: OnboardingModalProps) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [createdBusinessId, setCreatedBusinessId] = useState<string | null>(null);

  // Step 1: Business Registration Fields
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState<BusinessCategory>('Hair Salons');
  const [clientEmail, setClientEmail] = useState(isAdmin ? '' : userEmail);
  const [clientAccessLevel, setClientAccessLevel] = useState<'read_only' | 'qr_and_questions' | 'full'>('full');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(userEmail);
  const [website, setWebsite] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0F766E');
  const [seoKeywords, setSeoKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [keywordsTouched, setKeywordsTouched] = useState(false);
  const lastAutoKeyRef = useRef('');

  // Step 2: Dedicated Firebase Provisioning State
  const [fbMode, setFbMode] = useState<'automated' | 'customer_owned'>('automated');
  const [region, setRegion] = useState('asia-south1');
  const [provisioning, setProvisioning] = useState<BusinessProvisioningSummary | null>(null);
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAppId, setFbAppId] = useState('');
  const [fbDatabaseId, setFbDatabaseId] = useState('(default)');

  // Step 3: Gemini Integration State
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-3.1-flash-lite');
  const [maskedKey, setMaskedKey] = useState('');
  const [aiConnected, setAiConnected] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAutoKeywordGeneration = async (
    targetName: string,
    targetCategory: BusinessCategory,
    targetAddress: string,
  ) => {
    const cleanName = targetName.trim();
    if (cleanName.length < 2) return;
    setIsGeneratingKeywords(true);
    try {
      const generated = await fetchAutoSeoKeywords({
        businessName: cleanName,
        category: targetCategory,
        address: targetAddress,
      });
      setSeoKeywords(generated);
      lastAutoKeyRef.current = `${cleanName.toLowerCase()}|${targetCategory}|${targetAddress.trim().toLowerCase()}`;
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  useEffect(() => {
    const cleanName = name.trim();
    if (cleanName.length < 3 || keywordsTouched) return;
    const signature = `${cleanName.toLowerCase()}|${category}|${address.trim().toLowerCase()}`;
    if (signature === lastAutoKeyRef.current) return;

    const timer = setTimeout(() => {
      runAutoKeywordGeneration(cleanName, category, address);
    }, 650);
    return () => clearTimeout(timer);
  }, [name, category, address, keywordsTouched]);

  // Poll automated provisioning status in Step 2
  useEffect(() => {
    if (
      step !== 2 ||
      !createdBusinessId ||
      !provisioning ||
      ['completed', 'failed', 'not_started'].includes(provisioning.status)
    ) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const res = await fetchProvisioningStatus(createdBusinessId);
        if (res.provisioning) {
          setProvisioning(res.provisioning);
        }
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [step, createdBusinessId, provisioning?.status]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) {
      setSlug(val.trim() ? sanitizeSlug(val) : '');
    }
  };

  const applySamplePreset = (preset: 'salon' | 'restaurant') => {
    setKeywordsTouched(false);
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

  // Step 1 Submit -> Persists Business Registration immediately so data is never lost
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!name.trim() || !ownerName.trim() || !contactEmail.trim()) {
      setError('Business Name, Owner Name, and Email Address are required.');
      return;
    }

    if (createdBusinessId) {
      setStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      let finalKeywords = seoKeywords;
      if (finalKeywords.length === 0) {
        finalKeywords = await fetchAutoSeoKeywords({
          businessName: name.trim(),
          category,
          address: address.trim(),
        });
      }

      const normalizedSlug = sanitizeSlug(slug || name);
      const businessId = await createBusiness(ownerId, {
        ownerName: ownerName.trim(),
        clientEmail: isAdmin ? clientEmail : userEmail,
        clientAccessLevel: isAdmin ? clientAccessLevel : 'full',
        name: name.trim(),
        slug: normalizedSlug,
        category,
        address: address.trim(),
        phone: phone.trim(),
        contactEmail: contactEmail.trim(),
        website: website.trim(),
        googleReviewUrl: googleReviewUrl.trim() || 'https://www.google.com/maps',
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
        lifecycleStatus: 'provisioning',
      });

      setCreatedBusinessId(businessId);
      setStep(2);

      // Automatically trigger dedicated Firebase database provisioning right after registration
      try {
        const provRes = await startProvisioning({
          businessId,
          businessName: name.trim(),
          region,
        });
        setProvisioning(provRes.provisioning);
        setNotice('Business registered! Automated Firebase database provisioning has started.');
      } catch (provErr) {
        setError(
          provErr instanceof Error
            ? `Registration saved, but auto-provisioning returned: ${provErr.message}`
            : 'Registration saved. You can start or connect Firebase below.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Provisioning Actions
  const handleStartProvision = async () => {
    if (!createdBusinessId) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await startProvisioning({
        businessId: createdBusinessId,
        businessName: name.trim(),
        region,
      });
      setProvisioning(res.provisioning);
      setNotice('Dedicated Firebase provisioning started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start Firebase provisioning.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectCustomerProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdBusinessId) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await connectCustomerFirebase({
        businessId: createdBusinessId,
        region,
        webAppConfig: {
          projectId: fbProjectId.trim(),
          apiKey: fbApiKey.trim(),
          authDomain: `${fbProjectId.trim()}.firebaseapp.com`,
          appId: fbAppId.trim(),
          databaseId: fbDatabaseId.trim() || '(default)',
        },
      });
      setProvisioning(res.provisioning);
      setNotice(`Connected Firebase project "${res.provisioning.projectId}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect Firebase project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Gemini API Integration
  const handleValidateAndSaveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdBusinessId || !geminiApiKey.trim()) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await validateGeminiKey(geminiApiKey.trim(), geminiModel);
      const res = await connectBusinessGeminiKey({
        businessId: createdBusinessId,
        apiKey: geminiApiKey.trim(),
        modelName: geminiModel,
      });
      setMaskedKey(res.ai.maskedKey);
      setAiConnected(true);
      setGeminiApiKey('');
      setNotice(`Gemini API key validated and encrypted (${res.ai.maskedKey}).`);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate Gemini API key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const firebaseReady = provisioning?.status === 'completed';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl p-6 sm:p-8 my-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Business Onboarding &amp; Infrastructure Setup
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              4-step onboarding for automated isolated Firebase provisioning and business-owned Gemini API billing.
            </p>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={() => (createdBusinessId ? onCreated(createdBusinessId) : onClose())}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Stepper Bar */}
        <div className="mt-5 grid grid-cols-4 gap-1.5 border-y border-slate-200 py-3 text-[11px] font-medium">
          {[
            { num: 1, label: '1. Register' },
            { num: 2, label: '2. Firebase DB' },
            { num: 3, label: '3. Gemini AI' },
            { num: 4, label: '4. Activate' },
          ].map((s) => (
            <div
              key={s.num}
              className={`text-center py-1.5 px-1 rounded-lg truncate ${
                step === s.num
                  ? 'bg-slate-900 text-white font-semibold'
                  : step > s.num
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* STEP 1: Registration */}
        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <span className="text-xs font-medium text-slate-500">Quick templates:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applySamplePreset('salon')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                >
                  Stylish Hair Studio
                </button>
                <button
                  type="button"
                  onClick={() => applySamplePreset('restaurant')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                >
                  Mashoor Bistro
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <BusinessLogo
                src={logoDataUrl}
                name={name || 'Business'}
                primaryColor={primaryColor}
                sizeClass="w-14 h-14"
              />
              <div>
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Business Logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., ABC Hair Salon"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Owner Full Name *</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g., Rohan Mehta"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="owner@business.com"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BusinessCategory)}
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Website (Optional)</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://mybusiness.com"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Review URL Slug *</label>
                <div className="flex items-center h-10 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                  <span className="px-2 text-xs font-mono text-slate-500 border-r border-slate-200">/review/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                    }}
                    className="flex-1 h-full px-2 text-sm font-mono bg-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Google Review Link *</label>
                <input
                  type="url"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/.../review"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Business Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address, area, city"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>

            {/* SEO Keywords */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  Auto-Tailored Google Ranking Keywords
                </span>
                <button
                  type="button"
                  disabled={isGeneratingKeywords || name.trim().length < 2}
                  onClick={() => {
                    setKeywordsTouched(false);
                    runAutoKeywordGeneration(name, category, address);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-teal-700" />
                  <span>{isGeneratingKeywords ? 'Generating...' : 'Refresh'}</span>
                </button>
              </div>
              {seoKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {seoKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-200 bg-white text-xs text-slate-700"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setKeywordsTouched(true);
                          setSeoKeywords((prev) => prev.filter((item) => item !== kw));
                        }}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
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
                  placeholder="Add keyword..."
                  className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client Portal Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@business.com"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client Tier</label>
                  <select
                    value={clientAccessLevel}
                    onChange={(e) =>
                      setClientAccessLevel(e.target.value as 'read_only' | 'qr_and_questions' | 'full')
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    <option value="read_only">Read-Only</option>
                    <option value="qr_and_questions">QR &amp; Questions</option>
                    <option value="full">Full Self-Service</option>
                  </select>
                </div>
              </div>
            )}

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</div>}

            <div className="pt-2 flex justify-end gap-3">
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Register &amp; Provision Firebase Database</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Dedicated Firebase Project Setup */}
        {step === 2 && createdBusinessId && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setFbMode('automated')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  fbMode === 'automated' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Automated Provisioning
              </button>
              <button
                type="button"
                onClick={() => setFbMode('customer_owned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  fbMode === 'customer_owned' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Connect Business-Owned Firebase
              </button>
            </div>

            {fbMode === 'automated' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Starts an async job to create an isolated Google Cloud project, add Firebase, initialize Firestore, and deploy security rules. (Note: Automated GCP project creation discloses ReviewFlow project/billing management unless you connect your own Firebase project.)
                </p>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Firestore Region</label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      <option value="asia-south1">asia-south1 (Mumbai)</option>
                      <option value="us-central1">us-central1 (Iowa)</option>
                      <option value="europe-west1">europe-west1 (Belgium)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting || firebaseReady}
                    onClick={handleStartProvision}
                    className="h-9 px-4 rounded-xl bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>{firebaseReady ? 'Provisioned' : 'Provision Firebase Project'}</span>
                  </button>
                  {provisioning?.status === 'failed' && (
                    <button
                      type="button"
                      onClick={handleStartProvision}
                      className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleConnectCustomerProject} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={fbProjectId}
                    onChange={(e) => setFbProjectId(e.target.value)}
                    placeholder="Firebase Project ID *"
                    className="h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={fbApiKey}
                    onChange={(e) => setFbApiKey(e.target.value)}
                    placeholder="Web API Key (AIza...) *"
                    className="h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={fbAppId}
                    onChange={(e) => setFbAppId(e.target.value)}
                    placeholder="Firebase App ID (1:...:web:...) *"
                    className="h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                  />
                  <input
                    type="text"
                    value={fbDatabaseId}
                    onChange={(e) => setFbDatabaseId(e.target.value)}
                    placeholder="Database ID (default)"
                    className="h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 px-4 rounded-xl bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Verify &amp; Link Business Firebase
                </button>
              </form>
            )}

            {provisioning && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-900">
                  Job Status: <span className="font-mono">{provisioning.status}</span>
                </p>
                {provisioning.lastError && <p className="text-red-700">{provisioning.lastError}</p>}
              </div>
            )}

            {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">{notice}</div>}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</div>}

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setError(null);
                  setStep(3);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Continue to Gemini Setup (Complete Firebase Later)
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setError(null);
                  setStep(3);
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-xs font-semibold cursor-pointer"
              >
                Next: Gemini AI Integration
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Business Gemini API Integration */}
        {step === 3 && createdBusinessId && (
          <form onSubmit={handleValidateAndSaveGemini} className="mt-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">Connect Business-Owned Gemini API Key</span>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 font-semibold inline-flex items-center gap-1 underline"
                >
                  <span>aistudio.google.com/apikey</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open Google AI Studio and sign in with this business&apos;s Google account.</li>
                <li>Create/select the business&apos;s Google Cloud project and configure billing.</li>
                <li>Create a Gemini API key, paste it below, and click Validate &amp; Encrypt.</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Gemini API Key</label>
                <input
                  type="password"
                  required
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gemini Model</label>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-4-hydrogen">Gemini 4 Flash</option>
                  <option value="gemini-4-argon">Gemini 4 Pro (Paid)</option>
                </select>
              </div>
            </div>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</div>}

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Skip AI Key for Now
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !geminiApiKey.trim()}
                className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <ShieldCheck className="w-4 h-4" />
                <span>Validate &amp; Save Key Securely</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: Final Activation */}
        {step === 4 && createdBusinessId && (
          <div className="mt-5 space-y-5">
            <div className="rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {name} Registered in ReviewFlow
                  </h3>
                  <p className="text-xs text-slate-600">
                    Your QR link <span className="font-mono">/review/{sanitizeSlug(slug || name)}</span> is saved. Manage infrastructure and retries anytime in Infrastructure &amp; AI.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-slate-500">Business Profile</p>
                  <p className="font-semibold text-emerald-700 mt-0.5">
                    Registered
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-slate-500">Dedicated Firebase</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {firebaseReady ? provisioning?.projectId : provisioning?.status || 'Pending Setup'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-slate-500">Gemini API Key</p>
                  <p className="font-semibold text-slate-900 mt-0.5 flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{aiConnected ? maskedKey : 'Pending Key'}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onCreated(createdBusinessId)}
                className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold cursor-pointer"
              >
                Open Business Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
