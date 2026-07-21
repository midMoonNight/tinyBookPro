const { RECORD_TYPES, decorateCategory } = require('../../utils/constants')
const { formatMonth } = require('../../utils/date')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const stats = require('../../utils/stats')
const validation = require('../../utils/validation')

Page({
  data: {
    month: '',
    categories: [],
    categoryOptions: [],
    categoryIndex: 0,
    budgets: [],
    editorVisible: false,
    editor: null,
    saving: false
  },

  onShow() { this.load() },

  async load() {
    const user = storage.getUser()
    await sync.fetchV3Data(user)
    if (user && user.isCloudUser) {
      try {
        storage.mergeRecords(await sync.fetchRecordsForMonth(user, formatMonth()))
      } catch (error) {
        console.warn('[category-budgets] cloud records query failed', error)
      }
    }
    const allCategories = (await sync.fetchCategories(user, true)).map(decorateCategory)
    const categories = allCategories.filter((item) => item.type === RECORD_TYPES.EXPENSE)
    const month = formatMonth()
    const records = storage.getActiveRecords().filter((item) => item.date.slice(0, 7) === month && item.type === RECORD_TYPES.EXPENSE)
    const usage = records.reduce((map, record) => {
      map[record.categoryId] = (map[record.categoryId] || 0) + Number(record.amount || 0)
      return map
    }, {})
    const budgets = storage.getCategoryBudgets()
      .filter((item) => item.month === month && !item.deletedAt)
      .map((item) => this.toDisplayBudget(item, usage[item.categoryId] || 0, allCategories))
    this.setData({ month, categories, categoryOptions: categories.filter((item) => item.isEnabled !== false), budgets })
  },

  toDisplayBudget(item, used, categories) {
    const category = categories.find((entry) => entry._id === item.categoryId)
    const amount = Number(item.amount || 0)
    const ratio = amount ? used / amount : 0
    return {
      ...item,
      categoryName: (category && category.name) || item.categoryNameSnapshot || '未分类',
      categoryNameSnapshot: (category && category.name) || item.categoryNameSnapshot || '未分类',
      categoryEnabled: !category || category.isEnabled !== false,
      usedText: stats.formatMoney(used),
      amountText: stats.formatMoney(amount),
      remainingText: stats.formatMoney(amount - used),
      percent: Math.round(ratio * 1000) / 10,
      progressPercent: Math.min(100, Math.round(ratio * 100)),
      status: ratio > 1 ? 'over' : (ratio >= 0.8 ? 'warning' : 'normal'),
      message: ratio > 1 ? '已超支' : (ratio >= 0.8 ? '接近预算' : '使用正常')
    }
  },

  openCreate() {
    const usedIds = new Set(this.data.budgets.map((item) => item.categoryId))
    const category = this.data.categories.find((item) => item.isEnabled !== false && !usedIds.has(item._id))
    if (!category) { wx.showToast({ title: '没有可设置预算的启用分类', icon: 'none' }); return }
    this.setData({ editorVisible: true, categoryOptions: this.data.categories.filter((item) => item.isEnabled !== false), categoryIndex: 0, editor: { month: this.data.month, categoryId: category._id, categoryNameSnapshot: category.name, amount: '' } })
  },

  openEdit(event) {
    const item = this.data.budgets.find((budget) => budget.clientId === event.currentTarget.dataset.id)
    if (item) {
      const categoryOptions = this.data.categories.filter((entry) => entry.isEnabled !== false || entry._id === item.categoryId)
      this.setData({
      editorVisible: true,
      categoryOptions,
      categoryIndex: Math.max(0, categoryOptions.findIndex((entry) => entry._id === item.categoryId)),
      editor: { ...item, categoryNameSnapshot: item.categoryName }
      })
    }
  },

  closeEditor() { if (!this.data.saving) this.setData({ editorVisible: false }) },
  stopPropagation() {},

  onAmountInput(event) { this.setData({ 'editor.amount': event.detail.value }) },

  onCategoryChange(event) {
    const category = this.data.categoryOptions[Number(event.detail.value)]
    if (category) this.setData({ categoryIndex: Number(event.detail.value), 'editor.categoryId': category._id, 'editor.categoryNameSnapshot': category.name })
  },

  async save() {
    const editor = this.data.editor
    const message = validation.validateAmount(editor.amount, '分类预算')
    if (message) { wx.showToast({ title: message, icon: 'none' }); return }
    const existing = this.data.budgets.find((item) => item.categoryId === editor.categoryId && item.clientId !== editor.clientId)
    if (existing) { wx.showToast({ title: '该分类本月已有预算', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      await sync.saveV3Item('categoryBudget', { ...editor, amount: Number(editor.amount), month: this.data.month }, storage.getUser())
      this.setData({ editorVisible: false })
      await this.load()
      wx.showToast({ title: '分类预算已保存', icon: 'success' })
    } finally { this.setData({ saving: false }) }
  },

  async remove(event) {
    const item = this.data.budgets.find((budget) => budget.clientId === event.currentTarget.dataset.id)
    if (!item) return
    const result = await new Promise((resolve) => wx.showModal({ title: '删除分类预算', content: '删除预算不会影响账单。', success: resolve }))
    if (result.confirm) { await sync.deleteV3Item('categoryBudget', item.clientId, storage.getUser()); this.load() }
  }
})
