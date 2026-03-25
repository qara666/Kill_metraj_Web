import { hashString } from './excelProcessor';

export const getStableOrderId = (order: any): string => {
  if (!order) return '';
  
  // Treat "ID:0" as an invalid/placeholder ID to avoid collisions
  const rawId = order.id;
  const isInvalidId = rawId === undefined || rawId === null || rawId === 0 ||
    (typeof rawId === 'string' && rawId.toUpperCase().includes('ID:0'));

  const idVal = !isInvalidId ? String(rawId) : null;
  
  const orderDate = order.creationDate ? String(order.creationDate).split(' ')[0] : '';
  const datePrefix = orderDate ? `${orderDate}_` : '';
  
  // Use orderNumber or _id as secondary fallback, otherwise hash the address
  const fallback = String(order.orderNumber || order._id || `gen_${Math.abs(hashString(order.address || ''))}`);
  
  return datePrefix + (idVal || fallback);
};
