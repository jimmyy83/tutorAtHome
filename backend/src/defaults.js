// Seed content only. Admin edits replace it through the CMS.
const educationLevels = [
  { id: 'nursery', value: 'Nursery', label: 'Nursery', stage: 'early', active: true, order: 0 },
  { id: 'kindergarten', value: 'Kindergarten', label: 'Kindergarten', stage: 'early', active: true, order: 1 },
  ...Array.from({ length: 12 }, (_, index) => ({ id: `class-${index + 1}`, value: String(index + 1), label: `Class ${index + 1}`, stage: index < 5 ? 'primary' : index < 8 ? 'middle' : index < 10 ? 'secondary' : 'senior-secondary', active: true, order: index + 2 })),
];
const educationCatalogDefaults = {
  educationLevels,
  streams: [
    { id: 'pcm', label: 'Science — PCM', description: 'Physics, Chemistry and Mathematics.', subjects: ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Informatics Practices'], examIds: ['jee-main', 'jee-advanced'], active: true, order: 0 },
    { id: 'pcb', label: 'Science — PCB', description: 'Physics, Chemistry and Biology.', subjects: ['Physics', 'Chemistry', 'Biology', 'English'], examIds: ['neet-ug'], active: true, order: 1 },
    { id: 'pcmb', label: 'Science — PCMB', description: 'Physics, Chemistry, Mathematics and Biology.', subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'], examIds: ['jee-main', 'jee-advanced', 'neet-ug'], active: true, order: 2 },
    { id: 'commerce', label: 'Commerce', description: 'Core commerce subjects with board-dependent electives.', subjects: ['Accountancy', 'Business Studies', 'Economics', 'English', 'Mathematics', 'Applied Mathematics', 'Informatics Practices'], examIds: [], active: true, order: 3 },
    { id: 'humanities', label: 'Humanities / Arts', description: 'Humanities subjects vary by board and school.', subjects: ['History', 'Geography', 'Political Science', 'Economics', 'Sociology', 'Psychology', 'English', 'Other board-dependent subject'], examIds: [], active: true, order: 4 },
  ],
  competitiveExams: [
    { id: 'jee-main', label: 'JEE Main', description: 'Ask about JEE Main preparation.', active: true, order: 0 },
    { id: 'jee-advanced', label: 'JEE Advanced', description: 'Ask about JEE Advanced preparation.', active: true, order: 1 },
    { id: 'neet-ug', label: 'NEET-UG', description: 'Ask about NEET-UG preparation.', active: true, order: 2 },
    { id: 'foundation', label: 'Foundation preparation', description: 'Ask about foundation preparation, where available.', active: true, order: 3 },
  ],
  // Add only client-approved board-specific combinations through the admin catalogue.
  subjectsByBoardClass: {},
};
export const defaultSettings = {
  brandName: 'TutorAtHome', logoUrl: '', phone: '', whatsapp: '919532761193', email: '', address: '',
  footerDescription: 'Connecting parents with home tutors from Nursery to Class 12.',
  social: { facebook: '', instagram: '', youtube: '', x: '' }, socialLinks: [], educationCatalog: educationCatalogDefaults,
  footerLinks: [{ label: 'Find a Tutor', url: '/parent-enquiry' }, { label: 'Become a Teacher', url: '/teacher-registration' }],
  privacyPolicy: '', termsAndConditions: '',
  subjects: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Hindi', 'Science', 'Social Science', 'History', 'Geography', 'Computer Science', 'Commerce and Accountancy', 'Economics', 'Other'],
};
export const defaultContent = {
  sections: [
    { id: 'hero', visible: true, title: 'Find the Right Tutor for Your Child',
      description: 'Personalised learning and expert subject guidance for students from Nursery to Class 12.',
      primaryCta: { label: 'Find a Tutor', url: '/parent-enquiry' }, secondaryCta: { label: 'Register as a Teacher', url: '/teacher-registration' } },
    { id: 'levels', visible: true, title: 'Every level, Nursery to Class 12', description: 'Tutors teach the subjects and grades matching their qualifications and expertise.' },
    { id: 'subjects', visible: true, title: 'Subjects we cover', description: 'From core sciences to languages and commerce.' },
    { id: 'how', visible: true, title: 'How it works', description: '',
      steps: ["Submit your child's tuition requirements.", 'We review the request and identify suitable tutors.', 'Our team contacts you to discuss the next steps.'] },
    { id: 'teachers', visible: true, title: 'Featured teachers', description: '' },
    { id: 'owner', visible: true, title: 'Meet the owner', name: 'Shashank Pandey', role: 'Owner & Director · Academic Mentor',
      description: 'TutorAtHome connects families with personalised, one-to-one home tutoring from Nursery to Class 12.' },
    { id: 'benefits', visible: true, title: 'Why TutorAtHome', description: '',
      items: [{ title: 'Personal attention', text: 'One-to-one learning at home.' }, { title: 'Qualified tutors', text: 'Teachers are reviewed before being featured.' }] },
    { id: 'cta', visible: true, title: 'Ready to get started?', description: '' },
  ],
};
