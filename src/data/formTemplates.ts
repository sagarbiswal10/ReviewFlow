import type { FeedbackQuestion, FormTemplateId } from '../types';

export type TemplateCategoryFilter = 'all' | 'new' | 'light' | 'dark' | 'compact';

export interface FormTemplateDefinition {
  id: FormTemplateId;
  name: string;
  subtitle: string;
  description: string;
  toneTag: 'Light' | 'Dark' | 'Editorial' | 'Compact';
  bestFor: string;
  isNew: boolean;
  accentHex: string;
  surfaceHex: string;
}

export const FORM_TEMPLATES: FormTemplateDefinition[] = [
  {
    id: 'emoji_checklist_light',
    name: 'Pulse Light · Emoji & Checklist',
    subtitle: 'Mobile-first bright card with expressive emoji faces & crisp check rows',
    description:
      'Turns your rating question into 5 interactive emoji faces and renders every feedback point in a clean checklist with circular green checkmarks.',
    toneTag: 'Light',
    bestFor: 'Restaurants, Cafes, Salons & Delivery',
    isNew: true,
    accentHex: '#2563EB',
    surfaceHex: '#FFFFFF',
  },
  {
    id: 'emoji_checklist_dark',
    name: 'Midnight Studio · Dark UI',
    subtitle: 'High-contrast deep navy card with illuminated emoji ring & dark checklist',
    description:
      'Designed for evening dining, lounges, gyms, and luxury studios. Maps all existing business questions cleanly onto a sleek dark canvas.',
    toneTag: 'Dark',
    bestFor: 'Spas, Gyms, Lounges & Boutiques',
    isNew: true,
    accentHex: '#3B82F6',
    surfaceHex: '#0B1221',
  },
  {
    id: 'warm_editorial',
    name: 'Warm Hospitality · Editorial',
    subtitle: 'Soft linen paper aesthetic with numbered steps & serene pacing',
    description:
      'Calm warm-ivory layout with numbered sections and inviting typography tailored for wellness, hospitality, and boutique studios.',
    toneTag: 'Editorial',
    bestFor: 'Hotels, Resorts, Spas & Clinics',
    isNew: true,
    accentHex: '#B45309',
    surfaceHex: '#FAF7F2',
  },
  {
    id: 'split_executive',
    name: 'Executive Grid · Structured',
    subtitle: 'Clean monochrome architectural frame with 2-column selection tiles',
    description:
      'High-clarity grid tiles that let customers scan and tap multi-choice options rapidly with zero visual noise.',
    toneTag: 'Compact',
    bestFor: 'Healthcare, Auto Service & Retail',
    isNew: true,
    accentHex: '#0F172A',
    surfaceHex: '#F8FAFC',
  },
  {
    id: 'quick_tap_express',
    name: 'Express Check-In · 15-Sec Tap',
    subtitle: 'Compact counter-ready layout built for one-handed speed at billing desks',
    description:
      'Ultra-compact header, expressive star-mood bar, and single-screen flow optimized for quick QR scans right before exit.',
    toneTag: 'Compact',
    bestFor: 'Quick-Service Counter & Walk-In Desks',
    isNew: true,
    accentHex: '#0F766E',
    surfaceHex: '#F0FDFA',
  },
  {
    id: 'classic_cards',
    name: 'Classic Clean Cards',
    subtitle: 'Original ReviewFlow card layout with pill selections & brand header',
    description:
      'Standard trusted card-by-card feedback layout preserving full question prompts and multi-button chips.',
    toneTag: 'Light',
    bestFor: 'All Business Categories',
    isNew: false,
    accentHex: '#0F766E',
    surfaceHex: '#F8FAFC',
  },
];

export function getFormTemplateById(id?: FormTemplateId | null): FormTemplateDefinition {
  return (
    FORM_TEMPLATES.find((t) => t.id === id) ??
    FORM_TEMPLATES.find((t) => t.id === 'classic_cards')!
  );
}

export interface EmojiFaceOption {
  emoji: string;
  shortLabel: string;
  optionValue: string;
  sentimentRank: number; // 1 = lowest, 5 = highest
}

const NEGATIVE_KEYWORDS = ['poor', 'bad', 'worst', 'needs improvement', 'disappointed', 'unhappy', 'slow', 'terrible'];
const LOW_MID_KEYWORDS = ['okay', 'fair', 'below', 'not good', 'mixed'];
const NEUTRAL_KEYWORDS = ['average', 'fine', 'neutral', 'decent', 'normal', 'maybe'];
const GOOD_KEYWORDS = ['good', 'very good', 'nice', 'happy', 'satisfied', 'yes', 'great', 'pleasant'];
const AWESOME_KEYWORDS = ['excellent', 'awesome', 'amazing', 'outstanding', 'loved', 'fantastic', 'perfect', 'wonderful'];

function matchesAnyKeyword(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

export function isExperienceRatingQuestion(question: FeedbackQuestion): boolean {
  if (question.type !== 'single' || question.options.length < 2 || question.options.length > 6) {
    return false;
  }
  const promptLower = question.prompt.toLowerCase();
  if (
    question.id === 'q-experience' ||
    promptLower.includes('experience') ||
    promptLower.includes('rate') ||
    promptLower.includes('how was') ||
    promptLower.includes('how did') ||
    promptLower.includes('satisfied') ||
    promptLower.includes('relaxing') ||
    promptLower.includes('work quality') ||
    promptLower.includes('overall care')
  ) {
    return true;
  }
  const hasSentimentOptions = question.options.some(
    (opt) => matchesAnyKeyword(opt, AWESOME_KEYWORDS) || matchesAnyKeyword(opt, NEUTRAL_KEYWORDS),
  );
  return hasSentimentOptions;
}

const FIVE_FACES_META: { emoji: string; defaultLabel: string }[] = [
  { emoji: '😠', defaultLabel: 'Poor' },
  { emoji: '🙁', defaultLabel: 'Needs work' },
  { emoji: '😐', defaultLabel: 'Okay' },
  { emoji: '🙂', defaultLabel: 'Good!' },
  { emoji: '😍', defaultLabel: 'Awesome!' },
];

/**
 * Maps any existing business rating question options (e.g.
 * ['Excellent', 'Very Good', 'Good', 'Average', 'Needs Improvement'] or 3-option scales)
 * cleanly onto the 5 expressive emoji faces from lowest (left) -> highest (right),
 * preserving the exact underlying `optionValue` so AI prompts & analytics stay 100% consistent.
 */
export function mapOptionsToFiveFaces(options: string[]): EmojiFaceOption[] {
  const cleanOptions = options.filter(Boolean);
  if (cleanOptions.length === 0) {
    return FIVE_FACES_META.map((face, idx) => ({
      emoji: face.emoji,
      shortLabel: face.defaultLabel,
      optionValue: face.defaultLabel.replace('!', ''),
      sentimentRank: idx + 1,
    }));
  }

  // Detect whether options are authored best-first (ReviewFlow default) vs worst-first
  const firstOpt = cleanOptions[0];
  const lastOpt = cleanOptions[cleanOptions.length - 1];
  const firstIsBest =
    matchesAnyKeyword(firstOpt, AWESOME_KEYWORDS) ||
    matchesAnyKeyword(firstOpt, GOOD_KEYWORDS);
  const lastIsWorstOrMid =
    matchesAnyKeyword(lastOpt, NEGATIVE_KEYWORDS) ||
    matchesAnyKeyword(lastOpt, LOW_MID_KEYWORDS) ||
    matchesAnyKeyword(lastOpt, NEUTRAL_KEYWORDS);

  const orderedWorstToBest =
    firstIsBest && (lastIsWorstOrMid || !matchesAnyKeyword(lastOpt, AWESOME_KEYWORDS))
      ? [...cleanOptions].reverse()
      : [...cleanOptions];

  return FIVE_FACES_META.map((face, idx) => {
    const mappedIdx = Math.min(
      orderedWorstToBest.length - 1,
      Math.round((idx / (FIVE_FACES_META.length - 1)) * (orderedWorstToBest.length - 1)),
    );
    const actualOption = orderedWorstToBest[mappedIdx] || face.defaultLabel;
    return {
      emoji: face.emoji,
      shortLabel: actualOption.length <= 16 ? actualOption : face.defaultLabel,
      optionValue: actualOption,
      sentimentRank: idx + 1,
    };
  });
}

export interface ClassifiedTemplateQuestions {
  ratingQuestion: FeedbackQuestion | null;
  checklistQuestions: FeedbackQuestion[];
  textQuestions: FeedbackQuestion[];
}

/**
 * Dynamically partitions any business's existing questions into Rating, Checklist/Selection,
 * and Comment sections without discarding a single custom question.
 */
export function classifyQuestionsForTemplate(
  questions: FeedbackQuestion[],
): ClassifiedTemplateQuestions {
  const textQuestions = questions.filter((q) => q.type === 'text');
  const nonText = questions.filter((q) => q.type !== 'text');

  const ratingQuestion =
    nonText.find((q) => q.id === 'q-experience' && isExperienceRatingQuestion(q)) ??
    nonText.find((q) => isExperienceRatingQuestion(q)) ??
    null;

  const checklistQuestions = nonText.filter((q) => q !== ratingQuestion);

  return {
    ratingQuestion,
    checklistQuestions,
    textQuestions,
  };
}
