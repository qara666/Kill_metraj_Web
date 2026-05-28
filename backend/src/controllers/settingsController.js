const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { settingsSchema, settingFieldSchema } = require('../utils/validators/settingsValidator');

// Импорт типов для JSDoc
/** @typedef {import('../../types/settings').Settings} Settings */
/** @typedef {import('../../types/settings').SettingsVersion} SettingsVersion */

const SETTINGS_DIR = path.join(__dirname, '../../data/settings');

/**
 * Получить текущие настройки пользователя
 */
exports.getSettings = async (req, res) => {
    try {
        const userId = req.params.userId;
        const settingsPath = path.join(SETTINGS_DIR, `${userId}.json`);
        const fileContent = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(fileContent);
        return res.json(settings);
    } catch (error) {
        logger.error('Ошибка получения настроек', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось загрузить настройки' });
    }
};

/**
 * Сохранить измененные настройки
 */
exports.saveSettings = async (req, res) => {
    try {
        // Валидация входных данных
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.params.userId;
        const { settings, changelog } = req.body;

        // Создание версии
        await createSettingsVersion(userId, settings, changelog, req.user.id);

        // Обновление текущих настроек
        const settingsPath = path.join(SETTINGS_DIR, `${userId}.json`);
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

        return res.json({ success: true, settings });
    } catch (error) {
        logger.error('Ошибка сохранения настроек', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось сохранить настройки' });
    }
};

/**
 * Создать версию настроек
 * @param {string} userId
 * @param {Settings} settings
 * @param {string} changelog
 * @param {string} createdBy
 */
async function createSettingsVersion(userId, settings, changelog, createdBy) {
    const versionId = uuidv4();
    const version = {
        versionId,
        settingsId: userId,
        snapshot: settings,
        changelog,
        createdBy,
        createdAt: new Date()
    };

    const versionDir = path.join(SETTINGS_DIR, 'versions');
    await fs.mkdir(versionDir, { recursive: true });
    const versionPath = path.join(versionDir, `${userId}_${versionId}.json`);
    await fs.writeFile(versionPath, JSON.stringify(version, null, 2));
    return version;
}

/**
 * Получить историю изменений настроек
 */
exports.getSettingsHistory = async (req, res) => {
    try {
        const userId = req.params.userId;
        const versionDir = path.join(SETTINGS_DIR, 'versions');
        const versionFiles = await fs.readdir(versionDir);
        const userVersions = versionFiles
            .filter(file => file.startsWith(`${userId}_`))
            .map(file => file.replace('.json', ''))
            .map(file => {
                const [userId, versionId] = file.split('_');
                return { versionId };
            });

        // Берем последние 10 версий
        const recentVersions = await Promise.all(
            userVersions
                .sort((a, b) => b.versionId.localeCompare(a.versionId))
                .slice(0, 10)
                .map(version => fs.readFile(path.join(versionDir, `${version.versionId}.json`), 'utf-8')
                    .then(content => JSON.parse(content))
                )
        );

        return res.json(recentVersions);
    } catch (error) {
        logger.error('Ошибка получения истории настроек', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось получить историю изменений' });
    }
};

/**
 * Сравнить две версии настроек
 */
exports.compareSettingsVersions = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { versionId1, versionId2 } = req.body;

        const version1 = JSON.parse(
            await fs.readFile(path.join(SETTINGS_DIR, 'versions', `${userId}_${versionId1}.json`), 'utf-8')
        );

        const version2 = JSON.parse(
            await fs.readFile(path.join(SETTINGS_DIR, 'versions', `${userId}_${versionId2}.json`), 'utf-8')
        );

        // Простой пример сравнения
        const changes = {};
        Object.keys(SettingsCategory).forEach(category => {
            Object.keys(version1.snapshot.categories[category]).forEach(key => {
                const val1 = version1.snapshot.categories[category][key];
                const val2 = version2.snapshot.categories[category][key];
                if (val1 !== val2) {
                    changes[`${category}.${key}`] = { from: val1, to: val2 };
                }
            });
        });

        return res.json({ version1: version1.snapshot, version2: version2.snapshot, changes });
    } catch (error) {
        logger.error('Ошибка сравнения версий настроек', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось сравнить версии' });
    }
};

/**
 * Экспортировать настройки
 */
exports.exportSettings = async (req, res) => {
    try {
        const userId = req.params.userId;
        const settingsPath = path.join(SETTINGS_DIR, `${userId}.json`);
        const fileContent = await fs.readFile(settingsPath, 'utf-8');

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=settings_${userId}_${new Date().toISOString()}.json`);
        res.send(fileContent);
    } catch (error) {
        logger.error('Ошибка экспорта настроек', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось экспортировать настройки' });
    }
};

/**
 * Импортировать настройки
 */
exports.importSettings = async (req, res) => {
    try {
        const userId = req.params.userId;
        const settings = req.file;

        if (!settings) {
            return res.status(400).json({ error: 'Не выбран файл для импорта' });
        }

        // Валидация формата
        let parsedSettings;
        try {
            parsedSettings = JSON.parse(settings.buffer.toString());
        } catch (e) {
            return res.status(400).json({ error: 'Файл содержит невалидный JSON' });
        }

        // Валидация структуры
        if (!settingsSchema.isValidSync(parsedSettings)) {
            const errors = settingsSchema.validate(parsedSettings, { abortEarly: false }).error.details;
            return res.status(400).json({ errors: errors.map(e => e.message) });
        }

        // Сохранение настроек
        const settingsPath = path.join(SETTINGS_DIR, `${userId}.json`);
        await fs.writeFile(settingsPath, JSON.stringify(parsedSettings, null, 2));

        // Сохранение текущего состояния в истории
        await createSettingsVersion(userId, parsedSettings, 'Импортированы настройки', req.user.id);

        return res.json({ success: true });
    } catch (error) {
        logger.error('Ошибка импорта настроек', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось импортировать настройки' });
    }
};

/**
 * Получить рекомендации по настройкам
 */
exports.getSettingRecommendations = async (req, res) => {
    try {
        const userId = req.params.userId;
        const settingsPath = path.join(SETTINGS_DIR, `${userId}.json`);
        const fileContent = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(fileContent);

        // Пример ранее определенного вспомогательного файла
        const { getSettingRecommendations } = require('../../utils/settingsRecommender');

        // Получаем данные о поведении пользователя
        const userActivity = await getUserActivityData(userId);

        // Генерация рекомендаций
        const recommendations = getSettingRecommendations(userActivity);

        // Фильтрация рекомендаций на основе текущих настроек и активности
        const filteredRecommendations = recommendations.filter(rec => {
            // Уберем рекомендации, уже примененные
            const currentValue = settings.categories[rec.suggestion.settingsPath[0]][rec.suggestion.settingsPath[1]];
            return currentValue !== rec.suggestion.value;
        }).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);

        return res.json(filteredRecommendations);
    } catch (error) {
        logger.error('Ошибка получения рекомендаций', { userId, error: error.message });
        return res.status(500).json({ error: 'Не удалось получить рекомендации' });
    }
};

/**
 * Получить данные о поведении пользователя
 * @param {string} userId
 */
async function getUserActivityData(userId) {
    // Здесь может быть логика получения данных из аналитики
    // или внешнего сервиса использования
    const activityDataPath = path.join(__dirname, '../../data/userActivity', `${userId}.json`);
    let fileContent;

    try {
        fileContent = await fs.readFile(activityDataPath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (err) {
        // Если данные о поведении не найдены, возвращаем значения по умолчанию
        return {
            filtersUsed: [],
            filterUseRate: 0,
            lastActive: new Date(),
            featureUsage: {}
        };
    }
}
