const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
};

export const getStableOrderId = (order: any): string => {
  if (!order) return '';
  
  // v6.32: Приоритизация физической доставки - используем orderNumber как основной ID
  if (order.orderNumber) return String(order.orderNumber);

  // Считаем "ID:0" невалидным/заполнителем ID для избежания коллизий
  const rawId = order.id;
  const isInvalidId = rawId === undefined || rawId === null || rawId === 0 ||
    (typeof rawId === 'string' && String(rawId).toUpperCase().includes('ID:0'));

  const idVal = !isInvalidId ? String(rawId) : null;
  
  // v42.6: Финальная строгая логика - включаем excel_index для предотвращения коллизий дублирующихся строк
  const indexSuffix = (order.excel_index !== undefined) ? `_r${order.excel_index}` : '';
  
  // Используем _id как вторичный запасной вариант, иначе хеш адреса
  const fallback = String(order._id || `gen_${Math.abs(hashString(order.address || ''))}${indexSuffix}`);
  
  return idVal || fallback;
};
