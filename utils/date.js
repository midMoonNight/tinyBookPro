function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date = new Date()) {
  const target = date instanceof Date ? date : new Date(date)
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`
}

function formatMonth(date = new Date()) {
  const target = date instanceof Date ? date : new Date(date)
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}`
}

function getDaysInMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number)
  return new Date(year, monthIndex, 0).getDate()
}

function getMonthRange(month) {
  const days = getDaysInMonth(month)
  return {
    start: `${month}-01`,
    end: `${month}-${pad(days)}`
  }
}

function isSameDate(date, targetDate) {
  return date === targetDate
}

function isSameMonth(date, month) {
  return date.slice(0, 7) === month
}

function formatTimeText(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function shiftMonth(month, offset) {
  const [year, monthIndex] = month.split('-').map(Number)
  return formatMonth(new Date(year, monthIndex - 1 + offset, 1))
}

module.exports = {
  formatDate,
  formatMonth,
  formatTimeText,
  getDaysInMonth,
  getMonthRange,
  isSameDate,
  isSameMonth,
  shiftMonth
}
