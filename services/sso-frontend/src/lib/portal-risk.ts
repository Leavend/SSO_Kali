type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
type RiskLevel = 'low' | 'medium' | 'high'

type RiskTone = Pick<
  RiskPresentation,
  'level' | 'label' | 'description' | 'badgeVariant' | 'barClass' | 'labelClass'
>

export interface RiskPresentation {
  readonly level: RiskLevel
  readonly label: string
  readonly scoreText: string
  readonly normalizedScore: number
  readonly description: string
  readonly badgeVariant: BadgeVariant
  readonly barClass: string
  readonly labelClass: string
}

const RISK_SCORE_MAX = 100
const MEDIUM_RISK_THRESHOLD = 20
const HIGH_RISK_THRESHOLD = 50

const RISK_LOW_TONE: RiskTone = {
  level: 'low',
  label: 'Rendah',
  description: 'Tidak ada aktivitas mencurigakan pada login terbaru.',
  badgeVariant: 'default',
  barClass: 'bg-success-700 dark:bg-success-400',
  labelClass: 'text-success-700 dark:text-success-300',
}

const RISK_MEDIUM_TONE: RiskTone = {
  level: 'medium',
  label: 'Sedang',
  description: 'Pantau aktivitas terbaru dan perangkat aktif.',
  badgeVariant: 'secondary',
  barClass: 'bg-warning-800 dark:bg-warning-300',
  labelClass: 'text-warning-800 dark:text-warning-200',
}

const RISK_HIGH_TONE: RiskTone = {
  level: 'high',
  label: 'Tinggi',
  description: 'Perlu ditinjau. Ada sinyal login tidak biasa.',
  badgeVariant: 'destructive',
  barClass: 'bg-error-700 dark:bg-error-400',
  labelClass: 'text-error-700 dark:text-error-300',
}

export function presentRiskScore(score: number): RiskPresentation {
  const normalizedScore = clamp(score, 0, RISK_SCORE_MAX)
  const tone = riskTone(normalizedScore)
  return {
    ...tone,
    scoreText: `${normalizedScore}/${RISK_SCORE_MAX}`,
    normalizedScore,
  }
}

function riskTone(normalizedScore: number): RiskTone {
  if (normalizedScore >= HIGH_RISK_THRESHOLD) return RISK_HIGH_TONE
  if (normalizedScore >= MEDIUM_RISK_THRESHOLD) return RISK_MEDIUM_TONE
  return RISK_LOW_TONE
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
