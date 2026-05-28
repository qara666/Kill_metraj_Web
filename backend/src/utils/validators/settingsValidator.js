const Joi = require('joi');

// Импорт типов для JSDoc
/** @typedef {import('../../types/index').SettingField} SettingField */
/** @typedef {import('../../types/index').SettingsSchema} SettingsSchema */

// Схема валидации для одного поля настроек
const settingFieldSchema = Joi.object({
key: Joi.string().required(),
type: Joi.string().valid('string', 'number', 'boolean', 'array', 'object').required(),
defaultValue: Joi.any(),
label: Joi.string().required(),
description: Joi.string(),
validation: Joi.function()
});

// Схема валидации для схемы настроек
const settingsSchemaSchema = Joi.object({
category: Joi.string().required(),
fields: Joi.array().items(settingFieldSchema).required(),
validationRules: Joi.array().items(Joi.object({
rule: Joi.function().required(),
errorMessage: Joi.string().required()
}))
});

// Схема для валидации объекта настроек
const settingsValidationSchema = Joi.object({
id: Joi.string().required(),
userId: Joi.string().required(),
categories: Joi.object({
general: Joi.object().unknown(true),
account: Joi.object().unknown(true),
integrations: Joi.object().unknown(true),
notifications: Joi.object().unknown(true),
advanced: Joi.object().unknown(true)
}).required(),
createdAt: Joi.date().required(),
lastModified: Joi.date().required()
});

// Загрузка предопределенных схем
const predefinedSchemas = {
notifications: require('./notificationSchema'),
general: require('./generalSchema'),
integrations: require('./integrationsSchema')
};

// Функция для проверки соответствия настроек заданной схеме
function validateSettingsAgainstSchema(settings, schema) {
if (!schema) {
throw new Error('Не указана схема для валидации');
}

const { error } = settingsSchemaSchema.validate(schema, { abortEarly: false });
if (error) {
throw new Error(`Схема настроек не валидна: ${error.details.map(e => e.message).join(', ')}`);
}

const validationResult = {};
let hasErrors = false;

// Валидация поля по полю
schema.fields.forEach(field => {
const value = settings[schema.category] && settings[schema.category][field.key];

// Если есть пользовательская валидация
if (field.validation) {
try {
const isValid = field.validation(value);
if (!isValid) {
validationResult[field.key] = `Значение для ${field.key} не прошло пользовательскую валидацию`;
hasErrors = true;
}
} catch (e) {
validationResult[field.key] = `Ошибка валидации для ${field.key}: ${e.message}`;
hasErrors = true;
}
}
});

return {
valid: !hasErrors,
errors: hasErrors ? validationResult : null
};
}

// Экспортируемые объекты
module.exports = {
settingFieldSchema,
settingsSchemaSchema,
settingsValidationSchema,
predefinedSchemas,
validateSettingsAgainstSchema
};
