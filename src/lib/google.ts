const DEFAULT_PRODUCTION_GA4_ID = "G-9N9CRH6QG2";
const DEFAULT_PRODUCTION_ADSENSE_CLIENT = "ca-pub-1069480025527043";
const GOOGLE_CONSENT_STORAGE_KEY = "free-minutes-google-consent";

const GA4_ID =
  import.meta.env.VITE_GA4_MEASUREMENT_ID?.trim() ||
  (import.meta.env.PROD ? DEFAULT_PRODUCTION_GA4_ID : "");
const ADSENSE_CLIENT =
  import.meta.env.VITE_ADSENSE_CLIENT?.trim() ||
  (import.meta.env.PROD ? DEFAULT_PRODUCTION_ADSENSE_CLIENT : "");
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT?.trim() ?? "";
let runtimeGoogleConsent: GoogleConsentChoice | null = null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    adsbygoogle?: unknown[];
    __freeMinutesGaLoaded?: boolean;
    __freeMinutesAdsLoaded?: boolean;
    __freeMinutesPageViewSent?: boolean;
  }
}

export type GoogleConsentChoice = "granted" | "denied";

export type AdsenseSlotConfig = {
  enabled: boolean;
  client: string;
  slot: string;
};

export function initializeGoogleSlots(): void {
  initializeGa4();
  const consent = getStoredGoogleConsent();
  applyGoogleConsent(consent ?? "denied", consent !== null);
  if (consent === "granted") {
    initializeAdsense();
    sendGooglePageView();
  }
}

export function getAdsenseSlotConfig(
  consent: GoogleConsentChoice | null = getStoredGoogleConsent(),
): AdsenseSlotConfig {
  return {
    enabled: Boolean(consent === "granted" && ADSENSE_CLIENT && ADSENSE_SLOT),
    client: ADSENSE_CLIENT,
    slot: ADSENSE_SLOT,
  };
}

export function requestAdsenseRender(): void {
  if (!ADSENSE_CLIENT || !ADSENSE_SLOT || getStoredGoogleConsent() !== "granted") {
    return;
  }
  window.adsbygoogle = window.adsbygoogle ?? [];
  window.adsbygoogle.push({});
}

export function getStoredGoogleConsent(): GoogleConsentChoice | null {
  if (runtimeGoogleConsent) {
    return runtimeGoogleConsent;
  }

  try {
    const value = window.localStorage.getItem(GOOGLE_CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setGoogleConsentChoice(choice: GoogleConsentChoice): void {
  runtimeGoogleConsent = choice;

  try {
    window.localStorage.setItem(GOOGLE_CONSENT_STORAGE_KEY, choice);
  } catch {
    // Consent still applies for the current page if localStorage is unavailable.
  }

  applyGoogleConsent(choice, true);
  if (choice === "granted") {
    initializeAdsense();
    sendGooglePageView();
  }
}

function initializeGa4(): void {
  if (!GA4_ID || window.__freeMinutesGaLoaded) {
    return;
  }
  window.__freeMinutesGaLoaded = true;

  if (window.gtag) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  applyGoogleConsent("denied", false);
  window.gtag("js", new Date());
  window.gtag("config", GA4_ID, { send_page_view: false });
}

function applyGoogleConsent(choice: GoogleConsentChoice, update: boolean): void {
  const value = choice === "granted" ? "granted" : "denied";
  const consentState = {
    ad_storage: value,
    analytics_storage: value,
    ad_user_data: value,
    ad_personalization: value,
    ...(update ? {} : { wait_for_update: 500 }),
  };

  window.gtag?.("consent", update ? "update" : "default", consentState);
}

function sendGooglePageView(): void {
  if (!window.gtag || window.__freeMinutesPageViewSent) {
    return;
  }
  window.__freeMinutesPageViewSent = true;
  window.gtag("event", "page_view", {
    page_title: document.title,
    page_location: window.location.href,
    page_path: `${window.location.pathname}${window.location.search}`,
  });
}

function initializeAdsense(): void {
  if (
    !ADSENSE_CLIENT ||
    window.__freeMinutesAdsLoaded ||
    getStoredGoogleConsent() !== "granted"
  ) {
    return;
  }
  window.__freeMinutesAdsLoaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
    ADSENSE_CLIENT,
  )}`;
  document.head.appendChild(script);
}
