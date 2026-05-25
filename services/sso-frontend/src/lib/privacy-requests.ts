import type { DataSubjectRequestStatus, DataSubjectRequestType } from '@/types/profile.types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'

export interface PrivacyRequestTypeOption {
  readonly type: DataSubjectRequestType
  readonly title: string
  readonly description: string
  readonly riskLabel: string
  readonly riskDescription: string
  readonly ctaLabel: string
  readonly pendingLabel: string
  readonly confirmTitle: string
  readonly confirmDescription: string
  readonly confirmLabel: string
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
  title: 'Ekspor Data',
  description: 'Dapatkan salinan data akun yang dapat diunduh.',
  riskLabel: 'Aman',
  riskDescription: 'Aman — tidak mengubah data.',
  ctaLabel: 'Ajukan Ekspor Data',
  pendingLabel: 'Mengajukan ekspor…',
  confirmTitle: '',
  confirmDescription: '',
  confirmLabel: '',
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
  title: 'Hapus Data',
  description:
    'Hapus data akun secara permanen. Sebagian data mungkin tetap disimpan sesuai kewajiban hukum.',
  riskLabel: 'Destruktif',
  riskDescription: 'Permanen setelah disetujui.',
  ctaLabel: 'Ajukan Penghapusan Data',
  pendingLabel: 'Mengajukan penghapusan…',
  confirmTitle: 'Kamu yakin ingin mengajukan penghapusan?',
  confirmDescription:
    'Tindakan ini tidak dapat dibatalkan setelah diverifikasi. Tim kami akan meninjau permintaan sebelum data diproses.',
  confirmLabel: 'Ya, Ajukan Penghapusan',
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
  title: 'Anonimisasi Data',
  description: 'Samarkan identitas pada data historis yang wajib disimpan.',
  riskLabel: 'Permanen',
  riskDescription: 'Tidak bisa dikembalikan.',
  ctaLabel: 'Ajukan Anonimisasi Data',
  pendingLabel: 'Mengajukan anonimisasi…',
  confirmTitle: 'Kamu yakin ingin mengajukan anonimisasi?',
  confirmDescription:
    'Tindakan ini tidak dapat dikembalikan setelah diverifikasi. Identitas pada data historis akan disamarkan permanen.',
  confirmLabel: 'Ya, Ajukan Anonimisasi',
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
  if (type === 'delete') return 'Hapus'
  if (type === 'anonymize') return 'Anonimisasi'
  return 'Ekspor'
}

export function dataSubjectStatusLabel(status: DataSubjectRequestStatus): string {
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  if (status === 'fulfilled') return 'Selesai'
  return 'Diajukan'
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
