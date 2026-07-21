const { EXPENSE_CATEGORIES, INCOME_CATEGORIES, RECORD_TYPES, decorateCategory } = require('../../utils/constants')
const { formatDate, formatMonth, getMonthRange, shiftMonth } = require('../../utils/date')
const { getDateRangeError, isDateRangeValid } = require('../../utils/dateRange')
const recordUtils = require('../../utils/record')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const validation = require('../../utils/validation')

const PAGE_SIZE = 20
const CATEGORY_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: RECORD_TYPES.EXPENSE, label: '支出' },
  { value: RECORD_TYPES.INCOME, label: '收入' }
]

Page({
  data: {
    records: [],
    groups: [],
    categories: [],
    categoryGroups: { expense: [], income: [] },
    categoryFilterGroups: { expense: [], income: [] },
    categoryCascadeRange: [CATEGORY_TYPE_OPTIONS.map((item) => item.label), ['全部分类']],
    categoryCascadeValue: [0, 0],
    dateRangeError: '',
    filters: {
      range: 'month',
      startDate: '',
      endDate: '',
      type: '',
      categoryId: '',
      categoryName: '全部分类',
      keyword: ''
    },
    loading: false,
    hasMore: true,
    offset: 0,
    editVisible: false,
    editDirty: false,
    editForm: null,
    editCategories: [],
    editRemarkLength: 0,
    allowAnnualRange: false
  },

  onLoad(options) {
    const month = options.month || formatMonth()
    const defaultRange = getMonthRange(month)
    const requestedStartDate = options.startDate || defaultRange.start
    const requestedEndDate = options.endDate || defaultRange.end
    const range = options.annual === '1'
      ? { start: requestedStartDate, end: requestedEndDate }
      : (isDateRangeValid(requestedStartDate, requestedEndDate)
        ? { start: requestedStartDate, end: requestedEndDate }
        : defaultRange)
    this.setData({
      'filters.startDate': range.start,
      'filters.endDate': range.end,
      'filters.type': options.type || '',
      'filters.categoryId': options.categoryId || '',
      dateRangeError: '',
      allowAnnualRange: options.annual === '1'
    })
    this.loadCategories().then(() => this.reload())
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadMore(this._loadVersion || 0)
  },

  async loadCategories() {
    const cloud = await sync.fetchCategories(storage.getUser(), true)
    const categories = (cloud.length ? cloud : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
      .map(decorateCategory)
    const enabledCategories = categories.filter((item) => item.isEnabled !== false)
    const categoryGroups = {
      expense: enabledCategories.filter((item) => item.type === RECORD_TYPES.EXPENSE),
      income: enabledCategories.filter((item) => item.type === RECORD_TYPES.INCOME)
    }
    const categoryFilterGroups = {
      expense: categories.filter((item) => item.type === RECORD_TYPES.EXPENSE),
      income: categories.filter((item) => item.type === RECORD_TYPES.INCOME)
    }
    const selected = categories.find((item) => item._id === this.data.filters.categoryId)
    const selectedType = selected ? selected.type : this.data.filters.type
    const cascadeState = this.buildCategoryCascadeState(categoryFilterGroups, selectedType, selected && selected._id)
    this.setData({
      categories,
      categoryGroups,
      categoryFilterGroups,
      ...cascadeState,
      'filters.type': selectedType || '',
      'filters.categoryName': selected ? selected.name : '全部分类'
    })
  },

  getCategoryOptions(type) {
    return [{ _id: '', name: '全部分类' }, ...(type ? this.data.categoryFilterGroups[type] || [] : [])]
  },

  buildCategoryCascadeState(categoryGroups, type, categoryId = '') {
    const typeIndex = Math.max(0, CATEGORY_TYPE_OPTIONS.findIndex((item) => item.value === type))
    const categoryOptions = [{ _id: '', name: '全部分类' }, ...(type ? categoryGroups[type] || [] : [])]
    const categoryIndex = Math.max(0, categoryOptions.findIndex((item) => item._id === categoryId))
    return {
      categoryCascadeRange: [
        CATEGORY_TYPE_OPTIONS.map((item) => item.label),
        categoryOptions.map((item) => item.name)
      ],
      categoryCascadeValue: [typeIndex, categoryIndex]
    }
  },

  async reload() {
    const dateRangeError = this.data.allowAnnualRange
      ? (this.data.filters.startDate > this.data.filters.endDate ? '开始日期不能晚于结束日期' : '')
      : getDateRangeError(this.data.filters.startDate, this.data.filters.endDate)
    if (dateRangeError) {
      this.setData({ dateRangeError })
      return
    }
    const loadVersion = (this._loadVersion || 0) + 1
    this._loadVersion = loadVersion
    const categoryMap = recordUtils.buildCategoryMap(this.data.categories)
    const pendingRecords = storage.getActiveRecords()
      .filter((item) => item.syncStatus === 'pending' && this.matchesFilters(item))
      .map((item) => recordUtils.toDisplayRecord(item, categoryMap))
    this.setData({
      records: pendingRecords,
      groups: recordUtils.groupRecordsByDate(pendingRecords),
      offset: 0,
      hasMore: true,
      loading: false
    })
    await this.loadMore(loadVersion)
  },

  async loadMore(loadVersion = this._loadVersion || 0) {
    const rangeError = this.data.allowAnnualRange
      ? (this.data.filters.startDate > this.data.filters.endDate ? '开始日期不能晚于结束日期' : '')
      : getDateRangeError(this.data.filters.startDate, this.data.filters.endDate)
    if (rangeError) {
      return
    }
    if ((this.data.loading && this._loadingVersion === loadVersion) || !this.data.hasMore) {
      return
    }
    this._loadingVersion = loadVersion
    this.setData({ loading: true })
    try {
      const result = await sync.fetchRecordsPage(storage.getUser(), {
        ...this.data.filters,
        offset: this.data.offset,
        pageSize: PAGE_SIZE
      })
      if (loadVersion !== this._loadVersion) {
        return
      }
      storage.mergeRecords(result.records)
      const categoryMap = recordUtils.buildCategoryMap(this.data.categories)
      const localMap = storage.getRecords().reduce((map, item) => {
        map[item.clientId] = item
        return map
      }, {})
      const pageRecords = result.records
        .map((item) => localMap[item.clientId] || item)
        .filter((item) => !item.deletedAt)
      const nextRecords = this.mergeDisplayRecords([
        ...this.data.records,
        ...pageRecords.map((item) => recordUtils.toDisplayRecord(item, categoryMap))
      ])
      this.setData({
        records: nextRecords,
        groups: recordUtils.groupRecordsByDate(nextRecords),
        offset: result.nextOffset,
        hasMore: result.hasMore
      })
    } catch (error) {
      if (loadVersion !== this._loadVersion) {
        return
      }
      console.error('[records] load failed', error)
      wx.showToast({ title: '账单加载失败', icon: 'none' })
    } finally {
      if (loadVersion === this._loadVersion) {
        this.setData({ loading: false })
      }
    }
  },

  matchesFilters(record) {
    const filters = this.data.filters
    const keyword = String(filters.keyword || '').trim().toLowerCase()
    return (!filters.startDate || record.date >= filters.startDate)
      && (!filters.endDate || record.date <= filters.endDate)
      && (!filters.type || record.type === filters.type)
      && (!filters.categoryId || record.categoryId === filters.categoryId)
      && (!keyword || String(record.remark || '').toLowerCase().includes(keyword))
  },

  mergeDisplayRecords(records) {
    const map = records.reduce((result, record) => {
      result[record.clientId] = record
      return result
    }, {})
    return Object.values(map).sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date))
      return dateCompare || String(b.createdAt).localeCompare(String(a.createdAt))
    })
  },

  onRangeTap(event) {
    const rangeKey = event.currentTarget.dataset.range
    const currentMonth = formatMonth()
    let month = currentMonth
    if (rangeKey === 'lastMonth') {
      month = shiftMonth(currentMonth, -1)
    }
    if (rangeKey === 'threeMonths') {
      const startMonth = shiftMonth(currentMonth, -2)
      this.setData({
        'filters.range': rangeKey,
        'filters.startDate': `${startMonth}-01`,
        'filters.endDate': getMonthRange(currentMonth).end,
        dateRangeError: ''
      }, () => this.reload())
      return
    }
    const range = getMonthRange(month)
    this.setData({
      'filters.range': rangeKey,
      'filters.startDate': range.start,
      'filters.endDate': range.end,
      dateRangeError: ''
    }, () => this.reload())
  },

  onStartDateChange(event) {
    const startDate = event.detail.value
    const endDate = this.data.filters.endDate
    const dateRangeError = this.data.allowAnnualRange
      ? (startDate > endDate ? '开始日期不能晚于结束日期' : '')
      : getDateRangeError(startDate, endDate)
    this.setData({
      'filters.range': 'custom',
      'filters.startDate': startDate,
      dateRangeError
    }, () => {
      if (!dateRangeError) this.reload()
    })
  },

  onEndDateChange(event) {
    const startDate = this.data.filters.startDate
    const endDate = event.detail.value
    const dateRangeError = this.data.allowAnnualRange
      ? (startDate > endDate ? '开始日期不能晚于结束日期' : '')
      : getDateRangeError(startDate, endDate)
    this.setData({
      'filters.range': 'custom',
      'filters.endDate': endDate,
      dateRangeError
    }, () => {
      if (!dateRangeError) this.reload()
    })
  },

  onTypeFilterTap(event) {
    const type = event.currentTarget.dataset.type
    const cascadeState = this.buildCategoryCascadeState(this.data.categoryFilterGroups, type)
    this.setData({
      'filters.type': type,
      'filters.categoryId': '',
      'filters.categoryName': '全部分类',
      ...cascadeState
    }, () => this.reload())
  },

  onCategoryCascadeColumnChange(event) {
    if (Number(event.detail.column) !== 0) {
      return
    }
    const typeIndex = Number(event.detail.value)
    const type = CATEGORY_TYPE_OPTIONS[typeIndex].value
    const categoryOptions = this.getCategoryOptions(type)
    this.setData({
      categoryCascadeRange: [
        CATEGORY_TYPE_OPTIONS.map((item) => item.label),
        categoryOptions.map((item) => item.name)
      ],
      categoryCascadeValue: [typeIndex, 0]
    })
  },

  onCategoryFilterChange(event) {
    const [typeIndex, categoryIndex] = event.detail.value.map(Number)
    const type = CATEGORY_TYPE_OPTIONS[typeIndex].value
    const category = this.getCategoryOptions(type)[categoryIndex] || { _id: '', name: '全部分类' }
    this.setData({
      'filters.type': type,
      'filters.categoryId': category._id,
      'filters.categoryName': category.name,
      categoryCascadeValue: [typeIndex, categoryIndex]
    }, () => this.reload())
  },

  onKeywordInput(event) {
    this.setData({ 'filters.keyword': event.detail.value })
  },

  onKeywordConfirm() {
    this.reload()
  },

  onResetFilters() {
    const range = getMonthRange(formatMonth())
    this.setData({
      filters: {
        range: 'month',
        startDate: range.start,
        endDate: range.end,
        type: '',
        categoryId: '',
        categoryName: '全部分类',
        keyword: ''
      },
      dateRangeError: '',
      ...this.buildCategoryCascadeState(this.data.categoryFilterGroups, '')
    }, () => this.reload())
  },

  onRecordTap(event) {
    const record = this.data.records.find((item) => item.clientId === event.currentTarget.dataset.clientId)
    if (!record) {
      return
    }
    const editForm = recordUtils.createEditForm(record)
    const editCategories = this.data.categoryGroups[editForm.type]
    this.setData({
      editVisible: true,
      editDirty: false,
      editForm,
      editCategories,
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
    await this.reload()
    wx.showToast({
      title: result.cloudSynced ? '修改已同步' : '已修改，未同步云端',
      icon: result.cloudSynced ? 'success' : 'none'
    })
  }
})
