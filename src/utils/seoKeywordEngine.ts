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
    if (lower.includes('clothing') || lower.includes('apparel')) return 'कपड़ों की दुकान';
    if (lower.includes('jewelry') || lower.includes('gold')) return 'ज्वेलरी और सोने की दुकान';
    if (lower.includes('local shop') || lower.includes('retail')) return 'स्थानीय दुकान';
    if (lower.includes('restaurant')) return 'रेस्टोरेंट';
    if (lower.includes('hotel')) return 'होटल';
    if (lower.includes('spa')) return 'स्पा';
    if (lower.includes('gym')) return 'जिम';
    if (lower.includes('health')) return 'क्लिनिक';
    if (lower.includes('auto')) return 'ऑटो सर्विस सेंटर';
    return category;
  }
  if (language === 'mr') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'सलून';
    if (lower.includes('clothing') || lower.includes('apparel')) return 'कपड्यांचे दुकान';
    if (lower.includes('jewelry') || lower.includes('gold')) return 'सोन्याचे व दागिन्यांचे दुकान';
    if (lower.includes('local shop') || lower.includes('retail')) return 'स्थानिक दुकान';
    if (lower.includes('restaurant')) return 'रेस्टॉरंट';
    if (lower.includes('hotel')) return 'हॉटेल';
    if (lower.includes('spa')) return 'स्पा';
    if (lower.includes('gym')) return 'जिम';
    if (lower.includes('health')) return 'क्लिनिक';
    if (lower.includes('auto')) return 'ऑटो सर्व्हिस सेंटर';
    return category;
  }
  if (language === 'hinglish') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'hair aur grooming dukaan';
    if (lower.includes('clothing') || lower.includes('apparel')) return 'kapde ki dukaan';
    if (lower.includes('jewelry') || lower.includes('gold')) return 'sone chandi ki dukaan';
    if (lower.includes('local shop') || lower.includes('retail')) return 'local dukaan';
    if (lower.includes('restaurant')) return 'khane ki jagah';
    if (lower.includes('hotel')) return 'hotel aur thikana';
    if (lower.includes('spa')) return 'aaram aur spa jagah';
    if (lower.includes('gym')) return 'kasrat aur fitness jagah';
    if (lower.includes('health')) return 'doctor aur jaanch seva';
    if (lower.includes('auto')) return 'gaadi servicing dukaan';
    return 'bharosemand dukaan';
  }
  if (lower.includes('hair salon')) return 'hair salon';
  if (lower.includes('beauty salon')) return 'beauty salon';
  if (lower.includes('clothing') || lower.includes('apparel')) return 'clothing store';
  if (lower.includes('jewelry') || lower.includes('gold')) return 'gold jewellery shop';
  if (lower.includes('local shop')) return 'local shop';
  if (lower.includes('restaurant')) return 'restaurant';
  if (lower.includes('hotel')) return 'hotel';
  if (lower.includes('automobile')) return 'auto service center';
  return category.toLowerCase().replace(/s$/, '');
}

const HINGLISH_CATEGORY_PHRASES: Record<string, string[]> = {
  salon: [
    'baal katwane ki acchi jagah',
    'saaf-suthra salon aur staff',
    'sahi daam mein haircut',
    'aaramdayak grooming seva',
  ],
  clothing: [
    'kapde ki bharosemand dukaan',
    'shaadi aur tyohaar ke kapde',
    'accha kapda aur sahi fitting',
    'sahi daam mein naye kapde',
  ],
  jewelry: [
    'sone chandi ke shuddh gehne',
    'hallmark gehno ki dukaan',
    'naye sone ke design',
    'bharosemand jeweller aur saaf hisab',
  ],
  shop: [
    'rozana zarurat ki acchi dukaan',
    'bharosemand local dukaan',
    'sahi daam aur taaza samaan',
    'parivar ke liye acchi dukaan',
  ],
  restaurant: [
    'taza aur swadisht khana',
    'parivar ke sath khane ki jagah',
    'tezi aur achhi sewa',
    'saaf-suthra khana aur mahaul',
  ],
  generic: [
    'bharosemand sewa aur staff',
    'sahi daam mein accha kaam',
    'saaf jagah aur badhiya bartaav',
    'samay par kaam aur madad',
  ],
};

function getHinglishPhrasePool(category: string): string[] {
  const lower = category.toLowerCase();
  if (lower.includes('salon') || lower.includes('beauty') || lower.includes('spa')) {
    return HINGLISH_CATEGORY_PHRASES.salon;
  }
  if (lower.includes('clothing') || lower.includes('apparel')) {
    return HINGLISH_CATEGORY_PHRASES.clothing;
  }
  if (lower.includes('jewelry') || lower.includes('gold')) {
    return HINGLISH_CATEGORY_PHRASES.jewelry;
  }
  if (lower.includes('shop') || lower.includes('retail') || lower.includes('store')) {
    return HINGLISH_CATEGORY_PHRASES.shop;
  }
  if (lower.includes('restaurant')) {
    return HINGLISH_CATEGORY_PHRASES.restaurant;
  }
  return HINGLISH_CATEGORY_PHRASES.generic;
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

    if (lang === 'en') {
      if (input.businessName.trim()) {
        candidates.push(input.businessName.trim());
      }
      if (primaryArea) {
        candidates.push(tpl.inArea(noun, primaryArea));
      }
      if (secondaryArea) {
        candidates.push(tpl.inArea(noun, secondaryArea));
      }
      for (const s of services) {
        candidates.push(primaryArea ? `${s} ${primaryArea}` : s);
      }
      for (const p of products) {
        candidates.push(p);
      }
      candidates.push(...baseDefaults);
    } else if (lang === 'hinglish') {
      if (primaryArea) {
        candidates.push(`${primaryArea} mein ${noun}`);
        candidates.push(`${primaryArea} ki bharosemand dukaan`);
      }
      if (secondaryArea) {
        candidates.push(`${secondaryArea} mein ${noun}`);
      }
      candidates.push(...getHinglishPhrasePool(String(input.category || '')));
      for (const s of services.slice(0, 3)) {
        candidates.push(primaryArea ? `${primaryArea} mein ${s} sewa` : `accha ${s} kaam`);
      }
      if (input.businessName.trim()) {
        candidates.push(
          primaryArea
            ? `${input.businessName.trim()} ${primaryArea} mein`
            : `${input.businessName.trim()} bharosemand`,
        );
      }
    } else {
      if (input.businessName.trim()) {
        candidates.push(input.businessName.trim());
      }
      if (primaryArea) {
        candidates.push(tpl.inArea(noun, primaryArea));
      }
      if (secondaryArea) {
        candidates.push(tpl.inArea(noun, secondaryArea));
      }
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
