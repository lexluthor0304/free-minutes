const GITHUB_BUTTONS_SCRIPT_URL = "https://buttons.github.io/buttons.js";

declare global {
  interface Window {
    githubButtons?: {
      render?: (target?: HTMLElement | Document) => void;
    };
  }
}

export function initializeGithubButtons(target?: HTMLElement | null): void {
  if (window.githubButtons?.render) {
    window.githubButtons.render(target ?? undefined);
    return;
  }

  if (document.querySelector(`script[src="${GITHUB_BUTTONS_SCRIPT_URL}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.defer = true;
  script.src = GITHUB_BUTTONS_SCRIPT_URL;
  document.head.appendChild(script);
}
