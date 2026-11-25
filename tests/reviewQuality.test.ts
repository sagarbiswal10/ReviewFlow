import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatConsentedDatasetAsJsonl,
  validateReviewQuality,
} from '../api/_lib/reviewQualityCore.ts';
import { createCategoryQuestions } from '../src/data/categoryPresets.ts';
import { BUSINESS_CATEGORIES } from '../src/types.ts';

import fs from 'node:fs';
import path from 'node:path';

test('TC-QUAL-01: Hinglish accepts pure Roman Hindi and rejects Devanagari or English vocabulary', () => {
  const goodRomanHindi = validateReviewQuality({
    reviewText:
      'Khana bahut accha tha aur sewa bhi jaldi mil gayi. Wahan ka mahaul theek-thaak tha lekin kul milakar anubhav accha raha. Dobara zaroor aayenge.',
    language: 'hinglish',
    businessName: 'Spice Villa',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Service', answers: ['Quick'] },
      { question: 'Ambience', answers: ['Average'] },
      { question: 'Return visit', answers: ['Yes'] },
    ],
  });
  assert.equal(goodRomanHindi.passed, true);
  assert.equal(goodRomanHindi.scriptCompliant, true);
  assert.ok(goodRomanHindi.score >= 85);

  const mixedEnglishInRomanHindi = validateReviewQuality({
    reviewText:
      'Andar aane ka kaam check-in se easily ho gaya aur staff ne help ki. Overall stay accha raha.',
    language: 'hinglish',
    businessName: 'Hotel Surya',
    category: 'Hotels',
    responses: [{ question: 'Check-in', answers: ['Smooth'] }],
  });
  assert.equal(mixedEnglishInRomanHindi.passed, false);
  assert.equal(mixedEnglishInRomanHindi.scriptCompliant, false);
  assert.ok(mixedEnglishInRomanHindi.issues.some((i) => i.type === 'script_mismatch'));

  const devanagariInHinglish = validateReviewQuality({
    reviewText: 'Khana अच्छा था aur sewa भी jaldi थी।',
    language: 'hinglish',
    businessName: 'Spice Villa',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
  });
  assert.equal(devanagariInHinglish.passed, false);
  assert.equal(devanagariInHinglish.scriptCompliant, false);
  assert.ok(devanagariInHinglish.issues.some((i) => i.type === 'script_mismatch'));

  const pureEnglishAsHinglish = validateReviewQuality({
    reviewText: 'The food was very fresh and our waiter delivered everything quickly.',
    language: 'hinglish',
    businessName: 'Spice Villa',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
  });
  assert.equal(pureEnglishAsHinglish.scriptCompliant, false);
});

test('TC-QUAL-02: Hindi and Marathi validate Devanagari compliance and reject Roman-only drafts', () => {
  const validHi = validateReviewQuality({
    reviewText: 'यहाँ का खाना काफी अच्छा था और स्टाफ भी बहुत अच्छा था। बस सर्विस में थोड़ा समय लगा।',
    language: 'hi',
    businessName: 'Spice Villa',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
  });
  assert.equal(validHi.scriptCompliant, true);
  assert.equal(validHi.passed, true);

  const romanInsteadOfMr = validateReviewQuality({
    reviewText: 'The doctor explained everything clearly and clinic was clean.',
    language: 'mr',
    businessName: 'CarePlus Clinic',
    category: 'Healthcare',
    responses: [{ question: 'Care', answers: ['Good'] }],
  });
  assert.equal(romanInsteadOfMr.scriptCompliant, false);
  assert.equal(romanInsteadOfMr.passed, false);
});

test('TC-QUAL-03: Detects invented pricing, unmentioned dishes/services, and AI cliches', () => {
  const invented = validateReviewQuality({
    reviewText:
      'Had an amazing experience here. The biryani was great and parking was super convenient for just ₹350.',
    language: 'en',
    businessName: 'Urban Cafe',
    category: 'Restaurants',
    responses: [
      { question: 'What did you have?', answers: ['Drinks & Coffee'] },
      { question: 'Food', answers: ['Good'] },
    ],
  });
  assert.equal(invented.passed, false);
  assert.ok(invented.inventedClaimCount >= 2);
  assert.ok(invented.clicheCount >= 1);
});

test('TC-QUAL-04: Detects contradictions against return-visit answer and mixed feedback', () => {
  const contradictedReturn = validateReviewQuality({
    reviewText: 'Food was good and service was slow. Will definitely come back soon!',
    language: 'en',
    businessName: 'Urban Cafe',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Service', answers: ['Service Was Slightly Slow'] },
      { question: 'Would you visit again?', answers: ['No'] },
    ],
  });
  assert.equal(contradictedReturn.passed, false);
  assert.ok(contradictedReturn.contradictionCount >= 1);

  const glossedOverMixed = validateReviewQuality({
    reviewText: 'Everything was perfect with zero flaws at this place.',
    language: 'en',
    businessName: 'Urban Cafe',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Service', answers: ['Service Was Slightly Slow'] },
    ],
  });
  assert.equal(glossedOverMixed.passed, false);
  assert.ok(glossedOverMixed.contradictionCount >= 1);
});

test('TC-QUAL-05: Detects repeated content within a draft and across previousDrafts', () => {
  const repeated = validateReviewQuality({
    reviewText:
      'The food tasted fresh and good. The food tasted fresh and good overall during our dinner.',
    language: 'en',
    businessName: 'Urban Cafe',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
    previousDrafts: [
      'The food tasted fresh and good overall during our dinner visit.',
    ],
  });
  assert.ok(repeated.repetitionCount >= 1);
  assert.ok(repeated.issues.some((i) => i.type === 'repetition'));
});

test('TC-QUAL-06: Phase 5 JSONL export produces valid Gemini fine-tuning lines', () => {
  const jsonl = formatConsentedDatasetAsJsonl([
    {
      language: 'hinglish',
      category: 'Restaurants',
      responsesSummary: 'Food: Good | Service: Quick | Ambience: Average | Return visit: Yes',
      finalReview:
        'Food accha tha aur service bhi kaafi quick thi. Ambience okay tha, but overall experience acha raha. Dobara visit karna pasand karunga.',
    },
  ]);
  const lines = jsonl.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]) as {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  };
  assert.equal(parsed.contents[0].role, 'user');
  assert.equal(parsed.contents[1].role, 'model');
  assert.ok(parsed.contents[1].parts[0].text.includes('Food accha tha'));
});

test('TC-QUAL-07: Phase 2 category presets include experience & return-visit anchors across all categories', () => {
  for (const cat of BUSINESS_CATEGORIES) {
    const qs = createCategoryQuestions(cat);
    assert.ok(qs.length >= 4, `Expected >= 4 questions for ${cat}`);
    assert.ok(qs.some((q) => q.id === 'q-experience'), `Expected q-experience for ${cat}`);
    assert.ok(qs.some((q) => q.id === 'q-return'), `Expected q-return for ${cat}`);
  }
});

test('TC-QUAL-08: Flags stiff corporate vocabulary, promotional fluff, hashtags, emojis, and titles in Hinglish', () => {
  const stiffReport = validateReviewQuality({
    reviewText:
      'Review: The cuisine was exquisite and personnel hospitality was an epitome of excellence! #foodie 😍',
    language: 'hinglish',
    businessName: 'Spice Garden',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
  });
  assert.ok(stiffReport.clicheCount >= 2);
  assert.ok(stiffReport.issues.some((i) => i.type === 'formatting_violation'));
  assert.equal(stiffReport.passed, false);

  const naturalMixed = validateReviewQuality({
    reviewText:
      'Thoda intezar karna pada lekin khana kaafi accha tha aur wahan ke logon ka bartaav accha laga.',
    language: 'hinglish',
    businessName: 'Spice Garden',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Wait time', answers: ['Wait Was Slightly Long'] },
    ],
  });
  assert.equal(naturalMixed.passed, true);
  assert.equal(naturalMixed.clicheCount, 0);
});

test('TC-QUAL-09: Rejects inflating Average feedback into excellent and allows requested user emojis', () => {
  const inflatedReport = validateReviewQuality({
    reviewText: 'Food kaafi accha tha aur ambience was excellent and outstanding!',
    language: 'hinglish',
    businessName: 'Spice Garden',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Ambience', answers: ['Average'] },
    ],
  });
  assert.equal(inflatedReport.passed, false);
  assert.ok(inflatedReport.contradictionCount >= 1);

  const humanClaimReport = validateReviewQuality({
    reviewText: 'As a human-written review, food accha tha aur service quick thi.',
    language: 'hinglish',
    businessName: 'Spice Garden',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
  });
  assert.equal(humanClaimReport.passed, false);
  assert.ok(humanClaimReport.issues.some((i) => i.type === 'formatting_violation'));
});

test('TC-QUAL-10: Hinglish V2 detects excessive punctuation, choppy robotic checklist flow, and stiff vocabulary', () => {
  const choppyRobotic = validateReviewQuality({
    reviewText: 'Food was good. Service was good. Ambience was average. Overall experience was satisfactory!!',
    language: 'hinglish',
    businessName: 'Urban Kitchen',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Service', answers: ['Good'] },
      { question: 'Ambience', answers: ['Average'] },
    ],
  });
  assert.ok(choppyRobotic.clicheCount >= 2);
  assert.ok(choppyRobotic.issues.some((i) => i.type === 'formatting_violation'));
  assert.equal(choppyRobotic.passed, false);
});

test('TC-QUAL-11: Roman Hindi validates universal categories without English vocabulary', () => {
  const hotelRomanHindi = validateReviewQuality({
    reviewText:
      'Andar aane ka kaam aasani se ho gaya tha aur madad bhi mil gayi. Lekin baaki logon ka bartaav accha nahi laga. Sach kahun toh poora anubhav kuch khaas nahi raha.',
    language: 'hinglish',
    businessName: 'Surya Palace',
    category: 'Hotels',
    responses: [
      { question: 'Check-in', answers: ['Smooth'] },
      { question: 'Concierge', answers: ['Helpful'] },
      { question: 'Other staff', answers: ['Poor'] },
    ],
  });
  assert.equal(hotelRomanHindi.passed, true);
  assert.equal(hotelRomanHindi.scriptCompliant, true);
  assert.equal(hotelRomanHindi.clicheCount, 0);
});

test('TC-QUAL-12: CustomerReviewFlow removes Hinglish sub-label, starts QR visits at Step 1, allows Back to Questions, and caps generations at 5', () => {
  const flowSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CustomerReviewFlow.tsx'),
    'utf-8',
  );
  assert.equal(flowSource.includes('Roman Hindi+Eng'), false);
  assert.ok(flowSource.includes("useState<FlowStep>('feedback')"));
  assert.ok(flowSource.includes('Back to Questions'));
  assert.ok(flowSource.includes('MAX_USER_REVIEW_GENERATIONS = 5'));
});

test('TC-QUAL-13: Owner Name Intelligence blocks fabricated owner mentions unless customer named them', () => {
  const fabricatedOwner = validateReviewQuality({
    reviewText:
      'Had a great haircut at ABC Tattoo Studio. Rahul personally guided me through the custom tattoo design cleanly.',
    language: 'en',
    businessName: 'ABC Tattoo Studio',
    ownerName: 'Rahul',
    category: 'Other Businesses',
    responses: [{ question: 'Experience', answers: ['Great'] }],
    additionalComments: 'Clean studio and neat finish.',
  });
  assert.ok((fabricatedOwner.ownerHallucinationCount ?? 0) >= 1);
  assert.equal(fabricatedOwner.passed, false);

  const genuineOwnerMention = validateReviewQuality({
    reviewText:
      'Visited ABC Tattoo Studio for a custom piece and Rahul personally walked me through the placement and aftercare.',
    language: 'en',
    businessName: 'ABC Tattoo Studio',
    ownerName: 'Rahul',
    category: 'Other Businesses',
    responses: [{ question: 'Experience', answers: ['Great'] }],
    additionalComments: 'Rahul personally helped me finalize the custom tattoo sketch.',
  });
  assert.equal(genuineOwnerMention.ownerHallucinationCount, 0);
  assert.equal(genuineOwnerMention.passed, true);
});

test('TC-QUAL-14: Zero-Copying validation rejects verbatim phrase reuse from referenceReviews and passes original writing', () => {
  const referenceReviews = [
    'The salon is super clean, peaceful atmosphere, and the stylists take time to understand what haircut suits your face.',
  ];
  const copiedDraft = validateReviewQuality({
    reviewText:
      'Really liked the visit because the stylists take time to understand what haircut suits your face properly.',
    language: 'en',
    businessName: 'Enrich Salon',
    category: 'Hair Salons',
    responses: [{ question: 'Experience', answers: ['Great'] }],
    referenceReviews,
  });
  assert.ok((copiedDraft.copiedReferenceCount ?? 0) >= 1);
  assert.equal(copiedDraft.originalityPassed, false);
  assert.equal(copiedDraft.passed, false);

  const originalDraft = validateReviewQuality({
    reviewText:
      'My appointment at Enrich Salon went smoothly. The staff listened carefully to my styling preferences and kept the station neat.',
    language: 'en',
    businessName: 'Enrich Salon',
    category: 'Hair Salons',
    responses: [{ question: 'Experience', answers: ['Great'] }],
    referenceReviews,
  });
  assert.equal(originalDraft.copiedReferenceCount, 0);
  assert.equal(originalDraft.originalityPassed, true);
  assert.equal(originalDraft.passed, true);
});

test('TC-QUAL-15: Rejects unsupported SEO superlative claims such as best, top-rated, number one, or most popular', () => {
  const hypedDraft = validateReviewQuality({
    reviewText:
      'This is the best tattoo studio and top-rated salon in Andheri West with great service.',
    language: 'en',
    businessName: 'ABC Tattoo Studio',
    category: 'Hair Salons',
    responses: [{ question: 'Service', answers: ['Great'] }],
  });
  assert.ok(hypedDraft.inventedClaimCount >= 1);
  assert.ok(hypedDraft.issues.some((i) => i.type === 'invented_claim'));
  assert.equal(hypedDraft.passed, false);
});

