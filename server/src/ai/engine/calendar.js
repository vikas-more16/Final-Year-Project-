/**
 * Working-day arithmetic. Positions are fractional working days counted from a base date,
 * so scheduling can add hours of effort without caring about weekends.
 */
const DAY = 86_400_000

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6

export function nextWorkingDay(date) {
  let d = startOfDay(date)
  while (isWeekend(d)) d = new Date(d.getTime() + DAY)
  return d
}

export function makeCalendar(baseDate) {
  const base = nextWorkingDay(baseDate)

  /** Calendar date of working-day index n (fractions are floored). */
  const toDate = (n) => {
    let d = new Date(base)
    let remaining = Math.max(0, Math.floor(n))
    while (remaining > 0) {
      d = new Date(d.getTime() + DAY)
      if (!isWeekend(d)) remaining--
    }
    return d
  }

  /** Working-day index of a calendar date (weekend dates count as the following Monday). */
  const toIndex = (date) => {
    const target = nextWorkingDay(date)
    if (target <= base) return 0
    let n = 0
    for (let d = new Date(base); d < target; d = new Date(d.getTime() + DAY)) if (!isWeekend(d)) n++
    return n
  }

  return { base, toDate, toIndex }
}

export const addDays = (date, days) => new Date(startOfDay(date).getTime() + days * DAY)
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY)
