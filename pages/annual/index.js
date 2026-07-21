const { formatDate, formatMonth, getMonthRange } = require('../../utils/date')
const { decorateCategory } = require('../../utils/constants')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const stats = require('../../utils/v3')
const recordUtils = require('../../utils/record')

Page({
  data: {
    year: '',
    yearIndex: 0,
    years: [],
    annual: null,
    loading: false
  },

  onLoad() {
    const year = formatMonth().slice(0, 4)
    this.setData({ year, yearIndex: 0 })
    this.load(year)
  },

  async load(year) {
    this.setData({ loading: true })
    const user = storage.getUser()
    await sync.fetchV3Data(user)
    if (user && user.isCloudUser) {
      try {
        storage.mergeRecords(await sync.fetchAllRecords(user))
      } catch (error) {
        console.warn('[annual] cloud records query failed', error)
      }
    }
    const annual = stats.buildAnnualStats(storage.getActiveRecords(), year, formatDate())
    const categories = (await sync.fetchCategories(user, true)).map(decorateCategory)
    const categoryMap = recordUtils.buildCategoryMap(categories)
    annual.categories = annual.categories.map((item) => {
      const category = categoryMap[item.categoryId]
      return { ...item, iconPath: category && category.iconPath, foreground: category && category.foreground, background: category && category.background }
    })
    this.setData({ annual, years: stats.getAvailableYears(storage.getActiveRecords()), loading: false })
  },

  onYearChange(event) {
    const year = this.data.years[Number(event.detail.value)]
    if (year) { this.setData({ year, yearIndex: Number(event.detail.value) }); this.load(year) }
  },

  goMonth(event) {
    const month = event.currentTarget.dataset.month
    const range = getMonthRange(month)
    wx.navigateTo({ url: `/pages/records/index?startDate=${range.start}&endDate=${range.end}` })
  },

  goCategory(event) {
    const categoryId = event.currentTarget.dataset.categoryId
    wx.navigateTo({ url: `/pages/records/index?annual=1&startDate=${this.data.year}-01-01&endDate=${this.data.year}-12-31&type=expense&categoryId=${categoryId}` })
  }
})
