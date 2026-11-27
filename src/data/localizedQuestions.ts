import type { FeedbackQuestion, LocalizedQuestionContent, ReviewLanguage } from '../types';

export interface LocalizedOptionItem {
  canonicalValue: string;
  displayLabel: string;
}

export interface LocalizedFormUiStrings {
  languageSelectorLabel: string;
  languageSelectorHint: string;
  requiredLabel: string;
  optionalLabel: string;
  selectMultipleLabel: string;
  tapExpressionLabel: string;
  generateReviewButton: string;
  generatingReviewButton: string;
  writingProgressHint: string;
  textAreaPlaceholderDefault: string;
  answerCountLabel: (answered: number, total: number) => string;
  ratingLabels: [string, string, string, string, string];
  step2ReviewHeading: string;
  step2Subtitle: string;
  copyReviewButton: string;
  copiedButton: string;
  postOnGoogleButton: string;
  editReviewButton: string;
  doneEditingButton: string;
  regenerateButton: string;
  backButton: string;
  instantReadySubtitle: string;
  instantRefreshButton: string;
  instantCopyAndOpenButton: string;
  instantOpenGoogleAgainButton: string;
}

type LangMap = Partial<Record<ReviewLanguage, string>>;

const PROMPT_TRANSLATIONS: Record<string, LangMap> = {
  // Hair Salons
  'Which service did you take today?': {
    mr: 'आज तुम्ही कोणती सेवा घेतली?',
    hi: 'आज आपने कौन सी सेवा ली?',
    hinglish: 'Aaj aapne kaun si service li?',
  },
  'How did your styling turn out?': {
    mr: 'तुमची हेअरस्टाईल आणि लूक कसा वाटला?',
    hi: 'आपकी स्टाइलिंग और लुक कैसा रहा?',
    hinglish: 'Aapki styling aur look kaisa raha?',
  },
  'How were your stylist, wait time, and hygiene?': {
    mr: 'स्टायलिस्ट, प्रतीक्षा वेळ आणि स्वच्छता कशी होती?',
    hi: 'स्टाइलिस्ट, प्रतीक्षा समय और स्वच्छता कैसी रही?',
    hinglish: 'Stylist, wait time aur cleanliness kaisi rahi?',
  },
  'Would you visit us again?': {
    mr: 'तुम्ही पुन्हा भेट द्याल का?',
    hi: 'क्या आप फिर से आना चाहेंगे?',
    hinglish: 'Kya aap dobara visit karna chahenge?',
  },
  'Any specific detail? (Optional)': {
    mr: 'काही विशेष अनुभव सांगायचा आहे का? (ऐच्छिक)',
    hi: 'कोई खास बात बताना चाहेंगे? (वैकल्पिक)',
    hinglish: 'Koi special baat share karni hai? (Optional)',
  },

  // Restaurants
  'What did you have today?': {
    mr: 'आज तुम्ही काय ऑर्डर केले होते?',
    hi: 'आज आपने क्या ऑर्डर किया?',
    hinglish: 'Aaj aapne kya try kiya?',
  },
  'How was the food & taste?': {
    mr: 'जेवण आणि चव कशी होती?',
    hi: 'खाना और स्वाद कैसा था?',
    hinglish: 'Khana aur taste kaisa tha?',
  },
  'How were the service speed, staff & ambience?': {
    mr: 'सर्व्हिसची गती, कर्मचारी आणि वातावरण कसे होते?',
    hi: 'सर्विस की स्पीड, स्टाफ और माहौल कैसा था?',
    hinglish: 'Service speed, staff aur ambience kaisa tha?',
  },
  'Would you visit again?': {
    mr: 'तुम्ही पुन्हा भेट द्याल का?',
    hi: 'क्या आप फिर से आएंगे?',
    hinglish: 'Kya aap dobara aayenge?',
  },
  'Any dish or quick note? (Optional)': {
    mr: 'कोणत्या डिशबद्दल किंवा अनुभवाबद्दल काही लिहायचे आहे का? (ऐच्छिक)',
    hi: 'किसी डिश या अनुभव के बारे में कुछ लिखना चाहेंगे? (वैकल्पिक)',
    hinglish: 'Kisi dish ya experience ke baare mein kuch likhna hai? (Optional)',
  },

  // Beauty Salons
  'Which treatments did you have today?': {
    mr: 'आज तुम्ही कोणती ब्युटी ट्रीटमेंट घेतली?',
    hi: 'आज आपने कौन सा ट्रीटमेंट लिया?',
    hinglish: 'Aaj aapne kaun sa beauty treatment liya?',
  },
  'How satisfied were you with the result?': {
    mr: 'तुम्हाला रिझल्टबद्दल किती समाधान वाटले?',
    hi: 'आप परिणाम से कितने संतुष्ट रहे?',
    hinglish: 'Aap result se kitne satisfied rahe?',
  },
  'How were the staff, hygiene & timing?': {
    mr: 'कर्मचारी, स्वच्छता आणि वेळेचे नियोजन कसे होते?',
    hi: 'स्टाफ, स्वच्छता और समय की व्यवस्था कैसी थी?',
    hinglish: 'Staff, hygiene aur timing kaisi rahi?',
  },
  'Would you book with us again?': {
    mr: 'तुम्ही पुन्हा अपॉइंटमेंट बुक कराल का?',
    hi: 'क्या आप फिर से हमारे साथ बुकिंग करेंगे?',
    hinglish: 'Kya aap dobara booking karenge?',
  },
  'Any specific note? (Optional)': {
    mr: 'काही खास सूचना किंवा अनुभव? (ऐच्छिक)',
    hi: 'कोई खास नोट या अनुभव? (वैकल्पिक)',
    hinglish: 'Koi special note share karna hai? (Optional)',
  },

  // Hotels
  'Which parts of your stay did you experience?': {
    mr: 'तुमच्या मुक्कामादरम्यान कोणती सेवा अनुभवली?',
    hi: 'अपने ठहराव के दौरान आपने कौन सी सुविधाएं लीं?',
    hinglish: 'Apne stay mein aapne kaun si services experience ki?',
  },
  'How was your stay overall?': {
    mr: 'तुमचा एकूण मुक्काम कसा होता?',
    hi: 'आपका कुल मिलाकर ठहराव कैसा रहा?',
    hinglish: 'Aapka overall stay kaisa raha?',
  },
  'How were the staff & room upkeep?': {
    mr: 'कर्मचारी आणि रूमची स्वच्छता कशी होती?',
    hi: 'स्टाफ और कमरे की साफ-सफाई कैसी थी?',
    hinglish: 'Staff aur room cleaning kaisi rahi?',
  },
  'Would you stay here again?': {
    mr: 'तुम्ही येथे पुन्हा राहणे पसंत कराल का?',
    hi: 'क्या आप यहां फिर से ठहरना चाहेंगे?',
    hinglish: 'Kya aap yahan dobara stay karna chahenge?',
  },
  'Any specific stay detail? (Optional)': {
    mr: 'मुक्कामाबद्दल काही खास लिहायचे आहे का? (ऐच्छिक)',
    hi: 'ठहराव से जुड़ी कोई खास बात? (वैकल्पिक)',
    hinglish: 'Stay ke baare mein koi specific detail? (Optional)',
  },

  // Spas
  'Which spa session did you take?': {
    mr: 'तुम्ही कोणते स्पा सेशन घेतले?',
    hi: 'आपने कौन सा स्पा सेशन लिया?',
    hinglish: 'Aaj aapne kaun sa spa session liya?',
  },
  'How relaxing was your session?': {
    mr: 'तुमचे सेशन किती आरामदायी होते?',
    hi: 'आपका सेशन कितना आरामदायक रहा?',
    hinglish: 'Aapka session kitna relaxing raha?',
  },
  'How were the therapist & ambience?': {
    mr: 'थेरपिस्ट आणि स्पाचे वातावरण कसे होते?',
    hi: 'थेरेपिस्ट और स्पा का माहौल कैसा था?',
    hinglish: 'Therapist aur ambience kaisa tha?',
  },

  // Gyms
  'What did you use today?': {
    mr: 'आज तुम्ही जिममधील कोणती सुविधा वापरली?',
    hi: 'आज आपने जिम की कौन सी सुविधा का उपयोग किया?',
    hinglish: 'Aaj aapne gym mein kya use kiya?',
  },
  'How was your workout experience?': {
    mr: 'तुमचा वर्कआऊट अनुभव कसा होता?',
    hi: 'आपका वर्कआउट अनुभव कैसा रहा?',
    hinglish: 'Aapka workout experience kaisa raha?',
  },
  'How were the equipment, cleanliness & trainers?': {
    mr: 'मशीनरी, स्वच्छता आणि ट्रेनर्स कसे होते?',
    hi: 'उपकरण, साफ-सफाई और ट्रेनर्स कैसे थे?',
    hinglish: 'Equipment, cleanliness aur trainers kaise the?',
  },
  'Would you recommend this gym?': {
    mr: 'तुम्ही इतरांना या जिमची शिफारस कराल का?',
    hi: 'क्या आप इस जिम की सिफारिश करेंगे?',
    hinglish: 'Kya aap is gym ko recommend karenge?',
  },

  // Healthcare
  'What was your visit for today?': {
    mr: 'आज तुमची भेट कशासाठी होती?',
    hi: 'आज आप किस परामर्श या जांच के लिए आए थे?',
    hinglish: 'Aaj aapki clinic visit kis liye thi?',
  },
  'How was your overall care?': {
    mr: 'तुम्हाला मिळालेली एकूण वैद्यकीय सेवा कशी होती?',
    hi: 'आपको मिली कुल देखभाल और इलाज कैसा रहा?',
    hinglish: 'Aapko mili overall care aur treatment kaisi rahi?',
  },
  'How were the doctor, staff & wait time?': {
    mr: 'डॉक्टर, कर्मचारी आणि प्रतीक्षा वेळ कसा होता?',
    hi: 'डॉक्टर, स्टाफ और इंतजार का समय कैसा था?',
    hinglish: 'Doctor, staff aur wait time kaisa raha?',
  },
  'Would you visit again if needed?': {
    mr: 'गरज पडल्यास तुम्ही पुन्हा येथे उपचारासाठी याल का?',
    hi: 'ज़रूरत पड़ने पर क्या आप फिर से यहां आना चाहेंगे?',
    hinglish: 'Zaroorat padne par kya aap dobara visit karenge?',
  },
  'Any appointment note? (Optional)': {
    mr: 'अपॉइंटमेंटबद्दल काही खास नोंद? (ऐच्छिक)',
    hi: 'अपॉइंटमेंट के बारे में कोई खास बात? (वैकल्पिक)',
    hinglish: 'Appointment ke baare mein koi note? (Optional)',
  },

  // Retail Stores
  'What did you visit the store for?': {
    mr: 'तुम्ही आज दुकानात कशासाठी आला होता?',
    hi: 'आज आप स्टोर में किस खरीदारी के लिए आए थे?',
    hinglish: 'Aaj aap store mein kis shopping ke liye aaye the?',
  },
  'How was your shopping experience?': {
    mr: 'तुमचा खरेदीचा अनुभव कसा होता?',
    hi: 'आपका खरीदारी का अनुभव कैसा रहा?',
    hinglish: 'Aapka shopping experience kaisa raha?',
  },
  'How were the stock, staff & checkout?': {
    mr: 'वस्तूंचा साठा, कर्मचारी आणि बिलिंग प्रक्रिया कशी होती?',
    hi: 'सामान की वैरायटी, स्टाफ और बिलिंग कैसी थी?',
    hinglish: 'Stock variety, staff aur billing kaisi rahi?',
  },
  'Would you shop here again?': {
    mr: 'तुम्ही येथून पुन्हा खरेदी कराल का?',
    hi: 'क्या आप यहां फिर से खरीदारी करेंगे?',
    hinglish: 'Kya aap yahan dobara shopping karenge?',
  },
  'Any item or note? (Optional)': {
    mr: 'एखाद्या वस्तूबद्दल किंवा अनुभवाबद्दल काही लिहायचे आहे का? (ऐच्छिक)',
    hi: 'किसी उत्पाद या अनुभव के बारे में कुछ लिखना चाहेंगे? (वैकल्पिक)',
    hinglish: 'Kisi item ya experience ke baare mein note? (Optional)',
  },

  // Automobile Services
  'Which service did your vehicle get?': {
    mr: 'तुमच्या वाहनासाठी कोणती सर्व्हिस केली गेली?',
    hi: 'आपके वाहन की कौन सी सर्विस की गई?',
    hinglish: 'Aapki gaadi ki kaun si service hui?',
  },
  'How was the work quality?': {
    mr: 'कामाची गुणवत्ता कशी होती?',
    hi: 'काम की गुणवत्ता कैसी थी?',
    hinglish: 'Kaam ki quality kaisi thi?',
  },
  'How were communication & delivery time?': {
    mr: 'माहिती देणे आणि गाडी डिलिव्हरीची वेळ कशी होती?',
    hi: 'जानकारी देने का तरीका और डिलीवरी टाइम कैसा था?',
    hinglish: 'Communication aur delivery timing kaisi rahi?',
  },
  'Would you bring your vehicle here again?': {
    mr: 'तुम्ही तुमचे वाहन पुन्हा येथे आणाल का?',
    hi: 'क्या आप अपना वाहन फिर से यहां लाएंगे?',
    hinglish: 'Kya aap apni vehicle dobara yahan layenge?',
  },
  'Any vehicle note? (Optional)': {
    mr: 'वाहनाबद्दल काही खास लिहायचे आहे का? (ऐच्छिक)',
    hi: 'वाहन से जुड़ी कोई खास बात? (वैकल्पिक)',
    hinglish: 'Vehicle service ke baare mein koi note? (Optional)',
  },

  // Clothing & Apparel
  'What did you shop for today?': {
    mr: 'आज तुम्ही कोणत्या कपड्यांची खरेदी केली?',
    hi: 'आज आपने किस तरह के कपड़ों की खरीदारी की?',
    hinglish: 'Aaj aapne kis type ke kapdon ki shopping ki?',
  },
  'How was the fitting, collection, and fabric quality?': {
    mr: 'फिटिंग, कलेक्शन आणि कापडाचा दर्जा कसा होता?',
    hi: 'फिटिंग, कलेक्शन और कपड़े की क्वालिटी कैसी थी?',
    hinglish: 'Fitting, collection aur fabric quality kaisi thi?',
  },
  'How were the staff assistance, trial room, and billing?': {
    mr: 'कर्मचाऱ्यांची मदत, ट्रायल रूम आणि बिलिंग कशी होती?',
    hi: 'स्टाफ की मदद, ट्रायल रूम और बिलिंग कैसी थी?',
    hinglish: 'Staff help, trial room aur billing kaisi rahi?',
  },
  'Would you shop with us again?': {
    mr: 'तुम्ही आमच्याकडून पुन्हा खरेदी कराल का?',
    hi: 'क्या आप हमारे साथ फिर से खरीदारी करेंगे?',
    hinglish: 'Kya aap humare saath dobara shopping karenge?',
  },
  'Any outfit or fitting note? (Optional)': {
    mr: 'कपडे किंवा फिटिंगबद्दल काही खास नोंद? (ऐच्छिक)',
    hi: 'कपड़ों या फिटिंग के बारे में कोई खास बात? (वैकल्पिक)',
    hinglish: 'Outfit ya fitting ke baare mein koi note? (Optional)',
  },

  // Jewelry & Gold Shops
  'What were you looking for today?': {
    mr: 'आज तुम्ही कोणत्या दागिन्यांची पाहणी किंवा खरेदी केली?',
    hi: 'आज आप किस प्रकार की ज्वेलरी देख या खरीद रहे थे?',
    hinglish: 'Aaj aap kis type ki jewellery dekh rahe the?',
  },
  'How was the design finish and purity explanation?': {
    mr: 'डिझाइनची फिनिशिंग आणि शुद्धतेची माहिती कशी होती?',
    hi: 'डिज़ाइन की फिनिशिंग और शुद्धता की जानकारी कैसी थी?',
    hinglish: 'Design finish aur purity explanation kaisi rahi?',
  },
  'What stood out about the showroom experience?': {
    mr: 'शोरूमच्या अनुभवात तुम्हाला सर्वात जास्त काय आवडले?',
    hi: 'शोरूम के अनुभव में आपको सबसे अच्छा क्या लगा?',
    hinglish: 'Showroom experience mein aapko kya sabse accha laga?',
  },
  'Would you recommend us to family and friends?': {
    mr: 'तुम्ही कुटुंब आणि मित्रांना आमची शिफारस कराल का?',
    hi: 'क्या आप परिवार और दोस्तों को हमारी सिफारिश करेंगे?',
    hinglish: 'Kya aap family aur friends ko recommend karenge?',
  },
  'Any specific detail about your visit? (Optional)': {
    mr: 'तुमच्या भेटीबद्दल काही खास लिहायचे आहे का? (ऐच्छिक)',
    hi: 'अपनी विज़िट के बारे में कोई खास बात लिखना चाहेंगे? (वैकल्पिक)',
    hinglish: 'Apni visit ke baare mein koi detail? (Optional)',
  },

  // Local Shops & Stores
  'What did you visit our shop for today?': {
    mr: 'आज तुम्ही आमच्या दुकानात कशासाठी आला होता?',
    hi: 'आज आप हमारी दुकान पर किस सामान के लिए आए थे?',
    hinglish: 'Aaj aap humari shop par kis liye aaye the?',
  },
  'What did you appreciate most at the shop?': {
    mr: 'दुकानातील कोणती गोष्ट तुम्हाला सर्वात जास्त आवडली?',
    hi: 'दुकान की कौन सी बात आपको सबसे ज्यादा पसंद आई?',
    hinglish: 'Shop ki kaun si baat aapko sabse acchi lagi?',
  },
  'Any feedback for our shop? (Optional)': {
    mr: 'आमच्या दुकानासाठी काही अभिप्राय आहे का? (ऐच्छिक)',
    hi: 'हमारी दुकान के लिए कोई सुझाव या प्रतिक्रिया? (वैकल्पिक)',
    hinglish: 'Humari shop ke liye koi feedback? (Optional)',
  },

  // Other Businesses
  'How was your overall experience?': {
    mr: 'तुमचा एकूण अनुभव कसा होता?',
    hi: 'आपका कुल अनुभव कैसा रहा?',
    hinglish: 'Aapka overall experience kaisa raha?',
  },
  'What stood out during your visit?': {
    mr: 'तुमच्या भेटीदरम्यान तुम्हाला काय विशेष वाटले?',
    hi: 'आपकी विज़िट के दौरान आपको क्या खास लगा?',
    hinglish: 'Aapki visit ke dauraan kya special laga?',
  },
};

const PLACEHOLDER_TRANSLATIONS: Record<string, LangMap> = {
  'Optional: mention what you liked or what could be smoother...': {
    mr: 'ऐच्छिक: तुम्हाला काय आवडले किंवा काय आणखी चांगले होऊ शकते ते लिहा...',
    hi: 'वैकल्पिक: आपको क्या पसंद आया या क्या और बेहतर हो सकता है, लिखें...',
    hinglish: 'Optional: batayein aapko kya pasand aaya ya kya improve ho sakta hai...',
  },
  'Optional: name a dish you tried or share a quick detail...': {
    mr: 'ऐच्छिक: तुम्ही खाल्लेल्या डिशचे नाव किंवा अनुभव लिहा...',
    hi: 'वैकल्पिक: आपने जो डिश ट्राई की उसका नाम या अनुभव लिखें...',
    hinglish: 'Optional: jo dish aapne try ki uska naam ya quick note likhein...',
  },
  'Optional: share how your treatment felt...': {
    mr: 'ऐच्छिक: तुमचा ट्रीटमेंटचा अनुभव कसा होता ते लिहा...',
    hi: 'वैकल्पिक: आपका ट्रीटमेंट अनुभव कैसा रहा, लिखें...',
    hinglish: 'Optional: batayein aapka treatment kaisa laga...',
  },
  'Optional: share something specific from your stay...': {
    mr: 'ऐच्छिक: मुक्कामातील कोणतीही खास आठवण किंवा अनुभव लिहा...',
    hi: 'वैकल्पिक: अपने ठहराव से जुड़ी कोई खास बात लिखें...',
    hinglish: 'Optional: stay ki koi specific baat share karein...',
  },
  'Optional: mention what helped you relax most...': {
    mr: 'ऐच्छिक: तुम्हाला सर्वात जास्त आराम कशामुळे वाटला ते लिहा...',
    hi: 'वैकल्पिक: आपको सबसे ज्यादा आराम किससे मिला, लिखें...',
    hinglish: 'Optional: batayein sabse zyada relax kya laga...',
  },
  'Optional: mention a trainer, class, or facility note...': {
    mr: 'ऐच्छिक: ट्रेनर, क्लास किंवा सुविधेबद्दल नोंद लिहा...',
    hi: 'वैकल्पिक: ट्रेनर, क्लास या सुविधा के बारे में लिखें...',
    hinglish: 'Optional: trainer, class ya facility ke baare mein likhein...',
  },
  'Optional: share how the consultation or reception felt...': {
    mr: 'ऐच्छिक: तपासणी किंवा रिसेप्शनचा अनुभव कसा होता ते लिहा...',
    hi: 'वैकल्पिक: परामर्श या रिसेप्शन का अनुभव कैसा रहा, लिखें...',
    hinglish: 'Optional: consultation ya reception experience share karein...',
  },
  'Optional: mention what you bought or how staff helped...': {
    mr: 'ऐच्छिक: तुम्ही काय खरेदी केले किंवा कर्मचाऱ्यांनी कशी मदत केली ते लिहा...',
    hi: 'वैकल्पिक: आपने क्या खरीदा या स्टाफ ने कैसी मदद की, लिखें...',
    hinglish: 'Optional: kya kharida ya staff help kaisi rahi, likhein...',
  },
  'Optional: share how the vehicle feels after service...': {
    mr: 'ऐच्छिक: सर्व्हिसनंतर वाहन कसे चालते ते लिहा...',
    hi: 'वैकल्पिक: सर्विस के बाद वाहन कैसा चल रहा है, लिखें...',
    hinglish: 'Optional: service ke baad gaadi kaisi chal rahi hai, likhein...',
  },
  'Optional: share what you liked about the collection or service...': {
    mr: 'ऐच्छिक: कलेक्शन किंवा सेवेबद्दल तुम्हाला काय आवडले ते लिहा...',
    hi: 'वैकल्पिक: कलेक्शन या सेवा में आपको क्या पसंद आया, लिखें...',
    hinglish: 'Optional: collection ya service ke baare mein kya pasand aaya, likhein...',
  },
  'Optional: mention the design, transparency, or staff assistance...': {
    mr: 'ऐच्छिक: डिझाइन, पारदर्शक दर किंवा कर्मचाऱ्यांच्या मदतीबद्दल लिहा...',
    hi: 'वैकल्पिक: डिज़ाइन, पारदर्शिता या स्टाफ की मदद के बारे में लिखें...',
    hinglish: 'Optional: design, transparency ya staff help ke baare mein likhein...',
  },
  'Optional: share what you liked or any item you searched for...': {
    mr: 'ऐच्छिक: तुम्हाला काय आवडले किंवा तुम्ही कोणती वस्तू घेतली ते लिहा...',
    hi: 'वैकल्पिक: आपको क्या पसंद आया या आपने कौन सा सामान लिया, लिखें...',
    hinglish: 'Optional: aapko kya accha laga ya kaun sa item liya, likhein...',
  },
  'Optional: share a quick note in your own words...': {
    mr: 'ऐच्छिक: तुमच्या शब्दांत छोटा अभिप्राय लिहा...',
    hi: 'वैकल्पिक: अपने शब्दों में छोटा सा अनुभव लिखें...',
    hinglish: 'Optional: apne words mein chhota sa note likhein...',
  },
};

const OPTION_TRANSLATIONS: Record<string, LangMap> = {
  // Common scale & yes/no
  Excellent: { mr: 'उत्कृष्ट', hi: 'उत्कृष्ट', hinglish: 'Bahut Badhiya' },
  'Very Good': { mr: 'खूप छान', hi: 'बहुत अच्छा', hinglish: 'Kaafi Accha' },
  Good: { mr: 'चांगले', hi: 'अच्छा', hinglish: 'Accha' },
  Average: { mr: 'सामान्य', hi: 'ठीक-ठाक', hinglish: 'Theek-Thak' },
  Okay: { mr: 'ठीक', hi: 'ठीक', hinglish: 'Okay' },
  'Needs Improvement': { mr: 'सुधारणेची गरज', hi: 'सुधार की ज़रूरत', hinglish: 'Improvement Chahiye' },
  Yes: { mr: 'होय', hi: 'हाँ', hinglish: 'Haan' },
  Maybe: { mr: 'कदाचित', hi: 'शायद', hinglish: 'Shayad' },
  No: { mr: 'नाही', hi: 'नहीं', hinglish: 'Nahi' },

  // Hair Salons
  Haircut: { mr: 'हेअरकट', hi: 'हेयरकट', hinglish: 'Haircut' },
  'Hair Styling': { mr: 'हेअर स्टायलिंग', hi: 'हेयर स्टाइलिंग', hinglish: 'Hair Styling' },
  'Hair Colour': { mr: 'हेअर कलर', hi: 'हेयर कलर', hinglish: 'Hair Colour' },
  'Hair Spa': { mr: 'हेअर स्पा', hi: 'हेयर स्पा', hinglish: 'Hair Spa' },
  'Keratin Treatment': { mr: 'केराटिन ट्रीटमेंट', hi: 'केराटिन ट्रीटमेंट', hinglish: 'Keratin Treatment' },
  'Beard Styling': { mr: 'दाढी स्टायलिंग', hi: 'बियर्ड स्टाइलिंग', hinglish: 'Beard Styling' },
  'Skilled Stylist': { mr: 'कुशल स्टायलिस्ट', hi: 'कुशल स्टाइलिस्ट', hinglish: 'Skilled Stylist' },
  'Listened to Preferences': { mr: 'पसंती नीट ऐकून घेतली', hi: 'पसंद को ध्यान से सुना', hinglish: 'Preference Samjhi' },
  'Clean & Hygienic': { mr: 'स्वच्छ आणि नीटनेटके', hi: 'साफ और स्वच्छ', hinglish: 'Clean & Hygienic' },
  'Minimal Wait Time': { mr: 'कमी प्रतीक्षा वेळ', hi: 'कम इंतजार समय', hinglish: 'Kam Wait Time' },
  'Wait Was Slightly Long': { mr: 'थोड्या वेळ थांबावे लागले', hi: 'इंतजार थोड़ा लंबा था', hinglish: 'Wait Thoda Zyada Tha' },

  // Restaurants
  'Dine-In': { mr: 'रेस्टॉरंटमध्ये जेवण', hi: 'डाइन-इन', hinglish: 'Dine-In' },
  Takeaway: { mr: 'पार्सल / टेकअवे', hi: 'टेकअवे / पैकिंग', hinglish: 'Takeaway' },
  'Main Course': { mr: 'मेन कोर्स जेवण', hi: 'मेन कोर्स', hinglish: 'Main Course' },
  'Starters & Snacks': { mr: 'स्टार्टर्स आणि स्नॅक्स', hi: 'स्टार्टर्स और स्नैक्स', hinglish: 'Starters & Snacks' },
  Desserts: { mr: 'गोड पदार्थ / डेझर्ट', hi: 'मिठाई / डेज़र्ट', hinglish: 'Desserts' },
  'Drinks & Coffee': { mr: 'ड्रिंक्स आणि कॉफी', hi: 'ड्रिंक्स और कॉफी', hinglish: 'Drinks & Coffee' },
  'Quick Service': { mr: 'जलद सर्व्हिस', hi: 'तेज़ सर्विस', hinglish: 'Fast Service' },
  'Service Was Slightly Slow': { mr: 'सर्व्हिस थोडी धीमी होती', hi: 'सर्विस थोड़ी धीमी थी', hinglish: 'Service Thodi Slow Thi' },
  'Friendly Staff': { mr: 'मनमिळाऊ कर्मचारी', hi: 'मिलनसार स्टाफ', hinglish: 'Friendly Staff' },
  'Good Ambience': { mr: 'छान वातावरण', hi: 'अच्छा माहौल', hinglish: 'Accha Ambience' },
  'Ambience Was Average': { mr: 'वातावरण सामान्य होते', hi: 'माहौल सामान्य था', hinglish: 'Ambience Average Tha' },
  'Fresh & Hot Food': { mr: 'ताजे आणि गरम जेवण', hi: 'ताज़ा और गर्म खाना', hinglish: 'Fresh & Garam Khana' },

  // Beauty Salons
  'Facial & Skincare': { mr: 'फेशियल आणि स्किनकेअर', hi: 'फेशियल और स्किनकेयर', hinglish: 'Facial & Skincare' },
  'Manicure & Pedicure': { mr: 'मॅनिक्युअर आणि पेडिक्युअर', hi: 'मैनीक्योर और पेडीक्योर', hinglish: 'Manicure & Pedicure' },
  'Bridal / Party Makeup': { mr: 'ब्रायडल / पार्टी मेकअप', hi: 'ब्राइडल / पार्टी मेकअप', hinglish: 'Bridal / Party Makeup' },
  'Brows & Lashes': { mr: 'आयब्रो आणि लॅशेस', hi: 'आइब्रो और लैशेज', hinglish: 'Brows & Lashes' },
  'Waxing & Threading': { mr: 'वॅक्सिंग आणि थ्रेडिंग', hi: 'वैक्सिंग और थ्रेडिंग', hinglish: 'Waxing & Threading' },
  'Clean & Hygienic Studio': { mr: 'स्वच्छ आणि हायजिनिक स्टुडिओ', hi: 'साफ-सुथरा स्टूडियो', hinglish: 'Clean Studio' },
  'Gentle Technique': { mr: 'सौम्य आणि काळजीपूर्वक काम', hi: 'कोमल और सुरक्षित तरीका', hinglish: 'Gentle Technique' },
  'Warm & Polite Staff': { mr: 'नम्र आणि आपुलकीचा स्टाफ', hi: 'विनम्र और सहयोगी स्टाफ', hinglish: 'Polite Staff' },
  'Started on Time': { mr: 'वेळेवर सुरुवात झाली', hi: 'समय पर शुरू हुआ', hinglish: 'Time Par Start Hua' },
  'Slight Wait Time': { mr: 'थोड्या वेळ थांबावे लागले', hi: 'थोड़ा इंतजार करना पड़ा', hinglish: 'Thoda Wait Karna Pada' },

  // Hotels
  'Room Comfort & Cleanliness': { mr: 'रूमची स्वच्छता आणि आराम', hi: 'कमरे की सफाई और आराम', hinglish: 'Room Cleanliness & Comfort' },
  'Check-In / Front Desk': { mr: 'चेक-इन आणि रिसेप्शन', hi: 'चेक-इन / रिसेप्शन', hinglish: 'Check-In / Front Desk' },
  'Breakfast & Dining': { mr: 'नाश्ता आणि जेवण', hi: 'नाश्ता और भोजन', hinglish: 'Breakfast & Dining' },
  Housekeeping: { mr: 'हाऊसकीपिंग सेवा', hi: 'हाउसकीपिंग', hinglish: 'Housekeeping' },
  'Location & Convenience': { mr: 'सोयीस्कर ठिकाण', hi: 'सुविधाजनक लोकेशन', hinglish: 'Location & Convenience' },
  'Clean Rooms': { mr: 'स्वच्छ खोल्या', hi: 'साफ कमरे', hinglish: 'Clean Rooms' },
  'Courteous Staff': { mr: 'विनम्र कर्मचारी', hi: 'विनम्र स्टाफ', hinglish: 'Polite Staff' },
  'Smooth Check-In': { mr: 'सोपे आणि जलद चेक-इन', hi: 'आसान चेक-इन', hinglish: 'Smooth Check-In' },
  'Quiet & Restful': { mr: 'शांत आणि आरामदायी', hi: 'शांत और आरामदायक', hinglish: 'Quiet & Restful' },
  'Check-In Was Slightly Slow': { mr: 'चेक-इनला थोडा वेळ लागला', hi: 'चेक-इन में थोड़ा समय लगा', hinglish: 'Check-In Thoda Slow Tha' },

  // Spas
  'Deep Tissue Massage': { mr: 'डीप टिश्यू मसाज', hi: 'डीप टिश्यू मसाज', hinglish: 'Deep Tissue Massage' },
  Aromatherapy: { mr: 'अरोमाथेरपी', hi: 'अरोमाथेरेपी', hinglish: 'Aromatherapy' },
  'Hot Stone Therapy': { mr: 'हॉट स्टोन थेरपी', hi: 'हॉट स्टोन थेरेपी', hinglish: 'Hot Stone Therapy' },
  'Rejuvenating Facial': { mr: 'ताजेतवाने करणारे फेशियल', hi: 'रिजुविनेटिंग फेशियल', hinglish: 'Rejuvenating Facial' },
  'Steam / Hydrotherapy': { mr: 'स्टीम / हायड्रोथेरपी', hi: 'स्टीम / हाइड्रोथेरेपी', hinglish: 'Steam / Hydrotherapy' },
  'Skilled Therapist': { mr: 'अनुभवी थेरपिस्ट', hi: 'कुशल थेरेपिस्ट', hinglish: 'Skilled Therapist' },
  'Calm Ambience': { mr: 'शांत आणि प्रसन्न वातावरण', hi: 'शांत वातावरण', hinglish: 'Calm Ambience' },
  'Clean Treatment Rooms': { mr: 'स्वच्छ थेरपी रूम्स', hi: 'साफ ट्रीटमेंट रूम', hinglish: 'Clean Rooms' },
  'Good Pressure & Technique': { mr: 'योग्य दाब आणि मसाज तंत्र', hi: 'सही दबाव और तकनीक', hinglish: 'Good Technique' },
  'Slight Wait Before Session': { mr: 'सेशनपूर्वी थोडा वेळ लागला', hi: 'सेशन से पहले थोड़ा इंतजार', hinglish: 'Session Se Pehle Thoda Wait' },

  // Gyms
  'Strength Equipment': { mr: 'स्ट्रेंथ मशीन्स / वेट्स', hi: 'स्ट्रेंथ उपकरण', hinglish: 'Strength Equipment' },
  'Cardio Zone': { mr: 'कार्डिओ विभाग', hi: 'कार्डियो ज़ोन', hinglish: 'Cardio Zone' },
  'Group Class': { mr: 'ग्रुप क्लास', hi: 'ग्रुप क्लास', hinglish: 'Group Class' },
  'Personal Training': { mr: 'पर्सनल ट्रेनिंग', hi: 'पर्सनल ट्रेनिंग', hinglish: 'Personal Training' },
  'Locker & Shower Area': { mr: 'लॉकर आणि शॉवर विभाग', hi: 'लॉकर और शॉवर क्षेत्र', hinglish: 'Locker & Shower Area' },
  'Well-Maintained Equipment': { mr: 'चांगल्या स्थितीत मशीन्स', hi: 'अच्छी हालत में उपकरण', hinglish: 'Well-Maintained Machines' },
  'Helpful Trainers': { mr: 'मदत करणारे ट्रेनर्स', hi: 'सहयोगी ट्रेनर्स', hinglish: 'Helpful Trainers' },
  'Clean Floor & Washrooms': { mr: 'स्वच्छ फ्लोअर आणि वॉशरूम्स', hi: 'साफ फ्लोर और वॉशरूम', hinglish: 'Clean Floor & Washrooms' },
  'Crowded at Peak Hours': { mr: 'गर्दीच्या वेळी थोडी गर्दी', hi: 'पीक आवर्स में भीड़', hinglish: 'Peak Hours Mein Bheed' },
  'Good Workout Vibe': { mr: 'उत्साहवर्धक वर्कआऊट वातावरण', hi: 'वर्कआउट का अच्छा माहौल', hinglish: 'Good Workout Vibe' },

  // Healthcare
  'Doctor Consultation': { mr: 'डॉक्टर सल्ला / तपासणी', hi: 'डॉक्टर परामर्श', hinglish: 'Doctor Consultation' },
  'Routine Check-up': { mr: 'नियमित आरोग्य तपासणी', hi: 'नियमित जांच', hinglish: 'Routine Check-up' },
  'Dental / Specialist Care': { mr: 'दंत / विशेष तज्ज्ञ उपचार', hi: 'दंत / विशेषज्ञ देखभाल', hinglish: 'Specialist Care' },
  'Diagnostics / Lab': { mr: 'डायग्नोस्टिक्स / लॅब चाचणी', hi: 'डायग्नोस्टिक्स / लैब', hinglish: 'Diagnostics / Lab' },
  'Follow-up Visit': { mr: 'फॉलो-अप भेट', hi: 'फॉलो-अप विज़िट', hinglish: 'Follow-up Visit' },
  'Clear Explanation': { mr: 'स्पष्ट आणि सोपी माहिती', hi: 'स्पष्ट जानकारी', hinglish: 'Clear Explanation' },
  'Polite Front-Desk Staff': { mr: 'विनम्र रिसेप्शन कर्मचारी', hi: 'विनम्र रिसेप्शन स्टाफ', hinglish: 'Polite Reception Staff' },
  'Short Wait Time': { mr: 'कमी प्रतीक्षा वेळ', hi: 'कम इंतजार समय', hinglish: 'Kam Wait Time' },
  'Clean Clinic': { mr: 'स्वच्छ क्लिनिक', hi: 'साफ क्लिनिक', hinglish: 'Clean Clinic' },

  // Retail & Local Shops
  'Product Selection': { mr: 'वस्तूंची निवड', hi: 'सामान का चयन', hinglish: 'Product Selection' },
  'New Arrivals': { mr: 'नवीन आलेला माल', hi: 'नया कलेक्शन', hinglish: 'New Arrivals' },
  'Gift Shopping': { mr: 'भेटवस्तू खरेदी', hi: 'गिफ्ट खरीदारी', hinglish: 'Gift Shopping' },
  'Pickup / Exchange': { mr: 'पिकअप / एक्सचेंज', hi: 'पिकअप / एक्सचेंज', hinglish: 'Pickup / Exchange' },
  'Helpful Staff': { mr: 'मदतगार कर्मचारी', hi: 'मददगार स्टाफ', hinglish: 'Helpful Staff' },
  'Good Product Variety': { mr: 'वस्तूंची उत्तम विविधता', hi: 'उत्पादों की अच्छी वैरायटी', hinglish: 'Acchi Variety' },
  'Quick Billing': { mr: 'जलद बिलिंग', hi: 'तेज़ बिलिंग', hinglish: 'Fast Billing' },
  'Billing Took Some Time': { mr: 'बिलिंगला थोडा वेळ लागला', hi: 'बिलिंग में थोड़ा समय लगा', hinglish: 'Billing Mein Thoda Time Laga' },
  'Clean & Organized Store': { mr: 'स्वच्छ आणि व्यवस्थित दुकान', hi: 'साफ और व्यवस्थित स्टोर', hinglish: 'Clean & Organized Store' },
  'Daily Essentials': { mr: 'दैनिक गरजेच्या वस्तू', hi: 'रोज़मर्रा का सामान', hinglish: 'Daily Essentials' },
  'Fresh Stock & Variety': { mr: 'ताजा माल आणि विविधता', hi: 'ताज़ा स्टॉक और वैरायटी', hinglish: 'Fresh Stock & Variety' },
  'Home & Utility Items': { mr: 'घरगुती उपयोगी वस्तू', hi: 'घरेलू सामान', hinglish: 'Home Utility Items' },
  'Quick Pickup Order': { mr: 'पटकन ऑर्डर पिकअप', hi: 'जल्दी ऑर्डर पिकअप', hinglish: 'Quick Pickup' },
  'Bulk / Family Shopping': { mr: 'मोठी / कौटुंबिक खरेदी', hi: 'बल्क / पारिवारिक खरीदारी', hinglish: 'Family Shopping' },
  'Reasonable Prices': { mr: 'वाजवी दर', hi: 'उचित दाम', hinglish: 'Reasonable Rate' },
  'Quality Products': { mr: 'दर्जेदार वस्तू', hi: 'अच्छी क्वालिटी का सामान', hinglish: 'Quality Products' },
  'Helpful & Friendly Behaviour': { mr: 'मदतगार आणि आपुलकीची वागणूक', hi: 'मददगार और अच्छा व्यवहार', hinglish: 'Helpful Staff Behaviour' },
  'Clean & Organized Shop': { mr: 'स्वच्छ आणि नीटनेटके दुकान', hi: 'साफ और व्यवस्थित दुकान', hinglish: 'Clean & Organized Shop' },

  // Automobile Services
  'Routine Service / Oil Change': { mr: 'नियमित सर्व्हिस / ऑईल चेंज', hi: 'नियमित सर्विस / ऑयल चेंज', hinglish: 'Routine Service / Oil Change' },
  'Diagnostics & Repair': { mr: 'तपासणी आणि दुरुस्ती', hi: 'जांच और मरम्मत', hinglish: 'Repair & Diagnostics' },
  'Detailing & Wash': { mr: 'गाडी वॉश आणि डिटेलिंग', hi: 'डिटेलिंग और वॉश', hinglish: 'Detailing & Wash' },
  'Tires & Alignment': { mr: 'टायर्स आणि अलाइनमेंट', hi: 'टायर और अलाइनमेंट', hinglish: 'Tires & Alignment' },
  Inspection: { mr: 'संपूर्ण तपासणी', hi: 'निरीक्षण / जांच', hinglish: 'Inspection' },
  'Clear Estimate': { mr: 'अंदाजे खर्चाची स्पष्ट माहिती', hi: 'खर्च की स्पष्ट जानकारी', hinglish: 'Clear Estimate' },
  'Delivered on Time': { mr: 'वेळेवर डिलिव्हरी मिळाली', hi: 'समय पर डिलीवरी', hinglish: 'Time Par Delivery' },
  'Took Slightly Longer': { mr: 'कामाला थोडा जास्त वेळ लागला', hi: 'थोड़ा अधिक समय लगा', hinglish: 'Thoda Extra Time Laga' },
  'Knowledgeable Technicians': { mr: 'अनुभवी मेकॅनिक / तंत्रज्ञ', hi: 'अनुभवी तकनीशियन', hinglish: 'Skilled Technicians' },

  // Clothing & Apparel
  'Ethnic & Festive Wear': { mr: 'पारंपारिक आणि सणासुदीचे कपडे', hi: 'एथनिक और फेस्टिव कपड़े', hinglish: 'Ethnic & Festive Wear' },
  'Casual Wear': { mr: 'कॅज्युअल कपडे', hi: 'कैज़ुअल कपड़े', hinglish: 'Casual Wear' },
  'Formal Outfits': { mr: 'फॉर्मल कपडे', hi: 'फॉर्मल कपड़े', hinglish: 'Formal Outfits' },
  'Fabric & Stitching Quality': { mr: 'कापड आणि शिलाईचा दर्जा', hi: 'कपड़े और सिलाई की गुणवत्ता', hinglish: 'Fabric & Stitching Quality' },
  'Kids & Family Wear': { mr: 'लहान मुले आणि कुटुंबाचे कपडे', hi: 'बच्चों और परिवार के कपड़े', hinglish: 'Kids & Family Wear' },
  'Custom Alterations': { mr: 'मापानुसार अल्टरेशन / फिटिंग', hi: 'कस्टम ऑल्टरेशन', hinglish: 'Custom Alteration' },
  'Latest Collection': { mr: 'नवीनतम कलेक्शन', hi: 'लेटेस्ट कलेक्शन', hinglish: 'Latest Collection' },
  'Great Fitting & Quality': { mr: 'उत्तम फिटिंग आणि दर्जा', hi: 'बेहतरीन फिटिंग और क्वालिटी', hinglish: 'Great Fitting & Quality' },
  'Fair Pricing': { mr: 'योग्य दर', hi: 'सही कीमत', hinglish: 'Fair Pricing' },

  // Jewelry & Gold Shops
  'Gold Jewellery': { mr: 'सोन्याचे दागिने', hi: 'सोने के आभूषण', hinglish: 'Gold Jewellery' },
  'Bridal & Festive Designs': { mr: 'लग्नसराई आणि सणांचे दागिने', hi: 'ब्राइडल और फेस्टिव डिज़ाइन', hinglish: 'Bridal & Festive Designs' },
  'Silver & Gift Articles': { mr: 'चांदीच्या आणि भेटवस्तू', hi: 'चांदी और गिफ्ट आइटम', hinglish: 'Silver & Gift Items' },
  'Diamond Collection': { mr: 'डायमंड कलेक्शन', hi: 'डायमंड कलेक्शन', hinglish: 'Diamond Collection' },
  'Custom Order / Exchange': { mr: 'कस्टम ऑर्डर / जुने सोने बदलणे', hi: 'कस्टम ऑर्डर / एक्सचेंज', hinglish: 'Custom Order / Exchange' },
  'Hallmark Purity Check': { mr: 'हॉलमार्क शुद्धता तपासणी', hi: 'हॉलमार्क शुद्धता जांच', hinglish: 'Hallmark Purity Check' },
  'Transparent Weight & Making Charges': { mr: 'वजन आणि घडणावळीतील पारदर्शकता', hi: 'वज़न और मेकिंग चार्ज में पारदर्शिता', hinglish: 'Transparent Weight & Making' },
  'Hallmarked Purity Assurance': { mr: 'हॉलमार्क शुद्धतेची खात्री', hi: 'हॉलमार्क शुद्धता का भरोसा', hinglish: 'Hallmark Purity Trust' },
  'Polite & Patient Staff': { mr: 'नम्र आणि संयमी कर्मचारी', hi: 'विनम्र और धैर्यवान स्टाफ', hinglish: 'Polite Staff' },
  'Wide Variety of Designs': { mr: 'डिझाइनची भरपूर विविधता', hi: 'डिज़ाइनों की भरपूर वैरायटी', hinglish: 'Wide Design Variety' },
  'Safe & Welcoming Ambience': { mr: 'सुरक्षित आणि प्रसन्न वातावरण', hi: 'सुरक्षित और सुखद माहौल', hinglish: 'Safe & Nice Ambience' },

  // Other Businesses
  'Good Service Quality': { mr: 'सेवेचा उत्तम दर्जा', hi: 'सेवा की अच्छी गुणवत्ता', hinglish: 'Good Service Quality' },
  'Quick & Smooth': { mr: 'जलद आणि सुरळीत काम', hi: 'तेज़ और सहज सेवा', hinglish: 'Quick & Smooth' },
  'Clean Space': { mr: 'स्वच्छ परिसर', hi: 'साफ जगह', hinglish: 'Clean Space' },
};

const WORD_TRANSLITERATION_MAP: Record<string, string> = {
  tumhala: 'तुम्हाला',
  tumcha: 'तुमचा',
  tumchi: 'तुमची',
  tumche: 'तुमचे',
  aapla: 'आपला',
  aapli: 'आपली',
  aaple: 'आपले',
  aapko: 'आपको',
  aapka: 'आपका',
  aapki: 'आपकी',
  aapke: 'आपके',
  aaj: 'आज',
  aajchi: 'आजची',
  aajcha: 'आजचा',
  seva: 'सेवा',
  service: 'सर्व्हिस',
  kashi: 'कशी',
  kasha: 'कशा',
  kasa: 'कसा',
  kase: 'कसे',
  kaisa: 'कैसा',
  kaisi: 'कैसी',
  kaise: 'कैसे',
  vatli: 'वाटली',
  vatla: 'वाटला',
  vatle: 'वाटले',
  hoti: 'होती',
  hota: 'होता',
  hote: 'होते',
  ahe: 'आहे',
  aahe: 'आहे',
  aahet: 'आहेत',
  nahi: 'नाही',
  naahi: 'नाही',
  ho: 'हो',
  hoy: 'होय',
  haan: 'हाँ',
  khup: 'खूप',
  khoop: 'खूप',
  chhan: 'छान',
  chan: 'छान',
  bahut: 'बहुत',
  accha: 'अच्छा',
  acchi: 'अच्छी',
  uttam: 'उत्तम',
  utkrusht: 'उत्कृष्ट',
  changli: 'चांगली',
  changla: 'चांगला',
  changale: 'चांगले',
  mast: 'मस्त',
  bhaari: 'भारी',
  theek: 'ठीक',
  thik: 'ठीक',
  anubhav: 'अनुभव',
  swachh: 'स्वच्छ',
  swachhata: 'स्वच्छता',
  karmachari: 'कर्मचारी',
  madat: 'मदत',
  dukan: 'दुकान',
  dukaan: 'दुकान',
  bhet: 'भेट',
  punha: 'पुन्हा',
  dobara: 'दोबारा',
  yenar: 'येणार',
  yaal: 'याल',
  ka: 'का',
  kya: 'क्या',
  kay: 'काय',
  kon: 'कोण',
  konti: 'कोणती',
  konta: 'कोणता',
  konte: 'कोणते',
  kaun: 'कौन',
  kharedi: 'खरेदी',
  kharidi: 'खरीदारी',
  jevan: 'जेवण',
  jevhan: 'जेवण',
  khana: 'खाना',
  chav: 'चव',
  swad: 'स्वाद',
  aavadle: 'आवडले',
  avadle: 'आवडले',
  avadli: 'आवडली',
  pasand: 'पसंद',
  gunvatta: 'गुणवत्ता',
  darja: 'दर्जा',
  kimmat: 'किंमत',
  dar: 'दर',
  vel: 'वेळ',
  samay: 'समय',
  vatavaran: 'वातावरण',
  mahaul: 'माहौल',
  upchar: 'उपचार',
  tapasni: 'तपासणी',
  dagina: 'दागिना',
  dagine: 'दागिने',
  kapde: 'कपडे',
  fitting: 'फिटिंग',
  collection: 'कलेक्शन',
  dhanyawad: 'धन्यवाद',
  dhanyavad: 'धन्यवाद',
  aabhar: 'आभार',
  kadachit: 'कदाचित',
  shayad: 'शायद',
  nakki: 'नक्की',
  jaroor: 'जरूर',
  zaroor: 'ज़रूर',
  ithe: 'इथे',
  yethe: 'येथे',
  yahan: 'यहाँ',
  parat: 'परत',
  ekun: 'एकूण',
  sagle: 'सगळे',
  sarva: 'सर्व',
  kahi: 'काही',
  kuch: 'कुछ',
  vishesh: 'विशेष',
  khas: 'खास',
  tumhi: 'तुम्ही',
  aap: 'आप',
  mi: 'मी',
  amhi: 'आम्ही',
  amchya: 'आमच्या',
  amcha: 'आमचा',
  amchi: 'आमची',
  humara: 'हमारा',
  humari: 'हमारी',
  humare: 'हमारे',
  mein: 'में',
  madhe: 'मध्ये',
  var: 'वर',
  la: 'ला',
  ani: 'आणि',
  aani: 'आणि',
  aur: 'और',
  tar: 'तर',
  pan: 'पण',
  par: 'पर',
  sathi: 'साठी',
  liye: 'लिए',
  baddal: 'बद्दल',
  baare: 'बारे',
  ghetli: 'घेतली',
  ghetle: 'घेतले',
  liya: 'लिया',
  diya: 'दिया',
  karal: 'कराल',
  karenge: 'करेंगे',
  samadhan: 'समाधान',
  shifaras: 'शिफारस',
};

const DEVANAGARI_INDEPENDENT_VOWELS: Array<[string, string]> = [
  ['aa', 'आ'],
  ['ee', 'ई'],
  ['ii', 'ई'],
  ['oo', 'ऊ'],
  ['uu', 'ऊ'],
  ['ai', 'ऐ'],
  ['au', 'औ'],
  ['a', 'अ'],
  ['i', 'इ'],
  ['u', 'उ'],
  ['e', 'ए'],
  ['o', 'ओ'],
];

const DEVANAGARI_MATRAS: Array<[string, string]> = [
  ['aa', 'ा'],
  ['ee', 'ी'],
  ['ii', 'ी'],
  ['oo', 'ू'],
  ['uu', 'ू'],
  ['ai', 'ै'],
  ['au', 'ौ'],
  ['a', ''],
  ['i', 'ि'],
  ['u', 'ु'],
  ['e', 'े'],
  ['o', 'ो'],
];

const DEVANAGARI_CONSONANTS: Array<[string, string]> = [
  ['ksh', 'क्ष'],
  ['gny', 'ज्ञ'],
  ['dny', 'ज्ञ'],
  ['chh', 'छ'],
  ['shh', 'ष'],
  ['kh', 'ख'],
  ['gh', 'घ'],
  ['ch', 'च'],
  ['jh', 'झ'],
  ['th', 'थ'],
  ['dh', 'ध'],
  ['ph', 'फ'],
  ['bh', 'भ'],
  ['sh', 'श'],
  ['k', 'क'],
  ['q', 'क'],
  ['g', 'ग'],
  ['c', 'क'],
  ['j', 'ज'],
  ['z', 'झ'],
  ['t', 'त'],
  ['d', 'द'],
  ['n', 'न'],
  ['p', 'प'],
  ['f', 'फ'],
  ['b', 'ब'],
  ['m', 'म'],
  ['y', 'य'],
  ['r', 'र'],
  ['l', 'ल'],
  ['v', 'व'],
  ['w', 'व'],
  ['s', 'स'],
  ['h', 'ह'],
];

function transliterateWordPhonetic(rawWord: string): string {
  const lower = rawWord.toLowerCase();
  if (WORD_TRANSLITERATION_MAP[lower]) {
    return WORD_TRANSLITERATION_MAP[lower];
  }
  let out = '';
  let i = 0;

  while (i < lower.length) {
    let matchedConsonant: [string, string] | undefined;
    for (const entry of DEVANAGARI_CONSONANTS) {
      if (lower.startsWith(entry[0], i)) {
        matchedConsonant = entry;
        break;
      }
    }

    if (matchedConsonant) {
      out += matchedConsonant[1];
      i += matchedConsonant[0].length;

      // Check following vowel for matra
      let matchedMatra: [string, string] | undefined;
      for (const vowel of DEVANAGARI_MATRAS) {
        if (lower.startsWith(vowel[0], i)) {
          matchedMatra = vowel;
          break;
        }
      }
      if (matchedMatra) {
        out += matchedMatra[1];
        i += matchedMatra[0].length;
      } else if (i < lower.length) {
        // Halant between consecutive consonants inside clusters when no vowel follows
        const nextIsConsonant = DEVANAGARI_CONSONANTS.some((c) => lower.startsWith(c[0], i));
        const isTrailingNasal =
          (lower[i] === 'n' || lower[i] === 'm') &&
          (i === lower.length - 1 ||
            DEVANAGARI_CONSONANTS.some((c) => lower.startsWith(c[0], i + 1)));
        if (isTrailingNasal && lower[i] === 'n' && i > 0) {
          out += 'ं';
          i += 1;
          continue;
        }
        if (nextIsConsonant && out.length > 0 && matchedConsonant[0] !== 'h') {
          out += '्';
        }
      }
      continue;
    }

    let matchedVowel: [string, string] | undefined;
    for (const vowel of DEVANAGARI_INDEPENDENT_VOWELS) {
      if (lower.startsWith(vowel[0], i)) {
        matchedVowel = vowel;
        break;
      }
    }
    if (matchedVowel) {
      out += matchedVowel[1];
      i += matchedVowel[0].length;
      continue;
    }

    // Fallback for digits/punctuation
    out += rawWord[i] ?? lower[i];
    i += 1;
  }

  return out;
}

/**
 * Deterministic Roman-to-Devanagari phonetic transliterator for Marathi/Hindi
 * question authoring without requiring an OS Devanagari keyboard.
 */
export function transliterateRomanToDevanagari(input: string): string {
  if (!input.trim()) return '';
  return input
    .split(/(\s+|[?,!.।()\/:-]+)/)
    .map((segment) => {
      if (!segment || /^\s+$/.test(segment) || /^[?,!.।()\/:-]+$/.test(segment)) {
        return segment === '?' ? '?' : segment;
      }
      if (/^[\u0900-\u097F]+$/.test(segment)) {
        return segment;
      }
      if (!/[a-zA-Z]/.test(segment)) {
        return segment;
      }
      return transliterateWordPhonetic(segment);
    })
    .join('');
}

export const PHONETIC_MARATHI_VOCAB_CHIPS = [
  { label: 'तुम्हाला सेवा कशी वाटली?', roman: 'tumhala seva kashi vatli?' },
  { label: 'पुन्हा भेट द्याल का?', roman: 'punha bhet dyal ka?' },
  { label: 'स्वच्छता व कर्मचारी', roman: 'swachhata va karmachari' },
  { label: 'खूप छान', roman: 'khup chhan' },
  { label: 'उत्कृष्ट', roman: 'uttam' },
  { label: 'चांगले', roman: 'changale' },
  { label: 'होय / नाही', roman: 'hoy / nahi' },
  { label: 'दर आणि गुणवत्ता', roman: 'dar ani gunvatta' },
];

export const PHONETIC_HINDI_VOCAB_CHIPS = [
  { label: 'आपको हमारी सेवा कैसी लगी?', roman: 'aapko humari seva kaisi lagi?' },
  { label: 'क्या आप फिर से आएंगे?', roman: 'kya aap dobara aayenge?' },
  { label: 'साफ-सफाई और स्टाफ', roman: 'swachhata aur staff' },
  { label: 'बहुत अच्छा', roman: 'bahut accha' },
  { label: 'उत्कृष्ट', roman: 'uttam' },
  { label: 'हाँ / नहीं', roman: 'haan / nahi' },
];

const UI_STRINGS_BY_LANGUAGE: Record<ReviewLanguage, LocalizedFormUiStrings> = {
  en: {
    languageSelectorLabel: 'Choose Review Language',
    languageSelectorHint: 'Questions & review adapt to your language',
    requiredLabel: 'Required',
    optionalLabel: 'Optional',
    selectMultipleLabel: 'Select multiple',
    tapExpressionLabel: 'Tap an expression to rate',
    generateReviewButton: 'Generate Review',
    generatingReviewButton: 'Writing your review...',
    writingProgressHint: 'Crafting natural words from your feedback...',
    textAreaPlaceholderDefault: 'Write your quick note here...',
    answerCountLabel: (answered, total) => `${answered}/${total} answered`,
    ratingLabels: ['Excellent', 'Very Good', 'Good', 'Average', 'Needs Care'],
    step2ReviewHeading: 'Your Review is Ready',
    step2Subtitle: 'Review or tweak it before posting on Google.',
    copyReviewButton: 'Copy Review',
    copiedButton: 'Copied!',
    postOnGoogleButton: 'Post on Google',
    editReviewButton: 'Edit Review',
    doneEditingButton: 'Done Editing',
    regenerateButton: 'Regenerate',
    backButton: 'Back to Questions',
    instantReadySubtitle: 'Tap Copy & Post to share directly on Google.',
    instantRefreshButton: 'Refresh',
    instantCopyAndOpenButton: 'Copy & Post on Google',
    instantOpenGoogleAgainButton: 'Open Google Review',
  },
  mr: {
    languageSelectorLabel: 'भाषा निवडा (Language)',
    languageSelectorHint: 'प्रश्न आणि तुमचा रिव्ह्यू मराठीत तयार होईल',
    requiredLabel: 'आवश्यक',
    optionalLabel: 'ऐच्छिक',
    selectMultipleLabel: 'अनेक पर्याय निवडू शकता',
    tapExpressionLabel: 'तुमचा अनुभव निवडण्यासाठी टॅप करा',
    generateReviewButton: 'रिव्ह्यू तयार करा',
    generatingReviewButton: 'रिव्ह्यू तयार होत आहे...',
    writingProgressHint: 'तुमच्या उत्तरांनुसार नैसर्गिक रिव्ह्यू तयार करत आहोत...',
    textAreaPlaceholderDefault: 'तुमचा छोटा अभिप्राय येथे लिहा...',
    answerCountLabel: (answered, total) => `${answered}/${total} उत्तरे दिली`,
    ratingLabels: ['उत्कृष्ट', 'खूप छान', 'चांगले', 'सामान्य', 'सुधारणा हवी'],
    step2ReviewHeading: 'तुमचा रिव्ह्यू तयार आहे',
    step2Subtitle: 'Google वर पोस्ट करण्यापूर्वी तुम्ही यात बदल करू शकता.',
    copyReviewButton: 'रिव्ह्यू कॉपी करा',
    copiedButton: 'कॉपी झाले!',
    postOnGoogleButton: 'Google वर पोस्ट करा',
    editReviewButton: 'बदल करा',
    doneEditingButton: 'बदल पूर्ण झाले',
    regenerateButton: 'नवीन बनवा',
    backButton: 'प्रश्नांकडे परत जा',
    instantReadySubtitle: 'कॉपी करून थेट Google वर पोस्ट करा.',
    instantRefreshButton: 'रिफ्रेश करा',
    instantCopyAndOpenButton: 'कॉपी करून Google वर पोस्ट करा',
    instantOpenGoogleAgainButton: 'Google रिव्ह्यू उघडा',
  },
  hi: {
    languageSelectorLabel: 'भाषा चुनें (Language)',
    languageSelectorHint: 'प्रश्न और आपका रिव्यू हिंदी में तैयार होगा',
    requiredLabel: 'ज़रूरी',
    optionalLabel: 'वैकल्पिक',
    selectMultipleLabel: 'एक से ज़्यादा चुन सकते हैं',
    tapExpressionLabel: 'अपना अनुभव चुनने के लिए टैप करें',
    generateReviewButton: 'रिव्यू तैयार करें',
    generatingReviewButton: 'रिव्यू लिखा जा रहा है...',
    writingProgressHint: 'आपके जवाबों के आधार पर प्राकृतिक रिव्यू बना रहे हैं...',
    textAreaPlaceholderDefault: 'अपना संक्षिप्त अनुभव यहाँ लिखें...',
    answerCountLabel: (answered, total) => `${answered}/${total} उत्तर दिए`,
    ratingLabels: ['उत्कृष्ट', 'बहुत अच्छा', 'अच्छा', 'ठीक-ठाक', 'सुधार ज़रूरी'],
    step2ReviewHeading: 'आपका रिव्यू तैयार है',
    step2Subtitle: 'Google पर पोस्ट करने से पहले आप इसे देख या बदल सकते हैं।',
    copyReviewButton: 'रिव्यू कॉपी करें',
    copiedButton: 'कॉपी हो गया!',
    postOnGoogleButton: 'Google पर पोस्ट करें',
    editReviewButton: 'संपादित करें',
    doneEditingButton: 'संपादन पूर्ण',
    regenerateButton: 'नया बनाएं',
    backButton: 'प्रश्नों पर वापस जाएं',
    instantReadySubtitle: 'कॉपी करें और सीधे Google पर पोस्ट करें।',
    instantRefreshButton: 'रिफ्रेश करें',
    instantCopyAndOpenButton: 'कॉपी और Google पर पोस्ट करें',
    instantOpenGoogleAgainButton: 'Google रिव्यू खोलें',
  },
  hinglish: {
    languageSelectorLabel: 'Language Chunein',
    languageSelectorHint: 'Questions aur review Hinglish mein dikhenge',
    requiredLabel: 'Zaroori',
    optionalLabel: 'Optional',
    selectMultipleLabel: 'Multiple select kar sakte hain',
    tapExpressionLabel: 'Rating dene ke liye tap karein',
    generateReviewButton: 'Review Banayein',
    generatingReviewButton: 'Review likha ja raha hai...',
    writingProgressHint: 'Aapke answers se natural review ready ho raha hai...',
    textAreaPlaceholderDefault: 'Apna quick feedback yahan likhein...',
    answerCountLabel: (answered, total) => `${answered}/${total} answered`,
    ratingLabels: ['Bahut Badhiya', 'Kaafi Accha', 'Accha', 'Theek-Thak', 'Better Ho Sakta Hai'],
    step2ReviewHeading: 'Aapka Review Ready Hai',
    step2Subtitle: 'Google par post karne se pehle check ya edit karein.',
    copyReviewButton: 'Review Copy Karein',
    copiedButton: 'Copied!',
    postOnGoogleButton: 'Google Par Post Karein',
    editReviewButton: 'Edit Karein',
    doneEditingButton: 'Done',
    regenerateButton: 'Naya Banayein',
    backButton: 'Questions Par Wapas',
    instantReadySubtitle: 'Copy karke seedha Google par post karein.',
    instantRefreshButton: 'Refresh',
    instantCopyAndOpenButton: 'Copy & Google Par Post Karein',
    instantOpenGoogleAgainButton: 'Google Review Kholein',
  },
};

export function getLocalizedFormUiStrings(language: ReviewLanguage): LocalizedFormUiStrings {
  return UI_STRINGS_BY_LANGUAGE[language] || UI_STRINGS_BY_LANGUAGE.en;
}

function smartFallbackTranslatePrompt(prompt: string, language: ReviewLanguage): string {
  if (language === 'en') return prompt;
  const trimmed = prompt.trim();
  const exact = PROMPT_TRANSLATIONS[trimmed]?.[language];
  if (exact) return exact;

  // Fallback pattern handling for common custom question templates
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('would you ') && lower.includes('again')) {
    return language === 'mr'
      ? 'तुम्ही पुन्हा भेट द्याल का?'
      : language === 'hi'
        ? 'क्या आप फिर से आना चाहेंगे?'
        : 'Kya aap dobara visit karenge?';
  }
  if (lower.includes('overall experience')) {
    return PROMPT_TRANSLATIONS['How was your overall experience?']?.[language] || trimmed;
  }
  if (lower.includes('(optional)') && !trimmed.includes('?')) {
    return `${trimmed.replace(/\(optional\)/i, '').trim()} (${getLocalizedFormUiStrings(language).optionalLabel})`;
  }
  return trimmed;
}

export function localizeQuestion(
  question: FeedbackQuestion,
  language: ReviewLanguage,
): {
  prompt: string;
  placeholder: string;
  options: LocalizedOptionItem[];
} {
  if (language === 'en') {
    const customEn = question.translations?.en;
    return {
      prompt: customEn?.prompt?.trim() || question.prompt,
      placeholder: customEn?.placeholder?.trim() || question.placeholder || UI_STRINGS_BY_LANGUAGE.en.textAreaPlaceholderDefault,
      options: question.options.map((opt, idx) => ({
        canonicalValue: opt,
        displayLabel: customEn?.options?.[idx]?.trim() || opt,
      })),
    };
  }

  const customLoc = question.translations?.[language];
  const prompt =
    customLoc?.prompt?.trim() ||
    PROMPT_TRANSLATIONS[question.prompt.trim()]?.[language] ||
    smartFallbackTranslatePrompt(question.prompt, language);

  const defaultPlaceholder = UI_STRINGS_BY_LANGUAGE[language].textAreaPlaceholderDefault;
  const placeholder =
    customLoc?.placeholder?.trim() ||
    (question.placeholder ? PLACEHOLDER_TRANSLATIONS[question.placeholder.trim()]?.[language] : undefined) ||
    defaultPlaceholder;

  const options = question.options.map((opt, idx) => ({
    canonicalValue: opt,
    displayLabel:
      customLoc?.options?.[idx]?.trim() ||
      OPTION_TRANSLATIONS[opt.trim()]?.[language] ||
      opt,
  }));

  return { prompt, placeholder, options };
}

export function buildAutoTranslatedQuestionContent(
  question: FeedbackQuestion,
  language: Exclude<ReviewLanguage, 'en'>,
): LocalizedQuestionContent {
  const existing = question.translations?.[language];
  const localized = localizeQuestion(
    { ...question, translations: undefined },
    language,
  );
  return {
    prompt: existing?.prompt?.trim() || localized.prompt,
    options: question.options.map((_, idx) => {
      const customOpt = existing?.options?.[idx]?.trim();
      return customOpt || localized.options[idx]?.displayLabel || question.options[idx] || '';
    }),
    ...(question.type === 'text'
      ? { placeholder: existing?.placeholder?.trim() || localized.placeholder }
      : {}),
  };
}
