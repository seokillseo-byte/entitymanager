import type { DemoProjectSeed } from "./index";

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
  platforms: [
    {
      id: "medium",
      name: "Medium",
      type: "blog",
      homepageUrl: "https://medium.com",
      difficulty: 2,
      supportsAuto: false,
      supportsSemiAuto: true,
      requiresCaptcha: false,
      requiresEmail: true,
      fit: "content"
    },
    {
      id: "tumblr",
      name: "Tumblr",
      type: "blog",
      homepageUrl: "https://www.tumblr.com",
      difficulty: 2,
      supportsAuto: false,
      supportsSemiAuto: true,
      requiresCaptcha: true,
      requiresEmail: true,
      fit: "media"
    },
    {
      id: "aboutme",
      name: "About.me",
      type: "profile",
      homepageUrl: "https://about.me",
      difficulty: 1,
      supportsAuto: false,
      supportsSemiAuto: true,
      requiresCaptcha: false,
      requiresEmail: true,
      fit: "brand"
    },
    {
      id: "github",
      name: "GitHub",
      type: "profile",
      homepageUrl: "https://github.com",
      difficulty: 3,
      supportsAuto: false,
      supportsSemiAuto: true,
      requiresCaptcha: true,
      requiresEmail: true,
      fit: "author"
    },
    {
      id: "pinterest",
      name: "Pinterest",
      type: "media",
      homepageUrl: "https://www.pinterest.com",
      difficulty: 3,
      supportsAuto: false,
      supportsSemiAuto: true,
      requiresCaptcha: true,
      requiresEmail: true,
      fit: "media"
    }
  ],
  integrations: [
    { type: "ai", provider: "Gemini", isEnabled: false, maskedValue: "Not configured" },
    { type: "captcha", provider: "2Captcha / CapSolver", isEnabled: false, maskedValue: "Not configured" },
    { type: "email", provider: "IMAP / Gmail API", isEnabled: false, maskedValue: "Not configured" },
    { type: "proxy", provider: "Custom proxy", isEnabled: false, maskedValue: "Optional" },
    { type: "indexing", provider: "IndexNow / Google API", isEnabled: false, maskedValue: "Optional" }
  ]
};
