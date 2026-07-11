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
    form: {
      type: RECORD_TYPES.EXPENSE,
      amount: '',
      category: EXPENSE_CATEGORIES[0],
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
      typeLabel: TYPE_LABELS[record.type],
      amountText: stats.formatMoney(record.amount),
      timeText: formatTimeText(record.createdAt)
    }
  },

  onTypeTap(event) {
    const type = event.currentTarget.dataset.type
    const categories = type === RECORD_TYPES.EXPENSE ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
    this.setData({
      categories,
      'form.type': type,
      'form.category': categories[0]
    })
  },

  onAmountInput(event) {
    this.setData({
      'form.amount': event.detail.value
    })
  },

  onCategoryChange(event) {
    const index = Number(event.detail.value)
    this.setData({
      'form.category': this.data.categories[index]
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
    await sync.createRecord({
      type: form.type,
      amount,
      category: form.category,
      date: form.date,
      remark: form.remark.trim()
    }, user)

    wx.showToast({
      title: '已记录',
      icon: 'success'
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
