const { formatMonth, shiftMonth } = require('../../utils/date')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')

Page({
  data: {
    month: '',
    minMonth: '',
    maxMonth: '',
    exporting: false
  },

  onLoad() {
    const maxMonth = formatMonth()
    this.setData({
      month: maxMonth,
      minMonth: shiftMonth(maxMonth, -23),
      maxMonth
    })
  },

  onMonthChange(event) {
    this.setData({ month: event.detail.value })
  },

  escapeCsv(value) {
    const text = String(value === undefined || value === null ? '' : value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  },

  buildCsv(records) {
    const rows = [['日期', '类型', '分类', '金额', '备注', '创建时间', '更新时间']]
    records.forEach((record) => {
      rows.push([
        record.date,
        record.type === 'income' ? '收入' : '支出',
        record.categoryNameSnapshot || record.category || '未分类',
        Number(record.amount || 0).toFixed(2),
        record.remark || '',
        record.createdAt || '',
        record.updatedAt || ''
      ])
    })
    return `\ufeff${rows.map((row) => row.map(this.escapeCsv).join(',')).join('\r\n')}`
  },

  async exportCsv() {
    const user = storage.getUser()
    if (!user || !user.isCloudUser) {
      wx.showToast({ title: '请先登录后导出', icon: 'none' })
      return
    }
    if (this.data.exporting) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在生成' })
    try {
      const records = await sync.fetchRecordsForMonth(user, this.data.month)
      if (!records.length) {
        wx.showToast({ title: '该月没有可导出账单', icon: 'none' })
        return
      }
      const filePath = `${wx.env.USER_DATA_PATH}/极简记账本-${this.data.month}.csv`
      wx.getFileSystemManager().writeFileSync(filePath, this.buildCsv(records), 'utf8')
      if (wx.shareFileMessage) {
        try {
          await new Promise((resolve, reject) => {
            wx.shareFileMessage({
              filePath,
              fileName: `极简记账本-${this.data.month}.csv`,
              success: resolve,
              fail: reject
            })
          })
        } catch (error) {
          await new Promise((resolve, reject) => {
            wx.openDocument({ filePath, showMenu: true, success: resolve, fail: reject })
          })
        }
      } else {
        await new Promise((resolve, reject) => {
          wx.openDocument({ filePath, showMenu: true, success: resolve, fail: reject })
        })
      }
    } catch (error) {
      console.error('[export] failed', error)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ exporting: false })
    }
  }
})
