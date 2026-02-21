export interface StatusBadgeProps {
    text: string
    bgColorClass: string
    textColorClass: string
}

export const getStatusBadgeProps = (status: string, isDark: boolean): StatusBadgeProps => {
    const s = status.toLowerCase().trim();
    let text = status;
    let bgColorClass = '';
    let textColorClass = '';

    // НОВЫЙ С САЙТА / НОВЫЙ
    if (s.includes('нов') || s.includes('new')) {
        text = 'НОВЫЙ';
        if (s.includes('сайт') || s.includes('web')) text = 'НОВЫЙ С САЙТА';
        bgColorClass = isDark ? 'bg-cyan-600/20' : 'bg-cyan-50';
        textColorClass = isDark ? 'text-cyan-400' : 'text-cyan-600';
    }
    // В РАБОТЕ / ПРИНЯТ
    else if (s.includes('работ') || s.includes('принят') || s.includes('progress')) {
        text = 'В РАБОТЕ';
        bgColorClass = isDark ? 'bg-amber-600/20' : 'bg-amber-50';
        textColorClass = isDark ? 'text-amber-400' : 'text-amber-600';
    }
    // ОТКАЗАН / ОТМЕНЕН
    else if (s.includes('отказ') || s.includes('отмен') || s.includes('cancel')) {
        text = 'ОТКАЗАН';
        bgColorClass = isDark ? 'bg-red-600/20' : 'bg-red-50';
        textColorClass = isDark ? 'text-red-400' : 'text-red-500';
    }
    // СОБРАН / ГОТОВ
    else if (s.includes('собран') || s.includes('готов') || s.includes('ready')) {
        text = 'СОБРАН';
        bgColorClass = isDark ? 'bg-indigo-600/20' : 'bg-indigo-50';
        textColorClass = isDark ? 'text-indigo-400' : 'text-indigo-600';
    }
    // ДОСТАВЛЯЕТСЯ
    else if (s.includes('доставл') && !s.includes('доставлено')) {
        text = 'ДОСТАВЛЯЕТСЯ';
        bgColorClass = isDark ? 'bg-blue-600/20' : 'bg-blue-50';
        textColorClass = isDark ? 'text-blue-400' : 'text-blue-600';
    }
    // ИСПОЛНЕН / ДОСТАВЛЕНО
    else if (s.includes('исполн') || s.includes('доставлено') || s.includes('complete')) {
        text = 'ИСПОЛНЕН';
        bgColorClass = isDark ? 'bg-emerald-600/20' : 'bg-emerald-50';
        textColorClass = isDark ? 'text-emerald-400' : 'text-emerald-600';
    }
    // DEFAULT
    else {
        bgColorClass = isDark ? 'bg-gray-700/50' : 'bg-gray-100';
        textColorClass = isDark ? 'text-gray-400' : 'text-gray-500';
    }

    return { text, bgColorClass, textColorClass };
};
