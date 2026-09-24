export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export function relativeDays(date) {
  const days = Math.round((new Date(date) - Date.now()) / 86_400_000)
  if (days === 0) return 'today'
  return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`
}
