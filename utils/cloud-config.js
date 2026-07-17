const DEVELOPMENT_CLOUD_ENV_ID = 'cloud1-d8g1fm0ib912e2228'
const PRODUCTION_CLOUD_ENV_ID = 'pds-apps-prod-d3gfyro2m04bba827'
const APP_KEY = 'tinybookpro'
const FORCE_PRODUCTION_ENV = false

function getEnvVersion() {
  if (!wx.getAccountInfoSync) return 'develop'
  try {
    const accountInfo = wx.getAccountInfoSync()
    return accountInfo.miniProgram && accountInfo.miniProgram.envVersion || 'develop'
  } catch (error) {
    return 'develop'
  }
}

function getCloudEnvId() {
  return FORCE_PRODUCTION_ENV || getEnvVersion() === 'release'
    ? PRODUCTION_CLOUD_ENV_ID
    : DEVELOPMENT_CLOUD_ENV_ID
}

module.exports = {
  APP_KEY,
  DEVELOPMENT_CLOUD_ENV_ID,
  FORCE_PRODUCTION_ENV,
  getCloudEnvId,
  getEnvVersion,
  PRODUCTION_CLOUD_ENV_ID
}
