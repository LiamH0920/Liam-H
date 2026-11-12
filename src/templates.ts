export type TemplateId = 'restaurant' | 'services' | 'shop' | 'atelier' | 'studio' | 'journal'

export type SiteContent = {
  businessName: string
  tagline: string
  about: string
  phone: string
  email: string
  address: string
  openingHours: string
  primaryColor: string
  heroImage: string
  storyImage: string
  secondaryImage: string
  headingFont: string
  bodyFont: string
}

export type Site = {
  id: string
  templateId: TemplateId
  name: string
  slug: string
  content: SiteContent
  published: boolean
  updatedAt: string
}

export const fontOptions = [
  { name: 'Fraunces', family: "'Fraunces', Georgia, serif" },
  { name: 'Cormorant Garamond', family: "'Cormorant Garamond', Georgia, serif" },
  { name: 'DM Sans', family: "'DM Sans', Arial, sans-serif" },
  { name: 'Manrope', family: "'Manrope', Arial, sans-serif" },
  { name: 'Space Grotesk', family: "'Space Grotesk', Arial, sans-serif" },
  { name: 'Lora', family: "'Lora', Georgia, serif" },
  { name: 'Playfair Display', family: "'Playfair Display', Georgia, serif" },
]

export const templates: {
  id: TemplateId
  name: string
  category: string
  description: string
  color: string
  mood: string
  defaults: SiteContent
}[] = [
  {
    id: 'restaurant',
    name: 'The neighborhood table',
    category: 'Food & drink',
    description: 'Warm, rustic and made for the long lunch.',
    color: '#80543f',
    mood: 'Full-width, warm, rustic',
    defaults: {
      businessName: 'Olive & Thyme',
      tagline: 'Good food, made slowly.',
      about: 'A neighborhood kitchen for seasonal plates, good company, and one more cup of coffee.',
      phone: '(555) 018-2040',
      email: 'hello@example.com',
      address: '14 Market Lane, your town',
      openingHours: 'Tue–Sun, 11am–9pm',
      primaryColor: '#80543f',
      heroImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1800&q=85',
      storyImage: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1000&q=85',
      secondaryImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85',
      headingFont: 'Fraunces',
      bodyFont: 'DM Sans',
    },
  },
  {
    id: 'services',
    name: 'Good hands',
    category: 'Local services',
    description: 'Confident, clear and easy to find on a phone.',
    color: '#245b74',
    mood: 'Split screen, confident, crisp',
    defaults: {
      businessName: 'Good Hands Studio',
      tagline: 'Good work. Good people.',
      about: 'A dependable local team that cares about the details and the people behind every project.',
      phone: '(555) 018-2051',
      email: 'hello@example.com',
      address: '28 Cedar Street, your town',
      openingHours: 'Mon–Fri, 8am–6pm',
      primaryColor: '#245b74',
      heroImage: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85',
      storyImage: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=85',
      secondaryImage: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=85',
      headingFont: 'Manrope',
      bodyFont: 'DM Sans',
    },
  },
  {
    id: 'shop',
    name: 'Little things',
    category: 'Small shop',
    description: 'A cheerful product-led home for your independent shop.',
    color: '#a45446',
    mood: 'Product grid, bright, playful',
    defaults: {
      businessName: 'Little Things',
      tagline: 'Find something lovely.',
      about: 'A curious little shop filled with thoughtful finds, useful objects, and things worth keeping.',
      phone: '(555) 018-2062',
      email: 'hello@example.com',
      address: '6 Willow Walk, your town',
      openingHours: 'Mon–Sat, 10am–6pm',
      primaryColor: '#a45446',
      heroImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1500&q=85',
      storyImage: 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1000&q=85',
      secondaryImage: 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=1000&q=85',
      headingFont: 'Lora',
      bodyFont: 'Manrope',
    },
  },
  {
    id: 'atelier',
    name: 'After hours',
    category: 'Beauty & wellness',
    description: 'Dark, elegant and beautifully understated.',
    color: '#bc9a67',
    mood: 'Editorial, dark, elegant',
    defaults: {
      businessName: 'Atelier No. 8',
      tagline: 'A slower kind of beautiful.',
      about: 'A considered space for a little pause, thoughtful care, and feeling more like yourself.',
      phone: '(555) 018-2073',
      email: 'hello@example.com',
      address: '8 Rose Court, your town',
      openingHours: 'Tue–Sat, by appointment',
      primaryColor: '#bc9a67',
      heroImage: 'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?auto=format&fit=crop&w=1600&q=85',
      storyImage: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=1000&q=85',
      secondaryImage: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85',
      headingFont: 'Cormorant Garamond',
      bodyFont: 'DM Sans',
    },
  },
  {
    id: 'studio',
    name: 'Bright side',
    category: 'Creative studio',
    description: 'Bold type and bright color for makers and doers.',
    color: '#6248d8',
    mood: 'Bright, modern, geometric',
    defaults: {
      businessName: 'Good Day Studio',
      tagline: 'Make room for good ideas.',
      about: 'An independent creative studio helping ambitious local brands find their voice and make a little noise.',
      phone: '(555) 018-2084',
      email: 'hello@example.com',
      address: '19 Union Street, your town',
      openingHours: 'Mon–Fri, 9am–5pm',
      primaryColor: '#6248d8',
      heroImage: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1500&q=85',
      storyImage: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1000&q=85',
      secondaryImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1000&q=85',
      headingFont: 'Space Grotesk',
      bodyFont: 'Manrope',
    },
  },
  {
    id: 'journal',
    name: 'The Sunday paper',
    category: 'Farm & garden',
    description: 'Quiet, minimal and full of room to tell your story.',
    color: '#49634b',
    mood: 'Minimal, single-column, calm',
    defaults: {
      businessName: 'Sunday Garden',
      tagline: 'A little closer to nature.',
      about: 'We grow seasonal flowers and share small, useful things to help your garden find its own rhythm.',
      phone: '(555) 018-2095',
      email: 'hello@example.com',
      address: '3 Orchard Road, your town',
      openingHours: 'Fri–Sun, 9am–3pm',
      primaryColor: '#49634b',
      heroImage: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1500&q=85',
      storyImage: 'https://images.unsplash.com/photo-1493150134366-cacb0bdc03a9?auto=format&fit=crop&w=1000&q=85',
      secondaryImage: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1000&q=85',
      headingFont: 'Playfair Display',
      bodyFont: 'Lora',
    },
  },
]

export function templateFor(id: TemplateId) {
  return templates.find((template) => template.id === id) ?? templates[0]!
}
