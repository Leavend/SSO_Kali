const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
})

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const divisions: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, name: 'seconds' },
  { amount: 60, name: 'minutes' },
  { amount: 24, name: 'hours' },
  { amount: 7, name: 'days' },
  { amount: 4.345, name: 'weeks' },
  { amount: 12, name: 'months' },
  { amount: Number.POSITIVE_INFINITY, name: 'years' },
]

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'

  try {
    return dateFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never'

  try {
    let seconds = (new Date(iso).getTime() - Date.now()) / 1000

    for (const division of divisions) {
      if (Math.abs(seconds) < division.amount) {
        return relativeFormatter.format(Math.round(seconds), division.name)
      }

      seconds /= division.amount
    }

    return formatDateTime(iso)
  } catch {
    return iso
  }
}

export function truncateId(id: string, keep = 8): string {
  if (id.length <= keep * 2) return id
  return `${id.slice(0, keep)}...${id.slice(-4)}`
}
