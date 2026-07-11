const storage = require('./storage')
const { getMonthRange } = require('./date')

const RECORDS_COLLECTION = 'records'
const BUDGETS_COLLECTION = 'budgets'

function isCloudReady() {
  const app = getApp()
  return Boolean(app.globalData && app.globalData.cloudReady && wx.cloud)
}

function callLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    })
  })
}

async function login() {
  const loginResult = await callLogin()
  const now = new Date().toISOString()
  const fallbackUser = {
    userId: `local_user_${loginResult.code || Date.now()}`,
    isCloudUser: false,
    loggedInAt: now
  }

  if (!isCloudReady()) {
    storage.setUser(fallbackUser)
    return fallbackUser
  }

  try {
    const result = await wx.cloud.callFunction({
      name: 'login'
    })
    const user = {
      userId: result.result && result.result.openid ? result.result.openid : fallbackUser.userId,
      isCloudUser: true,
      loggedInAt: now
    }
    storage.setUser(user)
    return user
  } catch (error) {
    storage.setUser(fallbackUser)
    return fallbackUser
  }
}

async function syncLocalToCloud(user) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    const now = new Date().toISOString()
    storage.setLastSyncAt(now)
    return {
      synced: false,
      lastSyncAt: now,
      message: '当前未配置云开发，已保留本地数据'
    }
  }

  const db = wx.cloud.database()
  const records = storage.getRecords()
  const budgets = storage.getBudgets()
  const tasks = []

  records.forEach((record) => {
    tasks.push(upsertRecord(db, record, user))
  })

  Object.keys(budgets).forEach((month) => {
    tasks.push(upsertBudget(db, budgets[month], user))
  })

  await Promise.all(tasks)
  const now = new Date().toISOString()
  storage.setLastSyncAt(now)

  return {
    synced: true,
    lastSyncAt: now,
    message: '已同步到云端'
  }
}

async function createRecord(record, user) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return storage.addRecord(record)
  }

  const nextRecord = storage.addRecord(record)
  try {
    const db = wx.cloud.database()
    await upsertRecord(db, nextRecord, user)
    storage.setLastSyncAt(new Date().toISOString())
  } catch (error) {
    wx.showToast({
      title: '已先保存到本地',
      icon: 'none'
    })
  }
  return nextRecord
}

async function saveBudget(month, amount, user) {
  const budget = storage.setBudget(month, amount)
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return budget
  }

  try {
    const db = wx.cloud.database()
    await upsertBudget(db, budget, user)
    storage.setLastSyncAt(new Date().toISOString())
  } catch (error) {
    wx.showToast({
      title: '预算已先保存到本地',
      icon: 'none'
    })
  }

  return budget
}

async function deleteRecord(clientId, user) {
  storage.softDeleteRecord(clientId)

  if (!isCloudReady() || !user || !user.isCloudUser) {
    return
  }

  const db = wx.cloud.database()
  const now = new Date().toISOString()
  const result = await db.collection(RECORDS_COLLECTION)
    .where({
      userId: user.userId,
      clientId
    })
    .get()

  if (result.data && result.data[0]) {
    await db.collection(RECORDS_COLLECTION).doc(result.data[0]._id).update({
      data: {
        deletedAt: now,
        updatedAt: now
      }
    })
    storage.setLastSyncAt(now)
  }
}

async function fetchCurrentMonthFromCloud(user, month) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return {
      fetched: false
    }
  }

  const db = wx.cloud.database()
  const _ = db.command
  const range = getMonthRange(month)
  const recordResult = await db.collection(RECORDS_COLLECTION)
    .where({
      userId: user.userId,
      date: _.gte(range.start).and(_.lte(range.end))
    })
    .get()
  const budgetResult = await db.collection(BUDGETS_COLLECTION)
    .where({
      userId: user.userId,
      month
    })
    .get()

  const records = storage.getRecords()
  const otherMonthRecords = records.filter((record) => record.date.slice(0, 7) !== month)
  const remoteRecords = (recordResult.data || []).map(({ _id, ...record }) => ({
    ...record,
    id: _id
  }))
  const budgets = storage.getBudgets()
  const remoteBudget = budgetResult.data && budgetResult.data[0]

  if (remoteBudget) {
    const { _id, ...budget } = remoteBudget
    budgets[month] = {
      ...budget,
      id: _id
    }
  }

  const now = new Date().toISOString()
  storage.replaceCachedData({
    records: [...remoteRecords, ...otherMonthRecords],
    budgets,
    lastSyncAt: now
  })

  return {
    fetched: true,
    lastSyncAt: now
  }
}

async function upsertRecord(db, record, user) {
  const result = await db.collection(RECORDS_COLLECTION)
    .where({
      userId: user.userId,
      clientId: record.clientId
    })
    .get()

  const data = {
    ...record,
    userId: user.userId
  }

  if (result.data && result.data[0]) {
    const { _id } = result.data[0]
    await db.collection(RECORDS_COLLECTION).doc(_id).update({
      data
    })
    return
  }

  await db.collection(RECORDS_COLLECTION).add({
    data
  })
}

async function upsertBudget(db, budget, user) {
  const result = await db.collection(BUDGETS_COLLECTION)
    .where({
      userId: user.userId,
      month: budget.month
    })
    .get()

  const data = {
    ...budget,
    userId: user.userId
  }

  if (result.data && result.data[0]) {
    const { _id } = result.data[0]
    await db.collection(BUDGETS_COLLECTION).doc(_id).update({
      data
    })
    return
  }

  await db.collection(BUDGETS_COLLECTION).add({
    data
  })
}

module.exports = {
  createRecord,
  deleteRecord,
  fetchCurrentMonthFromCloud,
  login,
  saveBudget,
  syncLocalToCloud
}
