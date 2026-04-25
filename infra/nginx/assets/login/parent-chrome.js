(() => {
  const VERSION = "20260425-dom-safe-v2";
  const URL_PRIVACY_VERSION = "20260425-dom-safe-v2";
  const CONTEXT_KEY = "devssoLoginContext";
  const CONTEXT_TTL_MS = 15 * 60 * 1000;
  const RECOVERY_KEY = "devssoSignedinRecovery";
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
  const FLOW_KEYS = ["organization", "requestId"];
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

  function ensureHost() {
    let host = document.getElementById(IDS.host);

    if (!host) {
      host = document.createElement("div");
      host.id = IDS.host;
      document.body.appendChild(host);
    }
    host.className = "theme-toggle-anchor";
    host.dataset.devssoParentUi = "theme-toggle-host";
    if (host.parentElement !== document.body) document.body.appendChild(host);
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

  function ensureParentChrome() {
    if (!document.body) return;

    ensureFooter();
    ensureToggle();
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

  function isLoginTarget(pathname) {
    return /(^|\/)ui\/v2\/login(\/|$)/.test(pathname);
  }

  function isSignedInPath() {
    return /(^|\/)signedin(\/|$)/.test(location.pathname);
  }

  function contextIsFresh(context) {
    return context && Date.now() - Number(context.savedAt || 0) < CONTEXT_TTL_MS;
  }

  function readContext() {
    try {
      const context = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
      return contextIsFresh(context) ? context : null;
    } catch (error) {
      return null;
    }
  }

  function writeContext(context) {
    try {
      sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
    } catch (error) {}
  }

  function captureContext() {
    if (!isLoginPath() || !location.search) return;
    const url = new URL(location.href);
    captureUrlContext(url);
  }

  function captureUrlContext(url) {
    const params = {};
    SENSITIVE_KEYS.forEach((key) => {
      if (url.searchParams.has(key)) params[key] = url.searchParams.get(key);
    });
    if (Object.keys(params).length === 0) return;
    writeContext({ params, path: url.pathname, savedAt: Date.now() });
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

  function removeNonFlowParams(url) {
    let changed = false;

    SENSITIVE_KEYS.forEach((key) => {
      if (FLOW_KEYS.includes(key) || !url.searchParams.has(key)) return;
      url.searchParams.delete(key);
      changed = true;
    });
    return changed;
  }

  function cleanNavigationUrl(value) {
    const url = new URL(String(value), location.href);
    if (!isLoginTarget(url.pathname) || !url.search) return value;
    captureUrlContext(url);
    if (!removeNonFlowParams(url)) return value;
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function redactCurrentUrl() {
    if (!isLoginPath() || !location.search) return;

    captureContext();
    const url = new URL(location.href);
    if (!removeSensitiveParams(url)) return;
    rawReplaceState(history.state || null, document.title, `${url.pathname}${url.search}${url.hash}`);
    window.__devssoUrlPrivacyVersion = URL_PRIVACY_VERSION;
  }

  function pulseUrlPrivacy() {
    const delays = isSignedInPath() ? [1200, 3000, 6000, 10000] : [1800, 3000, 6000, 10000];
    captureContext();
    delays.forEach((delay) => {
      window.setTimeout(redactCurrentUrl, delay);
    });
  }

  function contextSearchParams() {
    const context = readContext();
    if (!context || !context.params || !context.params.requestId) return null;
    const params = new URLSearchParams();
    Object.entries(context.params).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params;
  }

  function completeStoredFlow() {
    const params = contextSearchParams();
    if (!params) return;
    const requestId = params.get("requestId");
    if (sessionStorage.getItem(RECOVERY_KEY) === requestId) return;
    const target = new URLSearchParams({ requestId: requestId || "" });
    if (params.get("organization")) target.set("organization", params.get("organization"));
    sessionStorage.setItem(RECOVERY_KEY, requestId || "");
    location.replace(`/login?${target.toString()}`);
  }

  function startSignedInRecovery() {
    if (!isSignedInPath()) return;
    window.setTimeout(completeStoredFlow, 1600);
  }

  function wrapHistoryMethod(name) {
    const original = history[name].bind(history);

    history[name] = (...args) => {
      if (args.length > 2) args[2] = cleanNavigationUrl(args[2]);
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

  function startParentChrome() {
    ensureParentChrome();
    schedule();
  }

  function isPrimaryAction(element) {
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    return /(Lanjutkan|Continue|Masuk|Sign in|Verifikasi|Verify)/i.test(text);
  }

  function setButtonLoading(button) {
    if (!button || button.dataset.devssoLoading === "true") return;
    button.dataset.devssoLabel = button.textContent || "";
    button.dataset.devssoLoading = "true";
    button.setAttribute("aria-busy", "true");
    button.style.setProperty("color", "transparent", "important");
    button.style.setProperty("text-shadow", "none", "important");
    window.setTimeout(() => clearButtonLoading(button), 12000);
  }

  function clearButtonLoading(button) {
    if (!button || button.dataset.devssoLoading !== "true") return;
    button.removeAttribute("aria-busy");
    delete button.dataset.devssoLoading;
    button.style.removeProperty("color");
    button.style.removeProperty("text-shadow");
  }

  function clearLoadingButtons() {
    document.querySelectorAll('[data-devsso-loading="true"]').forEach(clearButtonLoading);
  }

  function bindLoadingState() {
    if (window.__devssoLoadingStateBound) return;
    window.__devssoLoadingStateBound = true;
    document.addEventListener("submit", onSubmitCapture, true);
    document.addEventListener("click", onActionClick, true);
    window.addEventListener("pageshow", clearLoadingButtons);
  }

  function onSubmitCapture(event) {
    const button = event.submitter || event.target?.querySelector('button[type="submit"]');
    setButtonLoading(button);
  }

  function onActionClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const button = target.closest("button");
    if (!button || button.disabled || !isPrimaryAction(button)) return;
    setButtonLoading(button);
  }

  function boot() {
    startUrlPrivacy();
    bindLoadingState();
    startSignedInRecovery();
    window.setTimeout(startParentChrome, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
