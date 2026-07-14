const { decorateCategory, RECORD_TYPES, TYPE_LABELS } = require('./constants')
const { formatTimeText } = require('./date')
const stats = require('./stats')

function buildCategoryMap(categories) {
  return (categories || []).reduce((result, category) => {
    result[category._id] = decorateCategory(category)
    return result
  }, {})
}

function toDisplayRecord(record, categoryMap = {}) {
  const category = categoryMap[record.categoryId] || decorateCategory({
    _id: record.categoryId || 'unknown',
    name: record.categoryNameSnapshot || record.category || '未分类',
    iconKey: 'other',
    colorKey: 'gray'
  })
  return {
    ...record,
    categoryName: record.categoryNameSnapshot || record.category || category.name || '未分类',
    categoryIconPath: category.iconPath,
    categoryForeground: category.foreground,
    categoryBackground: category.background,
    typeLabel: TYPE_LABELS[record.type],
    amountText: stats.formatMoney(record.amount),
    timeText: formatTimeText(record.createdAt)
  }
}

function createEditForm(record) {
  return {
    clientId: record.clientId,
    type: record.type || RECORD_TYPES.EXPENSE,
    amount: String(record.amount || ''),
    categoryId: record.categoryId || '',
    categoryName: record.categoryNameSnapshot || record.category || '',
    date: record.date,
    remark: record.remark || ''
  }
}

function groupRecordsByDate(records) {
  const groups = []
  ;(records || []).forEach((record) => {
    let group = groups[groups.length - 1]
    if (!group || group.date !== record.date) {
      group = {
        date: record.date,
        records: [],
        income: 0,
        expense: 0
      }
      groups.push(group)
    }
    group.records.push(record)
    if (record.type === RECORD_TYPES.INCOME) {
      group.income += Number(record.amount || 0)
    } else {
      group.expense += Number(record.amount || 0)
    }
  })
  return groups.map((group) => ({
    ...group,
    incomeText: stats.formatMoney(group.income),
    expenseText: stats.formatMoney(group.expense)
  }))
}

module.exports = {
  buildCategoryMap,
  createEditForm,
  groupRecordsByDate,
  toDisplayRecord
}
