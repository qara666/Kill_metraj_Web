import React from 'react';
import { clsx } from 'clsx';
import {
    type CourierSchedule,
    VEHICLE_LIMITS,
    createDefaultSchedule
} from '../../utils/routes/courierSchedule';

interface CourierScheduleModalProps {
    isDark: boolean;
    show: boolean;
    onClose: () => void;
    schedules: CourierSchedule[];
    setSchedules: (schedules: CourierSchedule[]) => void;
    editingSchedule: CourierSchedule | null;
    setEditingSchedule: (schedule: CourierSchedule | null) => void;
}

export const CourierScheduleModal: React.FC<CourierScheduleModalProps> = React.memo(({
    isDark,
    show,
    onClose,
    schedules,
    setSchedules,
    editingSchedule,
    setEditingSchedule
}) => {
    if (!show && !editingSchedule) return null;

    const handleSaveSchedule = () => {
        if (!editingSchedule) return;

        const exists = schedules.some(s => s.courierId === editingSchedule.courierId);
        if (exists) {
            setSchedules(schedules.map(s => s.courierId === editingSchedule.courierId ? editingSchedule : s));
        } else {
            setSchedules([...schedules, editingSchedule]);
        }
        setEditingSchedule(null);
    };

    const handleDeleteSchedule = (courierId: string) => {
        setSchedules(schedules.filter(s => s.courierId !== courierId));
    };

    // Main Management Modal
    if (show && !editingSchedule) {
        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
                onClick={onClose}
            >
                <div
                    className={clsx(
                        'relative w-full max-w-4xl mx-4 max-h-[90vh] rounded-xl shadow-2xl overflow-hidden',
                        isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={clsx(
                        'px-6 py-4 border-b flex items-center justify-between',
                        isDark ? 'border-gray-700' : 'border-gray-200'
                    )}>
                        <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                            Управление графиками курьеров
                        </h3>
                        <button onClick={onClose} className={clsx('text-2xl hover:opacity-70', isDark ? 'text-gray-400' : 'text-gray-600')}>×</button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                        <div className="space-y-4">
                            <button
                                onClick={() => {
                                    const newSchedule = createDefaultSchedule(
                                        `courier_${Date.now()}`,
                                        `Курьер ${schedules.length + 1}`,
                                        'car',
                                        true
                                    );
                                    setEditingSchedule(newSchedule);
                                }}
                                className="w-full px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            >
                                + Добавить график курьера
                            </button>

                            {schedules.length === 0 ? (
                                <div className={clsx('text-center py-8', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                    Нет добавленных графиков.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {schedules.map((schedule) => (
                                        <div
                                            key={schedule.courierId}
                                            className={clsx(
                                                'p-4 rounded-lg border',
                                                isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <div className={clsx('font-medium', isDark ? 'text-white' : 'text-gray-900')}>
                                                        {schedule.courierName}
                                                    </div>
                                                    <div className={clsx('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                        {schedule.vehicleType === 'car' ? '🚗 Авто' : '🏍️ Мото'} •
                                                        {schedule.isActive ? ' ✅ Активен' : ' ❌ Неактивен'}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setEditingSchedule(schedule)}
                                                        className="px-3 py-1 text-xs rounded font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                                                    >
                                                        Редактировать
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSchedule(schedule.courierId)}
                                                        className="px-3 py-1 text-xs rounded font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                                                    >
                                                        Удалить
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={clsx('text-xs space-y-1', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                                {schedule.workDays.map((wd, idx) => {
                                                    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                                                    return (
                                                        <div key={idx}>
                                                            {dayNames[wd.dayOfWeek]}: {wd.startTime}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Editing Modal
    if (editingSchedule) {
        return (
            <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50"
                onClick={() => setEditingSchedule(null)}
            >
                <div
                    className={clsx(
                        'relative w-full max-w-2xl mx-4 max-h-[90vh] rounded-xl shadow-2xl overflow-hidden',
                        isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={clsx(
                        'px-6 py-4 border-b flex items-center justify-between',
                        isDark ? 'border-gray-700' : 'border-gray-200'
                    )}>
                        <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                            {editingSchedule.courierId.startsWith('courier_') ? 'Добавить график' : 'Редактировать график'}
                        </h3>
                        <button onClick={() => setEditingSchedule(null)} className={clsx('text-2xl hover:opacity-70', isDark ? 'text-gray-400' : 'text-gray-600')}>×</button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                        <div className="space-y-4">
                            <div>
                                <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Имя курьера</label>
                                <input
                                    type="text"
                                    value={editingSchedule.courierName}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, courierName: e.target.value })}
                                    className={clsx('w-full px-3 py-2 rounded-lg border', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900')}
                                />
                            </div>

                            <div>
                                <label className={clsx('block text-sm font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>Тип транспорта</label>
                                <select
                                    value={editingSchedule.vehicleType}
                                    onChange={(e) => setEditingSchedule({
                                        ...editingSchedule,
                                        vehicleType: e.target.value as 'car' | 'motorcycle',
                                        maxDistanceKm: e.target.value === 'motorcycle' ? VEHICLE_LIMITS.motorcycle.maxDistanceKm : undefined
                                    })}
                                    className={clsx('w-full px-3 py-2 rounded-lg border', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900')}
                                >
                                    <option value="car">🚗 Автомобиль (все зоны)</option>
                                    <option value="motorcycle">🏍️ Мотоцикл (до {VEHICLE_LIMITS.motorcycle.maxDistanceKm} км)</option>
                                </select>
                            </div>

                            <label className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={editingSchedule.isActive}
                                    onChange={(e) => setEditingSchedule({ ...editingSchedule, isActive: e.target.checked })}
                                    className="rounded"
                                />
                                <span className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>Активен</span>
                            </label>

                            <div>
                                <label className={clsx('block text-sm font-medium mb-3', isDark ? 'text-gray-300' : 'text-gray-700')}>График работы</label>
                                <div className="space-y-3">
                                    {editingSchedule.workDays.map((workDay, idx) => (
                                        <div key={idx} className={clsx('p-3 rounded-lg border', isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50')}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
                                                    {['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][workDay.dayOfWeek]}
                                                </span>
                                                <button
                                                    onClick={() => setEditingSchedule({ ...editingSchedule, workDays: editingSchedule.workDays.filter((_, i) => i !== idx) })}
                                                    className="text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30"
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                            <input
                                                type="time"
                                                value={workDay.startTime}
                                                onChange={(e) => {
                                                    const newWorkDays = [...editingSchedule.workDays];
                                                    newWorkDays[idx] = { ...workDay, startTime: e.target.value };
                                                    setEditingSchedule({ ...editingSchedule, workDays: newWorkDays });
                                                }}
                                                className={clsx('w-full px-2 py-1 rounded border text-sm', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900')}
                                            />
                                        </div>
                                    ))}
                                    <div className="flex gap-2">
                                        <select
                                            id="newDaySelect"
                                            className={clsx('flex-1 px-3 py-2 rounded-lg border text-sm', isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900')}
                                        >
                                            {['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'].map((day, i) => (
                                                <option key={i} value={i}>{day}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => {
                                                const select = document.getElementById('newDaySelect') as HTMLSelectElement;
                                                const dayOfWeek = parseInt(select.value);
                                                if (editingSchedule.workDays.some(wd => wd.dayOfWeek === dayOfWeek)) return;
                                                setEditingSchedule({
                                                    ...editingSchedule,
                                                    workDays: [...editingSchedule.workDays, { dayOfWeek, startTime: '11:00' }].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                                                });
                                            }}
                                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
                                        >
                                            Добавить день
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={clsx('px-6 py-4 border-t flex justify-end gap-3', isDark ? 'border-gray-700' : 'border-gray-200')}>
                        <button onClick={() => setEditingSchedule(null)} className={clsx('px-4 py-2 rounded-lg border', isDark ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700')}>Отмена</button>
                        <button onClick={handleSaveSchedule} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Сохранить</button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
});
