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
          prompt: 'What services did you have today?',
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
          prompt: 'How was your experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-staff',
          prompt: 'How was our staff?',
          type: 'multiple',
          options: ['Very Friendly', 'Professional', 'Helpful', 'Average'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Mention your stylist, favorite part of the visit, or anything we can improve...',
        },
      ];

    case 'Restaurants':
      return [
        {
          id: 'q-visit-type',
          prompt: 'What did you enjoy with us today?',
          type: 'multiple',
          options: [
            'Dine-In',
            'Takeaway',
            'Signature Mains',
            'Appetizers',
            'Desserts',
            'Drinks & Coffee',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your dining experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-highlights',
          prompt: 'What stood out most?',
          type: 'multiple',
          options: [
            'Fresh & Flavorful Food',
            'Attentive Service',
            'Warm Ambiance',
            'Fast Kitchen',
            'Great Value',
          ],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Share a favorite dish or shout-out to your server...',
        },
      ];

    case 'Beauty Salons':
      return [
        {
          id: 'q-services',
          prompt: 'Which treatments did you receive today?',
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
          prompt: 'How was your overall experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-studio',
          prompt: 'How did you find our hygiene and care?',
          type: 'multiple',
          options: ['Spotless Studio', 'Gentle Technique', 'Warm & Welcoming', 'On-Time Appointment'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Share any specific notes about your treatment...',
        },
      ];

    case 'Hotels':
      return [
        {
          id: 'q-stay',
          prompt: 'Which parts of your stay stood out?',
          type: 'multiple',
          options: [
            'Clean & Comfortable Room',
            'Smooth Check-In',
            'Breakfast & Dining',
            'Convenient Location',
            'Quiet & Restful',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your stay overall?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-staff',
          prompt: 'How was our hospitality team?',
          type: 'multiple',
          options: ['Warm & Courteous', 'Helpful Concierge', 'Prompt Housekeeping', 'Average'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Tell future guests what made your stay memorable...',
        },
      ];

    case 'Spas':
      return [
        {
          id: 'q-services',
          prompt: 'Which spa therapies did you experience?',
          type: 'multiple',
          options: [
            'Deep Tissue Massage',
            'Aromatherapy',
            'Hot Stone Therapy',
            'Rejuvenating Facial',
            'Sauna & Hydrotherapy',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How relaxing was your session?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-atmosphere',
          prompt: 'How were the ambiance and therapist?',
          type: 'multiple',
          options: ['Calming Atmosphere', 'Skilled Therapist', 'Spotless Rooms', 'Refreshing Tea & Lounge'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Anything else about your wellness visit...',
        },
      ];

    case 'Gyms':
      return [
        {
          id: 'q-focus',
          prompt: 'What did you use or attend today?',
          type: 'multiple',
          options: [
            'Strength Equipment',
            'Cardio Zone',
            'Group Fitness Class',
            'Personal Training',
            'Locker & Recovery Area',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How is your training experience here?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-facility',
          prompt: 'What do you appreciate most?',
          type: 'multiple',
          options: ['Well-Maintained Machines', 'Motivating Coaches', 'Clean Facilities', 'Friendly Community'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Share your fitness progress or favorite class...',
        },
      ];

    case 'Healthcare':
      return [
        {
          id: 'q-visit',
          prompt: 'What type of visit did you have today?',
          type: 'multiple',
          options: [
            'Consultation',
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
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-team',
          prompt: 'How was our clinical & front-desk team?',
          type: 'multiple',
          options: ['Clear Explanations', 'Short Wait Time', 'Caring & Attentive', 'Clean Clinic'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Share anything helpful about your appointment experience...',
        },
      ];

    case 'Retail Stores':
      return [
        {
          id: 'q-visit',
          prompt: 'What brought you into the store today?',
          type: 'multiple',
          options: [
            'Browsing New Arrivals',
            'Product Selection',
            'Gift Shopping',
            'Pickup / Exchange',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was your shopping experience?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-highlights',
          prompt: 'What stood out during your visit?',
          type: 'multiple',
          options: ['Helpful Staff', 'Quality Products', 'Easy Checkout', 'Clean & Organized Store'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Tell others what you picked up or liked...',
        },
      ];

    case 'Automobile Services':
      return [
        {
          id: 'q-service',
          prompt: 'Which service did your vehicle receive?',
          type: 'multiple',
          options: [
            'Routine Maintenance / Oil Change',
            'Diagnostics & Repair',
            'Detailing & Wash',
            'Tires & Alignment',
            'Inspection',
          ],
          required: true,
        },
        {
          id: 'q-experience',
          prompt: 'How was the service quality?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-trust',
          prompt: 'How was communication and turnaround?',
          type: 'multiple',
          options: ['Transparent Pricing', 'Ready on Time', 'Knowledgeable Technicians', 'Fair & Honest'],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Mention how your vehicle feels or any technician feedback...',
        },
      ];

    case 'Other Businesses':
    default:
      return [
        {
          id: 'q-experience',
          prompt: 'How was your overall experience with us?',
          type: 'single',
          options: ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'],
          required: true,
        },
        {
          id: 'q-highlights',
          prompt: 'What stood out most?',
          type: 'multiple',
          options: [
            'Friendly & Helpful Team',
            'High Quality Service',
            'Prompt & Reliable',
            'Great Value',
          ],
          required: false,
        },
        {
          id: 'q-comments',
          prompt: 'Additional Comments',
          type: 'text',
          options: [],
          required: false,
          placeholder: 'Share a few words about your visit...',
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
  seoKeywords: DEFAULT_SEO_KEYWORDS_BY_CATEGORY['Hair Salons'],
};
