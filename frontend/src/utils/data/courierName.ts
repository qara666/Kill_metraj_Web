/**
 * Утилиты для безопасной обработки имени курьера.
 *
 * В некоторых источниках (Excel/API) поле courier/name может приходить не строкой.
 * Эти функции предотвращают падения вида: "startsWith is not a function".
 */

export function asNonEmptyString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

export function isId0CourierName(value: unknown): boolean {
  const name = asNonEmptyString(value).trim().toUpperCase()
  // v5.126: Precise check for 'ID:0'. Must not match 'ID:01' or 'ID:059' which are real IDs.
  // v5.180: "ПО" is not a courier - treat as unassigned
  const isExactId0 = name === 'ID:0' || /^ID:0($|\s|[^0-9])/.test(name);
  return isExactId0 || name === 'НЕ НАЗНАЧЕНО' || name === 'НЕ НАЗНАЧЕННЫЕ ЗАКАЗЫ' || name === '' || name === 'ПО'
}

export function normalizeCourierName(value: unknown): string {
  const name = asNonEmptyString(value).trim().replace(/\s+/g, ' ').toUpperCase()
  if (!name || name.length < 1) return '' // Allow 1-char names (e.g. initials)
  // v5.180: "ПО" is not a courier - it's internal/trash designation
  if (name === 'ПО') return '';
  return isId0CourierName(name) ? 'Не назначено' : name
}

export function getCourierName(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.name || value._id || value.id || ''
}
