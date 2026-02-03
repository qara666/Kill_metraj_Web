const { Kafka } = require('kafkajs');
const logger = require('../utils/logger');
const cacheService = require('../services/CacheService');

/**
 * Kafka-консьюмер для событий CDC дашборда
 * Принимает события Debezium CDC из PostgreSQL и рассылает их WebSocket-клиентам
 */
class DashboardConsumer {
    constructor(io) {
        this.io = io;
        this.isEnabled = process.env.CDC_ENABLED === 'true';
        this.isRunning = false;

        if (!this.isEnabled) {
            logger.info('CDC-консьюмер отключен. Установите CDC_ENABLED=true для включения.');
            return;
        }

        this.kafka = new Kafka({
            clientId: 'kill-metraj-backend',
            brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(',')
        });

        this.consumer = this.kafka.consumer({
            groupId: 'dashboard-updates',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });
    }

    /**
     * Запуск потребления сообщений Kafka
     */
    async start() {
        if (!this.isEnabled) {
            return;
        }

        try {
            await this.consumer.connect();
            logger.info('Kafka-консьюмер подключен');

            // Подписка на топик Debezium
            const topic = process.env.KAFKA_TOPIC || 'kill_metraj.public.api_dashboard_cache';
            await this.consumer.subscribe({
                topic: topic,
                fromBeginning: false
            });

            logger.info(`Подписка на топик: ${topic}`);

            // Запуск обработки сообщений
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const event = JSON.parse(message.value.toString());
                        await this.handleDashboardUpdate(event);
                    } catch (error) {
                        logger.error('Ошибка обработки сообщения Kafka:', error);
                    }
                }
            });

            this.isRunning = true;
            logger.info('Kafka-консьюмер ожидает обновлений дашборда');
        } catch (error) {
            logger.error('Не удалось запустить Kafka-консьюмер:', error);
            this.isEnabled = false;
        }
    }

    /**
     * Обработка события обновления дашборда от Debezium
     */
    async handleDashboardUpdate(event) {
        try {
            // Структура события Debezium после трансформаExtractNewRecordState
            // event = { id, payload, data_hash, status_code, created_at }

            if (!event || !event.payload) {
                logger.warn('Получено неверное событие CDC:', event);
                return;
            }

            logger.info('Получено обновление дашборда от Debezium CDC', {
                id: event.id,
                status_code: event.status_code
            });

            // Сброс всего кэша
            await cacheService.invalidateAll();
            logger.debug('Кэш сброшен из-за события CDC');

            // Рассылка WebSocket-клиентам с фильтрацией
            const sockets = await this.io.fetchSockets();

            if (sockets.length === 0) {
                logger.debug('Нет подключенных WebSocket-клиентов, пропуск рассылки');
                return;
            }

            for (const socketInstance of sockets) {
                const socket = this.io.sockets.sockets.get(socketInstance.id);
                if (!socket || !socket.user) continue;

                const user = socket.user;
                let payload = event.payload;

                // Фильтрация по подразделению
                if (user.role !== 'admin' && user.divisionId) {
                    payload = {
                        ...payload,
                        orders: (payload.orders || []).filter(
                            o => String(o.departmentId) === String(user.divisionId)
                        ),
                        couriers: (payload.couriers || []).filter(
                            c => String(c.departmentId) === String(user.divisionId)
                        )
                    };
                }

                socket.emit('dashboard:update', {
                    data: payload,
                    timestamp: event.created_at,
                    status: event.status_code,
                    source: 'cdc'
                });
            }

            logger.info(`Обновление CDC разослано ${sockets.length} клиентам`);
        } catch (error) {
            logger.error('Ошибка обработки обновления дашборда:', error);
        }
    }

    /**
     * Остановка потребления и отключение
     */
    async stop() {
        if (this.isRunning) {
            try {
                await this.consumer.disconnect();
                this.isRunning = false;
                logger.info('Kafka-консьюмер остановлен');
            } catch (error) {
                logger.error('Ошибка при остановке Kafka-консьюмера:', error);
            }
        }
    }

    /**
     * Health check for Kafka consumer
     */
    async healthCheck() {
        if (!this.isEnabled) {
            return { healthy: true, message: 'CDC disabled' };
        }

        if (!this.isRunning) {
            return { healthy: false, error: 'Consumer not running' };
        }

        return {
            healthy: true,
            status: 'running',
            enabled: this.isEnabled
        };
    }
}

module.exports = DashboardConsumer;
