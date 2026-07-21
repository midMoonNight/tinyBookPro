const { createClientId } = require('./id')
const { CATEGORY_ID_BY_TYPE_AND_NAME, LEGACY_SYSTEM_CATEGORY_ID_MAP } = require('./constants')
const { formatMonth } = require('./date')

const KEYS = {
  RECORDS: 'tinyBookPro.records',
  BUDGETS: 'tinyBookPro.budgets',
  QUICK_TEMPLATES: 'tinyBookPro.quickTemplates',
  RECURRING_PLANS: 'tinyBookPro.recurringPlans',
  RECURRING_INSTANCES: 'tinyBookPro.recurringInstances',
  CATEGORY_BUDGETS: 'tinyBookPro.categoryBudgets',
  USER: 'tinyBookPro.user',
  LAST_SYNC_AT: 'tinyBookPro.lastSyncAt'
}

function getArray(key) {
  return wx.getStorageSync(key) || []
}

function setArray(key, value) {
  wx.setStorageSync(key, value)
}

function normalizeConfig(item, type) {
  const now = new Date().toISOString()
  const normalized = {
    ...item,
    clientId: item.clientId || item.id || item._id || createClientId(),
    syncStatus: item.syncStatus || 'synced',
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now
  }
  if (type === 'template') {
    normalized.amount = item.amount === '' || item.amount === null || item.amount === undefined ? '' : Number(item.amount)
    normalized.sortOrder = Number(item.sortOrder || Date.now())
    normalized.isEnabled = item.isEnabled !== false
  }
  if (type === 'plan') {
    normalized.amount = Number(item.amount || 0)
    normalized.isEnabled = item.isEnabled !== false
    normalized.activeFromDate = item.activeFromDate || normalized.startDate
  }
  if (type === 'instance') {
    normalized.status = item.status || 'pending'
    normalized.clientId = item.clientId || `${item.planClientId}_${item.occurrenceDate}`
  }
  if (type === 'categoryBudget') {
    normalized.amount = Number(item.amount || 0)
  }
  return normalized
}

function getConfigs(key, type) {
  return getArray(key).map((item) => normalizeConfig(item, type))
}

function setConfigs(key, type, items) {
  const map = {}
  ;(items || []).forEach((item) => {
    const normalized = normalizeConfig(item, type)
    const existing = map[normalized.clientId]
    if (!existing || existing.syncStatus !== 'pending' && (normalized.syncStatus === 'pending' || normalized.updatedAt >= existing.updatedAt)) {
      map[normalized.clientId] = normalized
    }
  })
  setArray(key, Object.values(map))
}

function upsertConfig(key, type, item) {
  const next = normalizeConfig(item, type)
  const items = getConfigs(key, type).filter((current) => current.clientId !== next.clientId)
  items.push(next)
  setConfigs(key, type, items)
  return next
}

function updateConfig(key, type, clientId, changes) {
  const current = getConfigs(key, type).find((item) => item.clientId === clientId)
  if (!current) return null
  return upsertConfig(key, type, { ...current, ...changes, clientId, updatedAt: new Date().toISOString(), syncStatus: 'pending' })
}

function getQuickTemplates() { return getConfigs(KEYS.QUICK_TEMPLATES, 'template') }
function setQuickTemplates(items) { setConfigs(KEYS.QUICK_TEMPLATES, 'template', items) }
function upsertQuickTemplate(item) { return upsertConfig(KEYS.QUICK_TEMPLATES, 'template', item) }
function updateQuickTemplate(clientId, changes) { return updateConfig(KEYS.QUICK_TEMPLATES, 'template', clientId, changes) }

function getRecurringPlans() { return getConfigs(KEYS.RECURRING_PLANS, 'plan') }
function setRecurringPlans(items) { setConfigs(KEYS.RECURRING_PLANS, 'plan', items) }
function upsertRecurringPlan(item) { return upsertConfig(KEYS.RECURRING_PLANS, 'plan', item) }
function updateRecurringPlan(clientId, changes) { return updateConfig(KEYS.RECURRING_PLANS, 'plan', clientId, changes) }

function getRecurringInstances() { return getConfigs(KEYS.RECURRING_INSTANCES, 'instance') }
function setRecurringInstances(items) { setConfigs(KEYS.RECURRING_INSTANCES, 'instance', items) }
function upsertRecurringInstance(item) { return upsertConfig(KEYS.RECURRING_INSTANCES, 'instance', item) }
function updateRecurringInstance(clientId, changes) { return updateConfig(KEYS.RECURRING_INSTANCES, 'instance', clientId, changes) }

function getCategoryBudgets() { return getConfigs(KEYS.CATEGORY_BUDGETS, 'categoryBudget') }
function setCategoryBudgets(items) { setConfigs(KEYS.CATEGORY_BUDGETS, 'categoryBudget', items) }
function upsertCategoryBudget(item) { return upsertConfig(KEYS.CATEGORY_BUDGETS, 'categoryBudget', item) }
function updateCategoryBudget(clientId, changes) { return updateConfig(KEYS.CATEGORY_BUDGETS, 'categoryBudget', clientId, changes) }

function getRecords() {
  return getArray(KEYS.RECORDS)
}

function setRecords(records) {
  const map = (records || []).map(normalizeRecord).reduce((result, record) => {
    const existing = result[record.clientId]
    if (!existing || record.syncStatus === 'pending' || existing.syncStatus !== 'pending') {
      result[record.clientId] = record
    }
    return result
  }, {})
  setArray(KEYS.RECORDS, Object.values(map))
}

function normalizeRecord(record) {
  const categoryName = record.categoryNameSnapshot || record.category || '未分类'
  const categoryId = LEGACY_SYSTEM_CATEGORY_ID_MAP[record.categoryId]
    || record.categoryId
    || CATEGORY_ID_BY_TYPE_AND_NAME[`${record.type}:${categoryName}`]
  return {
    ...record,
    clientId: record.clientId || record.id || record._id || createClientId(),
    categoryId,
    categoryNameSnapshot: categoryName,
    amount: Number(record.amount || 0)
  }
}

function getActiveRecords() {
  return getRecords().filter((record) => !record.deletedAt)
}

function addRecord(record) {
  const existing = record.clientId && getRecords().find((item) => item.clientId === record.clientId)
  if (existing) {
    return existing
  }
  const now = new Date().toISOString()
  const nextRecord = {
    ...record,
    clientId: record.clientId || createClientId(),
    amount: Number(record.amount),
    syncStatus: record.syncStatus || 'pending',
    createdAt: record.createdAt || now,
    updatedAt: now
  }
  const records = getRecords()
  records.unshift(nextRecord)
  setRecords(records)
  return nextRecord
}

function softDeleteRecord(clientId) {
  const now = new Date().toISOString()
  const records = getRecords().map((record) => {
    if (record.clientId !== clientId) {
      return record
    }

    return {
      ...record,
      deletedAt: now,
      syncStatus: 'pending',
      updatedAt: now
    }
  })
  setRecords(records)
}

function updateRecord(clientId, changes) {
  const now = new Date().toISOString()
  let updatedRecord = null
  const records = getRecords().map((record) => {
    if (record.clientId !== clientId) {
      return record
    }

    updatedRecord = {
      ...record,
      ...changes,
      clientId: record.clientId,
      createdAt: record.createdAt,
      amount: Number(changes.amount === undefined ? record.amount : changes.amount),
      updatedAt: now
    }
    return updatedRecord
  })
  setRecords(records)
  return updatedRecord
}

function mergeRecords(nextRecords) {
  const map = getRecords().reduce((result, record) => {
    result[record.clientId] = record
    return result
  }, {})
  ;(nextRecords || []).forEach((record) => {
    if (record.id) {
      const duplicateKey = Object.keys(map).find((key) => map[key].id === record.id)
      if (duplicateKey && duplicateKey !== record.clientId) {
        delete map[duplicateKey]
      }
    }
    const existing = map[record.clientId]
    map[record.clientId] = existing && existing.syncStatus === 'pending'
      ? existing
      : record
  })
  setRecords(Object.values(map).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))
}

function setRecordSyncStatus(clientId, syncStatus) {
  const records = getRecords().map((record) => record.clientId === clientId
    ? { ...record, syncStatus }
    : record)
  setRecords(records)
}

function setAllRecordsSyncStatus(syncStatus) {
  setRecords(getRecords().map((record) => ({ ...record, syncStatus })))
}

function ensureRecordClientIds() {
  setRecords(getRecords())
}

function getBudgets() {
  return wx.getStorageSync(KEYS.BUDGETS) || {}
}

function getBudget(month = formatMonth()) {
  const budgets = getBudgets()
  return budgets[month] || null
}

function setBudget(month, amount) {
  const now = new Date().toISOString()
  const budgets = getBudgets()
  const budget = {
    ...(budgets[month] || {}),
    month,
    amount: Number(amount),
    updatedAt: now,
    createdAt: budgets[month] ? budgets[month].createdAt : now
  }
  budgets[month] = budget
  wx.setStorageSync(KEYS.BUDGETS, budgets)
  return budget
}

function getUser() {
  return wx.getStorageSync(KEYS.USER) || null
}

function setUser(user) {
  wx.setStorageSync(KEYS.USER, user)
}

function updateUserProfile(profile) {
  const user = getUser()
  if (!user) {
    return null
  }

  const nextUser = {
    ...user,
    ...profile,
    updatedAt: new Date().toISOString()
  }
  setUser(nextUser)
  return nextUser
}

function clearUser() {
  wx.removeStorageSync(KEYS.USER)
}

function getLastSyncAt() {
  return wx.getStorageSync(KEYS.LAST_SYNC_AT) || ''
}

function setLastSyncAt(value) {
  wx.setStorageSync(KEYS.LAST_SYNC_AT, value)
}

function replaceCachedData({ records, budgets, quickTemplates, recurringPlans, recurringInstances, categoryBudgets, lastSyncAt }) {
  if (Array.isArray(records)) {
    setRecords(records)
  }

  if (budgets) {
    wx.setStorageSync(KEYS.BUDGETS, budgets)
  }

  if (Array.isArray(quickTemplates)) setQuickTemplates(quickTemplates)
  if (Array.isArray(recurringPlans)) setRecurringPlans(recurringPlans)
  if (Array.isArray(recurringInstances)) setRecurringInstances(recurringInstances)
  if (Array.isArray(categoryBudgets)) setCategoryBudgets(categoryBudgets)

  if (lastSyncAt) {
    setLastSyncAt(lastSyncAt)
  }
}

module.exports = {
  KEYS,
  addRecord,
  clearUser,
  ensureRecordClientIds,
  getActiveRecords,
  getBudget,
  getCategoryBudgets,
  getBudgets,
  getLastSyncAt,
  getRecords,
  getQuickTemplates,
  getRecurringInstances,
  getRecurringPlans,
  getUser,
  mergeRecords,
  normalizeRecord,
  replaceCachedData,
  setAllRecordsSyncStatus,
  setBudget,
  setCategoryBudgets,
  setQuickTemplates,
  setRecurringInstances,
  setRecurringPlans,
  setLastSyncAt,
  setRecordSyncStatus,
  setRecords,
  setUser,
  softDeleteRecord,
  updateCategoryBudget,
  updateQuickTemplate,
  updateRecurringInstance,
  updateRecurringPlan,
  updateRecord,
  updateUserProfile,
  upsertCategoryBudget,
  upsertQuickTemplate,
  upsertRecurringInstance,
  upsertRecurringPlan
}
