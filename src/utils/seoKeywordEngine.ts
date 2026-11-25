import type { BusinessCategory, PackageTier, ReviewLanguage } from '../types';
import { DEFAULT_SEO_KEYWORDS_BY_CATEGORY } from '../data/categoryPresets';
import { sanitizePackageTier } from './domainHelpers';

// Unsupported hype/superlative claims blocked by SEO rules
const DISALLOWED_SUPERLATIVES_REGEX =
  /\b(best|top-rated|top rated|number one|#1|no\.?\s*1|most popular|world class|finest|unmatched)\b/gi;

export interface SeoEngineContextInput {
  businessName: string;
  category: BusinessCategory | string;
  address?: string;
  locality?: string;
  city?: string;
  servicesOffered?: string[];
  productsOffered?: string[];
  businessHighlights?: string;
  packageTier?: PackageTier;
  language?: ReviewLanguage;
}

/**
 * Strips unsupported hype words ("best", "top-rated", "number one", "most popular")
 * and cleans spacing while keeping accurate location & service search terms.
 */
export function sanitizeSeoKeywordPhrase(raw: string): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(DISALLOWED_SUPERLATIVES_REGEX, '')
    .replace(/[#*@]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\-–—\s]+|[,.\-–—\s]+$/g, '')
    .trim()
    .slice(0, 55);
  // Require at least 3 chars so stripping "best" doesn't leave stray junk
  return cleaned.length >= 3 ? cleaned : '';
}

export function sanitizeSeoSuggestionList(items: unknown, max = 12): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const phrase = sanitizeSeoKeywordPhrase(raw);
    const key = phrase.toLowerCase();
    if (phrase && !seen.has(key)) {
      seen.add(key);
      out.push(phrase);
      if (out.length >= max) break;
    }
  }
  return out;
}

const LANGUAGE_LOCAL_TEMPLATES: Record<
  ReviewLanguage,
  {
    inArea: (noun: string, loc: string) => string;
    qualityService: (noun: string) => string;
  }
> = {
  en: {
    inArea: (noun, loc) => `${noun} in ${loc}`,
    qualityService: (noun) => `${noun} service`,
  },
  hi: {
    inArea: (noun, loc) => `${loc} में ${noun}`,
    qualityService: (noun) => `${noun} सेवा`,
  },
  mr: {
    inArea: (noun, loc) => `${loc} मधील ${noun}`,
    qualityService: (noun) => `${noun} सेवा`,
  },
  hinglish: {
    inArea: (noun, loc) => `${loc} mein ${noun}`,
    qualityService: (noun) => `accha ${noun}`,
  },
};

function deriveCategoryNoun(category: string, language: ReviewLanguage): string {
  const lower = category.toLowerCase();
  if (language === 'hi') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'सैलून';
    if (lower.includes('restaurant')) return 'रेस्टोरेंट';
    if (lower.includes('hotel')) return 'होटल';
    if (lower.includes('spa')) return 'स्पा';
    if (lower.includes('gym')) return 'जिम';
    if (lower.includes('health')) return 'क्लिनिक';
    return category;
  }
  if (language === 'mr') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'सलून';
    if (lower.includes('restaurant')) return 'रेस्टॉरंट';
    if (lower.includes('hotel')) return 'हॉटेल';
    if (lower.includes('spa')) return 'स्पा';
    if (lower.includes('gym')) return 'जिम';
    if (lower.includes('health')) return 'क्लिनिक';
    return category;
  }
  if (language === 'hinglish') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'salon';
    if (lower.includes('restaurant')) return 'restaurant';
    if (lower.includes('hotel')) return 'hotel';
    if (lower.includes('spa')) return 'spa';
    if (lower.includes('gym')) return 'gym';
    if (lower.includes('health')) return 'clinic';
    return category.toLowerCase();
  }
  if (lower.includes('hair salon')) return 'hair salon';
  if (lower.includes('beauty salon')) return 'beauty salon';
  if (lower.includes('restaurant')) return 'restaurant';
  if (lower.includes('hotel')) return 'hotel';
  if (lower.includes('automobile')) return 'auto service center';
  return category.toLowerCase().replace(/s$/, '');
}

/**
 * Generates contextual local SEO suggestions deterministically using business identity
 * fields, enforcing package entitlements (STANDARD = English only, STANDARD PLUS = EN/HI/MR/Hinglish)
 * and zero unsupported superlatives.
 */
export function buildContextualSeoSuggestions(
  input: SeoEngineContextInput,
): Partial<Record<ReviewLanguage, string[]>> {
  const tier = sanitizePackageTier(input.packageTier);
  const allowedLangs: ReviewLanguage[] =
    tier === 'standard' ? ['en'] : ['en', 'hi', 'mr', 'hinglish'];

  const locParts = [input.locality?.trim(), input.city?.trim()].filter(
    (v): v is string => Boolean(v && v.length > 0),
  );
  const primaryArea = locParts[0] || '';
  const secondaryArea = locParts[1] || '';

  const services = (input.servicesOffered || [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const products = (input.productsOffered || [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  const baseDefaults =
    DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category as BusinessCategory] ?? [];

  const result: Partial<Record<ReviewLanguage, string[]>> = {};

  for (const lang of allowedLangs) {
    const candidates: string[] = [];
    const noun = deriveCategoryNoun(String(input.category || ''), lang);
    const tpl = LANGUAGE_LOCAL_TEMPLATES[lang];

    if (input.businessName.trim()) {
      candidates.push(input.businessName.trim());
    }
    if (primaryArea) {
      candidates.push(tpl.inArea(noun, primaryArea));
    }
    if (secondaryArea) {
      candidates.push(tpl.inArea(noun, secondaryArea));
    }
    if (lang === 'en') {
      for (const s of services) {
        candidates.push(primaryArea ? `${s} ${primaryArea}` : s);
      }
      for (const p of products) {
        candidates.push(p);
      }
      candidates.push(...baseDefaults);
    } else {
      candidates.push(tpl.qualityService(noun));
      for (const s of services.slice(0, 2)) {
        candidates.push(primaryArea ? `${s} ${primaryArea}` : s);
      }
      if (input.businessName.trim() && primaryArea) {
        candidates.push(`${input.businessName.trim()} ${primaryArea}`);
      }
    }

    result[lang] = sanitizeSeoSuggestionList(candidates, 10);
  }

  return result;
}
