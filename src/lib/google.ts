const GA4_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID?.trim() ?? "";
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT?.trim() ?? "";
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT?.trim() ?? "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    adsbygoogle?: unknown[];
    __freeMinutesGaLoaded?: boolean;
    __freeMinutesAdsLoaded?: boolean;
  }
}

export type AdsenseSlotConfig = {
  enabled: boolean;
  client: string;
  slot: string;
};

export function initializeGoogleSlots(): void {
  initializeGa4();
  initializeAdsense();
}

export function getAdsenseSlotConfig(): AdsenseSlotConfig {
  return {
    enabled: Boolean(ADSENSE_CLIENT && ADSENSE_SLOT),
    client: ADSENSE_CLIENT,
    slot: ADSENSE_SLOT,
  };
}

export function requestAdsenseRender(): void {
  if (!ADSENSE_CLIENT || !ADSENSE_SLOT) {
    return;
  }
  window.adsbygoogle = window.adsbygoogle ?? [];
  window.adsbygoogle.push({});
}

function initializeGa4(): void {
  if (!GA4_ID || window.__freeMinutesGaLoaded) {
    return;
  }
  window.__freeMinutesGaLoaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA4_ID);
}

function initializeAdsense(): void {
  if (!ADSENSE_CLIENT || window.__freeMinutesAdsLoaded) {
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
