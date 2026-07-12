const { createClientId } = require('./id')
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
  setArray(KEYS.RECORDS, records)
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
      updatedAt: now
    }
  })
  setRecords(records)
}

function ensureRecordClientIds() {
  const records = getRecords()
  let changed = false
  const nextRecords = records.map((record) => {
    if (record.clientId) {
      return record
    }

    changed = true
    return {
      ...record,
      clientId: createClientId()
    }
  })

  if (changed) {
    setRecords(nextRecords)
  }
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
  replaceCachedData,
  setBudget,
  setLastSyncAt,
  setRecords,
  setUser,
  softDeleteRecord,
  updateUserProfile
}
