const { formatMonth, shiftMonth } = require('../../utils/date')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')

function pad(value) {
  return String(value).padStart(2, '0')
}

Page({
  data: {
    month: '',
    minMonth: '',
    maxMonth: '',
    exporting: false,
    readyFilePath: '',
    readyMonth: '',
    readyRecordCount: 0
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
    this.setData({
      month: event.detail.value,
      readyFilePath: '',
      readyMonth: '',
      readyRecordCount: 0
    })
  },

  escapeCsv(value) {
    const text = String(value === undefined || value === null ? '' : value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  },

  formatDateTime(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
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
        this.formatDateTime(record.createdAt),
        this.formatDateTime(record.updatedAt)
      ])
    })
    return `\ufeff${rows.map((row) => row.map(this.escapeCsv).join(',')).join('\r\n')}`
  },

  mergeExportRecords(cloudRecords) {
    const localRecords = storage.getRecords()
      .filter((record) => String(record.date || '').slice(0, 7) === this.data.month)
    const records = cloudRecords.reduce((map, record) => {
      const key = record.clientId || record.id || record._id
      if (key) map[key] = record
      return map
    }, {})
    localRecords.forEach((record) => {
      const key = record.clientId || record.id || record._id
      if (!key) return
      if (record.deletedAt) {
        delete records[key]
      } else if (record.syncStatus === 'pending' || !records[key]) {
        records[key] = record
      }
    })
    return Object.values(records).sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date))
      return dateCompare || String(a.createdAt).localeCompare(String(b.createdAt))
    })
  },

  getShareErrorMessage(error) {
    const errMsg = String(error && error.errMsg || '').replace(/^shareFileMessage:fail\s*/i, '').trim()
    if (/cancel/i.test(errMsg)) {
      return ''
    }
    return errMsg
      ? `微信文件分享失败：${errMsg}`
      : '微信文件分享失败，但未返回具体原因，请查看真机调试控制台。'
  },

  getExportDiagnostics(filePath) {
    let fileSize = 0
    try {
      fileSize = wx.getFileSystemManager().statSync(filePath).size
    } catch (error) {
      console.warn('[export] file stat failed', error)
    }
    const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : {}
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    return {
      filePath,
      fileSize,
      envVersion: accountInfo.miniProgram && accountInfo.miniProgram.envVersion,
      SDKVersion: systemInfo.SDKVersion,
      platform: systemInfo.platform,
      version: systemInfo.version
    }
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
    let filePath = ''
    let resultMessage = ''
    let resultIcon = 'none'
    try {
      const records = this.mergeExportRecords(await sync.fetchRecordsForMonth(user, this.data.month))
      if (!records.length) {
        this.setData({
          readyFilePath: '',
          readyMonth: '',
          readyRecordCount: 0
        })
        resultMessage = '当前月份没有账单数据'
      } else {
        filePath = `${wx.env.USER_DATA_PATH}/tinyBookPro-${this.data.month}.csv`
        wx.getFileSystemManager().writeFileSync(filePath, this.buildCsv(records), 'utf8')
        this.setData({
          readyFilePath: filePath,
          readyMonth: this.data.month,
          readyRecordCount: records.length
        })
        resultMessage = 'CSV 已生成'
        resultIcon = 'success'
      }
    } catch (error) {
      console.error('[export] failed', error)
      resultMessage = '导出失败，请重试'
    } finally {
      wx.hideLoading()
      this.setData({ exporting: false })
    }
    wx.showToast({ title: resultMessage, icon: resultIcon })
  },

  shareCsv() {
    const filePath = this.data.readyFilePath
    if (!filePath || this.data.readyMonth !== this.data.month) {
      wx.showToast({ title: '请先生成 CSV', icon: 'none' })
      return
    }
    if (!wx.shareFileMessage) {
      wx.showModal({
        title: 'CSV 已生成',
        content: '当前微信版本不支持文件分享，请升级微信后重试。',
        showCancel: false
      })
      return
    }

    console.info('[export] share start', this.getExportDiagnostics(filePath))
    wx.shareFileMessage({
      filePath,
      fileName: `极简记账本-${this.data.readyMonth}.csv`,
      fail: (error) => {
        console.error('[export] share failed', {
          error,
          diagnostics: this.getExportDiagnostics(filePath)
        })
        const message = this.getShareErrorMessage(error)
        if (!message) return
        wx.showModal({
          title: 'CSV 已生成',
          content: message,
          showCancel: false
        })
      }
    })
  }
})
