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
    syncing: false,
    statusText: '未登录',
    profileName: '',
    profileAvatar: ''
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

    this.setData({
      user,
      isLoggedIn: Boolean(user),
      currentBudget,
      budgetAmount: '',
      statusText: user ? (user.nickName || '微信用户') : '未登录',
      profileName: user && user.nickName ? user.nickName : '微信用户',
      profileAvatar: user && user.avatarUrl ? user.avatarUrl : ''
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
    this.setData({
      budgetAmount: ''
    })
  },

  async onLogin() {
    if (this.data.syncing) {
      return
    }

    this.setData({
      syncing: true
    })

    try {
      const profile = await this.getWeChatProfile()
      let user = await sync.login(profile)
      this.refresh()

      if (user.isCloudUser) {
        user = storage.getUser()
        await this.syncNow(user, true)
        await this.fetchCloudData(user)
      } else {
        wx.showToast({
          title: '登录成功',
          icon: 'none'
        })
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

  getWeChatProfile() {
    if (!wx.getUserProfile) {
      return Promise.resolve(null)
    }

    return new Promise((resolve) => {
      wx.getUserProfile({
        desc: '用于展示微信头像和昵称',
        success: (result) => {
          resolve(result.userInfo || null)
        },
        fail: () => {
          resolve(null)
        }
      })
    })
  },

  async syncNow(user, silent = false) {
    this.setData({
      syncing: true
    })
    try {
      const result = await sync.syncLocalToCloud(user)
      if (!silent) {
        wx.showToast({
          title: result.message,
          icon: 'none'
        })
      }
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
      const result = await sync.fetchCurrentMonthFromCloud(user, this.data.currentMonth)
      if (result && result.fetched) {
        wx.showToast({
          title: '已同步',
          icon: 'success'
        })
      }
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
