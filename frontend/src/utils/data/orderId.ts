import { hashString } from './excelProcessor';

export const getStableOrderId = (order: any): string => {
  if (!order) return '';
  
  // v6.32: Physical delivery prioritization - use orderNumber as primary ID
  if (order.orderNumber) return String(order.orderNumber);

  // Treat "ID:0" as an invalid/placeholder ID to avoid collisions
  const rawId = order.id;
  const isInvalidId = rawId === undefined || rawId === null || rawId === 0 ||
    (typeof rawId === 'string' && String(rawId).toUpperCase().includes('ID:0'));

  const idVal = !isInvalidId ? String(rawId) : null;
  
  // v42.6: Final Strict Logic - Include excel_index to prevent collision of duplicate rows
  const indexSuffix = (order.excel_index !== undefined) ? `_r${order.excel_index}` : '';
  
  // Use _id as secondary fallback, otherwise hash the address
  const fallback = String(order._id || `gen_${Math.abs(hashString(order.address || ''))}${indexSuffix}`);
  
  return idVal || fallback;
};
