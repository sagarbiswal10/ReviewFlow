import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatConsentedDatasetAsJsonl,
  validateReviewQuality,
} from '../api/_lib/reviewQualityCore.ts';
import { createCategoryQuestions } from '../src/data/categoryPresets.ts';
import { BUSINESS_CATEGORIES } from '../src/types.ts';

test('TC-QUAL-01: Hinglish accepts natural Roman-script Indian Hinglish and rejects Devanagari', () => {
  const goodHinglish = validateReviewQuality({
    reviewText:
      'Food accha tha aur service bhi kaafi quick thi. Ambience okay tha, but overall experience acha raha. Dobara visit karna pasand karunga.',
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
  assert.equal(goodHinglish.passed, true);
  assert.equal(goodHinglish.scriptCompliant, true);
  assert.ok(goodHinglish.score >= 85);

  const devanagariInHinglish = validateReviewQuality({
    reviewText: 'Food अच्छा था aur service भी quick थी।',
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
    reviewText: 'Thoda wait karna pada, but food kaafi accha tha aur staff ka behaviour accha laga.',
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

test('TC-QUAL-11: Hinglish V2 validates universal categories beyond restaurants (auto service, clinics, retail, custom fields)', () => {
  const autoServiceHinglish = validateReviewQuality({
    reviewText:
      'Car repair bina kisi dikkat ke time par ho gaya aur staff ne sab kuch clearly samjhaya. Price thoda zyada laga but quality kaafi acchi thi.',
    language: 'hinglish',
    businessName: 'Apex Motors',
    category: 'Automobile Services',
    responses: [
      { question: 'Repair Quality', answers: ['Good'] },
      { question: 'Communication', answers: ['Clear Explanation'] },
      { question: 'Pricing', answers: ['Slightly Expensive'] },
    ],
  });
  assert.equal(autoServiceHinglish.passed, true);
  assert.equal(autoServiceHinglish.scriptCompliant, true);
  assert.equal(autoServiceHinglish.clicheCount, 0);
});
