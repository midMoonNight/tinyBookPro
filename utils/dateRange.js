function getDateRangeError(startDate, endDate) {
  if (!startDate || !endDate) {
    return '请选择完整的日期范围'
  }
  if (startDate > endDate) {
    return '开始日期不能晚于结束日期'
  }
  const [startYear, startMonth] = startDate.slice(0, 7).split('-').map(Number)
  const [endYear, endMonth] = endDate.slice(0, 7).split('-').map(Number)
  if ((endYear * 12 + endMonth) - (startYear * 12 + startMonth) > 2) {
    return '单次最多查询连续 3 个月，请调整日期范围'
  }
  return ''
}

function isDateRangeValid(startDate, endDate) {
  return !getDateRangeError(startDate, endDate)
}

module.exports = {
  getDateRangeError,
  isDateRangeValid
}
