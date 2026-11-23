export type QualityReviewLanguage = 'en' | 'hi' | 'mr' | 'hinglish';

export type QualityIssueType =
  | 'invented_claim'
  | 'contradiction'
  | 'repetition'
  | 'script_mismatch'
  | 'ai_cliche'
  | 'empty_output';

export interface QualityIssue {
  type: QualityIssueType;
  severity: 'error' | 'warning';
  message: string;
  evidence?: string;
}

export interface ReviewQualityReport {
  score: number;
  passed: boolean;
  language: QualityReviewLanguage;
  inventedClaimCount: number;
  contradictionCount: number;
  repetitionCount: number;
  scriptCompliant: boolean;
  clicheCount: number;
  groundedFactCount: number;
  autoRepaired: boolean;
  issues: QualityIssue[];
}

export interface QualityValidationInput {
  reviewText: string;
  language: QualityReviewLanguage;
  businessName?: string;
  category?: string;
  responses: Array<{ question: string; answers: string[] }>;
  additionalComments?: string;
  previousDrafts?: string[];
  autoRepaired?: boolean;
}

const DEVANAGARI_REGEX = /[\u0900-\u097F]/g;
const LATIN_WORD_REGEX = /[A-Za-z]+/g;

const BANNED_AI_CLICHES = [
  'absolutely amazing experience',
  'amazing experience',
  'truly amazing',
  'exceptional hospitality',
  'outstanding hospitality',
  'exceptional service',
  'outstanding service',
  'exceeded all expectations',
  'exceeded my expectations',
  'beyond expectations',
  'hidden gem',
  'must-visit',
  'must visit',
  'cannot recommend enough',
  'can not recommend enough',
  'top-notch',
  'top notch',
  'world-class',
  'seamless experience',
  'truly unforgettable',
  'unforgettable experience',
  'everything was perfect',
  'zero complaints',
  'no complaints at all',
];

const UNGROUNDED_SPECIFIC_TERMS = [
  'biryani',
  'paneer',
  'butter chicken',
  'pasta',
  'pizza',
  'burger',
  'coffee',
  'latte',
  'dessert',
  'haircut',
  'keratin',
  'balayage',
  'manicure',
  'pedicure',
  'facial',
  'massage',
  'sauna',
  'parking',
  'valet',
  'wifi',
  'wi-fi',
  'delivery',
  'wheelchair',
  'discount',
  'coupon',
];

const MONEY_CLAIM_PATTERNS = [
  /₹\s*\d+/i,
  /\$\s*\d+/i,
  /\brs\.?\s*\d+/i,
  /\brupees\b/i,
  /\bcheap\b/i,
  /\boverpriced\b/i,
  /\bpaisa vasool\b/i,
  /\baffordable\b/i,
  /\bworth the price\b/i,
  /\bworth every penny\b/i,
];

const HINGLISH_ROMAN_MARKERS = [
  'tha',
  'thi',
  'hai',
  'hain',
  'raha',
  'rahi',
  'aur',
  'bhi',
  'kaafi',
  'kafi',
  'bahut',
  'bohot',
  'accha',
  'acha',
  'badhiya',
  'badiya',
  'theek',
  'thik',
  'dobara',
  'zaroor',
  'zarur',
  'pasand',
  'karunga',
  'karungi',
  'aayenge',
  'ayenge',
  'yahan',
  'yaha',
  'thoda',
  'thodi',
  'lekin',
  'zyada',
  'jyada',
  'sab',
  'ekdum',
  'bilkul',
  'nahi',
  'nahin',
];

const POSITIVE_INPUT_CUES = [
  'excellent',
  'very good',
  'great',
  'good',
  'quick',
  'fast',
  'friendly',
  'helpful',
  'clean',
  'spotless',
  'fresh',
  'flavorful',
  'warm',
  'courteous',
  'skilled',
  'yes',
  'definitely',
];

const NEGATIVE_OR_MIXED_INPUT_CUES = [
  'poor',
  'bad',
  'slow',
  'average',
  'okay',
  'ok',
  'delayed',
  'wait',
  'long',
  'rude',
  'cold',
  'noisy',
  'crowded',
  'expensive',
  'underwhelming',
  'could be better',
  'needs improvement',
];

function tokenizeNormalized(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeNormalized(a));
  const setB = new Set(tokenizeNormalized(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function validateReviewQuality(input: QualityValidationInput): ReviewQualityReport {
  const reviewText = (input.reviewText || '').trim();
  const language = input.language || 'en';
  const issues: QualityIssue[] = [];

  if (!reviewText) {
    return {
      score: 0,
      passed: false,
      language,
      inventedClaimCount: 0,
      contradictionCount: 0,
      repetitionCount: 0,
      scriptCompliant: false,
      clicheCount: 0,
      groundedFactCount: 0,
      autoRepaired: Boolean(input.autoRepaired),
      issues: [
        {
          type: 'empty_output',
          severity: 'error',
          message: 'Generated review text is empty.',
        },
      ],
    };
  }

  const lowerReview = reviewText.toLowerCase();
  const inputChunks: string[] = [];
  for (const r of input.responses || []) {
    if (r?.question) inputChunks.push(r.question);
    if (Array.isArray(r?.answers)) inputChunks.push(...r.answers);
  }
  if (input.additionalComments) inputChunks.push(input.additionalComments);
  const userFactsCorpus = inputChunks.join(' ').toLowerCase();
  const fullContextCorpus = `${userFactsCorpus} ${(input.businessName || '').toLowerCase()} ${(input.category || '').toLowerCase()}`;

  // 1. Grounded fact count
  const groundedFacts = new Set<string>();
  for (const r of input.responses || []) {
    for (const ans of r.answers || []) {
      const words = tokenizeNormalized(ans).filter((w) => w.length >= 3);
      if (words.some((w) => lowerReview.includes(w))) {
        groundedFacts.add(ans.trim());
      }
    }
  }
  if (input.additionalComments && input.additionalComments.trim().length > 2) {
    const commentWords = tokenizeNormalized(input.additionalComments).filter((w) => w.length >= 4);
    if (commentWords.some((w) => lowerReview.includes(w))) {
      groundedFacts.add('customer_comment');
    }
  }

  // 2. Script compliance check
  let scriptCompliant = true;
  const devanagariMatches = reviewText.match(DEVANAGARI_REGEX) || [];
  const latinWords = reviewText.match(LATIN_WORD_REGEX) || [];
  const latinChars = latinWords.join('').length;
  const totalScriptChars = devanagariMatches.length + latinChars;

  if (language === 'hi' || language === 'mr') {
    const devanagariRatio = totalScriptChars > 0 ? devanagariMatches.length / totalScriptChars : 0;
    if (devanagariMatches.length < 6 || devanagariRatio < 0.45) {
      scriptCompliant = false;
      issues.push({
        type: 'script_mismatch',
        severity: 'error',
        message: `${language === 'hi' ? 'Hindi' : 'Marathi'} review must be written primarily in Devanagari script.`,
        evidence: reviewText.slice(0, 80),
      });
    }
  } else if (language === 'hinglish') {
    if (devanagariMatches.length > 0) {
      scriptCompliant = false;
      issues.push({
        type: 'script_mismatch',
        severity: 'error',
        message: 'Hinglish review must use Roman English characters only (no Devanagari script).',
        evidence: devanagariMatches.slice(0, 6).join(''),
      });
    } else if (latinChars < 10) {
      scriptCompliant = false;
      issues.push({
        type: 'script_mismatch',
        severity: 'error',
        message: 'Hinglish review must contain readable Roman-script words.',
      });
    } else {
      const reviewWords = tokenizeNormalized(reviewText);
      const hasHindiMarker = reviewWords.some((w) => HINGLISH_ROMAN_MARKERS.includes(w));
      if (!hasHindiMarker && reviewWords.length >= 8) {
        scriptCompliant = false;
        issues.push({
          type: 'script_mismatch',
          severity: 'error',
          message: 'Hinglish output sounded like pure English without natural Roman Hindi phrasing.',
          evidence: reviewText.slice(0, 90),
        });
      }
    }
  } else if (language === 'en') {
    if (devanagariMatches.length > 0) {
      scriptCompliant = false;
      issues.push({
        type: 'script_mismatch',
        severity: 'error',
        message: 'English review contains Devanagari script characters.',
      });
    }
  }

  // 3. Invented claims detection
  let inventedClaimCount = 0;
  const userMentionedPrice =
    /price|value|money|cost|cheap|expensive|budget|affordable|rate|bill|charges|₹|\$|rs/i.test(
      userFactsCorpus,
    );
  if (!userMentionedPrice) {
    for (const pattern of MONEY_CLAIM_PATTERNS) {
      const m = reviewText.match(pattern);
      if (m) {
        inventedClaimCount += 1;
        issues.push({
          type: 'invented_claim',
          severity: 'error',
          message: 'Review mentioned pricing or money claims not present in customer feedback.',
          evidence: m[0],
        });
        break;
      }
    }
  }

  for (const term of UNGROUNDED_SPECIFIC_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerReview) && !regex.test(fullContextCorpus)) {
      inventedClaimCount += 1;
      issues.push({
        type: 'invented_claim',
        severity: 'error',
        message: `Mentioned "${term}" which did not appear in customer answers or business context.`,
        evidence: term,
      });
      if (inventedClaimCount >= 3) break;
    }
  }

  // 4. AI cliché detection
  let clicheCount = 0;
  for (const phrase of BANNED_AI_CLICHES) {
    if (lowerReview.includes(phrase)) {
      clicheCount += 1;
      issues.push({
        type: 'ai_cliche',
        severity: 'warning',
        message: `Avoid generic AI phrase "${phrase}" so the review reads naturally.`,
        evidence: phrase,
      });
    }
  }

  // 5. Contradiction detection
  let contradictionCount = 0;
  const hasNegativeOrMixedInput = NEGATIVE_OR_MIXED_INPUT_CUES.some((cue) =>
    userFactsCorpus.includes(cue),
  );
  const hasPositiveInput = POSITIVE_INPUT_CUES.some((cue) => userFactsCorpus.includes(cue));

  // Return visit negative check
  const returnVisitNo = (input.responses || []).some(
    (r) =>
      /return|visit again|come back|recommend/i.test(r.question) &&
      r.answers.some((a) => /^(no|unlikely|not sure|never)$/i.test(a.trim())),
  );
  if (
    returnVisitNo &&
    /\b(definitely come back|definitely return|dobara zaroor|dobara visit|will visit again|पुन्हा नक्की येईन|दोबारा ज़रूर)\b/i.test(
      lowerReview,
    )
  ) {
    contradictionCount += 1;
    issues.push({
      type: 'contradiction',
      severity: 'error',
      message: 'Draft promised a return visit even though the customer did not select Yes to returning.',
    });
  }

  // Overall positive input but strongly negative output
  if (hasPositiveInput && !hasNegativeOrMixedInput) {
    const negOutMatch = lowerReview.match(
      /\b(terrible|horrible|worst|pathetic|waste of money|rude staff|never coming back|disappointed)\b/i,
    );
    if (negOutMatch) {
      contradictionCount += 1;
      issues.push({
        type: 'contradiction',
        severity: 'error',
        message: 'Draft introduced negative complaints despite positive customer feedback.',
        evidence: negOutMatch[0],
      });
    }
  }

  // Negative/mixed input glossed over as "flawless / no complaints"
  if (hasNegativeOrMixedInput) {
    const glossOverMatch = lowerReview.match(
      /\b(flawless|no complaints|nothing wrong|everything was perfect|zero flaws)\b/i,
    );
    if (glossOverMatch) {
      contradictionCount += 1;
      issues.push({
        type: 'contradiction',
        severity: 'error',
        message: 'Draft claimed perfection while ignoring average or slow feedback from the customer.',
        evidence: glossOverMatch[0],
      });
    }
  }

  // 6. Repetition detection (within draft + across previous drafts)
  let repetitionCount = 0;
  const words = tokenizeNormalized(reviewText);
  if (words.length >= 9) {
    const trigramCounts = new Map<string, number>();
    for (let i = 0; i <= words.length - 3; i += 1) {
      const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      trigramCounts.set(tri, (trigramCounts.get(tri) || 0) + 1);
    }
    for (const [tri, count] of trigramCounts.entries()) {
      if (count >= 2) {
        repetitionCount += 1;
        issues.push({
          type: 'repetition',
          severity: 'warning',
          message: `Repeated phrase "${tri}" (${count}x) inside the same draft.`,
          evidence: tri,
        });
        break;
      }
    }
  }

  const sentences = reviewText
    .split(/[.!?।]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  if (sentences.length >= 2) {
    let foundDuplicateSentence = false;
    for (let i = 0; i < sentences.length && !foundDuplicateSentence; i += 1) {
      for (let j = i + 1; j < sentences.length; j += 1) {
        if (jaccardSimilarity(sentences[i], sentences[j]) > 0.72) {
          repetitionCount += 1;
          foundDuplicateSentence = true;
          issues.push({
            type: 'repetition',
            severity: 'warning',
            message: 'Two sentences in the draft express nearly identical wording.',
            evidence: sentences[j].slice(0, 60),
          });
          break;
        }
      }
    }
  }

  if (Array.isArray(input.previousDrafts)) {
    for (const prev of input.previousDrafts) {
      if (!prev || !prev.trim()) continue;
      if (jaccardSimilarity(reviewText, prev) > 0.78) {
        repetitionCount += 1;
        issues.push({
          type: 'repetition',
          severity: 'warning',
          message: 'Regenerated draft closely mirrors a previous variation.',
        });
        break;
      }
    }
  }

  // Score calculation
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'error') {
      score -= 28;
    } else {
      score -= 12;
    }
  }
  score = Math.max(0, Math.min(100, score));
  const hasErrors = issues.some((i) => i.severity === 'error');
  const passed = !hasErrors && score >= 75;

  return {
    score,
    passed,
    language,
    inventedClaimCount,
    contradictionCount,
    repetitionCount,
    scriptCompliant,
    clicheCount,
    groundedFactCount: groundedFacts.size,
    autoRepaired: Boolean(input.autoRepaired),
    issues,
  };
}

export interface CuratedExampleLike {
  language: QualityReviewLanguage;
  category?: string;
  responsesSummary: string;
  additionalComments?: string;
  finalReview: string;
}

export function formatConsentedDatasetAsJsonl(examples: CuratedExampleLike[]): string {
  return examples
    .filter((ex) => ex && ex.finalReview && ex.responsesSummary)
    .map((ex) => {
      const userPrompt = [
        `Language: ${ex.language}`,
        ex.category ? `Category: ${ex.category}` : '',
        `Customer Feedback:\n${ex.responsesSummary}`,
        ex.additionalComments ? `Additional Comment: "${ex.additionalComments}"` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] },
          { role: 'model', parts: [{ text: JSON.stringify({ review: ex.finalReview }) }] },
        ],
      });
    })
    .join('\n');
}
