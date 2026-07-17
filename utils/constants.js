const RECORD_TYPES = {
  EXPENSE: 'expense',
  INCOME: 'income'
}

const TYPE_LABELS = {
  expense: '支出',
  income: '收入'
}

const CATEGORY_COLORS = [
  { key: 'blue', name: '蓝', foreground: '#007AFF', background: '#EAF3FF' },
  { key: 'green', name: '绿', foreground: '#248A3D', background: '#EAF8EE' },
  { key: 'red', name: '红', foreground: '#D92D20', background: '#FFF0EF' },
  { key: 'orange', name: '橙', foreground: '#D97706', background: '#FFF4E5' },
  { key: 'yellow', name: '黄', foreground: '#A56A00', background: '#FFF8D6' },
  { key: 'indigo', name: '靛蓝', foreground: '#5856D6', background: '#EEEEFF' },
  { key: 'purple', name: '紫', foreground: '#7E57C2', background: '#F3EEFF' },
  { key: 'pink', name: '粉', foreground: '#D63384', background: '#FDEEF6' },
  { key: 'cyan', name: '青', foreground: '#1687A7', background: '#E7F8FC' },
  { key: 'teal', name: '蓝绿', foreground: '#138A72', background: '#E7F7F3' },
  { key: 'gray', name: '灰', foreground: '#636366', background: '#F1F1F3' }
]

const CATEGORY_ICONS = [
  { key: 'food', name: '餐饮', path: '/images/categories/餐饮.png' },
  { key: 'coffee', name: '咖啡', path: '/images/categories/咖啡.png' },
  { key: 'transport', name: '公交', path: '/images/categories/公交.png' },
  { key: 'car', name: '汽车', path: '/images/categories/汽车.png' },
  { key: 'fuel', name: '加油', path: '/images/categories/加油.png' },
  { key: 'shopping', name: '购物', path: '/images/categories/购物.png' },
  { key: 'grocery', name: '超市', path: '/images/categories/超市.png' },
  { key: 'home', name: '居住', path: '/images/categories/居住.png' },
  { key: 'utilities', name: '水电', path: '/images/categories/水电.png' },
  { key: 'phone', name: '通讯', path: '/images/categories/通讯.png' },
  { key: 'entertainment', name: '娱乐', path: '/images/categories/娱乐.png' },
  { key: 'movie', name: '影音', path: '/images/categories/影音.png' },
  { key: 'medical', name: '医疗', path: '/images/categories/医疗.png' },
  { key: 'medicine', name: '药品', path: '/images/categories/药品.png' },
  { key: 'study', name: '学习', path: '/images/categories/学习.png' },
  { key: 'education', name: '教育', path: '/images/categories/教育.png' },
  { key: 'clothing', name: '服饰', path: '/images/categories/服饰.png' },
  { key: 'beauty', name: '美容', path: '/images/categories/美容.png' },
  { key: 'gift', name: '礼物', path: '/images/categories/礼物.png' },
  { key: 'pet', name: '宠物', path: '/images/categories/宠物.png' },
  { key: 'travel', name: '旅行', path: '/images/categories/旅行.png' },
  { key: 'hotel', name: '酒店', path: '/images/categories/酒店.png' },
  { key: 'sport', name: '运动', path: '/images/categories/运动.png' },
  { key: 'family', name: '家庭', path: '/images/categories/家庭.png' },
  { key: 'repair', name: '维修', path: '/images/categories/维修.png' },
  { key: 'salary', name: '工资', path: '/images/categories/工资.png' },
  { key: 'bonus', name: '奖金', path: '/images/categories/奖金.png' },
  { key: 'partTime', name: '兼职', path: '/images/categories/兼职.png' },
  { key: 'investment', name: '投资', path: '/images/categories/投资.png' },
  { key: 'other', name: '其他', path: '/images/categories/其他.png' }
]

const ICON_BY_KEY = CATEGORY_ICONS.reduce((result, icon) => {
  result[icon.key] = icon
  return result
}, {})

const COLOR_BY_KEY = CATEGORY_COLORS.reduce((result, color) => {
  result[color.key] = color
  return result
}, {})

const EXPENSE_CATEGORIES = [
  { _id: 'tbp_expense_food', name: '餐饮', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'food', colorKey: 'orange', sortOrder: 10, isEnabled: true },
  { _id: 'tbp_expense_transport', name: '交通', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'transport', colorKey: 'blue', sortOrder: 20, isEnabled: true },
  { _id: 'tbp_expense_shopping', name: '购物', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'shopping', colorKey: 'pink', sortOrder: 30, isEnabled: true },
  { _id: 'tbp_expense_housing', name: '居住', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'home', colorKey: 'indigo', sortOrder: 40, isEnabled: true },
  { _id: 'tbp_expense_entertainment', name: '娱乐', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'entertainment', colorKey: 'purple', sortOrder: 50, isEnabled: true },
  { _id: 'tbp_expense_medical', name: '医疗', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'medical', colorKey: 'red', sortOrder: 60, isEnabled: true },
  { _id: 'tbp_expense_study', name: '学习', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'study', colorKey: 'cyan', sortOrder: 70, isEnabled: true },
  { _id: 'tbp_expense_other', name: '其他', type: RECORD_TYPES.EXPENSE, scope: 'system', iconKey: 'other', colorKey: 'gray', sortOrder: 80, isEnabled: true }
]

const INCOME_CATEGORIES = [
  { _id: 'tbp_income_salary', name: '工资', type: RECORD_TYPES.INCOME, scope: 'system', iconKey: 'salary', colorKey: 'green', sortOrder: 10, isEnabled: true },
  { _id: 'tbp_income_bonus', name: '奖金', type: RECORD_TYPES.INCOME, scope: 'system', iconKey: 'bonus', colorKey: 'yellow', sortOrder: 20, isEnabled: true },
  { _id: 'tbp_income_part_time', name: '兼职', type: RECORD_TYPES.INCOME, scope: 'system', iconKey: 'partTime', colorKey: 'teal', sortOrder: 30, isEnabled: true },
  { _id: 'tbp_income_investment', name: '投资', type: RECORD_TYPES.INCOME, scope: 'system', iconKey: 'investment', colorKey: 'blue', sortOrder: 40, isEnabled: true },
  { _id: 'tbp_income_other', name: '其他', type: RECORD_TYPES.INCOME, scope: 'system', iconKey: 'other', colorKey: 'gray', sortOrder: 50, isEnabled: true }
]

const LEGACY_SYSTEM_CATEGORY_ID_MAP = {
  expense_food: 'tbp_expense_food',
  expense_transport: 'tbp_expense_transport',
  expense_shopping: 'tbp_expense_shopping',
  expense_housing: 'tbp_expense_housing',
  expense_entertainment: 'tbp_expense_entertainment',
  expense_medical: 'tbp_expense_medical',
  expense_study: 'tbp_expense_study',
  expense_other: 'tbp_expense_other',
  income_salary: 'tbp_income_salary',
  income_bonus: 'tbp_income_bonus',
  income_part_time: 'tbp_income_part_time',
  income_investment: 'tbp_income_investment',
  income_other: 'tbp_income_other'
}

const SYSTEM_CATEGORY_BY_ID = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
  .reduce((result, category) => {
    result[category._id] = category
    return result
  }, {})

function decorateCategory(category) {
  const fallback = SYSTEM_CATEGORY_BY_ID[category._id] || {}
  const iconKey = category.iconKey || fallback.iconKey || 'other'
  const colorKey = category.colorKey || fallback.colorKey || 'gray'
  return {
    ...fallback,
    ...category,
    iconKey,
    colorKey,
    iconPath: (ICON_BY_KEY[iconKey] || ICON_BY_KEY.other).path,
    foreground: (COLOR_BY_KEY[colorKey] || COLOR_BY_KEY.gray).foreground,
    background: (COLOR_BY_KEY[colorKey] || COLOR_BY_KEY.gray).background
  }
}

const CATEGORY_ID_BY_TYPE_AND_NAME = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
  .reduce((result, category) => {
    result[`${category.type}:${category.name}`] = category._id
    return result
  }, {})

module.exports = {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_ID_BY_TYPE_AND_NAME,
  COLOR_BY_KEY,
  decorateCategory,
  ICON_BY_KEY,
  LEGACY_SYSTEM_CATEGORY_ID_MAP,
  RECORD_TYPES,
  SYSTEM_CATEGORY_BY_ID,
  TYPE_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES
}
