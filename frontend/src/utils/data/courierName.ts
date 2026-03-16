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
  const name = asNonEmptyString(value)
  return name === 'ID:0' || name.startsWith('ID:0')
}

export function normalizeCourierName(value: unknown): string {
  const name = asNonEmptyString(value).trim().replace(/\s+/g, ' ')
  if (!name || name.length <= 2) return '' // Игнорируем слишком короткие имена (типа "по")
  return isId0CourierName(name) ? 'Не назначено' : name
}
