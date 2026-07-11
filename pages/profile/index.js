const { formatMonth } = require('../../utils/date')
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')

Page({
  data: {
    user: null,
    isLoggedIn: false,
    currentMonth: '',
    budgetAmount: '',
    currentBudget: null,
    lastSyncAt: '',
    recordCount: 0,
    syncing: false,
    statusText: '未登录'
  },

  onLoad() {
    this.setData({
      currentMonth: formatMonth()
    })
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const user = storage.getUser()
    const currentMonth = this.data.currentMonth || formatMonth()
    const currentBudget = storage.getBudget(currentMonth)
    const recordCount = storage.getActiveRecords().length

    this.setData({
      user,
      isLoggedIn: Boolean(user),
      currentBudget,
      budgetAmount: currentBudget ? String(currentBudget.amount) : '',
      lastSyncAt: storage.getLastSyncAt(),
      recordCount,
      statusText: user ? (user.isCloudUser ? '已登录，云端同步可用' : '已登录，本地演示模式') : '未登录'
    })
  },

  onBudgetInput(event) {
    this.setData({
      budgetAmount: event.detail.value
    })
  },

  async onSaveBudget() {
    const amount = Number(this.data.budgetAmount)
    if (!amount || amount <= 0) {
      wx.showToast({
        title: '请输入大于 0 的预算',
        icon: 'none'
      })
      return
    }

    await sync.saveBudget(this.data.currentMonth, amount, storage.getUser())
    wx.showToast({
      title: '预算已保存',
      icon: 'success'
    })
    this.refresh()
  },

  async onLogin() {
    if (this.data.syncing) {
      return
    }

    this.setData({
      syncing: true
    })

    try {
      const user = await sync.login()
      this.refresh()

      if (storage.getRecords().length > 0) {
        wx.showModal({
          title: '同步本机数据',
          content: '检测到本机有未同步的记账记录，是否同步到当前账号？',
          confirmText: '同步',
          success: async (result) => {
            if (result.confirm) {
              await this.syncNow(user)
              return
            }

            await this.fetchCloudData(user)
          }
        })
      } else {
        await this.fetchCloudData(user)
      }
    } catch (error) {
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        syncing: false
      })
    }
  },

  async onSyncTap() {
    const user = storage.getUser()
    if (!user) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    await this.syncNow(user)
  },

  async syncNow(user) {
    this.setData({
      syncing: true
    })
    try {
      const result = await sync.syncLocalToCloud(user)
      wx.showToast({
        title: result.message,
        icon: 'none'
      })
      this.refresh()
    } catch (error) {
      wx.showToast({
        title: '同步失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        syncing: false
      })
    }
  },

  async fetchCloudData(user) {
    try {
      await sync.fetchCurrentMonthFromCloud(user, this.data.currentMonth)
      this.refresh()
    } catch (error) {
      wx.showToast({
        title: '云端数据拉取失败',
        icon: 'none'
      })
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后仍可继续使用本地记账。',
      confirmText: '退出',
      success: (result) => {
        if (!result.confirm) {
          return
        }

        storage.clearUser()
        this.refresh()
        wx.showToast({
          title: '已退出',
          icon: 'success'
        })
      }
    })
  }
})
