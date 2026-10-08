import type { DemoProjectSeed, EntityProfileRecord, PlatformLibraryRecord } from "./index";

export const platformLibrarySeed: PlatformLibraryRecord[] = [
  {
    id: "medium",
    name: "Medium",
    type: "blog",
    homepageUrl: "https://medium.com",
    authorityScore: 86,
    difficulty: "easy",
    automationMode: "semi_auto",
    entityValue: "content",
    requiresCaptcha: false,
    requiresEmail: true,
    notes: "Strong content hub for brand stories, author posts, and supporting articles."
  },
  {
    id: "tumblr",
    name: "Tumblr",
    type: "blog",
    homepageUrl: "https://www.tumblr.com",
    authorityScore: 74,
    difficulty: "medium",
    automationMode: "semi_auto",
    entityValue: "media",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "Useful for media-rich supporting properties and light cross-linking."
  },
  {
    id: "aboutme",
    name: "About.me",
    type: "profile",
    homepageUrl: "https://about.me",
    authorityScore: 69,
    difficulty: "easy",
    automationMode: "semi_auto",
    entityValue: "brand",
    requiresCaptcha: false,
    requiresEmail: true,
    notes: "Simple profile entity for brand, founder, or expert identity."
  },
  {
    id: "github",
    name: "GitHub",
    type: "profile",
    homepageUrl: "https://github.com",
    authorityScore: 90,
    difficulty: "medium",
    automationMode: "manual_review",
    entityValue: "author",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "High-trust author/company profile; use for technical, SaaS, SEO tooling, and docs assets."
  },
  {
    id: "pinterest",
    name: "Pinterest",
    type: "media",
    homepageUrl: "https://www.pinterest.com",
    authorityScore: 82,
    difficulty: "medium",
    automationMode: "semi_auto",
    entityValue: "media",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "Good for image-led entity reinforcement and visual topical clusters."
  },
  {
    id: "youtube",
    name: "YouTube",
    type: "video",
    homepageUrl: "https://www.youtube.com",
    authorityScore: 95,
    difficulty: "hard",
    automationMode: "manual_review",
    entityValue: "authority",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "Authority video entity; best for brand proof, tutorials, and EEAT signals."
  },
  {
    id: "slideshare",
    name: "SlideShare",
    type: "document",
    homepageUrl: "https://www.slideshare.net",
    authorityScore: 76,
    difficulty: "medium",
    automationMode: "semi_auto",
    entityValue: "content",
    requiresCaptcha: false,
    requiresEmail: true,
    notes: "Document-sharing property for service decks, process explainers, and branded PDFs."
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    type: "audio",
    homepageUrl: "https://soundcloud.com",
    authorityScore: 72,
    difficulty: "medium",
    automationMode: "manual_review",
    entityValue: "media",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "Audio entity option for podcasts, interviews, and brand voice proof."
  },
  {
    id: "crunchbase",
    name: "Crunchbase",
    type: "citation",
    homepageUrl: "https://www.crunchbase.com",
    authorityScore: 88,
    difficulty: "hard",
    automationMode: "manual_review",
    entityValue: "authority",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "High-authority business citation; best for companies with verifiable brand assets."
  },
  {
    id: "behance",
    name: "Behance",
    type: "portfolio",
    homepageUrl: "https://www.behance.net",
    authorityScore: 78,
    difficulty: "medium",
    automationMode: "semi_auto",
    entityValue: "brand",
    requiresCaptcha: false,
    requiresEmail: true,
    notes: "Portfolio entity for visual case studies, branding, and creative proof."
  },
  {
    id: "quora",
    name: "Quora",
    type: "qa",
    homepageUrl: "https://www.quora.com",
    authorityScore: 84,
    difficulty: "hard",
    automationMode: "manual_review",
    entityValue: "author",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "Author expertise and topical answer footprint; use carefully for quality."
  },
  {
    id: "google-business-profile",
    name: "Google Business Profile",
    type: "local",
    homepageUrl: "https://www.google.com/business",
    authorityScore: 96,
    difficulty: "hard",
    automationMode: "manual_review",
    entityValue: "local",
    requiresCaptcha: true,
    requiresEmail: true,
    notes: "Core local/NAP entity for real businesses and local SEO trust."
  }
];

export const demoProjectSeed: DemoProjectSeed = {
  projectName: "Demo Money Site Entity Campaign",
  moneySite: {
    id: "demo-money-site",
    domain: "example-money-site.com",
    homepageUrl: "https://example-money-site.com",
    sitemapUrl: "https://example-money-site.com/sitemap.xml",
    language: "Vietnamese",
    targetCountry: "Vietnam",
    industry: "SEO services"
  },
  readinessInput: {
    hasBrandProfile: true,
    hasNapProfile: true,
    hasAuthorProfile: false,
    hasMediaAssets: true,
    hasSeoTargets: true,
    hasContentSource: true,
    hasApiSettings: false
  },
  platforms: platformLibrarySeed.slice(0, 5).map((platform) => ({
    id: platform.id,
    name: platform.name,
    type: platform.type,
    homepageUrl: platform.homepageUrl,
    difficulty: platform.difficulty === "easy" ? 1 : platform.difficulty === "medium" ? 3 : 5,
    supportsAuto: platform.automationMode === "auto",
    supportsSemiAuto: platform.automationMode === "semi_auto",
    requiresCaptcha: platform.requiresCaptcha,
    requiresEmail: platform.requiresEmail,
    fit: platform.entityValue === "authority" ? "brand" : platform.entityValue
  })),
  integrations: [
    { type: "ai", provider: "Gemini", isEnabled: false, maskedValue: "Not configured" },
    { type: "captcha", provider: "2Captcha / CapSolver", isEnabled: false, maskedValue: "Not configured" },
    { type: "email", provider: "IMAP / Gmail API", isEnabled: false, maskedValue: "Not configured" },
    { type: "proxy", provider: "Custom proxy", isEnabled: false, maskedValue: "Optional" },
    { type: "indexing", provider: "IndexNow / Google API", isEnabled: false, maskedValue: "Optional" }
  ]
};

export const demoEntityProfileSeed: EntityProfileRecord = {
  id: "demo-entity-profile",
  profileType: "organization",
  brandName: "Example Money Site",
  legalName: "Example Money Site Co., Ltd.",
  shortDescription: "SEO services brand focused on entity growth and authority building.",
  fullDescription:
    "Example Money Site helps businesses improve organic visibility through entity optimization, EEAT content planning, and durable authority signals across trusted platforms.",
  founderName: "Nguyen Van A",
  authorName: "SEO Editorial Team",
  email: "contact@example-money-site.com",
  phone: "+84 900 000 000",
  address: "Ho Chi Minh City, Vietnam",
  sameAsUrls: "https://example-money-site.com/about\nhttps://example-money-site.com/contact",
  targetKeywords: "entity SEO, EEAT SEO, SEO services Vietnam",
  topicalNiche: "SEO services and entity authority building",
  expertiseProof: "Case studies, client results, process documentation, author bio, and service pages.",
  trustSignals: "Consistent NAP, branded profiles, author pages, social proof, privacy/contact pages, and clear ownership."
};
