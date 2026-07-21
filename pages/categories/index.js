const { CATEGORY_COLORS, CATEGORY_ICONS, RECORD_TYPES, decorateCategory } = require('../../utils/constants')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const validation = require('../../utils/validation')

Page({
  data: {
    activeType: RECORD_TYPES.EXPENSE,
    categories: [],
    visibleCategories: [],
    icons: CATEGORY_ICONS,
    colors: CATEGORY_COLORS,
    editorVisible: false,
    editor: null,
    nameLength: 0,
    nameInvalid: false,
    saving: false
  },

  onLoad() {
    if (!storage.getUser()) {
      wx.showModal({
        title: '请先登录',
        content: '登录后才能创建和管理自定义分类。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    this.loadCategories()
  },

  async loadCategories() {
    const categories = (await sync.fetchCategories(storage.getUser(), true)).map(decorateCategory)
    this.setData({ categories }, () => this.refreshVisible())
  },

  refreshVisible() {
    this.setData({
      visibleCategories: this.data.categories.filter((item) => item.type === this.data.activeType)
    })
  },

  onTypeTap(event) {
    this.setData({ activeType: event.currentTarget.dataset.type }, () => this.refreshVisible())
  },

  openCreate() {
    this.setData({
      editorVisible: true,
      nameLength: 0,
      nameInvalid: false,
      editor: {
        type: this.data.activeType,
        name: '',
        iconKey: 'other',
        colorKey: 'blue',
        isEnabled: true
      }
    })
  },

  openEdit(event) {
    const category = this.data.categories.find((item) => item._id === event.currentTarget.dataset.id)
    if (!category || category.scope !== 'user') {
      return
    }
    this.setData({
      editorVisible: true,
      editor: { ...category },
      nameLength: validation.countCharacters(category.name),
      nameInvalid: Boolean(validation.validateNameCharacters(category.name))
    })
  },

  onNameInput(event) {
    const name = event.detail.value
    const nameLength = validation.countCharacters(name)
    const nameMessage = validation.validateNameCharacters(name, '分类名称')
    if (this.data.nameLength <= 10 && nameLength > 10) {
      wx.showToast({ title: '分类名称最多 10 个字符', icon: 'none' })
    } else if (!this.data.nameInvalid && nameMessage) {
      wx.showToast({ title: nameMessage, icon: 'none' })
    }
    this.setData({ 'editor.name': name, nameLength, nameInvalid: Boolean(nameMessage) })
  },

  selectIcon(event) {
    this.setData({ 'editor.iconKey': event.currentTarget.dataset.key })
  },

  selectColor(event) {
    this.setData({ 'editor.colorKey': event.currentTarget.dataset.key })
  },

  closeEditor() {
    if (!this.data.saving) {
      this.setData({ editorVisible: false })
    }
  },

  stopPropagation() {},

  validateName(name) {
    const normalized = String(name || '').trim()
    const length = Array.from(normalized).length
    if (length < 1 || length > 10) {
      return { message: '分类名称需为 1-10 个字符' }
    }
    const nameMessage = validation.validateNameCharacters(normalized, '分类名称')
    if (nameMessage) return { message: nameMessage }
    return { name: normalized }
  },

  async saveEditor() {
    const validation = this.validateName(this.data.editor.name)
    if (validation.message) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await sync.saveCategory({ ...this.data.editor, name: validation.name }, storage.getUser())
      this.setData({ editorVisible: false })
      await this.loadCategories()
      wx.showToast({ title: '分类已保存', icon: 'success' })
    } catch (error) {
      console.error('[categories] save failed', error)
      wx.showToast({
        title: error.message === 'CATEGORY_NAME_EXISTS' ? '已有同名分类' : '分类保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ saving: false })
    }
  },

  toggleCategory(event) {
    const category = this.data.categories.find((item) => item._id === event.currentTarget.dataset.id)
    if (!category || category.scope !== 'user') {
      return
    }
    wx.showModal({
      title: category.isEnabled === false ? '启用分类' : '停用分类',
      content: category.isEnabled === false ? '启用后可在记账时选择。' : '停用后历史账单仍会保留。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await sync.setCategoryEnabled(category, category.isEnabled === false, storage.getUser())
          await this.loadCategories()
        } catch (error) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  async moveCategory(event) {
    const id = event.currentTarget.dataset.id
    const direction = Number(event.currentTarget.dataset.direction)
    const custom = this.data.visibleCategories.filter((item) => item.scope === 'user')
    const index = custom.findIndex((item) => item._id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= custom.length) {
      return
    }
    const current = custom[index]
    const target = custom[targetIndex]
    const currentSort = current.sortOrder
    try {
      await Promise.all([
        sync.saveCategory({ ...current, sortOrder: target.sortOrder }, storage.getUser()),
        sync.saveCategory({ ...target, sortOrder: currentSort }, storage.getUser())
      ])
      await this.loadCategories()
    } catch (error) {
      wx.showToast({ title: '排序失败', icon: 'none' })
    }
  }
})
