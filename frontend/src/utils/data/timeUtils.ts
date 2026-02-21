/**
 * Utility functions for parsing time from various formats, especially from Excel data.
 */

/**
 * Parses a time value from string, number (Excel serial), or Date.
 */
export const parseTime = (val: any, options: { isKitchenTime?: boolean, baseDate?: Date } = {}): number | null => {
    if (!val && val !== 0) return null;
    const s = String(val).trim();
    if (!s || s.includes('#')) return null;

    const strVal = s.toLowerCase();
    // Skip durations
    if (strVal.includes('мин.') || strVal.includes('час') || strVal.includes('min') || strVal.includes('hour')) {
        return null;
    }

    // 1. Excel serial number (number or numeric string)
    const excelTime = typeof val === 'number' ? val : parseFloat(s);
    if (!isNaN(excelTime) && excelTime > 0) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));

        if (excelTime >= 25569) { // Date + Time
            const days = Math.floor(excelTime);
            const timeFraction = excelTime - days;

            if (options.isKitchenTime && options.baseDate) {
                const totalHours = timeFraction * 24;
                const hours = Math.floor(totalHours);
                const minutes = Math.floor((totalHours - hours) * 60);
                const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);

                const resultDate = new Date(options.baseDate);
                resultDate.setHours(hours, minutes, seconds, 0);
                return resultDate.getTime();
            } else {
                const date = new Date(excelEpoch.getTime() + days * 86400 * 1000);
                const totalHours = timeFraction * 24;
                const hours = Math.floor(totalHours);
                const minutes = Math.floor((totalHours - hours) * 60);
                const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);
                date.setUTCHours(hours, minutes, seconds, 0);
                return date.getTime();
            }
        } else if (excelTime >= 0 && excelTime < 1) { // Time only
            const totalHours = excelTime * 24;
            const hours = Math.floor(totalHours);
            const minutes = Math.floor((totalHours - hours) * 60);
            const seconds = Math.round(((totalHours - hours) * 60 - minutes) * 60);

            const base = options.baseDate ? new Date(options.baseDate) : new Date();
            base.setHours(hours, minutes, seconds, 0);
            return base.getTime();
        }
    }

    // 2. String formats
    // DD.MM.YYYY HH:MM:SS
    const dotDateTimeMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
    if (dotDateTimeMatch) {
        const day = parseInt(dotDateTimeMatch[1], 10);
        const month = parseInt(dotDateTimeMatch[2], 10);
        const year = parseInt(dotDateTimeMatch[3], 10);
        const hour = parseInt(dotDateTimeMatch[4], 10);
        const minute = parseInt(dotDateTimeMatch[5], 10);
        const second = dotDateTimeMatch[6] ? parseInt(dotDateTimeMatch[6], 10) : 0;
        return new Date(year, month - 1, day, hour, minute, second).getTime();
    }

    // M/d/yy HH:mm (Excel standard)
    const excelDateTimeMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (excelDateTimeMatch) {
        let first = parseInt(excelDateTimeMatch[1], 10);
        let second = parseInt(excelDateTimeMatch[2], 10);
        let year = parseInt(excelDateTimeMatch[3], 10);
        let hour = parseInt(excelDateTimeMatch[4], 10);
        const minute = parseInt(excelDateTimeMatch[5], 10);
        const ampm = excelDateTimeMatch[7];

        let month, day;
        if (first > 12) { day = first; month = second; }
        else if (second > 12) { month = first; day = second; }
        else { month = first; day = second; }

        if (year < 100) year += year < 50 ? 2000 : 1900;
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
            else if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        return new Date(year, month - 1, day, hour, minute, 0).getTime();
    }

    // HH:mm:ss, HH:mm
    const timeMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        const ampm = timeMatch[4];
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
            else if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        const base = options.baseDate ? new Date(options.baseDate) : new Date();
        base.setHours(hour, minute, second, 0);
        return base.getTime();
    }

    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
        return d.getTime();
    }

    return null;
};

const KITCHEN_TIME_FIELDS = [
    'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
    'час на кухню', 'час_на_кухню', 'час на кухні', 'час_на_кухні',
    'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
    'kitchen', 'Kitchen', 'KITCHEN',
    'Время готовности', 'время готовности', 'Готовность', 'готовность',
    'готовність', 'час готовності'
];

const PLANNED_TIME_FIELDS = [
    'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
    'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
    'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
    'deadlineAt', 'deadline_at', 'DeadlineAt',
    'deliverBy', 'deliver_by', 'DeliverBy',
    'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
    'доставить к', 'доставить_к', 'Доставить к',
    'timeDeliveryEnd', 'time_delivery_end', 'TimeDeliveryEnd'
];

const ARRIVAL_TIME_FIELDS = [
    'создания', 'создание', 'creation', 'createdAt', 'Дата.создания',
    'дата.создания', 'Дата создания', 'дата создания', 'CreatedAt'
];

export const getKitchenTime = (o: any, baseDate?: Date): number | null => {
    if (!o) return null;
    // Check property directly if it exists
    if (o.readyAtSource && typeof o.readyAtSource === 'number') return o.readyAtSource;

    for (const field of KITCHEN_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTime(val, { isKitchenTime: true, baseDate });
            if (parsed) return parsed;
        }
    }
    return null;
};

export const getPlannedTime = (o: any, baseDate?: Date): number | null => {
    if (!o) return null;

    // Check explicit property first (populated by API transformer)
    if (o.deadlineAt && typeof o.deadlineAt === 'number') {
        // If it's a valid timestamp (not 00:00 on some epoch)
        const date = new Date(o.deadlineAt);
        if (date.getHours() !== 0 || date.getMinutes() !== 0) {
            return o.deadlineAt;
        }
    }

    for (const field of PLANNED_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            // If the value is "00:00", we should keep searching or handle it as invalid
            if (typeof val === 'string' && (val === '00:00' || val === '00:00:00')) {
                continue;
            }

            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }
    return null;
};

export const getArrivalTime = (o: any, baseDate?: Date): number | null => {
    if (!o) return null;

    // Phase 4.4 & SOTA 3.1: Для заказов в работе (собран/доставляется/исполнен)
    // главным временем для группировки считается время начала физической активности (сборка или выдача).
    if (o.status === 'Доставляется' || o.status === 'В пути' || o.status === 'Исполнен') {
        if (o.statusTimings?.deliveringAt) return o.statusTimings.deliveringAt;
        if (o.handoverAt) return o.handoverAt;
    }

    if (o.status === 'Собран') {
        if (o.statusTimings?.assembledAt) return o.statusTimings.assembledAt;
    }

    if (o.createdAt && typeof o.createdAt === 'number') return o.createdAt;

    for (const field of ARRIVAL_TIME_FIELDS) {
        const val = o[field] ?? o.raw?.[field];
        if (val !== undefined && val !== null) {
            const parsed = parseTime(val, { baseDate });
            if (parsed) return parsed;
        }
    }

    // Если время создания не найдено, используем время "на кухню" как прокси
    return getKitchenTime(o, baseDate);
};
