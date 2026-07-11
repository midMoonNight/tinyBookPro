function createClientId() {
  const random = Math.random().toString(36).slice(2, 10)
  return `local_${Date.now()}_${random}`
}

module.exports = {
  createClientId
}
