import type { Dictionary } from "./es";

// `satisfies Dictionary` hace fallar el typecheck si falta o sobra alguna clave respecto a es.ts.
const en = {
  meta: {
    title: "wine-app",
    description:
      "Discover Spanish wines and wineries: where to buy them, at what price, wine tourism and awards.",
  },
  common: {
    skipToContent: "Skip to content",
    homeLabel: "wine-app, go to home page",
    comingSoon: "Coming soon",
  },
  theme: {
    label: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  language: {
    label: "Language",
    switchTo: "Leer en español",
    short: "ES",
  },
  footer: {
    responsible:
      "Enjoy wine responsibly. The sale and consumption of alcohol by anyone under 18 is prohibited.",
    legalNav: "Legal information",
    privacy: "Privacy",
    cookies: "Cookies",
    legalNotice: "Legal notice",
    privateBeta: "Private, invitation-only phase",
  },
  ageGate: {
    title: "Before you enter",
    question: "Are you over 18?",
    text: "This website is about alcoholic beverages and is intended for adults only.",
    yes: "Yes, I'm over 18",
    no: "No",
    deniedTitle: "Sorry",
    deniedText:
      "You must be of legal drinking age to access this website. Come back when you turn 18.",
    back: "Go back",
    cookieNotice:
      "We only use technical cookies required for the site to work (session, language, theme and this check).",
    cookieLink: "More about cookies",
  },
  landing: {
    eyebrow: "Invitation-only access",
    title: "Spanish wines and wineries, all in one place",
    subtitle:
      "Find where to buy each wine and at what price, discover wineries to visit, and keep your favourites, notes and tastings.",
    ctaLogin: "Sign in",
    ctaInvite: "I have an invitation",
    featuresTitle: "What you'll be able to do",
    features: [
      {
        badge: "Wines",
        title: "Compare prices",
        text: "Vintages, bottle sizes and shops selling in Spain, with price history.",
      },
      {
        badge: "Wineries",
        title: "Plan visits",
        text: "Winery pages with their wines, awards and wine tourism.",
      },
      {
        badge: "Your space",
        title: "Keep your notebook",
        text: "Favourites, tasting notes, lists and your personal cellar.",
      },
    ],
  },
  login: {
    title: "Sign in",
    text: "Account access is coming very soon. For now the site is in a private phase.",
    back: "Back to home",
  },
  notFound: {
    title: "Page not found",
    text: "The page you're looking for doesn't exist or has moved.",
    back: "Back to home",
  },
  legal: {
    lastUpdated: "Last updated",
    privacyTitle: "Privacy policy",
    cookiesTitle: "Cookie policy",
    legalNoticeTitle: "Legal notice",
  },
} satisfies Dictionary;

export default en;
