export const AUTH_ROUTES = Object.freeze({
  identityActions: Object.freeze({
    passwordReset: "/auth/password-reset",
    register: "/auth/register",
  }),
  identityVue: Object.freeze({
    passwordReset: "/password/reset",
    register: "/register",
  }),
  legal: Object.freeze({
    terms: "/terms",
    privacy: "/privacy",
    docs: "/docs",
  }),
});

const footerLinks = Object.freeze([
  Object.freeze({ label: "Terms", href: AUTH_ROUTES.legal.terms }),
  Object.freeze({ label: "Privacy", href: AUTH_ROUTES.legal.privacy }),
  Object.freeze({ label: "Docs", href: AUTH_ROUTES.legal.docs }),
]);

export const AUTH_SHELL = Object.freeze({
  brand: Object.freeze({
    name: "Dev-SSO",
    tagline: "Akses identitas yang aman dan profesional",
  }),
  footer: Object.freeze({
    copyright: "\u00a9 2026 Dev-SSO",
    separator: ".",
    id: "devsso-footer",
    links: footerLinks,
  }),
  theme: Object.freeze({
    defaultTheme: "light",
    attribute: "data-theme",
    darkClass: "dark",
    toggleHostId: "devsso-theme-float",
    toggleHostClass: "theme-toggle-anchor",
    toggleId: "devsso-theme-toggle",
    toggleClass: "theme-toggle",
    lightLabel: "Switch to light theme",
    darkLabel: "Switch to dark theme",
  }),
  typography: Object.freeze({
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }),
  tokens: Object.freeze({
    light: Object.freeze({
      canvas: "#f9fafb",
      card: "#ffffff",
      cardHover: "#f3f4f6",
      ink: "#111827",
      muted: "#6b7280",
      accent: "#2563eb",
      accentHover: "#1d4ed8",
      accentContrast: "#ffffff",
      accentSoft: "#eaf1fd",
      line: "#6b7280",
      focusRing: "#1d4ed8",
      shadow: "rgb(15 23 42 / 10%)",
    }),
    dark: Object.freeze({
      canvas: "#111827",
      card: "#1f2937",
      cardHover: "#374151",
      ink: "#f3f4f6",
      muted: "#d1d5db",
      accent: "#93c5fd",
      accentHover: "#bfdbfe",
      accentContrast: "#111827",
      accentSoft: "#1e3a5f",
      line: "#9ca3af",
      focusRing: "#93c5fd",
      shadow: "rgb(0 0 0 / 28%)",
    }),
  }),
});

export const devSsoCssVariableMap = Object.freeze({
  canvas: "--devsso-bg",
  card: "--devsso-surface",
  cardHover: "--devsso-surface-hover",
  ink: "--devsso-text",
  muted: "--devsso-text-secondary",
  accent: "--devsso-primary",
  accentHover: "--devsso-primary-hover",
  accentContrast: "--devsso-primary-contrast",
  accentSoft: "--devsso-primary-soft",
  line: "--devsso-border",
  focusRing: "--devsso-border-focus",
  shadow: "--devsso-shadow",
});

export function identityActionHref(path, value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return path;

  const params = new URLSearchParams({ login_hint: trimmed });
  return `${path}?${params.toString()}`;
}

export function normalizeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

export function getNextTheme(value) {
  return normalizeTheme(value) === "dark" ? "light" : "dark";
}

export function themeIconSvg(theme) {
  return normalizeTheme(theme) === "dark" ? sunIconSvg() : moonIconSvg();
}

export function renderFooterHtml(options = {}) {
  const id = options.id === undefined ? AUTH_SHELL.footer.id : options.id;
  const className = options.className || "";
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
  const classAttribute = className ? ` class="${escapeHtml(className)}"` : "";
  const links = AUTH_SHELL.footer.links
    .map(
      (link) =>
        `<span aria-hidden="true">${escapeHtml(AUTH_SHELL.footer.separator)}</span><a href="${escapeHtml(
          link.href,
        )}">${escapeHtml(link.label)}</a>`,
    )
    .join("");

  return `<footer${idAttribute}${classAttribute} aria-label="Legal links"><span>${escapeHtml(
    AUTH_SHELL.footer.copyright,
  )}</span>${links}</footer>`;
}

export function renderCssVariables(selector, tokens, variableMap = devSsoCssVariableMap) {
  const declarations = Object.entries(variableMap)
    .map(([tokenName, cssVariable]) => `  ${cssVariable}: ${tokens[tokenName]};`)
    .join("\n");

  return `${selector} {\n${declarations}\n}`;
}

function sunIconSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>';
}

function moonIconSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
