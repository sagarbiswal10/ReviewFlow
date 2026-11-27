import type { QualityReviewLanguage } from './reviewQualityCore.js';

export interface ContextualReadyDraftInput {
  businessName: string;
  category?: string;
  ownerName?: string;
  locality?: string;
  city?: string;
  address?: string;
  servicesOffered?: string[];
  productsOffered?: string[];
  seoKeywords?: string[];
  referenceReviews?: Array<{ language?: QualityReviewLanguage; sentiment?: string; text: string }>;
  language: QualityReviewLanguage;
  count?: number;
  seed?: number;
}

interface ContextualSlotValues {
  biz: string;
  service: string;
  area: string;
  owner: string;
  seo: string;
}

type TemplateBuilder = (
  s: ContextualSlotValues,
  flags: { useBiz: boolean; useArea: boolean; useOwner: boolean; useSeo: boolean },
) => string;

const SUPERLATIVE_BLOCK_REGEX =
  /\b(best|top-rated|top rated|number one|#1|no\.?\s*1|most popular|world class|finest|unmatched)\b/gi;

function sanitizePhraseNoSuperlatives(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(SUPERLATIVE_BLOCK_REGEX, '')
    .replace(/[#*@]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\-–—\s]+|[,.\-–—\s]+$/g, '')
    .trim();
}

export function extractLocationCandidates(
  locality?: string,
  city?: string,
  address?: string,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (val: string) => {
    const clean = val.replace(/\s+/g, ' ').trim();
    if (clean.length < 3 || clean.length > 44) return;
    if (/^\d+$/.test(clean)) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(clean);
    }
  };

  const cleanLocality = (locality || '').trim();
  if (cleanLocality && cleanLocality.length <= 40) push(cleanLocality);

  if (address) {
    const rawParts = address
      .split(',')
      .map((p) => p.replace(/\b\d{5,6}\b/g, '').trim())
      .filter((p) => p.length >= 3 && p.length <= 44 && !/^\d+$/.test(p));

    // Prioritize natural landmarks: Sector / Phase / Building / Plaza / Complex / Mall / Tower / Road
    const prioritized = rawParts.filter((p) =>
      /\b(sector|sec|phase|plaza|arcade|complex|mall|tower|residency|heights|building|chawl|road|marg|colony|nagar|vihar|enclave|chowk|square|corner|landmark|centre|center|point)\b/i.test(
        p,
      ),
    );
    for (const item of prioritized) push(item);
    for (const item of rawParts) {
      if (!/^(shop|plot|flat|unit|office|room|gala|sr\.?\s*no|no\.?)\s*[\dA-Za-z/-]+$/i.test(item)) {
        push(item);
      }
    }
  }

  const cleanCity = (city || '').trim();
  if (cleanCity && cleanCity.length <= 35) push(cleanCity);

  return candidates.slice(0, 6);
}

export function extractShortArea(
  locality?: string,
  city?: string,
  address?: string,
): string {
  const candidates = extractLocationCandidates(locality, city, address);
  return candidates[0] || '';
}

function defaultServiceNoun(category: string | undefined, language: QualityReviewLanguage): string {
  const lower = (category || '').toLowerCase();
  if (language === 'hi') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'हेयर और ग्रूमिंग सर्विस';
    if (lower.includes('clothing') || lower.includes('apparel')) return 'कपड़ों और फिटिंग की सर्विस';
    if (lower.includes('jewelry') || lower.includes('gold')) return 'ज्वेलरी और डिज़ाइन की जानकारी';
    if (lower.includes('local shop') || lower.includes('retail')) return 'खरीदारी और सामान';
    if (lower.includes('restaurant')) return 'खाना और सर्विस';
    if (lower.includes('hotel')) return 'कमरा और ठहरने की व्यवस्था';
    if (lower.includes('spa')) return 'स्पा सेशन';
    if (lower.includes('gym')) return 'वर्कआउट और ट्रेनिंग';
    if (lower.includes('health')) return 'चेकअप और सलाह';
    if (lower.includes('auto')) return 'गाड़ी की सर्विसिंग';
    return 'सर्विस';
  }
  if (language === 'mr') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'हेअर आणि ग्रूमिंग सर्व्हिस';
    if (lower.includes('clothing') || lower.includes('apparel')) return 'कपडे आणि फिटिंगची सर्व्हिस';
    if (lower.includes('jewelry') || lower.includes('gold')) return 'दागिने आणि डिझाइनची माहिती';
    if (lower.includes('local shop') || lower.includes('retail')) return 'खरेदी आणि वस्तू';
    if (lower.includes('restaurant')) return 'जेवण आणि सर्व्हिस';
    if (lower.includes('hotel')) return 'रूम आणि राहण्याची सोय';
    if (lower.includes('spa')) return 'स्पा सेशन';
    if (lower.includes('gym')) return 'वर्कआउट आणि गाईडन्स';
    if (lower.includes('health')) return 'तपासणी आणि सल्ला';
    if (lower.includes('auto')) return 'गाडीची सर्व्हिसिंग';
    return 'सर्व्हिस';
  }
  if (language === 'hinglish') {
    if (lower.includes('salon') || lower.includes('beauty')) return 'kaam';
    if (lower.includes('clothing') || lower.includes('apparel')) return 'kapde aur fitting';
    if (lower.includes('jewelry') || lower.includes('gold')) return 'gehne aur design';
    if (lower.includes('local shop') || lower.includes('retail')) return 'samaan aur kharidari';
    if (lower.includes('restaurant')) return 'khana';
    if (lower.includes('hotel')) return 'jagah aur suvidha';
    if (lower.includes('spa')) return 'aaram';
    if (lower.includes('gym')) return 'kasrat ka mahaul';
    if (lower.includes('health')) return 'jaanch aur madad';
    if (lower.includes('auto')) return 'gaadi ka kaam';
    return 'kaam';
  }
  if (lower.includes('hair salon')) return 'haircut';
  if (lower.includes('beauty salon')) return 'beauty service';
  if (lower.includes('clothing') || lower.includes('apparel')) return 'outfit selection';
  if (lower.includes('jewelry') || lower.includes('gold')) return 'jewellery selection';
  if (lower.includes('local shop')) return 'shopping visit';
  if (lower.includes('restaurant')) return 'meal';
  if (lower.includes('hotel')) return 'stay';
  if (lower.includes('spa')) return 'spa session';
  if (lower.includes('gym')) return 'workout';
  if (lower.includes('health')) return 'consultation';
  if (lower.includes('retail')) return 'shopping';
  if (lower.includes('auto')) return 'vehicle service';
  return 'service';
}

// =============================================================================
// 55+ AUTHENTIC ENGLISH REVIEW TEMPLATES
// Natural conversational Indian-English & everyday tones; zero AI clichés
// =============================================================================
const EN_REVIEW_BANK: TemplateBuilder[] = [
  (s, f) =>
    `${f.useBiz ? `Visited ${s.biz}` : 'Stopped by'}${f.useArea ? ` in ${s.area}` : ''} for a ${s.service}. Everything was handled patiently without rushing me through, and the place felt well maintained.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} listened carefully to what I had in mind before starting.` : 'The team listened carefully to what I wanted before getting started.'} Really happy with how my ${s.service} turned out${f.useBiz ? ` at ${s.biz}` : ''}.`,
  (s, f) =>
    `Clean setup and polite people here.${f.useSeo ? ` Came in looking for ${s.seo} and got a smooth, straightforward experience.` : ` My ${s.service} was done neatly and right on schedule.`}`,
  (s, f) =>
    `Dropped in${f.useArea ? ` around ${s.area}` : ''} with a friend. Warm behaviour, tidy counters, and practical suggestions without pushing unnecessary extras.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} had a calm, welcoming vibe today.` : 'Had a calm, comfortable visit today.'} My ${s.service} took the right amount of time and felt genuinely worthwhile.`,
  (s, f) =>
    `I am usually particular about hygiene, so seeing how clean everything was${f.useBiz ? ` at ${s.biz}` : ''} put me at ease right away.${f.useSeo ? ` Solid choice for ${s.seo}.` : ''}`,
  (s, f) =>
    `Booking was easy and there was barely any waiting.${f.useOwner ? ` ${s.owner} even checked in halfway to make sure everything felt comfortable.` : ' Staff checked in nicely to make sure I was comfortable.'}`,
  (s, f) =>
    `Consistent quality and clear pricing.${f.useArea ? ` Convenient spot in ${s.area} if you want reliable ${s.service}.` : ` Would happily come back again for ${s.service}.`}`,
  (s, f) =>
    `Had a relaxed ${s.service}${f.useBiz ? ` at ${s.biz}` : ''}. No loud chaos, friendly greeting at the desk, and neat attention to detail.`,
  (s, f) =>
    `Tried this place for the first time${f.useSeo ? ` for ${s.seo}` : ` for ${s.service}`} and it turned out great. Honest feedback from the staff helped me pick what suited me.`,
  (s, f) =>
    `Respectful team and punctual service.${f.useBiz ? ` Thank you ${s.biz}` : ' Thank you'} for keeping things simple, clean, and well organized.`,
  (s, f) =>
    `${f.useArea ? `Found this spot in ${s.area} while walking by and decided to try a ${s.service}.` : `Came in for a quick ${s.service} today.`} Glad I went ahead because the finish was really clean.`,
  (s, f) =>
    `Good value for what you pay. Everything needed for my ${s.service} was explained clearly beforehand with zero surprises at billing.`,
  (s, f) =>
    `${f.useOwner ? `Met ${s.owner} during my visit and appreciated the helpful guidance.` : 'Appreciated how patient the staff were while answering my questions.'} Nice atmosphere all around.`,
  (s, f) =>
    `Second time coming back${f.useBiz ? ` to ${s.biz}` : ''} and the standard has stayed just as good. Polite, unhurried, and consistently tidy.`,
  (s, f) =>
    `Really liked the balanced approach here — attentive without hovering. My ${s.service} came out just how I pictured it.`,
  (s, f) =>
    `Calm seating area and courteous team.${f.useSeo ? ` A dependable option for ${s.seo}${f.useArea ? ` in ${s.area}` : ''}.` : ` Left feeling refreshed and satisfied.`}`,
  (s, f) =>
    `Small details stood out today, like clean tools, clear communication, and zero rush even though the place was fairly busy.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} makes you feel comfortable the moment you walk in.` : 'Felt welcomed as soon as I stepped inside.'} My ${s.service} went smoothly from start to finish.`,
  (s, f) =>
    `Went in unsure about what would work for me, and they walked me through practical options patiently. Very natural result.`,
  (s, f) =>
    `${f.useArea ? `Always reliable around ${s.area}.` : 'Very dependable experience.'} Clean workspace, friendly faces, and good timing.`,
  (s, f) =>
    `Straightforward, honest service without hard-selling products.${f.useBiz ? ` ${s.biz}` : ' This place'} focuses properly on doing good work.`,
  (s, f) =>
    `Booked a ${s.service}${f.useSeo ? ` and ${s.seo}` : ''} on a weekday afternoon. Quiet setting and careful execution throughout.`,
  (s, f) =>
    `The staff knew their craft well and kept checking my preference along the way.${f.useOwner ? ` ${s.owner} runs a very orderly place.` : ' Everything felt well coordinated.'}`,
  (s, f) =>
    `Worth mentioning how clean the waiting and service area stayed throughout my visit${f.useBiz ? ` at ${s.biz}` : ''}. Will visit again soon.`,
  (s, f) =>
    `My ${s.service} was handled with patience and genuine care. No shortcuts, no confusion, just solid everyday hospitality.`,
  (s, f) =>
    `Comfortable ambience and reasonable turnaround time.${f.useSeo ? ` Happy to have found good ${s.seo}${f.useArea ? ` near ${s.area}` : ''}.` : ''}`,
  (s, f) =>
    `I came with a tight schedule and they respected my time completely while still keeping the quality crisp and neat.`,
  (s, f) =>
    `${f.useBiz ? `First visit to ${s.biz}` : 'First time visiting here'} based on a recommendation, and it matched expectations nicely. Polite team and clean setup.`,
  (s, f) =>
    `Loved the calm, unpretentious atmosphere. You get practical care for your ${s.service} and courteous treatment throughout.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} helped sort out my appointment smoothly.` : 'Appointment coordination was effortless.'} Walked out happy with the overall result.`,
  (s, f) =>
    `Neat work, good communication, and fair rates.${f.useArea ? ` Easy to reach in ${s.area} too.` : ''}`,
  (s, f) =>
    `You can tell they care about regular quality rather than rushing customers out the door. Glad I tried${f.useBiz ? ` ${s.biz}` : ' this place'}.`,
  (s, f) =>
    `Cleanliness was clearly a priority here. Everything felt fresh, orderly, and handled by skilled hands.`,
  (s, f) =>
    `Helpful staff who actually listen instead of doing their own thing.${f.useSeo ? ` Great experience with ${s.seo}.` : ` Really happy with my ${s.service}.`}`,
  (s, f) =>
    `Good atmosphere, zero awkwardness, and steady service pace.${f.useBiz ? ` ${s.biz} got every detail right today.` : ' Got every detail right today.'}`,
  (s, f) =>
    `Checked this place out${f.useArea ? ` in ${s.area}` : ''} over the weekend. Organized queue, friendly people, and satisfactory ${s.service}.`,
  (s, f) =>
    `Appreciated the genuine, no-pressure suggestions tailored to what I actually needed rather than generic upselling.`,
  (s, f) =>
    `Quietly efficient service.${f.useOwner ? ` ${s.owner} and team kept everything moving smoothly.` : ' Team kept everything moving smoothly.'} Would gladly come back.`,
  (s, f) =>
    `Stopped by for a routine ${s.service} and left pleasantly surprised by how thorough and attentive the care was.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'This place'} has become my regular go-to${f.useSeo ? ` for ${s.seo}` : ''}. Friendly tone and clean standards every visit.`,
  (s, f) =>
    `Nice lighting, clean interiors, and staff who respect your preferences. Made the whole ${s.service} easy and pleasant.`,
  (s, f) =>
    `Was a bit hesitant trying somewhere new${f.useArea ? ` in ${s.area}` : ''}, but the team was reassuring and delivered clean results.`,
  (s, f) =>
    `Clear pricing, tidy station, and polite conversation. Everything you actually want from a reliable neighborhood place.`,
  (s, f) =>
    `Had a quick turnaround on my ${s.service} without feeling hurried.${f.useBiz ? ` Appreciate the care at ${s.biz}.` : ' Appreciate the careful work.'}`,
  (s, f) =>
    `Consistent hygiene and thoughtful service from arrival to checkout.${f.useSeo ? ` Solid experience for ${s.seo}.` : ''}`,
  (s, f) =>
    `${f.useOwner ? `Grateful to ${s.owner} for taking extra care with my request.` : 'Grateful to the team for taking care of my specific request.'} Turned out nicely.`,
  (s, f) =>
    `Easygoing staff who make you feel relaxed quickly. Clean equipment and well-paced ${s.service}.`,
  (s, f) =>
    `Very transparent from the start — told me how long it would take and stuck to it. Satisfied with${f.useBiz ? ` ${s.biz}` : ' the visit'}.`,
  (s, f) =>
    `Great balance of professionalism and warmth.${f.useArea ? ` Good find in ${s.area}.` : ''} Everything felt neatly put together.`,
  (s, f) =>
    `Everything was organized before my turn started, so my ${s.service} finished smoothly and comfortably.`,
  (s, f) =>
    `Zero hassle, clean setup, and polite follow-through.${f.useSeo ? ` Worth checking out for ${s.seo}.` : ' Would comfortably visit again.'}`,
  (s, f) =>
    `They took the time to understand small details I mentioned and got it right on the first go.`,
  (s, f) =>
    `Calm environment and genuine effort by the team.${f.useBiz ? ` Glad to support ${s.biz}.` : ' Happy with the overall quality.'}`,
  (s, f) =>
    `Came in for a ${s.service}${f.useArea ? ` near ${s.area}` : ''} and appreciated how orderly and welcoming the whole place felt.`,
];

// =============================================================================
// 55+ AUTHENTIC HINDI (DEVANAGARI) REVIEW TEMPLATES
// =============================================================================
const HI_REVIEW_BANK: TemplateBuilder[] = [
  (s, f) =>
    `${f.useBiz ? `${s.biz} में` : 'यहाँ'}${f.useArea ? ` (${s.area})` : ''} ${s.service} करवाया। काम बहुत आराम से और सफाई के साथ किया गया, बिल्कुल जल्दबाज़ी नहीं थी।`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ने मेरी बात ध्यान से सुनी और सही सलाह दी।` : 'यहाँ के स्टाफ ने मेरी ज़रूरत को ध्यान से सुना और सही सुझाव दिए।'} कुल मिलाकर बहुत अच्छा अनुभव रहा।`,
  (s, f) =>
    `साफ-सफाई और व्यवहार दोनों ही बढ़िया थे।${f.useSeo ? ` ${s.seo} के लिए आए थे और काम पूरी तरह संतोषजनक रहा।` : ` मेरा ${s.service} बिल्कुल समय पर पूरा हुआ।`}`,
  (s, f) =>
    `पहली बार${f.useBiz ? ` ${s.biz}` : ' यहाँ'} आए थे और माहौल काफी शांत व सहज लगा। कोई बेवजह की चीज़ बेचने की कोशिश नहीं की।`,
  (s, f) =>
    `${f.useArea ? `${s.area} के पास` : 'यहाँ'} समय पर काम और सही दाम दोनों मिले। स्टाफ काफी मिलनसार और मददगार है।`,
  (s, f) =>
    `मेरा ${s.service} बहुत ही व्यवस्थित तरीके से किया गया।${f.useBiz ? ` ${s.biz} की टीम` : ' यहाँ के लोग'} हर छोटी बात का ध्यान रखते हैं।`,
  (s, f) =>
    `अंदर आते ही अच्छा लगा क्योंकि पूरी जगह साफ-सुथरी थी।${f.useSeo ? ` ${s.seo} की तलाश थी और उम्मीद के मुताबिक सर्विस मिली।` : ''}`,
  (s, f) =>
    `इंतजार ज़्यादा नहीं करना पड़ा और काम की गुणवत्ता भी काफ़ी अच्छी रही।${f.useOwner ? ` ${s.owner} ने खुद ध्यान रखा कि सब ठीक रहे।` : ''}`,
  (s, f) =>
    `दोबारा आने लायक जगह है। काम की फिनिशिंग साफ है और पहले से सारी बात स्पष्ट बता दी जाती है।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} में` : 'यहाँ'} मेरा अनुभव बहुत आरामदायक रहा। सभी का बात करने का तरीका बहुत विनम्र है।`,
  (s, f) =>
    `परिवार के साथ आए थे और किसी को कोई शिकायत नहीं हुई।${f.useArea ? ` ${s.area} में यह एक भरोसेमंद जगह है।` : ''}`,
  (s, f) =>
    `जैसा मैंने बताया था, बिल्कुल वैसा ही ${s.service} मिला। स्टाफ का काम के प्रति ध्यान देखकर अच्छा लगा।`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} के लिए` : `${s.service} के लिए`} एक भरोसेमंद जगह। साफ उपकरण, शांत माहौल और समय की पाबंदी।`,
  (s, f) =>
    `दाम के हिसाब से काम बहुत संतोषजनक लगा। बिना किसी परेशानी के पूरा काम समय पर हो गया।`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} का व्यवहार बहुत सहज और मददगार लगा।` : 'यहाँ काम करने वालों का व्यवहार बहुत सहज था।'} आगे भी यहीं आना पसंद करूंगा।`,
  (s, f) =>
    `भीड़ होने के बावजूद किसी के साथ जल्दबाज़ी नहीं की गई और मेरा ${s.service} पूरे ध्यान से किया गया।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'यह जगह'} स्वच्छता पर काफी ध्यान देती है। काम शुरू करने से पहले हर जानकारी साफ तौर पर दी गई।`,
  (s, f) =>
    `दोस्त के कहने पर${f.useArea ? ` ${s.area} में` : ''} यहाँ आया था और अनुभव वाकई अच्छा रहा। समय और पैसे दोनों की सही कद्र है।`,
  (s, f) =>
    `सीधे और ईमानदार सुझाव मिले, कोई दिखावा नहीं।${f.useSeo ? ` ${s.seo} के लिए संतोषजनक अनुभव।` : ` ${s.service} से काफी खुश हूँ।`}`,
  (s, f) =>
    `बैठने की व्यवस्था साफ और आरामदायक है। स्टाफ ने विनम्रता से स्वागत किया और पूरा काम अच्छे से संभाला।`,
  (s, f) =>
    `दूसरी बार${f.useBiz ? ` ${s.biz}` : ' यहाँ'} आया हूँ और गुणवत्ता पहले जैसी ही अच्छी बनी हुई है।`,
  (s, f) =>
    `छोटी-छोटी बातों पर ध्यान देना इनकी सबसे अच्छी खूबी लगी। काम में पूरी तरह सफाई और सलीका दिखता है।`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ने मेरी सुविधा के अनुसार पूरा समय दिया।` : 'टीम ने मेरी सुविधा का पूरा ख्याल रखा।'} अनुभव बहुत सहज रहा।`,
  (s, f) =>
    `${s.service} करवाते समय बिल्कुल भी असहज महसूस नहीं हुआ। माहौल शांत और सुकून भरा था।`,
  (s, f) =>
    `${f.useArea ? `${s.area} इलाके में` : 'आस-पास'} अगर कोई व्यवस्थित जगह ढूंढ रहा है, तो यह एक अच्छा विकल्प है।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} की` : 'यहाँ की'} सबसे अच्छी बात यह है कि ये ग्राहकों की बात धैर्य से सुनते हैं।`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} के अनुभव से` : `अपने ${s.service} के अनुभव से`} पूरी तरह संतुष्ट हूँ। काम सादगी और ईमानदारी से किया गया।`,
  (s, f) =>
    `समय बहुत कम था मेरे पास, फिर भी उन्होंने वक्त पर और बिना गुणवत्ता कम किए बढ़िया काम कर दिया।`,
  (s, f) =>
    `हर चीज़ पहले से तय थी, कोई छिपा हुआ खर्च नहीं था। व्यवहार और काम दोनों से खुश हूँ।`,
  (s, f) =>
    `साफ-सफाई देखकर मन खुश हो गया।${f.useBiz ? ` ${s.biz}` : ' यहाँ'} के लोग अपने काम में काफी निपुण हैं।`,
  (s, f) =>
    `मैंने जैसा चाहा था उससे बिल्कुल भटके बिना, सटीक और साफ काम किया गया। धन्यवाद।`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} से बात करके अच्छा लगा, वे खुद हर काम की देखरेख करते हैं।` : 'पूरी टीम बहुत अच्छे तालमेल के साथ काम करती है।'}`,
  (s, f) =>
    `शाम के वक्त आया था, ज़्यादा शोर नहीं था और सेवा भी फुर्ती से मिल गई।`,
  (s, f) =>
    `${f.useArea ? `${s.area} में` : 'यहाँ'} कई बार आ चुका हूँ और हर बार काम का स्तर एक जैसा अच्छा मिलता है।`,
  (s, f) =>
    `आराम से बैठने की जगह, साफ पानी और विनम्र स्टाफ — अनुभव हर तरह से सहज रहा।`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} के लिए` : ''} काफ़ी सोचा-समझा और पेशेवर तरीका अपनाया जाता है। किसी तरह की हड़बड़ी नहीं दिखी।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'यह सेंटर'} ग्राहक की पसंद को प्राथमिकता देता है। नतीजा उम्मीद के मुताबिक रहा।`,
  (s, f) =>
    `पहली बार में ही भरोसा बन गया। काम साफ, समय पर और उचित दाम में हो गया।`,
  (s, f) =>
    `मेरे सवालों का बिना झुंझलाए आराम से जवाब दिया गया और सही जानकारी दी गई।`,
  (s, f) =>
    `इंतजार कम और काम पर ध्यान ज़्यादा — इसी वजह से यहाँ का अनुभव खास लगा।`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} के मार्गदर्शन में` : 'पूरी टीम के साथ'} मेरा ${s.service} बहुत बढ़िया रहा।`,
  (s, f) =>
    `किसी ने जल्दबाज़ी नहीं की और आख़िर में यह भी पूछा कि सब ठीक लगा या नहीं। अच्छा अनुभव रहा।`,
  (s, f) =>
    `यहाँ आने में कोई झंझट नहीं हुई${f.useArea ? `, ${s.area} में आसानी से मिल गया` : ''}। काम भी साफ-सुथरा हुआ।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'यहाँ'} आकर लगा कि ग्राहक के समय की कीमत समझी जाती है।`,
  (s, f) =>
    `अच्छा माहौल और साफ काम${f.useSeo ? ` — ${s.seo} के लिए बढ़िया विकल्प` : ''}। पूरी तरह से संतुष्ट हूँ।`,
  (s, f) =>
    `काम के दौरान बीच-बीच में मेरी पसंद पूछी गई, जिससे अंतिम नतीजा बिल्कुल सही आया।`,
  (s, f) =>
    `सफाई और अनुशासन देखकर काफी अच्छा लगा। ज़रूर फिर से आना चाहूंगा।`,
  (s, f) =>
    `सही सलाह और सादा व्यवहार ही इस जगह की पहचान है। मेरा ${s.service} आसानी से निपट गया।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} की टीम` : 'यहाँ के कर्मचारी'} काम को बोझ समझकर नहीं बल्कि ध्यान से करते हैं।`,
  (s, f) =>
    `${f.useArea ? `${s.area}` : 'इस क्षेत्र'} में शांत और व्यवस्थित सेवा के लिए यह जगह काफी सही लगी।`,
  (s, f) =>
    `काम की रफ्तार और सफाई दोनों संतुलित थीं। बिना थकान या परेशानी के पूरा समय अच्छा बीता।`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ने खुद स्थिति संभाली` : 'स्टाफ ने खुद पूरा ध्यान दिया'} और काम उम्मीद के अनुसार पूरा हुआ।`,
  (s, f) =>
    `सादा, स्वच्छ और भरोसेमंद अनुभव${f.useSeo ? ` (${s.seo})` : ''}। किसी बात की कमी नहीं लगी।`,
  (s, f) =>
    `जो बताया गया वही मिला और काम की गुणवत्ता भी साफ दिखी। समय अच्छा बीता।`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'यहाँ'} से बाहर निकलते वक्त पूरी संतुष्टि महसूस हुई। सभी का व्यवहार अच्छा रहा।`,
];

// =============================================================================
// 55+ AUTHENTIC MARATHI (DEVANAGARI) REVIEW TEMPLATES
// =============================================================================
const MR_REVIEW_BANK: TemplateBuilder[] = [
  (s, f) =>
    `${f.useBiz ? `${s.biz} मध्ये` : 'इथे'}${f.useArea ? ` (${s.area})` : ''} ${s.service} साठी आलो होतो. काम खूप शांतपणे आणि स्वच्छतेने करून मिळाले.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} यांनी माझी गरज नीट समजून घेतली आणि योग्य मार्गदर्शन केले.` : 'इथल्या स्टाफने मला नेमकं काय हवंय ते नीट ऐकून घेतलं.'} कामाचा दर्जा खूपच चांगला वाटला.`,
  (s, f) =>
    `स्वच्छता आणि वागणूक दोन्ही मनापासून आवडलं.${f.useSeo ? ` ${s.seo} साठी आलो होतो आणि अनुभव अगदी समाधानकारक होता.` : ` माझे ${s.service} अगदी वेळेत पूर्ण झाले.`}`,
  (s, f) =>
    `पहिल्यांदाच${f.useBiz ? ` ${s.biz}` : ' इथे'} भेट दिली आणि वातावरण खूप शांत वाटले. कोणतीही अनावश्यक गोष्ट घ्यायची सक्ती केली नाही.`,
  (s, f) =>
    `${f.useArea ? `${s.area} भागात` : 'इथे'} वेळ आणि पैशांचा योग्य मोबदला मिळतो. कर्मचारी खूप मदत करणारे आणि नम्र आहेत.`,
  (s, f) =>
    `माझे ${s.service} खूप व्यवस्थित पार पडले.${f.useBiz ? ` ${s.biz} मधील टीम` : ' इथले लोक'} प्रत्येक छोट्या गोष्टीकडे लक्ष देतात.`,
  (s, f) =>
    `आत येताच स्वच्छ जागा पाहून छान वाटलं.${f.useSeo ? ` ${s.seo} चा अनुभव अपेक्षेप्रमाणे छान राहिला.` : ''}`,
  (s, f) =>
    `फार वेळ थांबावे लागले नाही आणि कामात नीटनेटकेपणा होता.${f.useOwner ? ` ${s.owner} यांनी स्वतः लक्ष दिले.` : ''}`,
  (s, f) =>
    `पुन्हा यायला आवडेल अशी ही जागा आहे. प्रत्येक गोष्ट आधी स्पष्ट सांगितली जाते आणि कामाचा दर्जाही टिकवून ठेवला आहे.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} मध्ये` : 'इथे'} मला खूप निवांत वाटले. सगळ्यांची बोलण्याची पद्धत खूप सभ्य आणि आपुलकीची होती.`,
  (s, f) =>
    `कुटुंबासोबत आलो होतो आणि सगळ्यांनाच अनुभव छान वाटला.${f.useArea ? ` ${s.area} मध्ये ही एक विश्वासार्ह जागा आहे.` : ''}`,
  (s, f) =>
    `जसे मी सांगितले होते तंतोतंत तसेच ${s.service} मिळाले. कामाबद्दलचा प्रामाणिकपणा स्पष्ट जाणवला.`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} साठी` : `${s.service} साठी`} एक चांगला पर्याय. स्वच्छ साधने, शांत वातावरण आणि वेळेचे नियोजन उत्तम आहे.`,
  (s, f) =>
    `किंमतीच्या मानाने काम खूप समाधानकारक आहे. कोणताही गोंधळ न होता सगळं काम वेळेवर पूर्ण झालं.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} यांचा स्वभाव खूप मनमिळाऊ आहे.` : 'इथल्या कर्मचाऱ्यांचा स्वभाव खूप मनमिळाऊ आहे.'} पुढच्या वेळीही नक्की इथेच येईन.`,
  (s, f) =>
    `गर्दी असूनही अजिबात घाईगडबड न करता माझे ${s.service} अगदी लक्षपूर्वक पूर्ण केले.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'हे ठिकाण'} स्वच्छतेला खूप महत्त्व देते. काम सुरू करण्यापूर्वी सर्व माहिती नीट दिली जाते.`,
  (s, f) =>
    `मित्राच्या सांगण्यावरून${f.useArea ? ` ${s.area} मध्ये` : ''} आलो होतो आणि अनुभव खरोखरच छान आला.`,
  (s, f) =>
    `प्रामाणिक आणि योग्य सल्ला मिळाला, उगाच मोठेपणा नव्हता.${f.useSeo ? ` ${s.seo} चा चांगला अनुभव मिळाला.` : ''}`,
  (s, f) =>
    `बसण्याची सोय नीटनेटकी आणि आरामदायक होती. स्टाफने आपुलकीने विचारपूस करून काम पूर्ण केले.`,
  (s, f) =>
    `दुसऱ्यांदा${f.useBiz ? ` ${s.biz}` : ' इथे'} आलोय आणि आजही कामाचा दर्जा तितकाच चांगला टिकून आहे.`,
  (s, f) =>
    `छोट्या छोट्या तपशिलांकडे लक्ष देणे ही यांची खासियत वाटली. कामात अजिबात निष्काळजीपणा नव्हता.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} यांनी माझ्या सोयीनुसार वेळ दिला.` : 'टीमने माझ्या सोयीची पूर्ण काळजी घेतली.'} अनुभव खूप सोपा आणि सुखद होता.`,
  (s, f) =>
    `${s.service} करताना अजिबात दडपण जाणवले नाही. सगळं काम शांत आणि मोकळ्या वातावरणात पार पडलं.`,
  (s, f) =>
    `${f.useArea ? `${s.area} परिसरात` : 'जवळपास'} नीटनेटकी आणि शांत जागा हवी असेल तर नक्की विचार करू शकता.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} चं` : 'इथलं'} वैशिष्ट्य म्हणजे हे ग्राहकाचं म्हणणं शांतपणे ऐकून घेतात.`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} बद्दलचा` : `माझ्या ${s.service} बद्दलचा`} अनुभव पूर्णपणे समाधानकारक राहिला. काम साधेपणाने पण नीट केले गेले.`,
  (s, f) =>
    `माझ्याकडे वेळ कमी होता, तरीही त्यांनी कामाच्या दर्जात तडजोड न करता वेळेत काम पूर्ण करून दिलं.`,
  (s, f) =>
    `सर्व काही पारदर्शक होतं — वेळेचा आणि खर्चाचा अंदाज आधीच दिला गेला. वागणूक आणि काम दोन्ही छान.`,
  (s, f) =>
    `स्वच्छता पाहूनच मन प्रसन्न झालं.${f.useBiz ? ` ${s.biz}` : ' इथले'} कर्मचारी आपल्या कामात खरंच कुशल आहेत.`,
  (s, f) =>
    `माझ्या पसंतीनुसार काम करून मिळालं, कुठेही मनाविरुद्ध काही झालं नाही. धन्यवाद.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} स्वतः सगळ्या कामावर लक्ष ठेवतात, हे पाहून छान वाटलं.` : 'संपूर्ण टीम एकमेकांशी खूप छान समन्वय ठेवून काम करते.'}`,
  (s, f) =>
    `संध्याकाळी आलो होतो, शांत वातावरण होतं आणि कामही लवकर आटोपलं.`,
  (s, f) =>
    `${f.useArea ? `${s.area} मध्ये` : 'इथे'} मी बऱ्याचदा येतो आणि प्रत्येक वेळी कामात सातत्य दिसून येतं.`,
  (s, f) =>
    `आरामदायी जागा, स्वच्छता आणि नम्र संवाद — यामुळे एकूण अनुभव खूप चांगला झाला.`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} साठी` : ''} खूप व्यवस्थित आणि नियोजनबद्ध पद्धत वापरली जाते. घाईगडबड अजिबात नाही.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'हे ठिकाण'} ग्राहकांच्या आवडीला प्राधान्य देतं. निकाल मला हवा तसाच मिळाला.`,
  (s, f) =>
    `पहिल्याच भेटीत विश्वास वाटला. काम नीट, वेळेवर आणि योग्य दरात पूर्ण झालं.`,
  (s, f) =>
    `मी विचारलेल्या प्रत्येक प्रश्नाचे त्यांनी शांतपणे आणि स्पष्ट उत्तर दिले.`,
  (s, f) =>
    `थांबायला कमी वेळ लागला आणि कामावर लक्ष जास्त दिले गेले — ही गोष्ट मला खूप आवडली.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} यांच्या देखरेखीखाली` : 'संपूर्ण स्टाफसोबत'} माझा ${s.service} चा अनुभव छान राहिला.`,
  (s, f) =>
    `कोणीही घाई केली नाही आणि काम झाल्यावर सगळं व्यवस्थित वाटलं का याची विचारपूसही केली.`,
  (s, f) =>
    `येणं खूप सोपं होतं${f.useArea ? `, ${s.area} मध्ये सहज शोधता आलं` : ''} आणि कामही समाधानकारक झालं.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} मध्ये` : 'इथे'} ग्राहकांच्या वेळेचा आदर केला जातो, हे अनुभवायला मिळालं.`,
  (s, f) =>
    `चांगलं वातावरण आणि स्वच्छ काम${f.useSeo ? ` — ${s.seo} साठी उत्तम सोय` : ''}. अगदी समाधानी आहे.`,
  (s, f) =>
    `कामाच्या दरम्यान मधोमध माझं मत विचारलं गेलं, त्यामुळे शेवटचा परिणाम अगदी बरोबर आला.`,
  (s, f) =>
    `इथली शिस्त आणि नीटनेटकेपणा खूप आवडला. नक्की पुन्हा भेट देईन.`,
  (s, f) =>
    `योग्य मार्गदर्शन आणि साधी वागणूक हीच यांची ओळख आहे. माझे ${s.service} आरामात झाले.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} ची टीम` : 'इथले लोक'} काम कंटाळा न करता अगदी मनापासून करतात.`,
  (s, f) =>
    `${f.useArea ? `${s.area}` : 'या भागात'} शांत आणि व्यवस्थित सेवेसाठी ही जागा खूप योग्य वाटली.`,
  (s, f) =>
    `कामाचा वेग आणि स्वच्छता दोन्हीचा छान समतोल होता. कोणताही त्रास न होता वेळ छान गेला.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} यांनी स्वतः सगळं पाहिले` : 'स्टाफने स्वतः लक्ष दिले'} आणि काम मनासारखे झाले.`,
  (s, f) =>
    `साधा, स्वच्छ आणि विश्वासार्ह अनुभव${f.useSeo ? ` (${s.seo})` : ''}. कशाचीच कमतरता जाणवली नाही.`,
  (s, f) =>
    `जे सांगितले तसेच काम झाले आणि दर्जाही उत्तम राखला गेला. समाधानकारक भेट होती.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'इथून'} बाहेर पडताना खूप छान वाटलं. सगळ्यांची वागणूक आपुलकीची होती.`,
];

// =============================================================================
// 55+ AUTHENTIC HINGLISH (PURE ROMAN HINDI) REVIEW TEMPLATES
// Zero Devanagari, natural everyday conversational phrasing
// =============================================================================
const HINGLISH_REVIEW_BANK: TemplateBuilder[] = [
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'Yahan'}${f.useArea ? ` (${s.area})` : ''} aakar ${s.service} karwaya. Kaam bahut aaram aur safai ke saath kiya gaya, bilkul jaldbazi nahi thi.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ne meri baat dhyan se suni aur sahi salah di.` : 'Yahan ke logon ne meri zaroorat ko dhyan se suna aur sahi bataya.'} Kul milakar tajurba kaafi accha raha.`,
  (s, f) =>
    `Saaf-safai aur bartaav dono pasand aaye.${f.useSeo ? ` ${s.seo} ke liye aaye the aur kaam poori tarah theek raha.` : ` Mera ${s.service} samay par poora ho gaya.`}`,
  (s, f) =>
    `Pehli baar${f.useBiz ? ` ${s.biz}` : ' yahan'} aaye the aur mahaul kaafi shaant aur aaramdayak laga. Koi faltu cheez thopne ki koshish nahi ki gayi.`,
  (s, f) =>
    `${f.useArea ? `${s.area} ke paas` : 'Yahan'} sahi samay par kaam aur theek daam dono mile. Wahan ke log kaafi milansaar aur madad karne wale hain.`,
  (s, f) =>
    `Mera ${s.service} bahut hi saleeke se kiya gaya.${f.useBiz ? ` ${s.biz} ki poori toli` : ' Yahan ke log'} har chhoti baat ka dhyan rakhte hain.`,
  (s, f) =>
    `Andar aate hi accha laga kyunki poori jagah saaf-suthri rakhi hui thi.${f.useSeo ? ` ${s.seo} ke liye aaye the aur ummeed ke hisaab se madad mili.` : ''}`,
  (s, f) =>
    `Zyada intezar nahi karna pada aur kaam ki gunvatta bhi kaafi acchi lagi.${f.useOwner ? ` ${s.owner} ne khud dhyan diya ki sab theek rahe.` : ''}`,
  (s, f) =>
    `Dobara aane layak jagah hai. Kaam mein safai dikhti hai aur pehle se hi saari baat saaf bata di jaati hai.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} mein` : 'Yahan'} mera tajurba bahut aaramdayak raha. Sabhi ke baat karne ka dhang bahut narm tha.`,
  (s, f) =>
    `Gharwalon ke saath aaye the aur kisi ko koi shikayat nahi hui.${f.useArea ? ` ${s.area} mein yeh ek bharosemand jagah hai.` : ''}`,
  (s, f) =>
    `Jaisa maine bataya tha bilkul waisa hi ${s.service} mila. Kaam ke prati unka dhyan dekhkar dil khush ho gaya.`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} ke liye` : `${s.service} ke liye`} ek badhiya jagah hai. Saaf saaman, shaant mahaul aur samay ki pabandi acchi lagi.`,
  (s, f) =>
    `Daam ke hisaab se kaam kaafi santoshjanak laga. Bina kisi jhanjhat ke poora kaam samay par nipat gaya.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ka bartaav bahut apnaapan wala laga.` : 'Yahan kaam karne walon ka bartaav bahut apnaapan wala tha.'} Aage bhi yahin aana pasand karunga.`,
  (s, f) =>
    `Bheed hone ke bawajood kisi ne jaldbazi nahi dikhayi aur mera ${s.service} poore dhyan se kiya gaya.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'Yeh jagah'} safai par kaafi zor deti hai. Kaam shuru karne se pehle har baat saaf taur par samjhayi gayi.`,
  (s, f) =>
    `Dost ke kehne par${f.useArea ? ` ${s.area} mein` : ''} yahan aaya tha aur sach kahun toh anubhav waqai accha raha.`,
  (s, f) =>
    `Seedhe aur sachche sujhav mile, koi dikhawa nahi tha.${f.useSeo ? ` ${s.seo} se kaafi khush hoon.` : ''}`,
  (s, f) =>
    `Baithne ki jagah saaf aur aaramdayak thi. Logon ne muskura kar swagat kiya aur poora kaam acche se sambhala.`,
  (s, f) =>
    `Doosri baar${f.useBiz ? ` ${s.biz}` : ' yahan'} aaya hoon aur kaam ka star aaj bhi pehle jaisa hi badhiya bana hua hai.`,
  (s, f) =>
    `Chhoti-chhoti baaton par dhyan dena inki sabse badi khoobi lagi. Kaam mein poori safai aur dhyan dikhta hai.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ne meri suvidha ke hisaab se poora samay diya.` : 'Wahan ke logon ne meri suvidha ka poora khayal rakha.'} Anubhav bahut aasaan raha.`,
  (s, f) =>
    `${s.service} karwate waqt bilkul jhijhak mehsoos nahi hui. Mahaul kaafi shaant aur sukoon bhara tha.`,
  (s, f) =>
    `${f.useArea ? `${s.area} ilake mein` : 'Aas-paas'} agar koi saaf-suthri jagah dhoondh raha hai toh yahan aa sakta hai.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} ki` : 'Yahan ki'} sabse acchi baat yeh hai ki woh grahak ki baat dhairya se sunte hain.`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} ke tajurbe se` : `Apne ${s.service} ke tajurbe se`} poori tarah khush hoon. Kaam bina dikhawe ke imaandari se kiya gaya.`,
  (s, f) =>
    `Mere paas samay kam tha lekin phir bhi unhone gunvatta kam kiye bina waqt par kaam poora kar diya.`,
  (s, f) =>
    `Har cheez pehle se saaf thi, koi chhupa hua kharch nahi tha. Bartaav aur kaam dono se poora santosh mila.`,
  (s, f) =>
    `Saaf-safai dekhkar hi mann khush ho gaya.${f.useBiz ? ` ${s.biz}` : ' Yahan'} ke log apne kaam mein kaafi maahir hain.`,
  (s, f) =>
    `Jaisa maine socha tha usse bilkul bhatke bina, sateek aur saaf kaam kiya gaya. Shukriya.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} khud har kaam ki dekhrekh karte hain, yeh dekhkar bharosa badha.` : 'Yahan sabhi log acche taalmel ke saath kaam karte hain.'}`,
  (s, f) =>
    `Shaam ke waqt aaya tha, shor-sharaba kam tha aur sewa bhi jaldi mil gayi.`,
  (s, f) =>
    `${f.useArea ? `${s.area} mein` : 'Yahan'} main pehle bhi aa chuka hoon aur har baar kaam ek jaisa accha milta hai.`,
  (s, f) =>
    `Baithne ki sahi suvidha, saaf jagah aur narm bartaav — kul milakar sab kuch badhiya raha.`,
  (s, f) =>
    `${f.useSeo ? `${s.seo} ke liye` : ''} kaafi suljha hua tareeka apnaya jaata hai. Kisi tarah ki hadbadi nahi dikhi.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'Yeh jagah'} grahak ki pasand ko aage rakhti hai. Nateeja jaisa chahiye tha waisa hi nikla.`,
  (s, f) =>
    `Pehli hi mulaqat mein bharosa ban gaya. Kaam saaf, samay par aur sahi daam mein ho gaya.`,
  (s, f) =>
    `Mere har sawal ka bina chidhe aaram se jawab diya gaya aur poori jankari mili.`,
  (s, f) =>
    `Intezar kam aur kaam par dhyan zyada — isi wajah se yahan ka tajurba khaas laga.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ke bharose aur dekhrekh mein` : 'Wahan ke logon ki madad se'} mera ${s.service} badhiya raha.`,
  (s, f) =>
    `Kisi ne jaldi nahi machayi aur aakhir mein yeh bhi poocha ki sab theek laga ya nahi.`,
  (s, f) =>
    `Aane mein koi dikkat nahi hui${f.useArea ? `, ${s.area} mein aasani se mil gaya` : ''} aur kaam bhi badhiya hua.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'Yahan'} aakar mehsoos hua ki grahak ke samay ki keemat samjhi jaati hai.`,
  (s, f) =>
    `Accha mahaul aur saaf kaam${f.useSeo ? ` — ${s.seo} ke liye badhiya jagah` : ''}. Poori tarah santusht hoon.`,
  (s, f) =>
    `Kaam ke beech mein meri pasand poochi gayi, jisse aakhiri nateeja bilkul sahi aaya.`,
  (s, f) =>
    `Safai aur dhang dekhkar bahut accha laga. Pakka phir se aana chahunga.`,
  (s, f) =>
    `Sahi salah aur saada bartaav hi is jagah ki pehchaan hai. Mera ${s.service} aasani se poora ho gaya.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz} ke log` : 'Yahan ke log'} kaam ko bojh samajhkar nahi balki dil se aur dhyan se karte hain.`,
  (s, f) =>
    `${f.useArea ? `${s.area}` : 'Is taraf'} shaant aur vyavasthit sewa ke liye yeh jagah kaafi sahi lagi.`,
  (s, f) =>
    `Kaam ki raftar aur safai dono mein accha taalmel tha. Bina thakaan ke poora kaam nipat gaya.`,
  (s, f) =>
    `${f.useOwner ? `${s.owner} ne khud poora dhyan diya` : 'Sabhi logon ne khud poora dhyan diya'} aur kaam ummeed ke mutabik poora hua.`,
  (s, f) =>
    `Saada, swachh aur bharosemand tajurba${f.useSeo ? ` (${s.seo})` : ''}. Kisi cheez ki kami mehsoos nahi hui.`,
  (s, f) =>
    `Jo bataya gaya wahi mila aur kaam ka star bhi saaf dikha. Samay accha beeta.`,
  (s, f) =>
    `${f.useBiz ? `${s.biz}` : 'Yahan'} se bahar nikalte waqt poori khushi mehsoos hui. Sabka bartaav accha tha.`,
];

export const BACKEND_REVIEW_TEMPLATE_COUNTS: Record<QualityReviewLanguage, number> = {
  en: EN_REVIEW_BANK.length,
  hi: HI_REVIEW_BANK.length,
  mr: MR_REVIEW_BANK.length,
  hinglish: HINGLISH_REVIEW_BANK.length,
};

function getBankForLanguage(lang: QualityReviewLanguage): TemplateBuilder[] {
  if (lang === 'hi') return HI_REVIEW_BANK;
  if (lang === 'mr') return MR_REVIEW_BANK;
  if (lang === 'hinglish') return HINGLISH_REVIEW_BANK;
  return EN_REVIEW_BANK;
}

/**
 * Generates `count` (minimum 5) distinct, natural human-sounding ready-to-post drafts
 * dynamically adapted with the business name, optional owner name (used sparingly, NOT every review),
 * short locality/area (used sparingly, NOT every review), and clean SEO phrases (zero superlatives).
 */
export function selectContextualReadyDrafts(
  input: ContextualReadyDraftInput,
): string[] {
  const bank = getBankForLanguage(input.language);
  const count = Math.max(5, Math.min(10, Math.round(input.count ?? 6)));
  const seed = Math.max(1, Math.round(input.seed ?? 1));

  const cleanBiz = (input.businessName || '').trim() || 'this business';
  const cleanOwner = (input.ownerName || '').trim();
  const areaPool = extractLocationCandidates(input.locality, input.city, input.address);

  const servicePool = [
    ...(Array.isArray(input.servicesOffered) ? input.servicesOffered : []),
    ...(Array.isArray(input.productsOffered) ? input.productsOffered : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const seoPool = (Array.isArray(input.seoKeywords) ? input.seoKeywords : [])
    .map((k) => sanitizePhraseNoSuperlatives(k))
    .filter((k) => k.length >= 3);

  // Use deterministic stride through the 55-item bank so adjacent seeds yield non-overlapping sets
  const step = 7;
  const startOffset = ((seed - 1) * count * step) % bank.length;

  const drafts: string[] = [];
  const usedIndices = new Set<number>();
  let ownerMentionsUsed = 0;
  let areaMentionsUsed = 0;

  for (let i = 0; i < count; i += 1) {
    let idx = (startOffset + i * step) % bank.length;
    while (usedIndices.has(idx) && usedIndices.size < bank.length) {
      idx = (idx + 1) % bank.length;
    }
    usedIndices.add(idx);

    const builder = bank[idx];
    const svc =
      servicePool.length > 0
        ? servicePool[(seed + i) % servicePool.length]
        : defaultServiceNoun(input.category, input.language);
    const seo = seoPool.length > 0 ? seoPool[(seed + i * 2) % seoPool.length] : '';
    const areaChoice = areaPool.length > 0 ? areaPool[(seed + i) % areaPool.length] : '';

    // Never force owner name into every review (max 1-2 out of 5-6)
    const allowOwnerThisCard =
      Boolean(cleanOwner) && ownerMentionsUsed < 2 && (idx + seed + i) % 4 === 0;
    if (allowOwnerThisCard) ownerMentionsUsed += 1;

    // Never force area/address into every review (max 2-3 out of 5-6, varying sector/building/locality)
    const allowAreaThisCard =
      Boolean(areaChoice) && areaMentionsUsed < 3 && (idx + i) % 2 === 0;
    if (allowAreaThisCard) areaMentionsUsed += 1;

    // Include business name in ~70% of drafts for natural variety
    const allowBizThisCard = (i + seed) % 3 !== 2;

    // Weave 1 clean SEO phrase in ~50% of drafts
    const allowSeoThisCard = Boolean(seo) && (i + seed) % 2 === 0;

    const rendered = builder(
      {
        biz: cleanBiz,
        service: svc,
        area: areaChoice,
        owner: cleanOwner,
        seo,
      },
      {
        useBiz: allowBizThisCard,
        useArea: allowAreaThisCard,
        useOwner: allowOwnerThisCard,
        useSeo: allowSeoThisCard,
      },
    )
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?])/g, '$1')
      .trim();

    if (rendered && !drafts.includes(rendered)) {
      drafts.push(rendered);
    }
  }

  return drafts;
}

/**
 * Provides diverse human-style exemplars from the 55-per-language training bank
 * so AI prompt calibration produces humanly phrasing as usage grows.
 */
export function getTrainingExemplarsFromBank(
  input: ContextualReadyDraftInput,
): string[] {
  return selectContextualReadyDrafts({
    ...input,
    count: Math.min(8, Math.max(5, input.count ?? 6)),
  });
}
