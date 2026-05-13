/**
 * Type declarations for @parent-ui/auth-shell.mjs
 */

export type Theme = 'light' | 'dark' | 'system'

export declare const AUTH_SHELL: {
  readonly appName: string
  readonly logoAlt: string
  readonly footerText: string
}

export declare function normalizeTheme(raw: string | null | undefined): Theme
export declare function getNextTheme(current: Theme): Theme
