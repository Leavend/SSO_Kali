/**
 * Type declarations for @parent-ui/auth-shell.mjs
 */

export type Theme = 'light' | 'dark' | 'system'

export type FooterLink = {
  readonly label: string
  readonly href: string
}

export declare const AUTH_SHELL: {
  readonly appName: string
  readonly logoAlt: string
  readonly footerText: string
  readonly theme: {
    readonly defaultTheme: Theme
    readonly attribute: string
    readonly darkClass: string
    readonly toggleId: string
    readonly toggleClass: string
    readonly lightLabel: string
    readonly darkLabel: string
  }
  readonly brand: {
    readonly name: string
    readonly subtitle: string
  }
  readonly footer: {
    readonly copyright: string
    readonly separator: string
    readonly links: readonly FooterLink[]
  }
  readonly copy: {
    readonly loginTitle: string
    readonly loginSubtitle: string
    readonly continueButton: string
    readonly processingButton: string
    readonly registerPrompt: string
  }
}

export declare function normalizeTheme(raw: string | null | undefined): Theme
export declare function getNextTheme(current: Theme): Theme
