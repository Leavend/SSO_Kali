import { cva, type VariantProps } from 'class-variance-authority'

/** Swiss button variants — flat fills + 1px hairline borders, no shadows.
 *  Class names map to the scoped styles in UiButton.vue. */
export const buttonVariants = cva('ui-btn', {
  variants: {
    variant: {
      primary: 'ui-btn--primary',
      secondary: 'ui-btn--secondary',
      danger: 'ui-btn--danger',
      ghost: 'ui-btn--ghost',
    },
    size: {
      sm: 'ui-btn--sm',
      md: 'ui-btn--md',
      lg: 'ui-btn--lg',
      icon: 'ui-btn--icon',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

export type ButtonVariants = VariantProps<typeof buttonVariants>
