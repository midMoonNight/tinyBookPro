const storage = require('./utils/storage')
const { getCloudEnvId, getEnvVersion } = require('./utils/cloud-config')

App({
  onLaunch() {
    this.initCloud()
    storage.ensureRecordClientIds()
    this.bindNetworkSync()
  },

  initCloud() {
    if (!wx.cloud) {
      return
    }

    try {
      const cloudEnvId = getCloudEnvId()
      wx.cloud.init({
        env: cloudEnvId,
        traceUser: true
      })
      this.globalData.cloudReady = true
      this.globalData.cloudEnvId = cloudEnvId
      this.globalData.envVersion = getEnvVersion()
    } catch (error) {
      this.globalData.cloudReady = false
    }
  },

  bindNetworkSync() {
    if (!wx.onNetworkStatusChange) {
      return
    }
    wx.onNetworkStatusChange(({ isConnected }) => {
      if (!isConnected || this.globalData.syncingPendingData) {
        return
      }
      const user = storage.getUser()
      if (!user || !user.isCloudUser) {
        return
      }
      this.globalData.syncingPendingData = true
      require('./utils/sync').syncLocalToCloud(user)
        .catch((error) => console.warn('[cloud] reconnect sync failed', error))
        .finally(() => {
          this.globalData.syncingPendingData = false
        })
    })
  },

  globalData: {
    cloudReady: false,
    cloudEnvId: '',
    envVersion: 'develop',
    syncingPendingData: false
  }
})
