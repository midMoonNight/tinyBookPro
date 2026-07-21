const { formatDate, formatMonth, getDaysInMonth } = require('./date')
const stats = require('./stats')

function parseDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dateText(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function clampDay(year, monthIndex, day) {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate())
}

function getOccurrenceDate(plan, index) {
  const start = parseDate(plan.startDate)
  if (plan.frequency === 'weekly') {
    const date = new Date(start)
    date.setDate(start.getDate() + index * 7)
    return dateText(date)
  }

  if (plan.frequency === 'yearly') {
    const year = start.getFullYear() + index
    const monthIndex = start.getMonth()
    return dateText(new Date(year, monthIndex, clampDay(year, monthIndex, start.getDate())))
  }

  const totalMonths = start.getMonth() + index
  const year = start.getFullYear() + Math.floor(totalMonths / 12)
  const monthIndex = totalMonths % 12
  return dateText(new Date(year, monthIndex, clampDay(year, monthIndex, start.getDate())))
}

function getFirstOccurrenceDate(plan) {
  return getOccurrenceDate(plan, 1)
}

function getOccurrences(plan, throughDate = formatDate()) {
  if (!plan || !plan.startDate || !plan.isEnabled || plan.deletedAt) {
    return []
  }

  const startDate = plan.activeFromDate && plan.activeFromDate > plan.startDate
    ? plan.activeFromDate
    : plan.startDate
  const endDate = plan.endDate || throughDate
  const occurrences = []
  let index = 1
  while (index < 2000) {
    const occurrenceDate = getOccurrenceDate(plan, index)
    if (occurrenceDate > throughDate || occurrenceDate > endDate) {
      break
    }
    if (occurrenceDate >= startDate) {
      occurrences.push(occurrenceDate)
    }
    index += 1
  }
  return occurrences
}

function getLegacyStartInstances(plans, instances) {
  const planMap = (plans || []).reduce((result, plan) => {
    result[plan.clientId] = plan
    return result
  }, {})
  return (instances || []).filter((instance) => {
    const plan = planMap[instance.planClientId]
    return plan
      && !instance.deletedAt
      && instance.status !== 'confirmed'
      && instance.occurrenceDate === plan.startDate
  })
}

function getInvalidPendingInstances(plan, instances, throughDate = formatDate()) {
  const validDates = new Set(getOccurrences(plan, throughDate))
  return (instances || []).filter((instance) => (
    instance.planClientId === plan.clientId
    && instance.status === 'pending'
    && !instance.deletedAt
    && !validDates.has(instance.occurrenceDate)
  ))
}

function buildAnnualStats(records, year, today = formatDate()) {
  const yearText = String(year)
  const currentYear = yearText === today.slice(0, 4)
  const lastDate = currentYear ? today : `${yearText}-12-31`
  const validRecords = (records || []).filter((record) => (
    !record.deletedAt
    && String(record.date || '').slice(0, 4) === yearText
    && record.date <= lastDate
  ))
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${yearText}-${String(index + 1).padStart(2, '0')}`
    const monthRecords = validRecords.filter((record) => record.date.slice(0, 7) === month)
    const income = monthRecords
      .filter((record) => record.type === 'income')
      .reduce((sum, record) => sum + Number(record.amount || 0), 0)
    const expense = monthRecords
      .filter((record) => record.type === 'expense')
      .reduce((sum, record) => sum + Number(record.amount || 0), 0)
    return {
      month,
      label: `${index + 1}月`,
      income: stats.roundMoney(income),
      expense: stats.roundMoney(expense),
      incomeText: stats.formatMoney(income),
      expenseText: stats.formatMoney(expense)
    }
  })
  const income = validRecords
    .filter((record) => record.type === 'income')
    .reduce((sum, record) => sum + Number(record.amount || 0), 0)
  const expense = validRecords
    .filter((record) => record.type === 'expense')
    .reduce((sum, record) => sum + Number(record.amount || 0), 0)
  const categoryMap = validRecords
    .filter((record) => record.type === 'expense')
    .reduce((result, record) => {
      const categoryId = record.categoryId || record.categoryNameSnapshot || 'unknown'
      const current = result[categoryId] || {
        categoryId,
        category: record.categoryNameSnapshot || record.category || '未分类',
        amount: 0
      }
      current.amount += Number(record.amount || 0)
      result[categoryId] = current
      return result
    }, {})
  const categories = Object.values(categoryMap)
    .map((item) => ({
      ...item,
      amount: stats.roundMoney(item.amount),
      amountText: stats.formatMoney(item.amount),
      percent: expense > 0 ? Math.round((item.amount / expense) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
  const monthCount = currentYear ? Number(today.slice(5, 7)) : 12
  const yearStart = parseDate(`${yearText}-01-01`)
  const last = parseDate(lastDate)
  const dayCount = Math.floor((last - yearStart) / 86400000) + 1
  const maxMonth = months.reduce((result, item) => item.expense > result.expense ? item : result, { expense: 0 })
  const maxCategory = categories[0] || null

  return {
    year: yearText,
    records: validRecords,
    recordCount: validRecords.length,
    income: stats.roundMoney(income),
    expense: stats.roundMoney(expense),
    balance: stats.roundMoney(income - expense),
    incomeText: stats.formatMoney(income),
    expenseText: stats.formatMoney(expense),
    balanceText: stats.formatMoney(income - expense),
    months,
    categories,
    monthAverage: stats.roundMoney(expense / Math.max(1, monthCount)),
    dayAverage: stats.roundMoney(expense / Math.max(1, dayCount)),
    monthAverageText: stats.formatMoney(expense / Math.max(1, monthCount)),
    dayAverageText: stats.formatMoney(expense / Math.max(1, dayCount)),
    maxMonth: maxMonth.expense > 0 ? maxMonth : null,
    maxCategory
  }
}

function getAvailableYears(records, currentYear = formatMonth().slice(0, 4)) {
  const years = new Set([String(currentYear)])
  ;(records || []).forEach((record) => {
    if (!record.deletedAt && record.date) {
      years.add(String(record.date).slice(0, 4))
    }
  })
  return Array.from(years).sort((a, b) => Number(b) - Number(a))
}

function createPendingInstances(plans, instances, throughDate = formatDate()) {
  const existing = new Set((instances || [])
    .filter((item) => !item.deletedAt)
    .map((item) => `${item.planClientId}_${item.occurrenceDate}`))
  const next = []
  ;(plans || []).forEach((plan) => {
    getOccurrences(plan, throughDate).forEach((occurrenceDate) => {
      const key = `${plan.clientId}_${occurrenceDate}`
      if (existing.has(key)) return
      next.push({
        clientId: key,
        planClientId: plan.clientId,
        occurrenceDate,
        status: 'pending',
        recordClientId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      existing.add(key)
    })
  })
  return next
}

module.exports = {
  buildAnnualStats,
  createPendingInstances,
  getAvailableYears,
  getFirstOccurrenceDate,
  getInvalidPendingInstances,
  getLegacyStartInstances,
  getOccurrenceDate,
  getOccurrences
}
