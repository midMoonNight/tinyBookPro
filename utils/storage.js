const { createClientId } = require('./id')
const { CATEGORY_ID_BY_TYPE_AND_NAME } = require('./constants')
const { formatMonth } = require('./date')

const KEYS = {
  RECORDS: 'tinyBookPro.records',
  BUDGETS: 'tinyBookPro.budgets',
  USER: 'tinyBookPro.user',
  LAST_SYNC_AT: 'tinyBookPro.lastSyncAt'
}

function getArray(key) {
  return wx.getStorageSync(key) || []
}

function setArray(key, value) {
  wx.setStorageSync(key, value)
}

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
  return {
    ...record,
    clientId: record.clientId || record.id || record._id || createClientId(),
    categoryId: record.categoryId || CATEGORY_ID_BY_TYPE_AND_NAME[`${record.type}:${categoryName}`] || record.categoryId,
    categoryNameSnapshot: categoryName,
    amount: Number(record.amount || 0)
  }
}

function getActiveRecords() {
  return getRecords().filter((record) => !record.deletedAt)
}

function addRecord(record) {
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

function replaceCachedData({ records, budgets, lastSyncAt }) {
  if (Array.isArray(records)) {
    setRecords(records)
  }

  if (budgets) {
    wx.setStorageSync(KEYS.BUDGETS, budgets)
  }

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
  getBudgets,
  getLastSyncAt,
  getRecords,
  getUser,
  mergeRecords,
  normalizeRecord,
  replaceCachedData,
  setAllRecordsSyncStatus,
  setBudget,
  setLastSyncAt,
  setRecordSyncStatus,
  setRecords,
  setUser,
  softDeleteRecord,
  updateRecord,
  updateUserProfile
}
