const storage = require('./storage')
const { getMonthRange } = require('./date')
const { EXPENSE_CATEGORIES, INCOME_CATEGORIES } = require('./constants')
const { APP_KEY } = require('./cloud-config')

const RECORDS_COLLECTION = 'records'
const BUDGETS_COLLECTION = 'budgets'
const SYSTEM_CATEGORIES_COLLECTION = 'categories'
const USER_CATEGORIES_COLLECTION = 'user_categories'
const USERS_COLLECTION = 'users'
const QUICK_TEMPLATES_COLLECTION = 'quick_templates'
const RECURRING_PLANS_COLLECTION = 'recurring_plans'
const RECURRING_INSTANCES_COLLECTION = 'recurring_instances'
const CATEGORY_BUDGETS_COLLECTION = 'category_budgets'
const CLOUD_QUERY_LIMIT = 20

function getDefaultCategories() {
  return [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
    .map((category) => ({ ...category, appKey: APP_KEY }))
}

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
      appKey: APP_KEY,
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
      appKey: APP_KEY,
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
    appKey: APP_KEY,
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
      appKey: APP_KEY,
      userId: user.userId
    })
    .get()
  const existing = result.data && result.data[0]
  const now = new Date().toISOString()
  const nextNickName = profile && profile.nickName
    ? validateNickname(profile.nickName)
    : ''
  const data = {
    appKey: APP_KEY,
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
        appKey: APP_KEY,
        userId: user.userId,
        status: 'active',
        createdAt: now,
        lastLoginAt: user.loggedInAt || now
      }
    })
  }

  return storage.updateUserProfile(data)
}

async function fetchCategories(user = null, includeDisabled = false) {
  const defaults = getDefaultCategories()
  if (!isCloudReady()) {
    return defaults
  }

  try {
    const db = wx.cloud.database()
    const tasks = [fetchAll(db.collection(SYSTEM_CATEGORIES_COLLECTION).where({
      appKey: APP_KEY,
      scope: 'system'
    }))]
    if (user && user.isCloudUser) {
      tasks.push(fetchAll(db.collection(USER_CATEGORIES_COLLECTION).where({
        appKey: APP_KEY,
        userId: user.userId
      })))
    }
    const results = await Promise.all(tasks)
    const categories = [...defaults, ...results.flat()].reduce((map, item) => {
      map[item._id] = item
      return map
    }, {})
    return Object.values(categories)
      .filter((item) => includeDisabled || item.isEnabled !== false)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  } catch (error) {
    console.error('[cloud] category fetch failed', error)
    return defaults
  }
}

async function saveCategory(category, user) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    throw new Error('cloud login is required to save category')
  }

  const db = wx.cloud.database()
  const name = String(category.name || '').trim()
  const now = new Date().toISOString()
  const defaultDuplicate = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
    .find((item) => item.type === category.type && item.name === name && item.isEnabled !== false)
  if (category._id) {
    const existingResult = await db.collection(USER_CATEGORIES_COLLECTION)
      .where({
        _id: category._id,
        appKey: APP_KEY,
        userId: user.userId,
        scope: 'user'
      })
      .get()
    const existing = existingResult.data && existingResult.data[0]
    if (!existing || existing.scope !== 'user' || existing.userId !== user.userId) {
      throw new Error('CATEGORY_NOT_OWNED')
    }
  }
  if (category.isEnabled !== false) {
    const userResult = await db.collection(USER_CATEGORIES_COLLECTION).where({
      appKey: APP_KEY,
      userId: user.userId,
      type: category.type,
      name,
      isEnabled: true
    }).get()
    const duplicate = defaultDuplicate || (userResult.data || [])
      .find((item) => item._id !== category._id)
    if (duplicate) {
      throw new Error('CATEGORY_NAME_EXISTS')
    }
  }

  const data = {
    appKey: APP_KEY,
    userId: user.userId,
    scope: 'user',
    type: category.type,
    name,
    iconKey: category.iconKey || 'other',
    colorKey: category.colorKey || 'blue',
    sortOrder: Number(category.sortOrder || Date.now()),
    isEnabled: category.isEnabled !== false,
    updatedAt: now
  }

  if (category._id) {
    await db.collection(USER_CATEGORIES_COLLECTION).doc(category._id).update({ data })
    return {
      ...category,
      ...data
    }
  }

  const result = await db.collection(USER_CATEGORIES_COLLECTION).add({
    data: {
      ...data,
      createdAt: now
    }
  })
  return {
    _id: result._id,
    ...data,
    createdAt: now
  }
}

async function setCategoryEnabled(category, isEnabled, user) {
  if (!user || !category || category.appKey !== APP_KEY || category.scope !== 'user' || category.userId !== user.userId) {
    throw new Error('only owned custom categories can be changed')
  }
  return saveCategory({
    ...category,
    isEnabled
  }, user)
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
  const records = storage.getRecords().filter((record) => record.syncStatus !== 'synced')
  const budgets = storage.getBudgets()
  const quickTemplates = storage.getQuickTemplates().filter((item) => item.syncStatus === 'pending')
  const recurringPlans = storage.getRecurringPlans().filter((item) => item.syncStatus === 'pending')
  const recurringInstances = storage.getRecurringInstances().filter((item) => item.syncStatus === 'pending')
  const categoryBudgets = storage.getCategoryBudgets().filter((item) => item.syncStatus === 'pending')
  const tasks = []

  records.forEach((record) => {
    tasks.push(upsertRecord(db, record, user))
  })

  Object.keys(budgets).forEach((month) => {
    tasks.push(upsertBudget(db, budgets[month], user))
  })
  quickTemplates.forEach((item) => tasks.push(upsertV3Document(db, QUICK_TEMPLATES_COLLECTION, item, user)))
  recurringPlans.forEach((item) => tasks.push(upsertV3Document(db, RECURRING_PLANS_COLLECTION, item, user)))
  recurringInstances.forEach((item) => tasks.push(upsertV3Document(db, RECURRING_INSTANCES_COLLECTION, item, user)))
  categoryBudgets.forEach((item) => tasks.push(upsertV3Document(db, CATEGORY_BUDGETS_COLLECTION, item, user)))

  await Promise.all(tasks)
  storage.setAllRecordsSyncStatus('synced')
  markConfigsSynced()
  const now = new Date().toISOString()
  storage.setLastSyncAt(now)

  return {
    synced: true,
    lastSyncAt: now,
    message: '已同步到云端'
  }
}

function markConfigsSynced() {
  storage.setQuickTemplates(storage.getQuickTemplates().map((item) => ({ ...item, syncStatus: 'synced' })))
  storage.setRecurringPlans(storage.getRecurringPlans().map((item) => ({ ...item, syncStatus: 'synced' })))
  storage.setRecurringInstances(storage.getRecurringInstances().map((item) => ({ ...item, syncStatus: 'synced' })))
  storage.setCategoryBudgets(storage.getCategoryBudgets().map((item) => ({ ...item, syncStatus: 'synced' })))
}

function getV3Collection(type) {
  return {
    template: QUICK_TEMPLATES_COLLECTION,
    plan: RECURRING_PLANS_COLLECTION,
    instance: RECURRING_INSTANCES_COLLECTION,
    categoryBudget: CATEGORY_BUDGETS_COLLECTION
  }[type]
}

function getV3Items(type) {
  return {
    template: storage.getQuickTemplates,
    plan: storage.getRecurringPlans,
    instance: storage.getRecurringInstances,
    categoryBudget: storage.getCategoryBudgets
  }[type].call(storage)
}

function setV3Items(type, items) {
  return {
    template: storage.setQuickTemplates,
    plan: storage.setRecurringPlans,
    instance: storage.setRecurringInstances,
    categoryBudget: storage.setCategoryBudgets
  }[type].call(storage, items)
}

function upsertV3Local(type, item) {
  return {
    template: storage.upsertQuickTemplate,
    plan: storage.upsertRecurringPlan,
    instance: storage.upsertRecurringInstance,
    categoryBudget: storage.upsertCategoryBudget
  }[type].call(storage, { ...item, syncStatus: 'pending' })
}

async function upsertV3Document(db, collectionName, item, user) {
  const result = await db.collection(collectionName).where({
    appKey: APP_KEY,
    userId: user.userId,
    clientId: item.clientId
  }).get()
  const { _id, _openid, id, syncStatus, hasEndDate, ...document } = item
  const data = {
    ...document,
    appKey: APP_KEY,
    userId: user.userId
  }
  if (result.data && result.data[0]) {
    if (result.data[0].deletedAt && !item.deletedAt) {
      data.deletedAt = db.command.remove()
    }
    await db.collection(collectionName).doc(result.data[0]._id).update({ data })
    return
  }
  await db.collection(collectionName).add({ data })
}

async function saveV3Item(type, item, user) {
  const next = upsertV3Local(type, item)
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return { item: next, cloudSynced: false }
  }
  try {
    await upsertV3Document(wx.cloud.database(), getV3Collection(type), next, user)
    setV3Items(type, getV3Items(type).map((current) => current.clientId === next.clientId
      ? { ...current, syncStatus: 'synced' }
      : current))
    storage.setLastSyncAt(new Date().toISOString())
    return { item: next, cloudSynced: true }
  } catch (error) {
    console.error(`[cloud] ${type} sync failed`, error)
    return { item: next, cloudSynced: false }
  }
}

async function fetchV3Data(user) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return { fetched: false }
  }
  try {
    const db = wx.cloud.database()
    const types = ['template', 'plan', 'instance', 'categoryBudget']
    const results = await Promise.all(types.map((type) => fetchAll(db.collection(getV3Collection(type)).where({
      appKey: APP_KEY,
      userId: user.userId
    }))))
    types.forEach((type, index) => {
      const localPending = getV3Items(type).filter((item) => item.syncStatus === 'pending')
      setV3Items(type, [...localPending, ...results[index].map((item) => ({ ...item, id: item._id, syncStatus: 'synced' }))])
    })
    return { fetched: true }
  } catch (error) {
    console.warn('[cloud] V3 data query failed, using local cache', error)
    return { fetched: false }
  }
}

async function updateV3Item(type, clientId, changes, user) {
  const update = {
    template: storage.updateQuickTemplate,
    plan: storage.updateRecurringPlan,
    instance: storage.updateRecurringInstance,
    categoryBudget: storage.updateCategoryBudget
  }[type]
  if (!update) throw new Error('unsupported V3 item')
  const item = update(clientId, changes)
  if (!item) throw new Error('V3 item not found')
  if (!isCloudReady() || !user || !user.isCloudUser) return { item, cloudSynced: false }
  try {
    await upsertV3Document(wx.cloud.database(), getV3Collection(type), item, user)
    setV3Items(type, getV3Items(type).map((current) => current.clientId === clientId
      ? { ...current, syncStatus: 'synced' }
      : current))
    return { item, cloudSynced: true }
  } catch (error) {
    console.error(`[cloud] ${type} update failed`, error)
    return { item, cloudSynced: false }
  }
}

async function deleteV3Item(type, clientId, user) {
  return updateV3Item(type, clientId, { deletedAt: new Date().toISOString() }, user)
}

async function createRecord(record, user) {
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return {
      record: storage.addRecord({ ...record, appKey: APP_KEY, syncStatus: 'pending' }),
      cloudSynced: false
    }
  }

  const nextRecord = storage.addRecord({ ...record, appKey: APP_KEY, syncStatus: 'pending' })
  try {
    const db = wx.cloud.database()
    await upsertRecord(db, nextRecord, user)
    storage.setRecordSyncStatus(nextRecord.clientId, 'synced')
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

async function updateRecord(clientId, changes, user) {
  const updatedRecord = storage.updateRecord(clientId, {
    ...changes,
    syncStatus: 'pending'
  })
  if (!updatedRecord) {
    throw new Error('record not found')
  }

  if (!isCloudReady() || !user || !user.isCloudUser) {
    return {
      record: updatedRecord,
      cloudSynced: false
    }
  }

  try {
    const db = wx.cloud.database()
    await upsertRecord(db, updatedRecord, user)
    storage.setRecordSyncStatus(updatedRecord.clientId, 'synced')
    storage.setLastSyncAt(new Date().toISOString())
    return {
      record: updatedRecord,
      cloudSynced: true
    }
  } catch (error) {
    console.error('[cloud] record update failed', error)
    return {
      record: updatedRecord,
      cloudSynced: false
    }
  }
}

async function fetchRecordsPage(user, filters = {}) {
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize || 20)))
  const offset = Math.max(0, Number(filters.offset || 0))

  if (!isCloudReady() || !user || !user.isCloudUser) {
    const records = filterLocalRecords(storage.getActiveRecords(), filters)
    return {
      records: records.slice(offset, offset + pageSize),
      hasMore: offset + pageSize < records.length,
      nextOffset: offset + pageSize,
      fromCache: true
    }
  }

  try {
    const db = wx.cloud.database()
    const _ = db.command
    const where = {
      appKey: APP_KEY,
      userId: user.userId,
      deletedAt: _.exists(false)
    }
    if (filters.startDate && filters.endDate) {
      where.date = _.gte(filters.startDate).and(_.lte(filters.endDate))
    }
    if (filters.type) {
      where.type = filters.type
    }
    const keyword = String(filters.keyword || '').trim().toLowerCase()
    const records = []
    let rawOffset = offset
    let exhausted = false
    while (records.length < pageSize && !exhausted) {
      const result = await db.collection(RECORDS_COLLECTION)
        .where(where)
        .orderBy('date', 'desc')
        .orderBy('createdAt', 'desc')
        .skip(rawOffset)
        .limit(CLOUD_QUERY_LIMIT)
        .get()
      const rawRecords = result.data || []
      exhausted = rawRecords.length < CLOUD_QUERY_LIMIT
      for (const rawRecord of rawRecords) {
        rawOffset += 1
        const record = normalizeCloudRecord(rawRecord)
        const categoryMatches = !filters.categoryId || record.categoryId === filters.categoryId
        const keywordMatches = !keyword || String(record.remark || '').toLowerCase().includes(keyword)
        if (categoryMatches && keywordMatches) {
          records.push(record)
        }
        if (records.length >= pageSize) {
          exhausted = false
          break
        }
      }
    }
    return {
      records,
      hasMore: !exhausted,
      nextOffset: rawOffset,
      fromCache: false
    }
  } catch (error) {
    console.warn('[cloud] records query failed, using local cache', error)
    const records = filterLocalRecords(storage.getActiveRecords(), filters)
    return {
      records: records.slice(offset, offset + pageSize),
      hasMore: offset + pageSize < records.length,
      nextOffset: offset + pageSize,
      fromCache: true
    }
  }
}

async function fetchRecordsForMonth(user, month) {
  const range = getMonthRange(month)
  const all = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const result = await fetchRecordsPage(user, {
      startDate: range.start,
      endDate: range.end,
      pageSize: 50,
      offset
    })
    all.push(...result.records)
    hasMore = result.hasMore
    offset = result.nextOffset
  }
  return all
}

async function fetchAllRecords(user) {
  const all = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const result = await fetchRecordsPage(user, {
      pageSize: 50,
      offset
    })
    all.push(...result.records)
    offset = result.nextOffset
    hasMore = result.hasMore
  }
  return all
}

async function fetchRecentRecords(user, limit = 5) {
  const pageSize = Math.min(20, Math.max(1, Number(limit || 5)))
  if (!isCloudReady() || !user || !user.isCloudUser) {
    return [...storage.getActiveRecords()]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, pageSize)
  }

  try {
    const db = wx.cloud.database()
    const result = await db.collection(RECORDS_COLLECTION)
      .where({
        appKey: APP_KEY,
        userId: user.userId,
        deletedAt: db.command.exists(false)
      })
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .get()
    return (result.data || []).map(normalizeCloudRecord)
  } catch (error) {
    console.warn('[cloud] recent records query failed, using local cache', error)
    return [...storage.getActiveRecords()]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, pageSize)
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
  const localRecord = storage.getRecords().find((record) => record.clientId === clientId)
  storage.softDeleteRecord(clientId)

  if (!isCloudReady() || !user || !user.isCloudUser) {
    return
  }

  const db = wx.cloud.database()
  const now = new Date().toISOString()
  const result = await db.collection(RECORDS_COLLECTION)
    .where({
      appKey: APP_KEY,
      userId: user.userId,
      clientId
    })
    .get()

  let documentId = result.data && result.data[0] && result.data[0]._id
  if (!documentId && localRecord && localRecord.id) {
    const legacyResult = await db.collection(RECORDS_COLLECTION)
      .where({
        _id: localRecord.id,
        appKey: APP_KEY,
        userId: user.userId
      })
      .get()
    documentId = legacyResult.data && legacyResult.data[0] && legacyResult.data[0]._id
  }

  if (documentId) {
    await db.collection(RECORDS_COLLECTION).doc(documentId).update({
      data: {
        appKey: APP_KEY,
        deletedAt: now,
        updatedAt: now
      }
    })
    storage.setRecordSyncStatus(clientId, 'synced')
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
  const remoteRecords = await fetchRecordsForMonth(user, month)
  const budgetResult = await db.collection(BUDGETS_COLLECTION)
    .where({
      appKey: APP_KEY,
      userId: user.userId,
      month
    })
    .get()

  const records = storage.getRecords()
  const otherMonthRecords = records.filter((record) => record.date.slice(0, 7) !== month)
  const pendingMonthRecords = records.filter((record) => (
    record.date.slice(0, 7) === month && record.syncStatus === 'pending'
  ))
  const budgets = storage.getBudgets()
  const remoteBudget = budgetResult.data && budgetResult.data[0]

  if (remoteBudget) {
    const { _id, _openid, ...budget } = remoteBudget
    budgets[month] = {
      ...budget,
      id: _id
    }
  }

  const now = new Date().toISOString()
  storage.replaceCachedData({
    records: [...pendingMonthRecords, ...remoteRecords, ...otherMonthRecords],
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
      appKey: APP_KEY,
      userId: user.userId,
      clientId: record.clientId
    })
    .get()

  const { _id, _openid, id, syncStatus, ...recordData } = record
  const data = {
    ...recordData,
    appKey: APP_KEY,
    userId: user.userId
  }

  if (result.data && result.data[0]) {
    const { _id } = result.data[0]
    await db.collection(RECORDS_COLLECTION).doc(_id).update({
      data
    })
    return
  }

  if (id) {
    const legacyResult = await db.collection(RECORDS_COLLECTION).doc(id).get()
    if (legacyResult.data && legacyResult.data.appKey === APP_KEY && legacyResult.data.userId === user.userId) {
      await db.collection(RECORDS_COLLECTION).doc(id).update({ data })
      return
    }
  }

  await db.collection(RECORDS_COLLECTION).add({
    data
  })
}

function normalizeCloudRecord(record) {
  const { _id, _openid, ...data } = record
  return storage.normalizeRecord({
    ...data,
    id: _id,
    syncStatus: 'synced'
  })
}

async function upsertBudget(db, budget, user) {
  const result = await db.collection(BUDGETS_COLLECTION)
    .where({
      appKey: APP_KEY,
      userId: user.userId,
      month: budget.month
    })
    .get()

  const { _id, _openid, id, ...budgetData } = budget
  const data = {
    ...budgetData,
    appKey: APP_KEY,
    userId: user.userId
  }

  if (result.data && result.data[0]) {
    const remote = result.data[0]
    if (remote.updatedAt && budget.updatedAt && remote.updatedAt > budget.updatedAt) {
      return
    }
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

async function fetchAll(query, pageSize = 20) {
  const records = []
  let offset = 0
  while (true) {
    const result = await query.skip(offset).limit(pageSize).get()
    const data = result.data || []
    records.push(...data)
    if (data.length < pageSize) {
      return records
    }
    offset += pageSize
  }
}

function filterLocalRecords(records, filters) {
  const keyword = String(filters.keyword || '').trim().toLowerCase()
  return records
    .filter((record) => !filters.startDate || record.date >= filters.startDate)
    .filter((record) => !filters.endDate || record.date <= filters.endDate)
    .filter((record) => !filters.type || record.type === filters.type)
    .filter((record) => !filters.categoryId || record.categoryId === filters.categoryId)
    .filter((record) => !keyword || String(record.remark || '').toLowerCase().includes(keyword))
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date))
      return dateCompare || String(b.createdAt).localeCompare(String(a.createdAt))
    })
}

module.exports = {
  createRecord,
  deleteRecord,
  fetchCategories,
  fetchAllRecords,
  fetchCurrentMonthFromCloud,
  fetchRecentRecords,
  fetchRecordsForMonth,
  fetchRecordsPage,
  fetchV3Data,
  login,
  saveCategory,
  saveBudget,
  saveV3Item,
  setCategoryEnabled,
  syncLocalToCloud,
  deleteV3Item,
  updateV3Item,
  updateRecord,
  updateUserProfile
}
