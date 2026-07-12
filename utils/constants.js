const RECORD_TYPES = {
  EXPENSE: 'expense',
  INCOME: 'income'
}

const TYPE_LABELS = {
  expense: '支出',
  income: '收入'
}

const EXPENSE_CATEGORIES = [
  { _id: 'expense_food', name: '餐饮', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 10, isEnabled: true },
  { _id: 'expense_transport', name: '交通', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 20, isEnabled: true },
  { _id: 'expense_shopping', name: '购物', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 30, isEnabled: true },
  { _id: 'expense_housing', name: '居住', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 40, isEnabled: true },
  { _id: 'expense_entertainment', name: '娱乐', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 50, isEnabled: true },
  { _id: 'expense_medical', name: '医疗', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 60, isEnabled: true },
  { _id: 'expense_study', name: '学习', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 70, isEnabled: true },
  { _id: 'expense_other', name: '其他', type: RECORD_TYPES.EXPENSE, scope: 'system', sortOrder: 80, isEnabled: true }
]

const INCOME_CATEGORIES = [
  { _id: 'income_salary', name: '工资', type: RECORD_TYPES.INCOME, scope: 'system', sortOrder: 10, isEnabled: true },
  { _id: 'income_bonus', name: '奖金', type: RECORD_TYPES.INCOME, scope: 'system', sortOrder: 20, isEnabled: true },
  { _id: 'income_part_time', name: '兼职', type: RECORD_TYPES.INCOME, scope: 'system', sortOrder: 30, isEnabled: true },
  { _id: 'income_investment', name: '投资', type: RECORD_TYPES.INCOME, scope: 'system', sortOrder: 40, isEnabled: true },
  { _id: 'income_other', name: '其他', type: RECORD_TYPES.INCOME, scope: 'system', sortOrder: 50, isEnabled: true }
]

const CATEGORY_ID_BY_TYPE_AND_NAME = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
  .reduce((result, category) => {
    result[`${category.type}:${category.name}`] = category._id
    return result
  }, {})

module.exports = {
  CATEGORY_ID_BY_TYPE_AND_NAME,
  RECORD_TYPES,
  TYPE_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES
}
