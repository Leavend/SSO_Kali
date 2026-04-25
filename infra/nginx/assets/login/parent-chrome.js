(() => {
  const VERSION = "20260425-bottom-right-v1";
  const URL_PRIVACY_VERSION = "20260425-url-privacy-v1";
  const IDS = {
    footer: "devsso-footer",
    host: "devsso-theme-float",
    toggle: "devsso-theme-toggle",
  };
  const SENSITIVE_KEYS = [
    "authRequest",
    "code",
    "codeId",
    "idpIntent",
    "loginName",
    "organization",
    "prompt",
    "requestId",
    "sessionId",
    "userId",
  ];
  const rawReplaceState = history.replaceState.bind(history);

  const SUN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>';

  const currentTheme = () =>
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";

  const buttonLabel = (theme) =>
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  function applyTheme(value) {
    const theme = value === "dark" ? "dark" : "light";
    const button = document.getElementById(IDS.toggle);

    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.setAttribute("data-theme", theme);
    if (!button || button.dataset.devssoCurrentTheme === theme) return;
    button.innerHTML = theme === "dark" ? SUN : MOON;
    button.setAttribute("aria-label", buttonLabel(theme));
    button.dataset.devssoCurrentTheme = theme;
  }

  function ensureFooter() {
    if (!document.body || document.getElementById(IDS.footer)) return;

    const footer = document.createElement("footer");
    footer.id = IDS.footer;
    footer.setAttribute("aria-label", "Legal links");
    footer.innerHTML =
      '<span>&copy; 2026 Dev-SSO</span><span aria-hidden="true">.</span><a href="#">Terms</a><span aria-hidden="true">.</span><a href="#">Privacy</a><span aria-hidden="true">.</span><a href="#">Docs</a>';
    document.body.appendChild(footer);
  }

  function findShell() {
    return document.querySelector('body div[class*="min-h-screen"]') || document.body;
  }

  function ensureHost() {
    const shell = findShell();
    let host = document.getElementById(IDS.host);

    if (!host) {
      host = document.createElement("div");
      host.id = IDS.host;
    }
    host.className = "theme-toggle-anchor";
    host.dataset.devssoParentUi = "theme-toggle-host";
    if (host.parentElement !== shell) shell.appendChild(host);
    return host;
  }

  function ensureToggle() {
    const host = ensureHost();
    let button = document.getElementById(IDS.toggle);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = IDS.toggle;
    }
    button.className = "theme-toggle";
    button.dataset.devssoParentUi = "theme-toggle";
    button.onclick = () => applyTheme(currentTheme() === "dark" ? "light" : "dark");
    if (button.parentElement !== host) host.appendChild(button);
    applyTheme(currentTheme());
  }

  function hideNativeThemeSwitches() {
    document.querySelectorAll("button").forEach((button) => {
      if (button.id === IDS.toggle) return;

      const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""}`;
      if (!/(dark|light|theme|tema|mode|appearance)/i.test(label)) return;
      button.dataset.devssoNativeThemeHidden = "true";
    });
  }

  function ensureParentChrome() {
    if (!document.body) return;

    ensureFooter();
    ensureToggle();
    hideNativeThemeSwitches();
    window.__devssoToggleInjected = true;
    window.__devssoToggleVersion = VERSION;
  }

  function schedule() {
    [100, 600, 1500, 3000].forEach((delay) => {
      window.setTimeout(ensureParentChrome, delay);
    });
  }

  function isLoginPath() {
    return /(^|\/)ui\/v2\/login(\/|$)/.test(location.pathname);
  }

  function removeSensitiveParams(url) {
    let changed = false;

    SENSITIVE_KEYS.forEach((key) => {
      if (!url.searchParams.has(key)) return;
      url.searchParams.delete(key);
      changed = true;
    });
    return changed;
  }

  function redactCurrentUrl() {
    if (!isLoginPath() || !location.search) return;

    const url = new URL(location.href);
    if (!removeSensitiveParams(url)) return;
    rawReplaceState(history.state || null, document.title, `${url.pathname}${url.search}${url.hash}`);
    window.__devssoUrlPrivacyVersion = URL_PRIVACY_VERSION;
  }

  function pulseUrlPrivacy() {
    [250, 750, 1500, 3000, 6000, 10000].forEach((delay) => {
      window.setTimeout(redactCurrentUrl, delay);
    });
  }

  function wrapHistoryMethod(name) {
    const original = history[name].bind(history);

    history[name] = (...args) => {
      const result = original(...args);
      pulseUrlPrivacy();
      return result;
    };
  }

  function startUrlPrivacy() {
    if (window.__devssoUrlPrivacyWrapped) return;

    window.__devssoUrlPrivacyWrapped = true;
    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", pulseUrlPrivacy);
    window.addEventListener("hashchange", pulseUrlPrivacy);
    pulseUrlPrivacy();
  }

  function startObserver() {
    if (!window.MutationObserver || window.__devssoParentChromeObserver) return;

    window.__devssoParentChromeObserver = new MutationObserver(ensureParentChrome);
    window.__devssoParentChromeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function boot() {
    ensureParentChrome();
    schedule();
    startObserver();
    startUrlPrivacy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
