const storage = require('./utils/storage')

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
