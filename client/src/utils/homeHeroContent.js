const fallbackHeroCopy = {
  title: 'The right tutor. A brighter future.',
  description: 'One-to-one learning shaped around your child’s class, subjects and schedule.',
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
  return current || next;
}
