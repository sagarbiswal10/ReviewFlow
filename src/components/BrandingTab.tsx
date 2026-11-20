import { useEffect, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import {
  BUSINESS_CATEGORIES,
  type Business,
  type BusinessCategory,
  type ReviewStyle,
} from '../types';
import {
  DEFAULT_SEO_KEYWORDS_BY_CATEGORY,
  DEMO_BISTRO_LOGO,
  DEMO_SALON_LOGO,
} from '../data/categoryPresets';
import {
  deleteBusiness,
  fetchAutoSeoKeywords,
  sanitizeSlug,
  updateBusiness,
} from '../services/businessService';
import { compressLogoFile } from '../utils/qrAndPdf';
import { BusinessLogo } from './BusinessLogo';

interface BrandingTabProps {
  business: Business;
  isAdmin?: boolean;
  onDeleted: () => void;
}

export function BrandingTab({ business, isAdmin = false, onDeleted }: BrandingTabProps) {
  const [name, setName] = useState(business.name);
  const [category, setCategory] = useState<BusinessCategory>(business.category);
  const [slug, setSlug] = useState(business.slug);
  const [address, setAddress] = useState(business.address);
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
  const [newKeyword, setNewKeyword] = useState('');
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(business.name);
    setCategory(business.category);
    setSlug(business.slug);
    setAddress(business.address);
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
    setNewKeyword('');
    setConfirmDelete(false);
    setError(null);
    setSavedNotice(null);
  }, [business]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressLogoFile(file);
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
      const nextSlug = await updateBusiness(
        business,
        {
          name: name.trim(),
          category,
          slug: sanitizeSlug(slug || name),
          address: address.trim(),
          phone: phone.trim(),
          contactEmail: contactEmail.trim(),
          googleReviewUrl: googleReviewUrl.trim() || 'https://www.google.com/maps',
          logoDataUrl,
          seoKeywords,
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
      setSlug(nextSlug);
      setSavedNotice('Branding, SEO keywords & profile settings saved.');
      setTimeout(() => setSavedNotice(null), 3000);
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
    try {
      const next = await fetchAutoSeoKeywords({
        businessName: name.trim(),
        category,
        address: address.trim(),
      });
      setSeoKeywords(next);
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const handleAddKeyword = () => {
    const clean = newKeyword.trim().slice(0, 60);
    if (!clean) return;
    if (!seoKeywords.some((k) => k.toLowerCase() === clean.toLowerCase())) {
      setSeoKeywords((prev) => [...prev, clean].slice(0, 15));
    }
    setNewKeyword('');
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
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Business Profile &amp; Google Review Link
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Update your public URL slug, contact details, and Google Business Profile link.
            </p>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>Save Changes</span>
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
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setLogoDataUrl(DEMO_SALON_LOGO)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Use Studio Emblem
              </button>
              <button
                type="button"
                onClick={() => setLogoDataUrl(DEMO_BISTRO_LOGO)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Use Bistro Emblem
              </button>
              {logoDataUrl && (
                <button
                  type="button"
                  onClick={() => setLogoDataUrl('')}
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
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Category
            </label>
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
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
                className="flex-1 h-full px-2.5 text-sm font-mono bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Google Business Profile Review Link
            </label>
            <input
              type="url"
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
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
              onChange={(e) => setPhone(e.target.value)}
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
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Business Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
          />
        </div>
      </div>

      {/* Google Search Ranking SEO Keywords */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Google Search Ranking Keywords
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Automatically generated from {name || business.name} and {category}. AI customer reviews weave these terms in naturally so your business ranks higher for local searches.
            </p>
          </div>
          <button
            type="button"
            disabled={isGeneratingKeywords || !name.trim()}
            onClick={handleRegenerateKeywords}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            {isGeneratingKeywords ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            )}
            <span>{isGeneratingKeywords ? 'Generating...' : 'Auto-Generate from Name & Category'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {seoKeywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
            >
              <span>{kw}</span>
              <button
                type="button"
                onClick={() => setSeoKeywords((prev) => prev.filter((item) => item !== kw))}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={`Remove ${kw}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
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
            placeholder="Add custom search keyword..."
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

      {/* Customer Experience Branding */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
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
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
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
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
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
              onChange={(e) => setDefaultReviewStyle(e.target.value as ReviewStyle)}
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
              onChange={(e) => setWelcomeMessage(e.target.value)}
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
              onChange={(e) => setThankYouMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Delete Business */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
    </form>
  );
}
