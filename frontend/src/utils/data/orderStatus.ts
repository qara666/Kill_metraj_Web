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
 * Проверяет, является ли заказ завершенным (доставленным).
 * Использует нормализацию (регистр, пробелы).
 */
export function isOrderCompleted(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase().trim();
  return COMPLETED_STATUSES.includes(normalized);
}

/**
 * Проверяет, является ли заказ активным (в пути или собран).
 */
export function isOrderActive(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase().trim();
  return ['доставляется', 'в пути', 'собран', 'в работе'].includes(normalized);
}

/**
 * Проверяет, является ли заказ отмененным.
 */
export function isOrderCancelled(status: string | undefined | null): boolean {
  if (!status) return false;
  const normalized = String(status).toLowerCase().trim();
  return ['отменен', 'отмена', 'удален', 'удалено', 'отклонен'].includes(normalized);
}
