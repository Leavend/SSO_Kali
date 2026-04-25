export type Theme = "light" | "dark";

export interface AuthShellLink {
  readonly label: string;
  readonly href: string;
}

export interface AuthShellTokens {
  readonly canvas: string;
  readonly card: string;
  readonly cardHover: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentContrast: string;
  readonly accentSoft: string;
  readonly line: string;
  readonly focusRing: string;
  readonly shadow: string;
}

export declare const AUTH_SHELL: {
  readonly brand: {
    readonly name: "Dev-SSO";
    readonly tagline: string;
  };
  readonly footer: {
    readonly copyright: string;
    readonly separator: ".";
    readonly id: "devsso-footer";
    readonly links: readonly AuthShellLink[];
  };
  readonly theme: {
    readonly defaultTheme: Theme;
    readonly attribute: "data-theme";
    readonly darkClass: "dark";
    readonly toggleHostId: "devsso-theme-float";
    readonly toggleHostClass: "theme-toggle-anchor";
    readonly toggleId: "devsso-theme-toggle";
    readonly toggleClass: "theme-toggle";
    readonly lightLabel: string;
    readonly darkLabel: string;
  };
  readonly typography: {
    readonly fontFamily: string;
  };
  readonly tokens: {
    readonly light: AuthShellTokens;
    readonly dark: AuthShellTokens;
  };
};

export declare const devSsoCssVariableMap: Record<keyof AuthShellTokens, string>;

export declare function identityActionHref(path: string, value: string): string;
export declare function normalizeTheme(value: unknown): Theme;
export declare function getNextTheme(value: unknown): Theme;
export declare function themeIconSvg(theme: unknown): string;
export declare function renderFooterHtml(options?: { id?: string; className?: string }): string;
export declare function renderCssVariables(
  selector: string,
  tokens: AuthShellTokens,
  variableMap?: Record<keyof AuthShellTokens, string>,
): string;
