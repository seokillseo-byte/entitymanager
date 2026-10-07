import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.upsert({
    where: { id: "demo-project" },
    update: {},
    create: {
      id: "demo-project",
      name: "Demo Money Site Entity Campaign",
      description: "Starter project for validating EntityManager desktop workflows."
    }
  });

  await prisma.moneySite.upsert({
    where: { id: "demo-money-site" },
    update: {},
    create: {
      id: "demo-money-site",
      projectId: project.id,
      domain: "example-money-site.com",
      homepageUrl: "https://example-money-site.com",
      sitemapUrl: "https://example-money-site.com/sitemap.xml",
      language: "Vietnamese",
      targetCountry: "Vietnam",
      industry: "SEO services",
      businessModel: "SEO service business"
    }
  });

  const platforms = [
    ["platform-medium", "Medium", "blog", "https://medium.com", 2, false, true, false, true],
    ["platform-tumblr", "Tumblr", "blog", "https://www.tumblr.com", 2, false, true, true, true],
    ["platform-aboutme", "About.me", "profile", "https://about.me", 1, false, true, false, true],
    ["platform-github", "GitHub", "profile", "https://github.com", 3, false, true, true, true],
    ["platform-pinterest", "Pinterest", "media", "https://www.pinterest.com", 3, false, true, true, true]
  ] as const;

  for (const [id, name, type, homepageUrl, difficulty, supportsAuto, supportsSemiAuto, requiresCaptcha, requiresEmail] of platforms) {
    await prisma.platform.upsert({
      where: { id },
      update: {},
      create: {
        id,
        projectId: project.id,
        name,
        type,
        homepageUrl,
        difficulty,
        supportsAuto,
        supportsSemiAuto,
        requiresCaptcha,
        requiresEmail
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
