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
    updatingProfile: false,
    statusText: '未登录',
    profileName: '',
    profileAvatar: '',
    nicknameDraft: ''
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
      profileAvatar: user && user.avatarUrl ? user.avatarUrl : '',
      nicknameDraft: user && user.nickName ? user.nickName : '微信用户'
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

      user = storage.getUser()
      await this.syncNow(user, true)
      await this.fetchCloudData(user)
    } catch (error) {
      console.error('[cloud] login flow failed', error)
      wx.showToast({
        title: '登录失败，请重试',
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

  async onChooseAvatar(event) {
    if (!this.data.isLoggedIn || this.data.updatingProfile) {
      return
    }

    const user = storage.getUser()
    if (!user || !user.isCloudUser) {
      wx.showToast({
        title: '请重新登录后更新资料',
        icon: 'none'
      })
      return
    }

    try {
      const tempFilePath = event.detail.avatarUrl
      if (!tempFilePath) {
        return
      }

      this.setData({
        updatingProfile: true
      })
      const extension = tempFilePath.split('.').pop() || 'jpg'
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `avatars/${user.userId}/${Date.now()}.${extension}`,
        filePath: tempFilePath
      })
      await sync.updateUserProfile(user, {
        avatarUrl: uploadResult.fileID
      })
      this.refresh()
      wx.showToast({
        title: '头像已更新',
        icon: 'success'
      })
    } catch (error) {
      console.error('[cloud] avatar update failed', error)
      wx.showToast({
        title: '头像更新失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        updatingProfile: false
      })
    }
  },

  onNicknameInput(event) {
    this.setData({
      nicknameDraft: event.detail.value
    })
  },

  normalizeNickname(value) {
    return String(value || '').trim().replace(/\s+/g, ' ')
  },

  validateNickname(nickName) {
    const length = Array.from(nickName).length
    if (length < 1 || length > 20) {
      return '昵称长度需为 1-20 个字符'
    }
    if (/[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/.test(nickName)) {
      return '昵称包含不支持的字符'
    }
    return ''
  },

  async onNicknameReview(event) {
    const nickName = this.normalizeNickname(this.data.nicknameDraft)
    const user = storage.getUser()
    if (!nickName || !user || !user.isCloudUser || nickName === user.nickName) {
      this.setData({
        nicknameDraft: user && user.nickName ? user.nickName : '微信用户'
      })
      return
    }

    const validationMessage = this.validateNickname(nickName)
    if (validationMessage) {
      this.setData({
        nicknameDraft: user.nickName || '微信用户'
      })
      wx.showToast({
        title: validationMessage,
        icon: 'none'
      })
      return
    }

    if (event.detail.timeout) {
      this.setData({
        nicknameDraft: user.nickName || '微信用户'
      })
      wx.showToast({
        title: '昵称审核超时，请重试',
        icon: 'none'
      })
      return
    }

    if (!event.detail.pass) {
      this.setData({
        nicknameDraft: user.nickName || '微信用户'
      })
      wx.showToast({
        title: '昵称未通过微信审核',
        icon: 'none'
      })
      return
    }

    try {
      await sync.updateUserProfile(user, {
        nickName
      })
      this.refresh()
      wx.showToast({
        title: '昵称已更新',
        icon: 'success'
      })
    } catch (error) {
      console.error('[cloud] nickname update failed', error)
      this.refresh()
      wx.showToast({
        title: '昵称更新失败',
        icon: 'none'
      })
    }
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
  },

  goCategories() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/categories/index' })
  },

  goExport() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/export/index' })
  }
})
