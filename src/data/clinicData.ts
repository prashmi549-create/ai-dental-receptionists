import { Doctor, ServiceItem, FinancingPartner } from '../types';

export const CLINIC_INFO = {
  name: 'Dental Care & Implants of Houston',
  locationName: 'Greenspoint Location',
  address: '165 Greens Rd',
  cityStateZip: 'Houston, TX 77060',
  country: 'United States',
  phoneNewPatients: '(281) 946-2569',
  phoneOtherCallers: '(832) 648-7234',
  demographic: 'Comprehensive dental care serving patients from teens through adults',
  hours: [
    { days: 'Monday–Friday', time: '8:00 AM–7:00 PM' },
    { days: 'Saturday', time: '8:00 AM–5:00 PM' },
    { days: 'Sunday', time: 'Closed' },
  ],
  disclaimerNote: 'AIWebTeck Concept Demo: Independent demonstration created using publicly available information. Not an official application of Dental Care & Implants of Houston.',
};

export const DOCTORS: Doctor[] = [
  {
    name: 'Dr. Aditya Bhawsar',
    location: 'Greenspoint Office',
  },
  {
    name: 'Dr. James Dinh',
    location: 'Greenspoint Office',
  },
  {
    name: 'Dr. Firoz Lalani',
    location: 'Greenspoint Office',
  },
  {
    name: 'Dr. Vicky Matayoshi',
    location: 'Greenspoint Office',
  },
];

export const SERVICES: ServiceItem[] = [
  {
    id: 'implants',
    name: 'Dental Implants',
    category: 'Restorative & Implants',
    description: 'Permanent, lifelike tooth replacement solutions designed to restore chewing strength, dental function, and natural aesthetics.',
    badge: 'Popular',
  },
  {
    id: 'implant-dentures',
    name: 'Implant-Supported Dentures',
    category: 'Restorative & Implants',
    description: 'Secure, non-slip denture alternatives anchored by durable dental implants for maximum stability and comfort.',
  },
  {
    id: 'full-mouth-implants',
    name: 'Full-Mouth Dental Implants',
    category: 'Restorative & Implants',
    description: 'Complete full-arch restorative implant therapy to reconstruct entire upper or lower arches of teeth with natural-looking prosthetic teeth.',
  },
  {
    id: 'invisalign',
    name: 'Invisalign® & Clear Aligners',
    category: 'Cosmetic & Ortho',
    description: 'Discreet, removable clear orthodontic aligners for teens and adults to straighten teeth without traditional metal brackets.',
    badge: 'Teens & Adults',
  },
  {
    id: 'cosmetic-dentistry',
    name: 'Cosmetic Dentistry',
    category: 'Cosmetic & Ortho',
    description: 'Tailored aesthetic dental enhancements to transform smiles with confidence, balance, and harmony.',
  },
  {
    id: 'teeth-whitening',
    name: 'Teeth Whitening',
    category: 'Cosmetic & Ortho',
    description: 'Professional dental-grade whitening treatments designed to safely eliminate stains and significantly brighten your smile.',
  },
  {
    id: 'crowns',
    name: 'Dental Crowns',
    category: 'Restorative & Implants',
    description: 'Custom-fitted, high-strength ceramic or porcelain caps crafted to protect and restore weakened or broken teeth.',
  },
  {
    id: 'bridges',
    name: 'Dental Bridges',
    category: 'Restorative & Implants',
    description: 'Custom prosthetics designed to bridge the gap created by one or more missing teeth, anchored to adjacent teeth or implants.',
  },
  {
    id: 'root-canals',
    name: 'Root Canals',
    category: 'Specialty & Urgent',
    description: 'Gentle endodontic therapy to remove infected pulp tissue, relieve pain, and preserve your natural tooth structure.',
  },
  {
    id: 'family-dentistry',
    name: 'Family Dentistry',
    category: 'General & Preventive',
    description: 'Comprehensive dental care for patients from teens through adults, offering gentle cleanings, exams, and routine care.',
  },
  {
    id: 'preventive-care',
    name: 'Preventive Dental Care',
    category: 'General & Preventive',
    description: 'Routine oral examinations, professional dental hygiene cleanings, plaque removal, and proactive oral health screenings.',
  },
  {
    id: 'general-dentistry',
    name: 'General Dentistry',
    category: 'General & Preventive',
    description: 'Complete dental diagnostics, tooth-colored composite fillings, and ongoing oral wellness maintenance for everyday oral health.',
  },
  {
    id: 'sedation-dentistry',
    name: 'Sedation Dentistry',
    category: 'Specialty & Urgent',
    description: 'Relaxation and comfort options for patients who experience dental anxiety or require extensive treatment procedures.',
    badge: 'Anxiety-Free Care',
  },
  {
    id: 'emergency-care',
    name: 'Emergency Dental Care',
    category: 'Specialty & Urgent',
    description: 'Prompt dental attention for severe toothaches, broken restorations, sudden dental trauma, or acute dental discomfort.',
    badge: 'Prompt Attention',
  },
];

export const TECHNOLOGIES = [
  {
    title: 'Digital X-Rays',
    description: 'Low-radiation, instant high-resolution imaging that provides crystal-clear diagnostics while maximizing patient safety.',
  },
  {
    title: '3D Imaging / CBCT',
    description: 'Advanced cone beam computed tomography yielding precise three-dimensional views of bone structure for exact implant planning.',
  },
  {
    title: 'CEREC Technology',
    description: 'State-of-the-art CAD/CAM computer-aided design and milling for efficient, highly precise crown and restoration fabrication.',
  },
];

export const FINANCING_PARTNERS: FinancingPartner[] = [
  {
    name: 'Cherry',
    tagline: 'Fast and flexible monthly payment plans designed for patient treatments.',
    type: 'Monthly Installments',
  },
  {
    name: 'CareCredit',
    tagline: 'Healthcare credit card designed specifically for health, wellness, and dental care.',
    type: 'Healthcare Credit',
  },
  {
    name: 'Proceed Finance',
    tagline: 'Specialized financing options often suited for major dental implant procedures.',
    type: 'Treatment Financing',
  },
  {
    name: 'Sunbit',
    tagline: 'Quick, friendly financing solution with high approval access for dental needs.',
    type: 'Flexible Term Financing',
  },
  {
    name: 'Alpheon',
    tagline: 'Dedicated patient financing credit plans providing structured healthcare payment terms.',
    type: 'Patient Credit Line',
  },
  {
    name: 'Basis',
    tagline: 'Transparent healthcare financing alternative helping patients afford quality care.',
    type: 'Flexible Payment Plans',
  },
];

export const SUGGESTED_QUESTIONS = [
  'What services do you offer?',
  'Are you open on Saturday?',
  'How can I contact the office?',
  'Do you offer dental implants?',
  'Do you offer Invisalign?',
  'Who are the dentists at the Greenspoint location?',
  'How can I become a new patient?',
  'What financing options are available?',
  'Where is the office located?',
];
