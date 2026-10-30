const fallbackHeroCopy = {
  title: 'Find the Right Tutor for Your Child',
  description: 'Personalised learning and expert subject guidance for students from Nursery to Class 12.',
  primaryCta: { label: 'Find a tutor', url: '/parent-enquiry' },
  secondaryCta: { label: 'Become a teacher', url: '/teacher-registration' },
};

export function resolveHomeHeroCopy(hero) {
  return {
    title: typeof hero?.title === 'string' && hero.title.trim() ? hero.title.trim() : fallbackHeroCopy.title,
    description: typeof hero?.description === 'string' && hero.description.trim() ? hero.description.trim() : fallbackHeroCopy.description,
    primaryCta: {
      label: typeof hero?.primaryCta?.label === 'string' && hero.primaryCta.label.trim() ? hero.primaryCta.label.trim() : fallbackHeroCopy.primaryCta.label,
      url: typeof hero?.primaryCta?.url === 'string' && hero.primaryCta.url.trim() ? hero.primaryCta.url.trim() : fallbackHeroCopy.primaryCta.url,
    },
    secondaryCta: {
      label: typeof hero?.secondaryCta?.label === 'string' && hero.secondaryCta.label.trim() ? hero.secondaryCta.label.trim() : fallbackHeroCopy.secondaryCta.label,
      url: typeof hero?.secondaryCta?.url === 'string' && hero.secondaryCta.url.trim() ? hero.secondaryCta.url.trim() : fallbackHeroCopy.secondaryCta.url,
    },
  };
}

export function retainInitialHomeHeroCopy(current, next) {
  if (!current) return next;
  if (current.title === next.title && current.description === next.description
    && current.primaryCta.label === next.primaryCta.label && current.primaryCta.url === next.primaryCta.url
    && current.secondaryCta.label === next.secondaryCta.label && current.secondaryCta.url === next.secondaryCta.url) return current;
  return next;
}
