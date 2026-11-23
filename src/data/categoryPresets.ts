import type { BusinessCategory, FeedbackQuestion, PublicProfile } from '../types';

export const DEMO_SALON_LOGO = '/src/assets/images/demo_salon_emblem_1794808683508.jpg';
export const DEMO_BISTRO_LOGO = '/src/assets/images/demo_bistro_emblem_1794808683461.jpg';
export const HERO_TABLETOP_IMAGE = '/src/assets/images/hero_google_review_qr_1795161653423.jpg';

export function createCategoryQuestions(category: BusinessCategory): FeedbackQuestion[] {
  switch (category) {
    case 'Hair Salons':
      return [
        {
          id: 'q-services',
          prompt: 'Which service did you take today?',
          type: 'multiple',
          options: [
            'Haircut',
            'Hair Styling',
            'Hair Colour',
            'Hair Spa',
            'Keratin Treatment',
            'Beard Styling',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How did your styling turn out?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Needs Improvement'],
          required: true,
        },
        {
          id: 'q-staff',
          prompt: 'How were your stylist, wait time, and hygiene?',
          type: 'multiple',
          options: [
            'Skilled Stylist',
            'Listened to Preferences',
            'Clean & Hygienic',
            'Minimal Wait Time',
            'Wait Was Slightly Long',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you visit us again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any specific detail? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: mention what you liked or what could be smoother...',
        },
      ];

    case 'Restaurants':
      return [
        {
          id: 'q-visit-type',
          prompt: 'What did you have today?',
          type: 'multiple',
          options: [
            'Dine-In',
            'Takeaway',
            'Main Course',
            'Starters & Snacks',
            'Desserts',
            'Drinks & Coffee',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was the food & taste?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-highlights',
          prompt: 'How were the service speed, staff & ambience?',
          type: 'multiple',
          options: [
            'Quick Service',
            'Service Was Slightly Slow',
            'Friendly Staff',
            'Good Ambience',
            'Ambience Was Average',
            'Fresh & Hot Food',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you visit again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any dish or quick note? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: name a dish you tried or share a quick detail...',
        },
      ];

    case 'Beauty Salons':
      return [
        {
          id: 'q-services',
          prompt: 'Which treatments did you have today?',
          type: 'multiple',
          options: [
            'Facial & Skincare',
            'Manicure & Pedicure',
            'Bridal / Party Makeup',
            'Brows & Lashes',
            'Waxing & Threading',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How satisfied were you with the result?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-studio',
          prompt: 'How were the staff, hygiene & timing?',
          type: 'multiple',
          options: [
            'Clean & Hygienic Studio',
            'Gentle Technique',
            'Warm & Polite Staff',
            'Started on Time',
            'Slight Wait Time',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you book with us again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any specific note? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: share how your treatment felt...',
        },
      ];

    case 'Hotels':
      return [
        {
          id: 'q-stay',
          prompt: 'Which parts of your stay did you experience?',
          type: 'multiple',
          options: [
            'Room Comfort & Cleanliness',
            'Check-In / Front Desk',
            'Breakfast & Dining',
            'Housekeeping',
            'Location & Convenience',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your stay overall?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-staff',
          prompt: 'How were the staff & room upkeep?',
          type: 'multiple',
          options: [
            'Clean Rooms',
            'Courteous Staff',
            'Smooth Check-In',
            'Quiet & Restful',
            'Check-In Was Slightly Slow',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you stay here again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any specific stay detail? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: share something specific from your stay...',
        },
      ];

    case 'Spas':
      return [
        {
          id: 'q-services',
          prompt: 'Which spa session did you take?',
          type: 'multiple',
          options: [
            'Deep Tissue Massage',
            'Aromatherapy',
            'Hot Stone Therapy',
            'Rejuvenating Facial',
            'Steam / Hydrotherapy',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How relaxing was your session?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-atmosphere',
          prompt: 'How were the therapist & ambience?',
          type: 'multiple',
          options: [
            'Skilled Therapist',
            'Calm Ambience',
            'Clean Treatment Rooms',
            'Good Pressure & Technique',
            'Slight Wait Before Session',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you visit again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any specific note? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: mention what helped you relax most...',
        },
      ];

    case 'Gyms':
      return [
        {
          id: 'q-focus',
          prompt: 'What did you use today?',
          type: 'multiple',
          options: [
            'Strength Equipment',
            'Cardio Zone',
            'Group Class',
            'Personal Training',
            'Locker & Shower Area',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your workout experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-facility',
          prompt: 'How were the equipment, cleanliness & trainers?',
          type: 'multiple',
          options: [
            'Well-Maintained Equipment',
            'Helpful Trainers',
            'Clean Floor & Washrooms',
            'Crowded at Peak Hours',
            'Good Workout Vibe',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you recommend this gym?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any specific detail? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: mention a trainer, class, or facility note...',
        },
      ];

    case 'Healthcare':
      return [
        {
          id: 'q-visit',
          prompt: 'What was your visit for today?',
          type: 'multiple',
          options: [
            'Doctor Consultation',
            'Routine Check-up',
            'Dental / Specialist Care',
            'Diagnostics / Lab',
            'Follow-up Visit',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your overall care?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-team',
          prompt: 'How were the doctor, staff & wait time?',
          type: 'multiple',
          options: [
            'Clear Explanation',
            'Polite Front-Desk Staff',
            'Short Wait Time',
            'Wait Was Slightly Long',
            'Clean Clinic',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you visit again if needed?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any appointment note? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: share how the consultation or reception felt...',
        },
      ];

    case 'Retail Stores':
      return [
        {
          id: 'q-visit',
          prompt: 'What did you visit the store for?',
          type: 'multiple',
          options: [
            'Product Selection',
            'New Arrivals',
            'Gift Shopping',
            'Pickup / Exchange',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your shopping experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-highlights',
          prompt: 'How were the stock, staff & checkout?',
          type: 'multiple',
          options: [
            'Helpful Staff',
            'Good Product Variety',
            'Quick Billing',
            'Billing Took Some Time',
            'Clean & Organized Store',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you shop here again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any item or note? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: mention what you bought or how staff helped...',
        },
      ];

    case 'Automobile Services':
      return [
        {
          id: 'q-service',
          prompt: 'Which service did your vehicle get?',
          type: 'multiple',
          options: [
            'Routine Service / Oil Change',
            'Diagnostics & Repair',
            'Detailing & Wash',
            'Tires & Alignment',
            'Inspection',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was the work quality?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-trust',
          prompt: 'How were communication & delivery time?',
          type: 'multiple',
          options: [
            'Clear Estimate',
            'Delivered on Time',
            'Took Slightly Longer',
            'Knowledgeable Technicians',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you bring your vehicle here again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any vehicle note? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: share how the vehicle feels after service...',
        },
      ];

    case 'Other Businesses':
    default:
      return [
        {
          id: 'q-experience',
          prompt: 'How was your overall experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Okay'],
          required: true,
        },
        {
          id: 'q-highlights',
          prompt: 'What stood out during your visit?',
          type: 'multiple',
          options: [
            'Friendly Staff',
            'Good Service Quality',
            'Quick & Smooth',
            'Took Slightly Longer',
            'Clean Space',
          ],
          required: false,
        },
        {
          id: 'q-return',
          prompt: 'Would you visit again?',
          type: 'single',
          options: ['Yes', 'Maybe', 'No'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Any specific detail? (Optional)',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Optional: share a quick note in your own words...',
        },
      ];
  }
}

export const DEFAULT_SEO_KEYWORDS_BY_CATEGORY: Record<BusinessCategory, string[]> = {
  'Hair Salons': ['hair salon', 'haircut', 'hair styling', 'hair colour', 'hair spa', 'keratin treatment', 'hairstylist'],
  'Beauty Salons': ['beauty salon', 'facial and skincare', 'manicure and pedicure', 'bridal makeup', 'beauty parlour'],
  Restaurants: ['restaurant', 'dine-in', 'fresh food', 'dining experience', 'takeaway'],
  Hotels: ['hotel', 'hotel stay', 'clean comfortable rooms', 'hospitality', 'breakfast'],
  Spas: ['spa', 'massage', 'deep tissue massage', 'aromatherapy', 'wellness spa'],
  Gyms: ['gym', 'fitness center', 'strength training', 'personal training', 'workout', 'cardio'],
  Healthcare: ['clinic', 'healthcare', 'doctor consultation', 'medical care', 'routine check-up'],
  'Retail Stores': ['retail store', 'shopping experience', 'quality products', 'customer service'],
  'Automobile Services': ['auto service', 'car repair', 'vehicle maintenance', 'oil change', 'car detailing'],
  'Other Businesses': ['local business', 'quality service', 'customer experience', 'reliable service'],
};

export const DEFAULT_ENABLED_FEATURES = {
  aiReviewDrafts: true,
  customQuestions: true,
  pdfPosterExport: true,
  analyticsView: true,
  inStoreQrStands: true,
  gbpAutoReply: true,
  weeklyReports: true,
};

export const BUILTIN_DEMO_PROFILE: PublicProfile = {
  businessId: 'demo-stylish-hair-studio',
  ownerId: 'demo',
  slug: 'stylish-hair-studio',
  name: 'Stylish Hair Studio',
  category: 'Hair Salons',
  googleReviewUrl: 'https://www.google.com/maps',
  logoDataUrl: DEMO_SALON_LOGO,
  enabledFeatures: DEFAULT_ENABLED_FEATURES,
  branding: {
    primaryColor: '#0F766E',
    secondaryColor: '#0F172A',
    welcomeMessage: 'Thanks for visiting Stylish Hair Studio! Share a few quick taps and we will draft a review for you.',
    thankYouMessage: 'Thank you for supporting Stylish Hair Studio. We look forward to seeing you again!',
    defaultReviewStyle: 'short',
  },
  qrConfig: {
    isActive: true,
    fgColor: '#0F172A',
    bgColor: '#FFFFFF',
    token: 'demo-v1',
    includeLogo: true,
  },
  questions: createCategoryQuestions('Hair Salons'),
  formTemplate: 'classic_cards',
  seoKeywords: DEFAULT_SEO_KEYWORDS_BY_CATEGORY['Hair Salons'],
};
