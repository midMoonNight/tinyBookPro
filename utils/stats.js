const { RECORD_TYPES } = require('./constants')
const { formatDate, formatMonth, getDaysInMonth, isSameDate, isSameMonth } = require('./date')

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function formatMoney(value) {
  return roundMoney(value).toFixed(2)
}

function active(records) {
  return (records || []).filter((record) => !record.deletedAt)
}

function sumByType(records, type) {
  return roundMoney(records
    .filter((record) => record.type === type)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0))
}

function getDayRecords(records, date = formatDate()) {
  return active(records).filter((record) => isSameDate(record.date, date))
}

function getMonthRecords(records, month = formatMonth()) {
  return active(records).filter((record) => isSameMonth(record.date, month))
}

function buildSummary(records) {
  const income = sumByType(records, RECORD_TYPES.INCOME)
  const expense = sumByType(records, RECORD_TYPES.EXPENSE)
  return {
    income,
    incomeText: formatMoney(income),
    expense,
    expenseText: formatMoney(expense),
    balance: roundMoney(income - expense),
    balanceText: formatMoney(income - expense)
  }
}

function buildDayStats(records, date = formatDate()) {
  const dayRecords = getDayRecords(records, date)
  return {
    date,
    records: dayRecords,
    ...buildSummary(dayRecords)
  }
}

function buildMonthStats(records, month = formatMonth()) {
  const monthRecords = getMonthRecords(records, month)
  const days = getDaysInMonth(month)
  const trend = Array.from({ length: days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`
    const expense = sumByType(getDayRecords(monthRecords, date), RECORD_TYPES.EXPENSE)
    return {
      day: index + 1,
      date,
      expense,
      expenseText: formatMoney(expense)
    }
  })
  const maxExpense = Math.max(...trend.map((item) => item.expense), 0)
  const trendWithPercent = trend.map((item) => ({
    ...item,
    percent: maxExpense > 0 ? Math.max(4, Math.round((item.expense / maxExpense) * 100)) : 0
  }))

  const expenseRecords = monthRecords.filter((record) => record.type === RECORD_TYPES.EXPENSE)
  const categoryMap = expenseRecords.reduce((result, record) => {
    result[record.category] = roundMoney((result[record.category] || 0) + Number(record.amount || 0))
    return result
  }, {})
  const expenseTotal = sumByType(monthRecords, RECORD_TYPES.EXPENSE)
  const categories = Object.keys(categoryMap)
    .map((category) => ({
      category,
      amount: categoryMap[category],
      amountText: formatMoney(categoryMap[category]),
      percent: expenseTotal > 0 ? Math.round((categoryMap[category] / expenseTotal) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    month,
    records: monthRecords,
    trend: trendWithPercent,
    categories,
    ...buildSummary(monthRecords)
  }
}

function buildBudgetState(monthStats, budget) {
  if (!budget || !Number(budget.amount)) {
    return {
      hasBudget: false
    }
  }

  const amount = Number(budget.amount)
  const spent = Number(monthStats.expense || 0)
  const ratio = amount > 0 ? spent / amount : 0
  const remaining = roundMoney(amount - spent)
  let status = 'normal'
  let message = '预算使用正常'

  if (ratio > 1) {
    status = 'over'
    message = '本月支出已超出预算'
  } else if (ratio >= 0.8) {
    status = 'warning'
    message = '本月支出已接近预算'
  }

  return {
    hasBudget: true,
    amount,
    amountText: formatMoney(amount),
    spent,
    spentText: formatMoney(spent),
    remaining,
    remainingText: formatMoney(remaining),
    percent: Math.round(ratio * 1000) / 10,
    progressPercent: Math.min(100, Math.round(ratio * 100)),
    status,
    message
  }
}

module.exports = {
  buildBudgetState,
  buildDayStats,
  buildMonthStats,
  formatMoney,
  getDayRecords,
  getMonthRecords,
  roundMoney
}
