const storage = require('./utils/storage')
const { CLOUD_ENV_ID } = require('./utils/cloud-config')

App({
  onLaunch() {
    this.initCloud()
    storage.ensureRecordClientIds()
  },

  initCloud() {
    if (!wx.cloud) {
      return
    }

    try {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      })
      this.globalData.cloudReady = true
    } catch (error) {
      this.globalData.cloudReady = false
    }
  },

  globalData: {
    cloudReady: false
  }
})
