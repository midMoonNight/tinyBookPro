const { RECORD_TYPES, decorateCategory } = require('../../utils/constants')
const { formatDate } = require('../../utils/date')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const validation = require('../../utils/validation')

Page({
  data: {
    templates: [],
    categories: [],
    categoryOptions: [],
    categoryIndex: 0,
    typeOptions: ['支出', '收入'],
    editorVisible: false,
    editor: null,
    nameLength: 0,
    nameInvalid: false,
    remarkLength: 0,
    saving: false
  },

  onShow() {
    this.load()
  },

  async load() {
    await sync.fetchV3Data(storage.getUser())
    const categories = (await sync.fetchCategories(storage.getUser(), true)).map(decorateCategory)
    this.setData({
      categories,
      categoryOptions: categories.filter((item) => item.type === RECORD_TYPES.EXPENSE && item.isEnabled !== false),
      templates: storage.getQuickTemplates()
        .filter((item) => !item.deletedAt)
        .map((item) => {
          const category = categories.find((entry) => entry._id === item.categoryId)
          return { ...item, categoryNameSnapshot: (category && category.name) || item.categoryNameSnapshot }
        })
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    })
  },

  openCreate() {
    const category = this.data.categories.find((item) => item.type === RECORD_TYPES.EXPENSE && item.isEnabled !== false)
    this.setData({
      editorVisible: true,
      nameLength: 0,
      nameInvalid: false,
      remarkLength: 0,
      categoryIndex: 0,
      categoryOptions: this.data.categories.filter((item) => item.type === RECORD_TYPES.EXPENSE && item.isEnabled !== false),
      editor: { name: '', type: RECORD_TYPES.EXPENSE, amount: '', categoryId: category && category._id, categoryNameSnapshot: category && category.name, remark: '', isEnabled: true }
    })
  },

  openEdit(event) {
    const item = this.data.templates.find((template) => template.clientId === event.currentTarget.dataset.id)
    if (item) {
      const categoryOptions = this.data.categories.filter((entry) => entry.type === item.type && entry.isEnabled !== false)
      this.setData({
      editorVisible: true,
      nameLength: validation.countCharacters(item.name),
      nameInvalid: Boolean(validation.validateNameCharacters(item.name)),
      remarkLength: validation.countCharacters(item.remark),
      categoryOptions,
      categoryIndex: Math.max(0, categoryOptions.findIndex((entry) => entry._id === item.categoryId)),
      editor: { ...item }
      })
    }
  },

  closeEditor() {
    if (!this.data.saving) this.setData({ editorVisible: false })
  },

  stopPropagation() {},

  onInput(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    const updates = { [`editor.${field}`]: value }
    const limits = { name: 12, remark: validation.MAX_REMARK_LENGTH }
    const lengthKeys = { name: 'nameLength', remark: 'remarkLength' }
    const labels = { name: '模板名称', remark: '备注' }
    if (limits[field]) {
      const length = validation.countCharacters(value)
      const lengthKey = lengthKeys[field]
      if (this.data[lengthKey] <= limits[field] && length > limits[field]) {
        wx.showToast({ title: `${labels[field]}最多 ${limits[field]} 个字符`, icon: 'none' })
      }
      updates[lengthKey] = length
    }
    if (field === 'name') {
      const nameMessage = validation.validateNameCharacters(value, '模板名称')
      if (!this.data.nameInvalid && nameMessage) {
        wx.showToast({ title: nameMessage, icon: 'none' })
      }
      updates.nameInvalid = Boolean(nameMessage)
    }
    this.setData(updates)
  },

  onTypeChange(event) {
    const type = event.detail.value === '1' ? RECORD_TYPES.INCOME : RECORD_TYPES.EXPENSE
    const category = this.data.categories.find((item) => item.type === type && item.isEnabled !== false)
    this.setData({
      categoryOptions: this.data.categories.filter((item) => item.type === type && item.isEnabled !== false),
      categoryIndex: 0,
      'editor.type': type,
      'editor.categoryId': category && category._id,
      'editor.categoryNameSnapshot': category && category.name
    })
  },

  onCategoryChange(event) {
    const options = this.data.categories.filter((item) => item.type === this.data.editor.type && item.isEnabled !== false)
    const category = options[Number(event.detail.value)]
    if (category) this.setData({ categoryIndex: Number(event.detail.value), 'editor.categoryId': category._id, 'editor.categoryNameSnapshot': category.name })
  },

  async save() {
    const editor = this.data.editor
    const name = String(editor.name || '').trim()
    if (!name || Array.from(name).length > 12) {
      wx.showToast({ title: '模板名称需为 1-12 个字符', icon: 'none' }); return
    }
    const nameMessage = validation.validateNameCharacters(name, '模板名称')
    if (nameMessage) { wx.showToast({ title: nameMessage, icon: 'none' }); return }
    const duplicate = this.data.templates.find((item) => item.clientId !== editor.clientId && item.isEnabled !== false && item.name.trim() === name)
    if (duplicate && editor.isEnabled !== false) {
      wx.showToast({ title: '已有同名启用模板', icon: 'none' }); return
    }
    const amountMessage = editor.amount === '' ? '' : validation.validateAmount(editor.amount, '模板金额')
    if (amountMessage) { wx.showToast({ title: amountMessage, icon: 'none' }); return }
    const remarkMessage = validation.validateRemark(editor.remark)
    if (remarkMessage) { wx.showToast({ title: remarkMessage, icon: 'none' }); return }
    if (!editor.categoryId) { wx.showToast({ title: '请选择分类', icon: 'none' }); return }
    const category = this.data.categories.find((item) => item._id === editor.categoryId)
    if (!category || category.isEnabled === false) { wx.showToast({ title: '请选择启用中的分类', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      await sync.saveV3Item('template', { ...editor, name, amount: editor.amount === '' ? '' : Number(editor.amount), sortOrder: editor.sortOrder || Date.now() }, storage.getUser())
      this.setData({ editorVisible: false })
      await this.load()
      wx.showToast({ title: '模板已保存', icon: 'success' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async toggle(event) {
    const item = this.data.templates.find((template) => template.clientId === event.currentTarget.dataset.id)
    if (!item) return
    if (item.isEnabled === false) {
      const category = this.data.categories.find((entry) => entry._id === item.categoryId)
      if (!category || category.isEnabled === false) {
        wx.showToast({ title: '模板分类已停用，请先修改模板', icon: 'none' })
        return
      }
      const duplicate = this.data.templates.find((entry) => entry.clientId !== item.clientId && entry.isEnabled !== false && entry.name.trim() === item.name.trim())
      if (duplicate) {
        wx.showToast({ title: '已有同名启用模板', icon: 'none' })
        return
      }
    }
    await sync.updateV3Item('template', item.clientId, { isEnabled: item.isEnabled === false }, storage.getUser())
    this.load()
  },

  async remove(event) {
    const item = this.data.templates.find((template) => template.clientId === event.currentTarget.dataset.id)
    if (!item) return
    const result = await new Promise((resolve) => wx.showModal({ title: '删除模板', content: '删除后不影响已经记入的账单。', success: resolve }))
    if (!result.confirm) return
    await sync.deleteV3Item('template', item.clientId, storage.getUser())
    this.load()
  },

  async move(event) {
    const id = event.currentTarget.dataset.id
    const direction = Number(event.currentTarget.dataset.direction)
    const items = [...this.data.templates]
    const index = items.findIndex((item) => item.clientId === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return
    const current = items[index]
    const next = items[target]
    await Promise.all([
      sync.updateV3Item('template', current.clientId, { sortOrder: next.sortOrder }, storage.getUser()),
      sync.updateV3Item('template', next.clientId, { sortOrder: current.sortOrder }, storage.getUser())
    ])
    this.load()
  },

  useTemplate(event) {
    const item = this.data.templates.find((template) => template.clientId === event.currentTarget.dataset.id)
    if (!item || item.isEnabled === false) return
    wx.setStorageSync('tinyBookPro.pendingTemplate', { ...item, date: formatDate() })
    wx.switchTab({ url: '/pages/ledger/index' })
  }
})
