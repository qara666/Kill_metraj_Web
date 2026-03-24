/**
 * Утилиты для работы со статусами заказов.
 * Централизованный список статусов, которые считаются "Завершенными" (Доставленными).
 */

export const COMPLETED_STATUSES = [
  'исполнен',
  'исполнено',
  'доставлено',
  'доставлен',
  'выдано',
  'выдан',
  'закрыт',
  'закрыто',
  'завершен',
  'завершено',
  'оплачен',
  'оплачено'
];

/**
 * Статусы, которые означают отмену заказа.
 * Такие заказы НЕ учитываются в счётчиках и км курьера.
 */
export const CANCELLED_STATUSES = [
  'отказан',

];

/**
 * Проверяет, является ли заказ завершенным (доставленным).
 * Использует нормализацию (регистр, пробелы).
 */
export function isOrderCompleted(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase().trim();
  return COMPLETED_STATUSES.includes(normalized);
}

/**
 * Проверяет, является ли заказ отменённым.
 * Отменённые заказы НЕ засчитываются в статистику курьера.
 */
export function isOrderCancelled(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase().trim();
  // Direct match
  if (CANCELLED_STATUSES.includes(normalized)) return true;
  // Partial match for multi-word statuses
  return CANCELLED_STATUSES.some(s => normalized.includes(s) || s.includes(normalized) && normalized.length > 4);
}

/**
 * Проверяет, является ли заказ активным (в пути или собран).
 */
export function isOrderActive(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase().trim();
  return ['доставляется', 'в пути', 'собран', 'в работе'].includes(normalized);
}
