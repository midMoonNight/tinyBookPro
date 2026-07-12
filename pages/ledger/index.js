const { EXPENSE_CATEGORIES, INCOME_CATEGORIES, RECORD_TYPES, TYPE_LABELS } = require('../../utils/constants')
const { formatDate, formatMonth, formatTimeText } = require('../../utils/date')
const stats = require('../../utils/stats')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')

Page({
  data: {
    today: '',
    currentMonth: '',
    records: [],
    todayRecords: [],
    categories: EXPENSE_CATEGORIES,
    categoryGroups: {
      expense: EXPENSE_CATEGORIES,
      income: INCOME_CATEGORIES
    },
    form: {
      type: RECORD_TYPES.EXPENSE,
      amount: '',
      categoryId: EXPENSE_CATEGORIES[0]._id,
      categoryName: EXPENSE_CATEGORIES[0].name,
      date: '',
      remark: ''
    },
    overview: {},
    dayStats: {},
    monthStats: {},
    budgetState: {
      hasBudget: false
    },
    selectedDay: '',
    selectedMonth: '',
    typeOptions: [
      { value: RECORD_TYPES.EXPENSE, label: '支出' },
      { value: RECORD_TYPES.INCOME, label: '收入' }
    ]
  },

  onLoad() {
    const today = formatDate()
    const currentMonth = formatMonth()
    this.setData({
      today,
      currentMonth,
      selectedDay: today,
      selectedMonth: currentMonth,
      'form.date': today
    })
    this.loadCategories()
  },

  async loadCategories() {
    const cloudCategories = await sync.fetchCategories()
    const expenseCategories = cloudCategories.filter((item) => item.type === RECORD_TYPES.EXPENSE)
    const incomeCategories = cloudCategories.filter((item) => item.type === RECORD_TYPES.INCOME)
    const categoryGroups = {
      expense: expenseCategories.length ? expenseCategories : EXPENSE_CATEGORIES,
      income: incomeCategories.length ? incomeCategories : INCOME_CATEGORIES
    }
    const categories = categoryGroups[this.data.form.type]

    this.setData({
      categoryGroups,
      categories,
      'form.categoryId': categories[0]._id,
      'form.categoryName': categories[0].name
    })
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const records = storage.getRecords()
    const activeRecords = storage.getActiveRecords()
    const today = this.data.today || formatDate()
    const currentMonth = this.data.currentMonth || formatMonth()
    const selectedDay = this.data.selectedDay || today
    const selectedMonth = this.data.selectedMonth || currentMonth
    const dayStats = stats.buildDayStats(activeRecords, selectedDay)
    const monthStats = stats.buildMonthStats(activeRecords, selectedMonth)
    const displayMonthStats = {
      ...monthStats,
      trendChartWidth: Math.max(638, monthStats.trend.length * 42)
    }
    const currentMonthStats = stats.buildMonthStats(activeRecords, currentMonth)
    const overview = stats.buildDayStats(activeRecords, today)
    const budgetState = stats.buildBudgetState(currentMonthStats, storage.getBudget(currentMonth))
    const todayRecords = overview.records.map(this.toDisplayRecord)

    this.setData({
      records,
      todayRecords,
      overview: {
        ...overview,
        monthExpenseText: currentMonthStats.expenseText
      },
      dayStats: {
        ...dayStats,
        records: dayStats.records.map(this.toDisplayRecord)
      },
      monthStats: displayMonthStats,
      budgetState
    })
  },

  toDisplayRecord(record) {
    return {
      ...record,
      categoryName: record.categoryNameSnapshot || record.category || '未分类',
      typeLabel: TYPE_LABELS[record.type],
      amountText: stats.formatMoney(record.amount),
      timeText: formatTimeText(record.createdAt)
    }
  },

  onTypeTap(event) {
    const type = event.currentTarget.dataset.type
    const categories = this.data.categoryGroups[type]
    this.setData({
      categories,
      'form.type': type,
      'form.categoryId': categories[0]._id,
      'form.categoryName': categories[0].name
    })
  },

  onAmountInput(event) {
    this.setData({
      'form.amount': event.detail.value
    })
  },

  onCategoryChange(event) {
    const index = Number(event.detail.value)
    const category = this.data.categories[index]
    this.setData({
      'form.categoryId': category._id,
      'form.categoryName': category.name
    })
  },

  onDateChange(event) {
    this.setData({
      'form.date': event.detail.value
    })
  },

  onRemarkInput(event) {
    this.setData({
      'form.remark': event.detail.value
    })
  },

  async onSubmit() {
    const form = this.data.form
    const amount = Number(form.amount)

    if (!amount || amount <= 0) {
      wx.showToast({
        title: '请输入大于 0 的金额',
        icon: 'none'
      })
      return
    }

    const user = storage.getUser()
    const result = await sync.createRecord({
      type: form.type,
      amount,
      categoryId: form.categoryId,
      categoryNameSnapshot: form.categoryName,
      date: form.date,
      remark: form.remark.trim()
    }, user)

    wx.showToast({
      title: result.cloudSynced ? '已记录并同步' : '已记录，未同步云端',
      icon: result.cloudSynced ? 'success' : 'none'
    })

    this.setData({
      'form.amount': '',
      'form.remark': '',
      'form.date': formatDate()
    })
    this.refresh()
  },

  onDeleteRecord(event) {
    const clientId = event.currentTarget.dataset.clientId
    wx.showModal({
      title: '删除记录',
      content: '确认删除这笔记录吗？',
      confirmText: '删除',
      confirmColor: '#c4493a',
      success: (result) => {
        if (!result.confirm) {
          return
        }

        sync.deleteRecord(clientId, storage.getUser())
          .catch(() => {
            wx.showToast({
              title: '云端删除失败，已先删除本地',
              icon: 'none'
            })
          })
          .finally(() => {
            this.refresh()
            wx.showToast({
              title: '已删除',
              icon: 'success'
            })
          })
      }
    })
  },

  onDayChange(event) {
    this.setData({
      selectedDay: event.detail.value
    }, () => this.refresh())
  },

  onMonthChange(event) {
    this.setData({
      selectedMonth: event.detail.value
    }, () => this.refresh())
  },

  goProfile() {
    wx.switchTab({
      url: '/pages/profile/index'
    })
  }
})
