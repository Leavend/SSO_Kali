import type { DataSubjectRequestStatus, DataSubjectRequestType } from '@/types/profile.types'
import { useI18n } from '@/composables/useI18n'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'

export interface PrivacyRequestTypeOption {
  readonly type: DataSubjectRequestType
  readonly titleKey: string
  readonly descriptionKey: string
  readonly riskLabelKey: string
  readonly riskDescriptionKey: string
  readonly ctaLabelKey: string
  readonly pendingLabelKey: string
  readonly confirmTitleKey: string
  readonly confirmDescriptionKey: string
  readonly confirmLabelKey: string
  readonly requiresConfirmation: boolean
  readonly buttonVariant: ButtonVariant
  readonly buttonClass: string
  readonly cardClass: string
  readonly selectedClass: string
  readonly iconClass: string
  readonly riskBadgeClass: string
}

const EXPORT_OPTION: PrivacyRequestTypeOption = {
  type: 'export',
  titleKey: 'portal.privacy.type_export',
  descriptionKey: 'portal.privacy.desc_export',
  riskLabelKey: 'portal.privacy.risk_safe',
  riskDescriptionKey: 'portal.privacy.risk_desc_safe',
  ctaLabelKey: 'portal.privacy.cta_export',
  pendingLabelKey: 'portal.privacy.pending_export',
  confirmTitleKey: '',
  confirmDescriptionKey: '',
  confirmLabelKey: '',
  requiresConfirmation: false,
  buttonVariant: 'default',
  buttonClass: '',
  cardClass: 'border-success-700/20 hover:border-success-700/40 dark:border-success-700/30',
  selectedClass:
    'border-success-700/50 bg-success-50/70 dark:border-success-700/50 dark:bg-success-950/30',
  iconClass: 'text-success-700 dark:text-success-300',
  riskBadgeClass:
    'border-success-700/30 bg-success-50 text-success-700 dark:border-success-700/50 dark:bg-success-950/35 dark:text-success-200',
}

const DELETE_OPTION: PrivacyRequestTypeOption = {
  type: 'delete',
  titleKey: 'portal.privacy.type_delete',
  descriptionKey: 'portal.privacy.desc_delete',
  riskLabelKey: 'portal.privacy.risk_destructive',
  riskDescriptionKey: 'portal.privacy.risk_desc_destructive',
  ctaLabelKey: 'portal.privacy.cta_delete',
  pendingLabelKey: 'portal.privacy.pending_delete',
  confirmTitleKey: 'portal.privacy.confirm_title_delete',
  confirmDescriptionKey: 'portal.privacy.confirm_desc_delete',
  confirmLabelKey: 'portal.privacy.confirm_btn_delete',
  requiresConfirmation: true,
  buttonVariant: 'destructive',
  buttonClass:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive/70 dark:hover:bg-destructive/80',
  cardClass: 'border-error-700/20 hover:border-error-700/40 dark:border-error-700/30',
  selectedClass: 'border-error-700/50 bg-error-50/80 dark:border-error-700/50 dark:bg-error-950/30',
  iconClass: 'text-error-700 dark:text-error-300',
  riskBadgeClass:
    'border-error-700/30 bg-error-50 text-error-800 dark:border-error-700/50 dark:bg-error-950/40 dark:text-error-200',
}

const ANONYMIZE_OPTION: PrivacyRequestTypeOption = {
  type: 'anonymize',
  titleKey: 'portal.privacy.type_anonymize',
  descriptionKey: 'portal.privacy.desc_anonymize',
  riskLabelKey: 'portal.privacy.risk_permanent',
  riskDescriptionKey: 'portal.privacy.risk_desc_permanent',
  ctaLabelKey: 'portal.privacy.cta_anonymize',
  pendingLabelKey: 'portal.privacy.pending_anonymize',
  confirmTitleKey: 'portal.privacy.confirm_title_anonymize',
  confirmDescriptionKey: 'portal.privacy.confirm_desc_anonymize',
  confirmLabelKey: 'portal.privacy.confirm_btn_anonymize',
  requiresConfirmation: true,
  buttonVariant: 'outline',
  buttonClass:
    'border-warning-800/40 text-warning-800 hover:bg-warning-50 dark:border-warning-700/50 dark:text-warning-200 dark:hover:bg-warning-950/30',
  cardClass: 'border-warning-800/20 hover:border-warning-800/40 dark:border-warning-700/30',
  selectedClass:
    'border-warning-800/50 bg-warning-50/80 dark:border-warning-700/50 dark:bg-warning-950/30',
  iconClass: 'text-warning-800 dark:text-warning-200',
  riskBadgeClass:
    'border-warning-800/30 bg-warning-50 text-warning-800 dark:border-warning-700/50 dark:bg-warning-950/35 dark:text-warning-200',
}

export const PRIVACY_REQUEST_TYPE_OPTIONS: readonly PrivacyRequestTypeOption[] = [
  EXPORT_OPTION,
  DELETE_OPTION,
  ANONYMIZE_OPTION,
]

export function privacyRequestOption(type: DataSubjectRequestType): PrivacyRequestTypeOption {
  return PRIVACY_REQUEST_TYPE_OPTIONS.find((option) => option.type === type) ?? EXPORT_OPTION
}

export function dataSubjectTypeLabel(type: DataSubjectRequestType): string {
  const { t } = useI18n()
  if (type === 'delete') return t('portal.privacy.label_delete')
  if (type === 'anonymize') return t('portal.privacy.label_anonymize')
  return t('portal.privacy.label_export')
}

export function dataSubjectStatusLabel(status: DataSubjectRequestStatus): string {
  const { t } = useI18n()
  if (status === 'approved') return t('portal.privacy.status_approved')
  if (status === 'rejected') return t('portal.privacy.status_rejected')
  if (status === 'fulfilled') return t('portal.privacy.status_fulfilled')
  return t('portal.privacy.status_submitted')
}

export function dataSubjectTypeBadgeVariant(type: DataSubjectRequestType): BadgeVariant {
  if (type === 'delete') return 'destructive'
  if (type === 'anonymize') return 'secondary'
  return 'default'
}

export function dataSubjectStatusBadgeVariant(status: DataSubjectRequestStatus): BadgeVariant {
  if (status === 'rejected') return 'destructive'
  if (status === 'fulfilled') return 'default'
  if (status === 'approved') return 'secondary'
  return 'outline'
}
