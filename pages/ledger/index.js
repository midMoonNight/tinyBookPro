const { EXPENSE_CATEGORIES, INCOME_CATEGORIES, RECORD_TYPES, decorateCategory } = require('../../utils/constants')
const { formatDate, formatMonth, shiftMonth } = require('../../utils/date')
const recordUtils = require('../../utils/record')
const stats = require('../../utils/stats')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const validation = require('../../utils/validation')
const v3 = require('../../utils/v3')

Page({
  data: {
    today: '',
    currentMonth: '',
    records: [],
    recentRecords: [],
    allCategories: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map(decorateCategory),
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
    overview: { incomeText: '0.00', expenseText: '0.00', balanceText: '0.00', monthExpenseText: '0.00' },
    dayStats: { records: [], incomeText: '0.00', expenseText: '0.00', balanceText: '0.00' },
    monthStats: { trend: [], categories: [], recordCount: 0, incomeText: '0.00', expenseText: '0.00', balanceText: '0.00' },
    previousMonthStats: { income: 0, expense: 0, balance: 0 },
    monthComparison: {
      incomeAmountText: '0.00',
      incomePercentText: '暂无可比数据',
      expenseAmountText: '0.00',
      expensePercentText: '暂无可比数据',
      balanceDifferenceText: '0.00'
    },
    budgetState: {
      hasBudget: false
    },
    selectedDay: '',
    selectedMonth: '',
    editVisible: false,
    editDirty: false,
    editForm: null,
    editCategories: [],
    remarkLength: 0,
    editRemarkLength: 0,
    formDirty: false,
    quickTemplates: [],
    pendingInstances: [],
    categoryBudgetHint: null,
    showCategoryBudgetHint: false,
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

  async loadCategories() {
    const cloudCategories = await sync.fetchCategories(storage.getUser(), true)
    const enabledCloudCategories = cloudCategories.filter((item) => item.isEnabled !== false)
    const expenseCategories = enabledCloudCategories.filter((item) => item.type === RECORD_TYPES.EXPENSE)
    const incomeCategories = enabledCloudCategories.filter((item) => item.type === RECORD_TYPES.INCOME)
    const categoryGroups = {
      expense: (expenseCategories.length ? expenseCategories : EXPENSE_CATEGORIES).map(decorateCategory),
      income: (incomeCategories.length ? incomeCategories : INCOME_CATEGORIES).map(decorateCategory)
    }
    const categories = categoryGroups[this.data.form.type]
    const selectedCategory = categories.find((item) => item._id === this.data.form.categoryId) || categories[0]

    this.setData({
      categoryGroups,
      allCategories: (cloudCategories.length ? cloudCategories : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]).map(decorateCategory),
      categories,
      'form.categoryId': selectedCategory._id,
      'form.categoryName': selectedCategory.name
    })
  },

  async onShow() {
    await this.loadCategories()
    const user = storage.getUser()
    await this.loadV3Data(user)
    this.applyPendingTemplate()
    if (user && user.isCloudUser) {
      const selectedMonth = this.data.selectedMonth || formatMonth()
      try {
        const [currentRecords, previousRecords, recentRecords] = await Promise.all([
          sync.fetchRecordsForMonth(user, selectedMonth),
          sync.fetchRecordsForMonth(user, shiftMonth(selectedMonth, -1)),
          sync.fetchRecentRecords(user, 5)
        ])
        storage.mergeRecords([...currentRecords, ...previousRecords, ...recentRecords])
      } catch (error) {
        console.error('[ledger] initial stats fetch failed', error)
      }
    }
    this.refresh()
  },

  async loadV3Data(user) {
    await sync.fetchV3Data(user)
    const recurringPlans = storage.getRecurringPlans()
    const legacyInstances = v3.getLegacyStartInstances(recurringPlans, storage.getRecurringInstances())
    await Promise.all(legacyInstances.map((item) => sync.deleteV3Item('instance', item.clientId, user)))
    const newInstances = v3.createPendingInstances(recurringPlans, storage.getRecurringInstances())
    await Promise.all(newInstances.map((item) => sync.saveV3Item('instance', item, user)))
    const plans = recurringPlans.reduce((map, item) => { map[item.clientId] = item; return map }, {})
    const pendingInstances = storage.getRecurringInstances()
      .filter((item) => item.status === 'pending' && !item.deletedAt)
      .map((item) => ({ ...item, plan: plans[item.planClientId] }))
      .filter((item) => item.plan && !item.plan.deletedAt && item.plan.isEnabled !== false)
      .sort((a, b) => String(a.occurrenceDate).localeCompare(String(b.occurrenceDate)))
    const quickTemplates = storage.getQuickTemplates()
      .filter((item) => item.isEnabled !== false && !item.deletedAt)
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    this.setData({ pendingInstances, quickTemplates })
  },

  applyPendingTemplate() {
    const template = wx.getStorageSync('tinyBookPro.pendingTemplate')
    if (!template) return
    const apply = () => {
      const categoryGroups = this.data.categoryGroups
      const categories = categoryGroups[template.type] || []
      if (template.categoryId && !categories.some((item) => item._id === template.categoryId)) {
        wx.showToast({ title: '模板分类已停用，请先修改模板', icon: 'none' })
        return
      }
      const category = categories.find((item) => item._id === template.categoryId) || categories[0]
      if (!category) return
      this.setData({
        formDirty: true,
        'form.type': template.type,
        'form.amount': template.amount === '' ? '' : String(template.amount),
        'form.categoryId': category._id,
        'form.categoryName': category.name,
        'form.date': formatDate(),
        'form.remark': template.remark || '',
        categories
      }, () => {
        this.setData({ remarkLength: validation.countCharacters(template.remark || '') })
        this.refreshCategoryBudgetHint()
      })
    }
    const hasContent = this.data.formDirty || this.data.form.amount || this.data.form.remark
    wx.removeStorageSync('tinyBookPro.pendingTemplate')
    if (!hasContent) {
      apply()
      return
    }
    wx.showModal({
      title: '应用快捷模板',
      content: '当前表单已有内容，应用模板会替换这些内容。',
      success: (result) => { if (result.confirm) apply() }
    })
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
    const previousMonthStats = stats.buildMonthStats(activeRecords, shiftMonth(selectedMonth, -1))
    const categoryMap = recordUtils.buildCategoryMap(this.data.allCategories || [
      ...this.data.categoryGroups.expense,
      ...this.data.categoryGroups.income
    ])
    const monthCategories = monthStats.categories.map((item) => {
      const category = categoryMap[item.categoryId] || decorateCategory({
        _id: item.categoryId,
        name: item.category,
        iconKey: 'other',
        colorKey: 'gray'
      })
      const categoryBudget = storage.getCategoryBudgets().find((budget) => (
        budget.month === selectedMonth
        && budget.categoryId === item.categoryId
        && !budget.deletedAt
      ))
      const budgetAmount = categoryBudget ? Number(categoryBudget.amount || 0) : 0
      const budgetRatio = budgetAmount ? Number(item.amount || 0) / budgetAmount : 0
      return {
        ...item,
        iconPath: category.iconPath,
        foreground: category.foreground,
        background: category.background,
        hasBudget: Boolean(categoryBudget),
        budgetAmountText: budgetAmount ? stats.formatMoney(budgetAmount) : '',
        budgetUsedText: budgetAmount ? stats.formatMoney(item.amount) : '',
        budgetRemainingText: budgetAmount ? stats.formatMoney(budgetAmount - Number(item.amount || 0)) : '',
        budgetProgressPercent: budgetAmount ? Math.min(100, Math.round(budgetRatio * 100)) : 0,
        budgetStatus: budgetRatio > 1 ? 'over' : (budgetRatio >= 0.8 ? 'warning' : 'normal')
      }
    })
    const monthCategoryIds = new Set(monthCategories.map((item) => item.categoryId))
    storage.getCategoryBudgets()
      .filter((budget) => budget.month === selectedMonth && !budget.deletedAt && !monthCategoryIds.has(budget.categoryId))
      .forEach((budget) => {
        const category = categoryMap[budget.categoryId]
        if (!category || category.type !== RECORD_TYPES.EXPENSE) return
        monthCategories.push({
          categoryId: budget.categoryId,
          category: category.name,
          amount: 0,
          amountText: '0.00',
          percent: 0,
          iconPath: category.iconPath,
          foreground: category.foreground,
          background: category.background,
          hasBudget: true,
          budgetAmountText: stats.formatMoney(budget.amount),
          budgetUsedText: '0.00',
          budgetRemainingText: stats.formatMoney(budget.amount),
          budgetProgressPercent: 0,
          budgetStatus: 'normal'
        })
      })
    const displayMonthStats = {
      ...monthStats,
      categories: monthCategories,
      trendChartWidth: Math.max(638, monthStats.trend.length * 42)
    }
    const currentMonthStats = stats.buildMonthStats(activeRecords, currentMonth)
    const overview = stats.buildDayStats(activeRecords, today)
    const budgetState = stats.buildBudgetState(currentMonthStats, storage.getBudget(currentMonth))
    const recentRecords = [...activeRecords]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 5)
      .map((record) => {
        const displayRecord = recordUtils.toDisplayRecord(record, categoryMap)
        return {
          ...displayRecord,
          displayDateTime: record.date === today
            ? (displayRecord.timeText || '今天')
            : record.date
        }
      })

    this.setData({
      records,
      recentRecords,
      overview: {
        ...overview,
        monthExpenseText: currentMonthStats.expenseText
      },
      dayStats: {
        ...dayStats,
        records: dayStats.records.map((record) => recordUtils.toDisplayRecord(record, categoryMap))
      },
      monthStats: displayMonthStats,
      previousMonthStats,
      monthComparison: this.buildMonthComparison(monthStats, previousMonthStats),
      budgetState,
      ...this.getCategoryBudgetHintState(activeRecords)
    })
  },

  getCategoryBudgetHintState(records) {
    const categoryBudgetHint = this.buildCategoryBudgetHint(records)
    return {
      categoryBudgetHint,
      showCategoryBudgetHint: Boolean(categoryBudgetHint)
    }
  },

  buildCategoryBudgetHint(records = storage.getActiveRecords()) {
    const form = this.data.form
    const currentMonth = this.data.currentMonth || formatMonth()
    const entryAmount = Number(form.amount)
    if (form.type !== RECORD_TYPES.EXPENSE || String(form.date || '').slice(0, 7) !== currentMonth) {
      return null
    }
    if (validation.validateAmount(form.amount) || entryAmount <= 0) return null
    const budget = storage.getCategoryBudgets().find((item) => (
      item.month === currentMonth
      && item.categoryId === form.categoryId
      && !item.deletedAt
    ))
    if (!budget) return null
    const amount = Number(budget.amount || 0)
    const used = (records || [])
      .filter((item) => item.type === RECORD_TYPES.EXPENSE && item.date.slice(0, 7) === currentMonth && item.categoryId === form.categoryId)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const projectedUsed = used + entryAmount
    const ratio = amount ? projectedUsed / amount : 0
    return {
      categoryName: form.categoryName,
      amountText: stats.formatMoney(amount),
      projectedUsedText: stats.formatMoney(projectedUsed),
      projectedRemainingText: stats.formatMoney(amount - projectedUsed),
      status: ratio > 1 ? 'over' : (ratio >= 0.8 ? 'warning' : 'normal'),
      message: ratio > 1 ? '记账后超支' : (ratio >= 0.8 ? '记账后接近预算' : '记账后正常')
    }
  },

  refreshCategoryBudgetHint() {
    this.setData(this.getCategoryBudgetHintState())
  },

  buildMonthComparison(current, previous) {
    return {
      incomeAmountText: stats.formatMoney(current.income - previous.income),
      incomePercentText: previous.income ? `${Math.round(((current.income - previous.income) / previous.income) * 1000) / 10}%` : '暂无可比数据',
      expenseAmountText: stats.formatMoney(current.expense - previous.expense),
      expensePercentText: previous.expense ? `${Math.round(((current.expense - previous.expense) / previous.expense) * 1000) / 10}%` : '暂无可比数据',
      balanceDifferenceText: stats.formatMoney(current.balance - previous.balance)
    }
  },

  goCategoryRecords(event) {
    const categoryId = event.currentTarget.dataset.categoryId
    wx.navigateTo({
      url: `/pages/records/index?month=${this.data.selectedMonth}&type=expense&categoryId=${categoryId}`
    })
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
    this.setData({ formDirty: true }, () => this.refreshCategoryBudgetHint())
  },

  onAmountInput(event) {
    this.setData({
      formDirty: true,
      'form.amount': event.detail.value
    }, () => this.refreshCategoryBudgetHint())
  },

  onQuickTemplateTap(event) {
    const template = this.data.quickTemplates.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (!template) return
    wx.setStorageSync('tinyBookPro.pendingTemplate', template)
    this.applyPendingTemplate()
  },

  onCategoryChange(event) {
    const index = Number(event.detail.value)
    const category = this.data.categories[index]
    this.setData({
      formDirty: true,
      'form.categoryId': category._id,
      'form.categoryName': category.name
    }, () => this.refreshCategoryBudgetHint())
  },

  onDateChange(event) {
    this.setData({
      formDirty: true,
      'form.date': event.detail.value
    }, () => this.refreshCategoryBudgetHint())
  },

  onRemarkInput(event) {
    const remark = event.detail.value
    const remarkLength = validation.countCharacters(remark)
    if (this.data.remarkLength <= validation.MAX_REMARK_LENGTH && remarkLength > validation.MAX_REMARK_LENGTH) {
      wx.showToast({ title: `备注最多 ${validation.MAX_REMARK_LENGTH} 个字符`, icon: 'none' })
    }
    this.setData({
      formDirty: true,
      'form.remark': remark,
      remarkLength
    })
  },

  async onSubmit() {
    const form = this.data.form
    const amount = Number(form.amount)
    const amountMessage = validation.validateAmount(form.amount)
    if (amountMessage) {
      wx.showToast({ title: amountMessage, icon: 'none' })
      return
    }
    const remarkMessage = validation.validateRemark(form.remark)
    if (remarkMessage) {
      wx.showToast({ title: remarkMessage, icon: 'none' })
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
      'form.date': formatDate(),
      remarkLength: 0,
      formDirty: false
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

  goAllRecords() {
    wx.navigateTo({ url: '/pages/records/index' })
  },

  onRecordTap(event) {
    const record = this.data.recentRecords.find((item) => item.clientId === event.currentTarget.dataset.clientId)
    if (!record) {
      return
    }
    const editForm = recordUtils.createEditForm(record)
    this.setData({
      editVisible: true,
      editDirty: false,
      editForm,
      editCategories: this.data.categoryGroups[editForm.type],
      editRemarkLength: validation.countCharacters(editForm.remark)
    })
  },

  onEditAmountInput(event) {
    this.setData({ editDirty: true, 'editForm.amount': event.detail.value })
  },

  onEditCategoryChange(event) {
    const category = this.data.editCategories[Number(event.detail.value)]
    this.setData({
      editDirty: true,
      'editForm.categoryId': category._id,
      'editForm.categoryName': category.name
    })
  },

  onEditDateChange(event) {
    this.setData({ editDirty: true, 'editForm.date': event.detail.value })
  },

  onEditRemarkInput(event) {
    const remark = event.detail.value
    const editRemarkLength = validation.countCharacters(remark)
    if (this.data.editRemarkLength <= validation.MAX_REMARK_LENGTH && editRemarkLength > validation.MAX_REMARK_LENGTH) {
      wx.showToast({ title: `备注最多 ${validation.MAX_REMARK_LENGTH} 个字符`, icon: 'none' })
    }
    this.setData({
      editDirty: true,
      'editForm.remark': remark,
      editRemarkLength
    })
  },

  onCloseEdit() {
    if (!this.data.editDirty) {
      this.setData({ editVisible: false })
      return
    }
    wx.showModal({
      title: '放弃修改？',
      content: '当前修改尚未保存。',
      success: (result) => {
        if (result.confirm) {
          this.setData({ editVisible: false, editDirty: false })
        }
      }
    })
  },

  stopPropagation() {},

  async onSaveEdit() {
    const form = this.data.editForm
    const amount = Number(form.amount)
    const amountMessage = validation.validateAmount(form.amount)
    if (amountMessage) {
      wx.showToast({ title: amountMessage, icon: 'none' })
      return
    }
    const remarkMessage = validation.validateRemark(form.remark)
    if (remarkMessage) {
      wx.showToast({ title: remarkMessage, icon: 'none' })
      return
    }
    const result = await sync.updateRecord(form.clientId, {
      amount,
      categoryId: form.categoryId,
      categoryNameSnapshot: form.categoryName,
      date: form.date,
      remark: form.remark.trim()
    }, storage.getUser())
    this.setData({ editVisible: false, editDirty: false })
    this.refresh()
    wx.showToast({
      title: result.cloudSynced ? '修改已同步' : '已修改，未同步云端',
      icon: result.cloudSynced ? 'success' : 'none'
    })
  },

  onDayChange(event) {
    this.setData({
      selectedDay: event.detail.value
    }, () => this.refresh())
  },

  async onMonthChange(event) {
    const selectedMonth = event.detail.value
    this.setData({
      selectedMonth
    })
    const user = storage.getUser()
    if (user && user.isCloudUser) {
      wx.showLoading({ title: '加载统计' })
      try {
        const [currentRecords, previousRecords] = await Promise.all([
          sync.fetchRecordsForMonth(user, selectedMonth),
          sync.fetchRecordsForMonth(user, shiftMonth(selectedMonth, -1))
        ])
        storage.mergeRecords([...currentRecords, ...previousRecords])
      } catch (error) {
        console.error('[ledger] month stats fetch failed', error)
        wx.showToast({ title: '月度数据加载失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    }
    this.refresh()
  },

  goProfile() {
    wx.switchTab({
      url: '/pages/profile/index'
    })
  },

  goRecurring() {
    wx.navigateTo({ url: '/pages/recurring/index' })
  },

  goAnnual() {
    wx.navigateTo({ url: '/pages/annual/index' })
  },

  onShareAppMessage() {
    return {
      title: '极简记账本 Pro',
      path: '/pages/ledger/index',
      imageUrl: '/images/share-cover.jpg'
    }
  },

  onShareTimeline() {
    return {
      title: '极简记账本 Pro',
      imageUrl: '/images/share-timeline-cover.jpg'
    }
  }
})
