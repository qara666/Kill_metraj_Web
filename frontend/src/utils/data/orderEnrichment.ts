// No imports needed

export const parseTime = (timeStr: any): number | null => {
    if (!timeStr) return null;
    if (typeof timeStr === 'number') {
        if (timeStr > 946684800000) return timeStr;
        if (timeStr > 25569 && timeStr < 60000) {
            const utcDate = new Date((timeStr - 25569) * 86400 * 1000);
            return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), utcDate.getUTCHours(), utcDate.getUTCMinutes(), utcDate.getUTCSeconds()).getTime();
        }
        return null;
    }
    const str = String(timeStr).trim();
    const timeMatch = str.match(/^(\d{1,2})[:\-](\d{2})(?:[:\-](\d{2}))?$/);
    if (timeMatch) {
        const d = new Date();
        d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
        return d.getTime();
    }
    const parsed = Date.parse(str);
    return !isNaN(parsed) && parsed > 946684800000 ? parsed : null;
};

export const getKitchenTime = (o: any): number | null => {
    if (o.readyAt && typeof o.readyAt === 'number') return o.readyAt;
    const fields = ['время на кухню', 'время_на_кухню', 'kitchen_time', 'kitchenTime'];
    for (const f of fields) {
        const val = o[f] || o.raw?.[f];
        if (val) {
            const p = parseTime(val);
            if (p) return p;
        }
    }
    return null;
};

export const getPlannedTime = (o: any): number | null => {
    if (o.deadlineAt && typeof o.deadlineAt === 'number') return o.deadlineAt;
    const fields = ['плановое время', 'плановое_время', 'planned_time', 'plannedTime', 'доставить к'];
    for (const f of fields) {
        const val = o[f] || o.raw?.[f];
        if (val) {
            const p = parseTime(val);
            if (p) return p;
        }
    }
    return null;
};

export const getArrivalTime = (o: any): number | null => {
    if (o.createdAt && typeof o.createdAt === 'number') return o.createdAt;
    const fields = ['создания', 'создание', 'creation', 'createdAt', 'Дата.создания'];
    for (const f of fields) {
        const val = o[f] || o.raw?.[f];
        if (val) {
            const p = parseTime(val);
            if (p) return p;
        }
    }
    // Если ничего не нашли, пробуем вернуть время на кухню как минимально возможное время поступления
    return getKitchenTime(o);
};

export const isValidAddress = (str: string): boolean => {
    if (!str || str.trim().length < 5) return false;
    const markers = [/\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|бульвар|бул\.?)\b/i, /\b\d+[а-я]?\b/];
    return markers.some(m => m.test(str)) && str.length > 8;
};
