const MAX_AMOUNT = 99999999.99
const MAX_NICKNAME_LENGTH = 20
const MAX_REMARK_LENGTH = 40

function countCharacters(value) {
  return Array.from(String(value || '')).length
}

function validateAmount(value, label = '金额') {
  const text = String(value || '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    return `${label}需大于 0，且最多保留两位小数`
  }
  if (Number(text) > MAX_AMOUNT) {
    return `${label}不能超过 99,999,999.99`
  }
  return ''
}

function validateRemark(value) {
  return countCharacters(value) > MAX_REMARK_LENGTH
    ? `备注最多 ${MAX_REMARK_LENGTH} 个字符`
    : ''
}

module.exports = {
  MAX_AMOUNT,
  MAX_NICKNAME_LENGTH,
  MAX_REMARK_LENGTH,
  countCharacters,
  validateAmount,
  validateRemark
}
