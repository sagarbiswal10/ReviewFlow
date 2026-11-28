import type { QualityReviewLanguage } from './reviewQualityCore.js';

export type FallbackReviewStyle = 'short' | 'detailed' | 'professional';

export type FallbackSentimentLevel =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'mixed'
  | 'negative'
  | 'very_negative';

export interface FallbackReviewInput {
  businessName: string;
  category?: string;
  responses: Array<{ question: string; answers: string[] }>;
  additionalComments?: string;
  style: FallbackReviewStyle;
  language: QualityReviewLanguage;
  variationSeed?: number;
}

export interface FallbackReviewOutput {
  reviewText: string;
  script: 'roman' | 'devanagari';
  sentiment: FallbackSentimentLevel;
  groundedFacts: string[];
  keywordsUsed: string[];
}

const VERY_POSITIVE_TERMS = [
  'excellent',
  'awesome',
  'fantastic',
  'loved',
  'love it',
  'outstanding',
  'superb',
  'great',
  'wonderful',
  'amazing',
  'best',
  '5 star',
  '5/5',
  'very good',
  'very happy',
  'very satisfied',
  'highly satisfied',
  'definitely',
  'delicious',
  'fresh',
  'friendly',
  'polite',
  'clean',
  'quick',
  'fast',
  'helpful',
  'comfortable',
  'professional',
  'bahut accha',
  'bohot accha',
  'shandar',
  'jabardast',
];

const POSITIVE_TERMS = [
  'good',
  'nice',
  'pleasant',
  'smooth',
  'warm',
  'attentive',
  'neat',
  'tidy',
  'prompt',
  'welcoming',
  'happy',
  'satisfied',
  'tasty',
  'cozy',
  'calm',
  'relaxing',
  'reliable',
  'helpful',
  'courteous',
  'accha',
  'badiya',
  'badhiya',
  'sahi',
];

const NEUTRAL_TERMS = [
  'average',
  'okay',
  'ok',
  'decent',
  'fine',
  'moderate',
  'normal',
  'ordinary',
  'theek',
  'thik',
  'chal gaya',
  'so-so',
  'nothing special',
];

const NEGATIVE_TERMS = [
  'bad',
  'poor',
  'slow',
  'rude',
  'dirty',
  'unclean',
  'cold',
  'stale',
  'late',
  'delay',
  'delayed',
  'wait',
  'long wait',
  'noisy',
  'unhelpful',
  'disappoint',
  'disappointed',
  'disappointing',
  'not good',
  'needs improvement',
  'could be better',
  'underwhelming',
  'issue',
  'problem',
  'kharab',
  'bura',
  'ganda',
];

const VERY_NEGATIVE_TERMS = [
  'terrible',
  'horrible',
  'worst',
  'awful',
  'unacceptable',
  'never again',
  'waste',
  'very bad',
  'very poor',
  'extremely bad',
  'disgusting',
  'pathetic',
  '1 star',
  '1/5',
  'bahut kharab',
  'bilkul accha nahi',
];

const TRIVIAL_ANSWERS = new Set([
  'yes',
  'no',
  'maybe',
  'n/a',
  'na',
  'none',
  'other',
  'ok',
  'okay',
]);

function stripLeadingDecorations(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/^[\s\-–—•*:]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSentenceEnd(text: string, devanagari = false): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/[.!?।]$/.test(trimmed)) return trimmed;
  return `${trimmed}${devanagari ? '।' : '.'}`;
}

function classifySentiment(
  responses: Array<{ question: string; answers: string[] }>,
  additionalComments: string,
): FallbackSentimentLevel {
  const combined = [
    ...responses.flatMap((r) => r.answers),
    additionalComments,
  ]
    .join(' ')
    .toLowerCase();

  let veryPos = 0;
  let pos = 0;
  let neu = 0;
  let neg = 0;
  let veryNeg = 0;

  for (const term of VERY_NEGATIVE_TERMS) {
    if (combined.includes(term)) veryNeg += 1;
  }
  for (const term of NEGATIVE_TERMS) {
    if (combined.includes(term)) neg += 1;
  }
  for (const term of NEUTRAL_TERMS) {
    if (combined.includes(term)) neu += 1;
  }
  for (const term of VERY_POSITIVE_TERMS) {
    if (combined.includes(term)) veryPos += 1;
  }
  for (const term of POSITIVE_TERMS) {
    if (combined.includes(term)) pos += 1;
  }

  const totalPos = veryPos + pos;
  const totalNeg = veryNeg + neg;

  if (totalPos > 0 && totalNeg > 0) return 'mixed';
  if (veryNeg > 0) return 'very_negative';
  if (totalNeg > 0) return 'negative';
  if (neu > 0 && totalPos === 0) return 'neutral';
  if (veryPos >= 2) return 'very_positive';
  if (totalPos > 0) return 'positive';
  return 'positive';
}

function extractHighlights(
  responses: Array<{ question: string; answers: string[] }>,
): { cleanAnswers: string[]; groundedFacts: string[] } {
  const seen = new Set<string>();
  const cleanAnswers: string[] = [];
  const groundedFacts: string[] = [];

  for (const r of responses) {
    const cleanQ = stripLeadingDecorations(r.question);
    const cleaned = r.answers
      .map((a) => stripLeadingDecorations(a))
      .filter((a) => a.length > 0);

    for (const ans of cleaned) {
      const lower = ans.toLowerCase();
      if (!seen.has(lower) && !TRIVIAL_ANSWERS.has(lower)) {
        seen.add(lower);
        cleanAnswers.push(ans);
      }
    }

    if (cleaned.length > 0) {
      groundedFacts.push(
        cleanQ ? `${cleanQ}: ${cleaned.join(', ')}`.slice(0, 120) : cleaned.join(', ').slice(0, 120),
      );
    }
  }

  return {
    cleanAnswers: cleanAnswers.slice(0, 5),
    groundedFacts: groundedFacts.slice(0, 8),
  };
}

function joinNaturalList(items: string[], conjunction: string): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

function lowercaseInitialIfPhrase(phrase: string): string {
  if (!phrase) return '';
  if (/^[A-Z]{2,}/.test(phrase)) return phrase;
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

function pickBySeed<T>(items: T[], seed: number): T {
  const idx = Math.abs(Math.floor(seed) || 1) % items.length;
  return items[idx];
}

function buildEnglishReview(
  businessName: string,
  highlights: string[],
  comment: string,
  sentiment: FallbackSentimentLevel,
  style: FallbackReviewStyle,
  seed: number,
): string {
  const formattedHighlights = highlights.map(lowercaseInitialIfPhrase);
  const topList = joinNaturalList(formattedHighlights.slice(0, 3), 'and');
  const extraList = joinNaturalList(formattedHighlights.slice(3, 5), 'and');
  const cleanComment = comment ? normalizeSentenceEnd(comment) : '';

  const openings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      `Had a really good visit to ${businessName}.`,
      `I was very happy with my visit to ${businessName}.`,
      `Visited ${businessName} recently and came away very satisfied.`,
      `My visit to ${businessName} went really well from start to finish.`,
    ],
    positive: [
      `Had a pleasant visit to ${businessName}.`,
      `Visited ${businessName} recently and had a good experience.`,
      `Stopped by ${businessName} and everything went smoothly.`,
      `My recent visit to ${businessName} was quite good.`,
    ],
    neutral: [
      `Visited ${businessName} recently and the experience was decent overall.`,
      `My visit to ${businessName} was okay and fairly standard.`,
      `Stopped by ${businessName} and found things reasonably alright.`,
    ],
    mixed: [
      `My recent visit to ${businessName} was a bit mixed.`,
      `Had a mixed visit to ${businessName} with a few good parts and some room to improve.`,
      `Visited ${businessName} recently; some parts went well while others could be better.`,
    ],
    negative: [
      `My visit to ${businessName} did not go as well as I hoped.`,
      `Visited ${businessName} recently and felt there is clear room for improvement.`,
      `Had a somewhat disappointing visit to ${businessName}.`,
    ],
    very_negative: [
      `I was quite unhappy with my recent visit to ${businessName}.`,
      `My visit to ${businessName} was far below what I expected.`,
      `Had a poor visit to ${businessName} and left feeling disappointed.`,
    ],
  };

  const highlightLines = topList
    ? sentiment === 'negative' || sentiment === 'very_negative'
      ? [
          `What stood out most during the visit was ${topList}.`,
          `The main points from my visit were ${topList}.`,
        ]
      : sentiment === 'mixed'
        ? [
            `Specifically, I noticed ${topList}.`,
            `Key things that stood out were ${topList}.`,
          ]
        : [
            `I especially appreciated ${topList}.`,
            `What stood out for me was ${topList}.`,
            `I was glad to see ${topList}.`,
          ]
    : [];

  const closings: Record<FallbackSentimentLevel, Record<FallbackReviewStyle, string[]>> = {
    very_positive: {
      short: [
        'Would gladly visit again.',
        'Happy to come back next time.',
      ],
      detailed: [
        'Overall, it was a genuinely satisfying visit and I would gladly come back again.',
        'Everything felt well looked after and I plan to visit again soon.',
      ],
      professional: [
        'Overall, the consistency and care made it a dependable place to visit again.',
        'I appreciate the steady quality and would comfortably return in the future.',
      ],
    },
    positive: {
      short: [
        'Worth stopping by again.',
        'Would happily return.',
      ],
      detailed: [
        'Overall, it was a smooth and comfortable visit that left a good impression.',
        'All in all, a solid visit and I would feel good about coming back.',
      ],
      professional: [
        'Overall, it was a reliable and well-managed visit.',
        'The visit was handled well and met my expectations.',
      ],
    },
    neutral: {
      short: [
        'Overall, it got the job done.',
        'A fairly standard visit overall.',
      ],
      detailed: [
        'Nothing major went wrong, though a little extra attention would make it even better.',
        'Overall, it was fine for a quick visit and met basic expectations.',
      ],
      professional: [
        'Overall, the visit was acceptable and met basic expectations.',
        'It was a straightforward visit with scope for small improvements.',
      ],
    },
    mixed: {
      short: [
        'A few adjustments would make the next visit much smoother.',
        'Hoping the weaker areas improve next time.',
      ],
      detailed: [
        'There are clear positives here, and smoothing out the rough spots would make a big difference.',
        'Overall it was a mixed visit, and addressing the gaps would make it easier to return.',
      ],
      professional: [
        'With a bit more consistency across the board, the overall visit would be noticeably stronger.',
        'Addressing the weaker points would bring the rest of the visit up to the same standard.',
      ],
    },
    negative: {
      short: [
        'With a few small improvements, the next visit can be much better.',
        'Looking forward to seeing these points addressed positively soon.',
      ],
      detailed: [
        'With a little extra focus on these basics, I am confident the overall experience will be much smoother next time.',
        'The team has good potential, and addressing these gaps will make future visits genuinely pleasant.',
      ],
      professional: [
        'With timely attention to these details, I look forward to a much smoother experience on my next visit.',
        'Sharing this feedback constructively in the hope of seeing even better service next time.',
      ],
    },
    very_negative: {
      short: [
        'Hoping to see a much smoother experience on a future visit.',
        'Wishing the team the best in improving these areas soon.',
      ],
      detailed: [
        'With proper attention to these concerns, future guests will surely have a much better visit, and I look forward to positive improvements.',
        'I share this feedback constructively and genuinely hope to see things run much more smoothly next time around.',
      ],
      professional: [
        'Sharing these points constructively with the hope of seeing meaningful improvements ahead.',
        'Looking forward to seeing positive updates from the team on future visits.',
      ],
    },
  };

  const parts: string[] = [pickBySeed(openings[sentiment], seed)];

  if (highlightLines.length > 0) {
    parts.push(pickBySeed(highlightLines, seed + 1));
  }

  if (cleanComment) {
    parts.push(cleanComment);
  }

  if (style === 'detailed') {
    if (extraList) {
      parts.push(`I also noticed ${extraList}.`);
    } else if (parts.length < 3) {
      parts.push(
        sentiment === 'negative' || sentiment === 'very_negative'
          ? 'Taking care of a few everyday details would easily lift the whole visit.'
          : 'Overall the pace and setup felt easygoing and comfortable during the time spent there.',
      );
    }
  }

  if (style !== 'short' || parts.length < 2) {
    parts.push(pickBySeed(closings[sentiment][style], seed + 2));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildHinglishReview(
  businessName: string,
  comment: string,
  sentiment: FallbackSentimentLevel,
  style: FallbackReviewStyle,
  seed: number,
): string {
  const openings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      `${businessName} par aakar bahut accha anubhav raha.`,
      `${businessName} mein mera anubhav kaafi badiya raha.`,
      `${businessName} aakar kaafi khushi hui aur sab kuch sahi raha.`,
    ],
    positive: [
      `${businessName} par mera anubhav accha raha.`,
      `${businessName} mein sab kuch kaafi theek aur aaramdayak tha.`,
      `${businessName} par aakar accha laga.`,
    ],
    neutral: [
      `${businessName} par anubhav theek-thaak raha.`,
      `${businessName} mein sab kuch jaisa socha tha waisa hi tha.`,
      `${businessName} ka anubhav bas chal gaya aur theek laga.`,
    ],
    mixed: [
      `${businessName} par kuch cheezein acchi thi lekin kuch aur behtar ho sakti thi.`,
      `${businessName} mein mera anubhav mila-jula raha.`,
      `${businessName} mein kuch baatein theek lagi par thoda sudhaar zaroori hai.`,
    ],
    negative: [
      `${businessName} par anubhav utna accha nahi laga.`,
      `${businessName} mein isse behtar ummeed thi.`,
      `${businessName} par sach kahun toh kuch khaas nahi raha.`,
    ],
    very_negative: [
      `${businessName} par bahut hi kharab anubhav raha.`,
      `${businessName} mein bilkul accha nahi laga aur kaafi niraash hue.`,
      `${businessName} ka anubhav ummeed se bilkul alag aur kharab nikla.`,
    ],
  };

  const middles: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      'Yahan ka vyavahaar aur kaam dono kaafi pasand aaye.',
      'Yahan samay par aur acche tareeke se dhyaan diya gaya.',
    ],
    positive: [
      'Yahan ka mahaul aur kaam ka tareeka theek laga.',
      'Sab kuch bina kisi dikkat ke aasani se ho gaya.',
    ],
    neutral: [
      'Koi badi dikkat nahi hui lekin kuch khaas alag bhi nahi laga.',
      'Aam taur par sab theek raha aur kaam ho gaya.',
    ],
    mixed: [
      'Thoda aur dhyaan diya jaye toh poora anubhav kaafi accha ho sakta hai.',
      'Kuch hisse pasand aaye par baaki cheezon mein sudhaar ki zaroorat hai.',
    ],
    negative: [
      'Yahan ki suvidha aur vyavastha par aur dhyaan dene ki zaroorat hai.',
      'Agar buniyadi cheezon ko sudhara jaye toh behtar hoga.',
    ],
    very_negative: [
      'Yahan ki vyavastha aur dhyaan dono mein kaafi kami mehsoos hui.',
      'Is tarah ke anubhav ke baad sudhaar bahut zaroori lagta hai.',
    ],
  };

  const closings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      'Aage bhi yahan zaroor aana chahunga.',
      'Dobara aane ka mann zaroor karega.',
    ],
    positive: [
      'Aage mauka mila toh phir se aana theek rahega.',
      'Kul milakar accha laga aur phir aa sakte hain.',
    ],
    neutral: [
      'Kul milakar anubhav theek raha.',
      'Aam zaroorat ke liye jagah theek hai.',
    ],
    mixed: [
      'Ummeed hai agli baar sab cheezein aur behtar milengi.',
      'Sudhaar hone par agli baar accha lagega.',
    ],
    negative: [
      'Ummeed hai aage is par dhyaan diya jayega aur agli baar anubhav aur accha hoga.',
      'Behtar vyavastha ke saath agli baar zaroor accha anubhav milne ki ummeed hai.',
    ],
    very_negative: [
      'Ummeed hai in kamiyon ko jaldi sudhara jayega, aur agli baar sab kuch behtar milega.',
      'Thode sudhaar ke saath aane wale samay mein yeh jagah aur accha anubhav de sakti hai.',
    ],
  };

  const parts: string[] = [pickBySeed(openings[sentiment], seed)];
  if (comment) {
    parts.push(normalizeSentenceEnd(comment));
  } else {
    parts.push(pickBySeed(middles[sentiment], seed + 1));
  }
  if (style === 'detailed') {
    parts.push(
      sentiment === 'negative' || sentiment === 'very_negative'
        ? 'Chhoti-chhoti baaton par dhyaan dene se poori vyavastha kaafi behtar ban sakti hai.'
        : 'Logon ka bartaav aur poore kaam ka tareeka samajhdari bhara aur aasaan laga.',
    );
  }
  if (style !== 'short' || parts.length < 2) {
    parts.push(pickBySeed(closings[sentiment], seed + 2));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildHindiReview(
  businessName: string,
  comment: string,
  sentiment: FallbackSentimentLevel,
  style: FallbackReviewStyle,
  seed: number,
): string {
  const openings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      `${businessName} में आकर बहुत अच्छा अनुभव रहा।`,
      `${businessName} का मेरा अनुभव बहुत बढ़िया रहा।`,
    ],
    positive: [
      `${businessName} में आकर अच्छा लगा।`,
      `${businessName} में मेरा अनुभव अच्छा और सहज रहा।`,
    ],
    neutral: [
      `${businessName} का अनुभव ठीक-ठाक रहा।`,
      `${businessName} में सब कुछ सामान्य और ठीक था।`,
    ],
    mixed: [
      `${businessName} में कुछ चीज़ें अच्छी थीं लेकिन कुछ और बेहतर हो सकती थीं।`,
      `${businessName} में मेरा अनुभव मिला-जुला रहा।`,
    ],
    negative: [
      `${businessName} का अनुभव उतना अच्छा नहीं रहा।`,
      `${businessName} में इससे बेहतर उम्मीद थी।`,
    ],
    very_negative: [
      `${businessName} में बहुत खराब अनुभव रहा।`,
      `${businessName} से काफ़ी निराशा हुई।`,
    ],
  };

  const middles: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      'यहाँ की व्यवस्था और व्यवहार दोनों पसंद आए।',
      'सब कुछ समय पर और अच्छे ढंग से हुआ।',
    ],
    positive: [
      'यहाँ का माहौल और काम का तरीका अच्छा लगा।',
      'सब कुछ बिना किसी परेशानी के आसानी से हो गया।',
    ],
    neutral: [
      'कोई बड़ी परेशानी नहीं हुई, सब कुछ सामान्य रहा।',
      'कुल मिलाकर काम ठीक से हो गया।',
    ],
    mixed: [
      'थोड़ा और ध्यान दिया जाए तो अनुभव काफ़ी बेहतर हो सकता है।',
      'कुछ पहलुओं में सुधार की ज़रूरत महसूस हुई।',
    ],
    negative: [
      'यहाँ की व्यवस्था और सेवा में सुधार की ज़रूरत है।',
      'बुनियादी बातों पर और ध्यान दिया जाना चाहिए।',
    ],
    very_negative: [
      'यहाँ की व्यवस्था में काफ़ी कमी लगी।',
      'इन समस्याओं पर तुरंत ध्यान देने की ज़रूरत है।',
    ],
  };

  const closings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: ['आगे भी यहाँ ज़रूर आना चाहूँगा।', 'दोबारा आने का मन ज़रूर करेगा।'],
    positive: ['आगे मौका मिलने पर फिर से आना अच्छा रहेगा।', 'कुल मिलाकर बढ़िया अनुभव रहा।'],
    neutral: ['कुल मिलाकर अनुभव ठीक रहा।', 'सामान्य ज़रूरत के लिए जगह ठीक है।'],
    mixed: ['उम्मीद है अगली बार और बेहतर अनुभव मिलेगा।', 'सुधार होने पर अगली बार अच्छा लगेगा।'],
    negative: ['उम्मीद है आगे इन बातों में सुधार होगा और अगली बार अनुभव और बेहतर रहेगा।', 'थोड़े और ध्यान के साथ भविष्य में यहाँ का अनुभव काफ़ी अच्छा हो सकता है।'],
    very_negative: ['उम्मीद है इन कमियों को जल्द सुधारा जाएगा और आगे बेहतर अनुभव मिलेगा।', 'आने वाले समय में सकारात्मक बदलाव की पूरी उम्मीद है।'],
  };

  const parts: string[] = [pickBySeed(openings[sentiment], seed)];
  if (comment && /[\u0900-\u097F]/.test(comment)) {
    parts.push(normalizeSentenceEnd(comment, true));
  } else {
    parts.push(pickBySeed(middles[sentiment], seed + 1));
  }
  if (style === 'detailed') {
    parts.push(
      sentiment === 'negative' || sentiment === 'very_negative'
        ? 'छोटी-छोटी बातों पर ध्यान देने से पूरी व्यवस्था काफ़ी बेहतर बन सकती है।'
        : 'यहाँ का सहज माहौल और काम करने का ढंग काफ़ी आरामदायक लगा।',
    );
  }
  if (style !== 'short' || parts.length < 2) {
    parts.push(pickBySeed(closings[sentiment], seed + 2));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function buildMarathiReview(
  businessName: string,
  comment: string,
  sentiment: FallbackSentimentLevel,
  style: FallbackReviewStyle,
  seed: number,
): string {
  const openings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      `${businessName} येथे येण्याचा अनुभव खूप छान होता.`,
      `${businessName} मधील माझा अनुभव अत्यंत चांगला होता.`,
    ],
    positive: [
      `${businessName} येथे येऊन छान वाटले.`,
      `${businessName} मधील अनुभव चांगला आणि सोयीस्कर होता.`,
    ],
    neutral: [
      `${businessName} चा अनुभव ठीकठाक होता.`,
      `${businessName} मध्ये सर्व काही साधारण आणि ठीक होते.`,
    ],
    mixed: [
      `${businessName} मध्ये काही गोष्टी चांगल्या होत्या पण काही अजून सुधारता येतील.`,
      `${businessName} येथील माझा अनुभव संमिश्र होता.`,
    ],
    negative: [
      `${businessName} येथील अनुभव अपेक्षेइतका चांगला नव्हता.`,
      `${businessName} मध्ये यापेक्षा चांगल्या सेवेची अपेक्षा होती.`,
    ],
    very_negative: [
      `${businessName} मधील अनुभव खूपच खराब होता.`,
      `${businessName} येथील अनुभवामुळे निराशा झाली.`,
    ],
  };

  const middles: Record<FallbackSentimentLevel, string[]> = {
    very_positive: [
      'येथील व्यवस्था आणि वागणूक दोन्ही खूप आवडल्या.',
      'सर्व काही वेळेत आणि नीटनेटके पार पडले.',
    ],
    positive: [
      'येथील वातावरण आणि कामाची पद्धत चांगली वाटली.',
      'कोणत्याही अडचणीशिवाय सर्व काही व्यवस्थित झाले.',
    ],
    neutral: [
      'कोणतीही मोठी अडचण आली नाही आणि काम व्यवस्थित झाले.',
      'एकूणच सर्व काही नेहमीसारखे ठीक होते.',
    ],
    mixed: [
      'थोडे अजून लक्ष दिल्यास एकूण अनुभव नक्कीच अधिक चांगला होईल.',
      'काही बाबी चांगल्या आहेत पण काही ठिकाणी सुधारणा हवी आहे.',
    ],
    negative: [
      'येथील व्यवस्था आणि सेवेत सुधारणा होणे गरजेचे आहे.',
      'मूलभूत गोष्टींकडे अधिक लक्ष देणे आवश्यक वाटले.',
    ],
    very_negative: [
      'येथील व्यवस्थेत बऱ्याच उणिवा जाणवल्या.',
      'या गोष्टींकडे तातडीने लक्ष देण्याची गरज आहे.',
    ],
  };

  const closings: Record<FallbackSentimentLevel, string[]> = {
    very_positive: ['पुन्हा नक्कीच येथे यायला आवडेल.', 'एकूणच खूप समाधानकारक अनुभव होता.'],
    positive: ['पुढेही येथे येणे नक्कीच आवडेल.', 'एकूण अनुभव चांगला होता.'],
    neutral: ['एकूण अनुभव ठीक होता.', 'साधारण कामासाठी जागा ठीक आहे.'],
    mixed: ['पुढच्या वेळी अनुभव अजून चांगला असेल अशी अपेक्षा आहे.', 'सुधारणा झाल्यास नक्कीच छान वाटेल.'],
    negative: ['पुढे या गोष्टी सुधारल्या जातील आणि पुढच्या वेळी अनुभव नक्कीच अधिक चांगला राहील अशी अपेक्षा आहे.', 'थोड्या सुधारणांसह भविष्यात येथील सेवा नक्कीच अधिक छान होईल.'],
    very_negative: ['या अडचणी लवकर दूर होतील आणि पुढच्या वेळी चांगला अनुभव मिळेल अशी आशा आहे.', 'सकारात्मक सुधारणांनंतर पुन्हा चांगला अनुभव मिळण्याची अपेक्षा आहे.'],
  };

  const parts: string[] = [pickBySeed(openings[sentiment], seed)];
  if (comment && /[\u0900-\u097F]/.test(comment)) {
    parts.push(normalizeSentenceEnd(comment, false));
  } else {
    parts.push(pickBySeed(middles[sentiment], seed + 1));
  }
  if (style === 'detailed') {
    parts.push(
      sentiment === 'negative' || sentiment === 'very_negative'
        ? 'लहानसहान गोष्टींवर थोडे अधिक लक्ष दिल्यास संपूर्ण व्यवस्था अधिक उत्तम होऊ शकते.'
        : 'येथील शांत वातावरण आणि काम करण्याची सहज पद्धत मनाला भावली.',
    );
  }
  if (style !== 'short' || parts.length < 2) {
    parts.push(pickBySeed(closings[sentiment], seed + 2));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function composeGroundedFallbackReview(
  input: FallbackReviewInput,
): FallbackReviewOutput {
  const businessName = input.businessName.trim() || 'this business';
  const additionalComments = (input.additionalComments || '').trim();
  const seed = Number.isFinite(input.variationSeed) ? Number(input.variationSeed) : 1;
  const sentiment = classifySentiment(input.responses || [], additionalComments);
  const { cleanAnswers, groundedFacts } = extractHighlights(input.responses || []);

  if (additionalComments) {
    groundedFacts.push(`Note: ${additionalComments.slice(0, 100)}`);
  }

  let reviewText = '';
  const script: 'roman' | 'devanagari' =
    input.language === 'hi' || input.language === 'mr' ? 'devanagari' : 'roman';

  if (input.language === 'hi') {
    reviewText = buildHindiReview(businessName, additionalComments, sentiment, input.style, seed);
  } else if (input.language === 'mr') {
    reviewText = buildMarathiReview(businessName, additionalComments, sentiment, input.style, seed);
  } else if (input.language === 'hinglish') {
    reviewText = buildHinglishReview(businessName, additionalComments, sentiment, input.style, seed);
  } else {
    reviewText = buildEnglishReview(
      businessName,
      cleanAnswers,
      additionalComments,
      sentiment,
      input.style,
      seed,
    );
  }

  return {
    reviewText,
    script,
    sentiment,
    groundedFacts: groundedFacts.slice(0, 8),
    keywordsUsed: cleanAnswers.slice(0, 3),
  };
}
