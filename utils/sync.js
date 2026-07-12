const storage = require('./storage')
const { getMonthRange } = require('./date')

const RECORDS_COLLECTION = 'records'
const BUDGETS_COLLECTION = 'budgets'
const CATEGORIES_COLLECTION = 'categories'
const USERS_COLLECTION = 'users'

function isCloudReady() {
  const app = getApp()
  return Boolean(app.globalData && app.globalData.cloudReady && wx.cloud)
}

async function login(profile = null) {
  const now = new Date().toISOString()

  if (!isCloudReady()) {
    throw new Error('cloud is not ready')
  }

  try {
    const result = await wx.cloud.callFunction({
      name: 'login'
    })
    const openid = result.result && result.result.openid
    if (!openid) {
      throw new Error('login cloud function did not return openid')
    }
    const user = {
      userId: openid,
      isCloudUser: true,
      loggedInAt: now,
      ...normalizeProfile(profile)
    }
    let nextUser = user
    try {
      const cloudProfile = await upsertUser(wx.cloud.database(), user)
      nextUser = {
        ...user,
        nickName: cloudProfile.nickName,
        avatarUrl: cloudProfile.avatarUrl
      }
    } catch (error) {
      console.error('[cloud] user profile sync failed', error)
    }
    storage.setUser(nextUser)
    return nextUser
  } catch (error) {
    console.error('[cloud] login failed', error)
    throw error
  }
}

function normalizeProfile(profile) {
  if (!profile) {
    return {
      nickName: '微信用户',
      avatarUrl: ''
    }
  }

  return {
    nickName: profile.nickName || '微信用户',
    avatarUrl: profile.avatarUrl || ''
  }
}

function hasCustomNickName(nickName) {
  return Boolean(nickName && nickName !== '微信用户')
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function validateNickname(value) {
  const nickName = normalizeNickname(value)
  const length = Array.from(nickName).length
  if (length < 1 || length > 20) {
    throw new Error('nickname length must be between 1 and 20 characters')
  }
  if (/[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/.test(nickName)) {
    throw new Error('nickname contains unsupported characters')
  }
  return nickName
}

async function upsertUser(db, user) {
  const result = await db.collection(USERS_COLLECTION)
    .where({
      userId: user.userId
    })
    .get()
  const existing = result.data && result.data[0]
  const now = new Date().toISOString()
  const nickName = hasCustomNickName(user.nickName)
    ? user.nickName
    : (existing && existing.nickName) || '微信用户'
  const avatarUrl = user.avatarUrl || (existing && existing.avatarUrl) || ''
  const data = {
    userId: user.userId,
    nickName,
    avatarUrl,
    status: 'active',
    lastLoginAt: now,
    updatedAt: now
  }

  if (existing) {
    await db.collection(USERS_COLLECTION).doc(existing._id).update({
      data
    })
    return data
  }

  await db.collection(USERS_COLLECTION).add({
    data: {
      ...data,
      createdAt: now
    }
  })
  return data
}

async function updateUserProfile(user, profile) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    throw new Error('cloud user is required to update profile')
  }

  const normalized = normalizeProfile(profile)
  const db = wx.cloud.database()
  const result = await db.collection(USERS_COLLECTION)
    .where({
      userId: user.userId
    })
    .get()
  const existing = result.data && result.data[0]
  const now = new Date().toISOString()
  const nextNickName = profile && profile.nickName
    ? validateNickname(profile.nickName)
    : ''
  const data = {
    nickName: hasCustomNickName(nextNickName)
      ? nextNickName
      : (existing && existing.nickName) || user.nickName || '微信用户',
    avatarUrl: normalized.avatarUrl
      || (existing && existing.avatarUrl)
      || user.avatarUrl
      || '',
    updatedAt: now
  }

  if (existing) {
    await db.collection(USERS_COLLECTION).doc(existing._id).update({
      data
    })
  } else {
    await db.collection(USERS_COLLECTION).add({
      data: {
        ...data,
        userId: user.userId,
        status: 'active',
        createdAt: now,
        lastLoginAt: user.loggedInAt || now
      }
    })
  }

  return storage.updateUserProfile(data)
}

async function fetchCategories() {
  if (!isCloudReady()) {
    return []
  }

  try {
    const db = wx.cloud.database()
    const result = await db.collection(CATEGORIES_COLLECTION)
      .where({
        isEnabled: true
      })
      .get()
    return (result.data || []).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  } catch (error) {
    console.error('[cloud] category fetch failed', error)
    return []
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
    return {
      record: storage.addRecord(record),
      cloudSynced: false
    }
  }

  const nextRecord = storage.addRecord(record)
  try {
    const db = wx.cloud.database()
    await upsertRecord(db, nextRecord, user)
    storage.setLastSyncAt(new Date().toISOString())
    return {
      record: nextRecord,
      cloudSynced: true
    }
  } catch (error) {
    console.error('[cloud] record sync failed', error)
    return {
      record: nextRecord,
      cloudSynced: false
    }
  }
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
    console.error('[cloud] budget sync failed', error)
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
  fetchCategories,
  fetchCurrentMonthFromCloud,
  login,
  saveBudget,
  syncLocalToCloud,
  updateUserProfile
}
