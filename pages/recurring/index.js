const { RECORD_TYPES, decorateCategory } = require('../../utils/constants')
const { formatDate } = require('../../utils/date')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const validation = require('../../utils/validation')
const v3 = require('../../utils/v3')

const FREQUENCIES = [
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' }
]

Page({
  data: {
    plans: [],
    instances: [],
    pendingInstances: [],
    processedInstances: [],
    categories: [],
    categoryOptions: [],
    editorCategoryIndex: 0,
    instanceCategoryIndex: 0,
    typeOptions: ['支出', '收入'],
    frequencies: FREQUENCIES,
    editorVisible: false,
    editor: null,
    instanceEditorVisible: false,
    instanceEditor: null,
    editorNameLength: 0,
    editorNameInvalid: false,
    editorRemarkLength: 0,
    instanceRemarkLength: 0,
    firstOccurrenceDate: '',
    confirmingInstanceId: '',
    saving: false
  },

  onShow() {
    this.load()
  },

  async load() {
    const user = storage.getUser()
    await sync.fetchV3Data(user)
    const storedPlans = storage.getRecurringPlans()
    const legacyInstances = v3.getLegacyStartInstances(storedPlans, storage.getRecurringInstances())
    await Promise.all(legacyInstances.map((item) => sync.deleteV3Item('instance', item.clientId, user)))
    const newInstances = v3.createPendingInstances(storedPlans, storage.getRecurringInstances())
    await Promise.all(newInstances.map((item) => sync.saveV3Item('instance', item, user)))
    const categories = (await sync.fetchCategories(user, true)).map(decorateCategory)
    const plans = storedPlans
      .filter((item) => !item.deletedAt)
      .map((plan) => {
        const category = categories.find((item) => item._id === plan.categoryId)
        return { ...plan, categoryNameSnapshot: (category && category.name) || plan.categoryNameSnapshot }
      })
    const instances = storage.getRecurringInstances()
      .filter((item) => !item.deletedAt)
      .sort((a, b) => String(b.occurrenceDate).localeCompare(String(a.occurrenceDate)))
      .map((item) => ({
        ...item,
        plan: plans.find((plan) => plan.clientId === item.planClientId)
      }))
      .filter((item) => item.plan)
    this.setData({
      plans,
      instances,
      pendingInstances: instances.filter((item) => item.status === 'pending'),
      processedInstances: instances.filter((item) => item.status === 'confirmed' || item.status === 'skipped'),
      categories,
      categoryOptions: categories.filter((item) => item.type === RECORD_TYPES.EXPENSE && item.isEnabled !== false)
    })
  },

  openCreate() {
    const category = this.data.categories.find((item) => item.type === RECORD_TYPES.EXPENSE && item.isEnabled !== false)
    const editor = {
      name: '', type: RECORD_TYPES.EXPENSE, amount: '', categoryId: category && category._id,
      categoryNameSnapshot: category && category.name, remark: '', frequency: 'monthly',
      startDate: formatDate(), endDate: '', isEnabled: true
    }
    this.setData({
      editorVisible: true,
      editorNameLength: 0,
      editorNameInvalid: false,
      editorRemarkLength: 0,
      firstOccurrenceDate: v3.getFirstOccurrenceDate(editor),
      editorCategoryIndex: 0,
      categoryOptions: this.data.categories.filter((item) => item.type === RECORD_TYPES.EXPENSE && item.isEnabled !== false),
      editor
    })
  },

  openEdit(event) {
    const plan = this.data.plans.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (plan) {
      const categoryOptions = this.data.categories.filter((item) => item.type === plan.type && item.isEnabled !== false)
      this.setData({
      editorVisible: true,
      editorNameLength: validation.countCharacters(plan.name),
      editorNameInvalid: Boolean(validation.validateNameCharacters(plan.name)),
      editorRemarkLength: validation.countCharacters(plan.remark),
      firstOccurrenceDate: v3.getFirstOccurrenceDate(plan),
      categoryOptions,
      editorCategoryIndex: Math.max(0, categoryOptions.findIndex((item) => item._id === plan.categoryId)),
      editor: { ...plan, hasEndDate: Boolean(plan.endDate) }
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
    const limits = { name: 20, remark: validation.MAX_REMARK_LENGTH }
    const lengthKeys = { name: 'editorNameLength', remark: 'editorRemarkLength' }
    const labels = { name: '计划名称', remark: '备注' }
    if (limits[field]) {
      const length = validation.countCharacters(value)
      const lengthKey = lengthKeys[field]
      if (this.data[lengthKey] <= limits[field] && length > limits[field]) {
        wx.showToast({ title: `${labels[field]}最多 ${limits[field]} 个字符`, icon: 'none' })
      }
      updates[lengthKey] = length
    }
    if (field === 'name') {
      const nameMessage = validation.validateNameCharacters(value, '计划名称')
      if (!this.data.editorNameInvalid && nameMessage) {
        wx.showToast({ title: nameMessage, icon: 'none' })
      }
      updates.editorNameInvalid = Boolean(nameMessage)
    }
    this.setData(updates)
  },

  onTypeChange(event) {
    const type = event.detail.value === '1' ? RECORD_TYPES.INCOME : RECORD_TYPES.EXPENSE
    const category = this.data.categories.find((item) => item.type === type && item.isEnabled !== false)
    this.setData({
      categoryOptions: this.data.categories.filter((item) => item.type === type && item.isEnabled !== false),
      editorCategoryIndex: 0,
      'editor.type': type,
      'editor.categoryId': category && category._id,
      'editor.categoryNameSnapshot': category && category.name
    })
  },

  onCategoryChange(event) {
    const options = this.data.categories.filter((item) => item.type === this.data.editor.type && item.isEnabled !== false)
    const category = options[Number(event.detail.value)]
    if (category) this.setData({ editorCategoryIndex: Number(event.detail.value), 'editor.categoryId': category._id, 'editor.categoryNameSnapshot': category.name })
  },

  onStartDateChange(event) {
    const startDate = event.detail.value
    this.setData({
      'editor.startDate': startDate,
      firstOccurrenceDate: v3.getFirstOccurrenceDate({ ...this.data.editor, startDate })
    })
  },

  onEndDateChange(event) {
    this.setData({ 'editor.endDate': event.detail.value, 'editor.hasEndDate': true })
  },

  onEndToggle(event) {
    this.setData({
      'editor.hasEndDate': event.detail.value,
      'editor.endDate': event.detail.value ? (this.data.editor.endDate || this.data.firstOccurrenceDate) : ''
    })
  },

  onFrequencyChange(event) {
    const frequency = FREQUENCIES[Number(event.detail.value)].value
    this.setData({
      'editor.frequency': frequency,
      firstOccurrenceDate: v3.getFirstOccurrenceDate({ ...this.data.editor, frequency })
    })
  },

  async save() {
    const editor = this.data.editor
    const name = String(editor.name || '').trim()
    if (!name || Array.from(name).length > 20) { wx.showToast({ title: '计划名称需为 1-20 个字符', icon: 'none' }); return }
    const nameMessage = validation.validateNameCharacters(name, '计划名称')
    if (nameMessage) { wx.showToast({ title: nameMessage, icon: 'none' }); return }
    const amountMessage = validation.validateAmount(editor.amount, '每期金额')
    if (amountMessage || !editor.categoryId || !editor.startDate) {
      wx.showToast({ title: amountMessage || '请完整填写计划信息', icon: 'none' }); return
    }
    const category = this.data.categories.find((item) => item._id === editor.categoryId)
    if (!category || category.isEnabled === false) { wx.showToast({ title: '请选择启用中的分类', icon: 'none' }); return }
    if (!editor.clientId && editor.startDate < formatDate()) { wx.showToast({ title: '周期开始日期不能早于今天', icon: 'none' }); return }
    if (editor.hasEndDate && editor.endDate && editor.endDate < this.data.firstOccurrenceDate) { wx.showToast({ title: '计划结束日期不能早于首期待记账日期', icon: 'none' }); return }
    const remarkMessage = validation.validateRemark(editor.remark)
    if (remarkMessage) { wx.showToast({ title: remarkMessage, icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      const plan = {
        ...editor,
        endDate: editor.hasEndDate ? editor.endDate : '',
        name,
        amount: Number(editor.amount),
        activeFromDate: editor.activeFromDate || editor.startDate
      }
      await sync.saveV3Item('plan', plan, storage.getUser())
      if (editor.clientId) {
        const invalidInstances = v3.getInvalidPendingInstances(plan, storage.getRecurringInstances())
        await Promise.all(invalidInstances.map((item) => sync.deleteV3Item('instance', item.clientId, storage.getUser())))
      }
      this.setData({ editorVisible: false })
      await this.load()
      wx.showToast({ title: '周期计划已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '周期计划保存失败', icon: 'none' })
    } finally { this.setData({ saving: false }) }
  },

  async toggle(event) {
    const plan = this.data.plans.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (!plan) return
    if (plan.isEnabled === false) {
      const category = this.data.categories.find((item) => item._id === plan.categoryId)
      if (!category || category.isEnabled === false) {
        wx.showToast({ title: '计划分类已停用，请先修改计划', icon: 'none' })
        return
      }
    }
    await sync.updateV3Item('plan', plan.clientId, { isEnabled: plan.isEnabled === false, activeFromDate: plan.isEnabled === false ? formatDate() : plan.activeFromDate }, storage.getUser())
    this.load()
  },

  async remove(event) {
    const plan = this.data.plans.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (!plan) return
    const result = await new Promise((resolve) => wx.showModal({ title: '删除周期计划', content: '已生成的正式账单不会被删除。', success: resolve }))
    if (result.confirm) { await sync.deleteV3Item('plan', plan.clientId, storage.getUser()); this.load() }
  },

  async confirmInstance(event) {
    const instance = this.data.instances.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (!instance || instance.status !== 'pending' || this.data.confirmingInstanceId) return
    this.setData({ confirmingInstanceId: instance.clientId })
    try {
      await this.confirmInstanceInternal(instance)
    } finally {
      this.setData({ confirmingInstanceId: '' })
    }
  },

  async confirmInstanceInternal(instance) {
    const plan = instance.plan
    const category = this.data.categories.find((item) => item._id === plan.categoryId)
    if (!category || category.isEnabled === false) {
      wx.showToast({ title: '计划分类已停用，请修改后记账', icon: 'none' })
      return
    }
    const recordClientId = `recurring_${instance.clientId}`
    const result = await this.createInstanceRecord(instance, {
      amount: plan.amount,
      categoryId: plan.categoryId,
      categoryNameSnapshot: plan.categoryNameSnapshot,
      date: instance.occurrenceDate,
      remark: plan.remark || ''
    })
    await sync.updateV3Item('instance', instance.clientId, { status: 'confirmed', recordClientId: result.record.clientId }, storage.getUser())
    await this.load()
    wx.showToast({ title: result.cloudSynced ? '已确认记账' : '已记账，待同步', icon: result.cloudSynced ? 'success' : 'none' })
  },

  openInstanceEdit(event) {
    const instance = this.data.instances.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (!instance || instance.status !== 'pending') return
    const plan = instance.plan
    const categoryOptions = this.data.categories.filter((item) => item.type === plan.type && item.isEnabled !== false)
    const selectedCategory = categoryOptions.find((item) => item._id === plan.categoryId) || categoryOptions[0]
    if (!selectedCategory) {
      wx.showToast({ title: '当前类型没有可用分类', icon: 'none' })
      return
    }
    this.setData({
      instanceEditorVisible: true,
      instanceRemarkLength: validation.countCharacters(plan.remark),
      instanceEditor: {
        instanceClientId: instance.clientId,
        amount: String(plan.amount),
        categoryId: selectedCategory._id,
        categoryNameSnapshot: selectedCategory.name,
        date: instance.occurrenceDate,
        remark: plan.remark || ''
      },
      categoryOptions,
      instanceCategoryIndex: Math.max(0, categoryOptions.findIndex((item) => item._id === selectedCategory._id))
    })
  },

  closeInstanceEdit() {
    if (!this.data.saving) this.setData({ instanceEditorVisible: false })
  },

  onInstanceAmountInput(event) { this.setData({ 'instanceEditor.amount': event.detail.value }) },
  onInstanceDateChange(event) { this.setData({ 'instanceEditor.date': event.detail.value }) },
  onInstanceRemarkInput(event) {
    const remark = event.detail.value
    const instanceRemarkLength = validation.countCharacters(remark)
    if (this.data.instanceRemarkLength <= validation.MAX_REMARK_LENGTH && instanceRemarkLength > validation.MAX_REMARK_LENGTH) {
      wx.showToast({ title: `备注最多 ${validation.MAX_REMARK_LENGTH} 个字符`, icon: 'none' })
    }
    this.setData({ 'instanceEditor.remark': remark, instanceRemarkLength })
  },
  onInstanceCategoryChange(event) {
    const category = this.data.categoryOptions[Number(event.detail.value)]
    if (category) this.setData({ instanceCategoryIndex: Number(event.detail.value), 'instanceEditor.categoryId': category._id, 'instanceEditor.categoryNameSnapshot': category.name })
  },

  async createInstanceRecord(instance, changes) {
    const plan = instance.plan
    const recordClientId = `recurring_${instance.clientId}`
    return sync.createRecord({
      clientId: recordClientId,
      type: plan.type,
      amount: changes.amount,
      categoryId: changes.categoryId,
      categoryNameSnapshot: changes.categoryNameSnapshot,
      date: changes.date,
      remark: changes.remark,
      sourceType: 'recurring',
      sourcePlanClientId: plan.clientId,
      sourceOccurrenceDate: instance.occurrenceDate
    }, storage.getUser())
  },

  async saveInstanceEdit() {
    const form = this.data.instanceEditor
    const amountMessage = validation.validateAmount(form.amount, '金额')
    const remarkMessage = validation.validateRemark(form.remark)
    if (amountMessage || remarkMessage || !form.date || !form.categoryId) {
      wx.showToast({ title: amountMessage || remarkMessage || '请完整填写待记账内容', icon: 'none' })
      return
    }
    const instance = this.data.instances.find((item) => item.clientId === form.instanceClientId)
    if (!instance) return
    if (this.data.confirmingInstanceId) return
    this.setData({ saving: true, confirmingInstanceId: instance.clientId })
    try {
      const result = await this.createInstanceRecord(instance, {
        amount: Number(form.amount),
        categoryId: form.categoryId,
        categoryNameSnapshot: form.categoryNameSnapshot,
        date: form.date,
        remark: String(form.remark || '').trim()
      })
      await sync.updateV3Item('instance', instance.clientId, { status: 'confirmed', recordClientId: result.record.clientId }, storage.getUser())
      this.setData({ instanceEditorVisible: false })
      await this.load()
      wx.showToast({ title: result.cloudSynced ? '已修改并记账' : '已记账，待同步', icon: result.cloudSynced ? 'success' : 'none' })
    } finally {
      this.setData({ saving: false, confirmingInstanceId: '' })
    }
  },

  async skipInstance(event) {
    const instance = this.data.instances.find((item) => item.clientId === event.currentTarget.dataset.id)
    if (!instance || instance.status !== 'pending') return
    await sync.updateV3Item('instance', instance.clientId, { status: 'skipped' }, storage.getUser())
    this.load()
  }
})
