# Отслеживание данных Дашборда и работы Фетчера на Render

Этот документ поможет вам понять, как отслеживать получение данных из API и их обработку фоновым процессом на Render.

## 1. Архитектура системы данных

Данные дашборда проходят следующий путь:
1. **Dashboard Fetcher (Worker)**: Фоновый процесс, который каждые 15 минут запрашивает данные из внешнего API Fastopertor.
2. **PostgreSQL Cache**: Фетчер сохраняет сырые данные в таблицу `api_dashboard_cache`.
3. **API Dashboard Latest**: Эндпоинт `/api/dashboard/latest` читает эти данные из базы и отдает фронтенду.
4. **WebSocket (Socket.io)**: При обновлении данных в базе (через PostgreSQL NOTIFY или CDC), сервер мгновенно рассылает их подключенным клиентам.

## 2. Как отслеживать на Render

### А. Логи фонового процесса (Fetcher)
Если вы используете **PM2** (через `ecosystem.config.js`), фетчер работает как отдельный процесс.

1. Зайдите в **Logs** вашего сервиса в панели управления Render.
2. Ищите строки с тегами `[dashboard-fetcher]`.
3. Вы должны видеть сообщения вида:
   - `[Dept: 100000052, Date: 2026-02-05] Загрузка данных...`
   - `[Dept: 100000052] Сохранено 124 заказов (1234мс)`

> [!IMPORTANT]
> Если вы видите только логи API сервера, значит фетчер не запущен. Для запуска всех процессов на Render команда старта должна быть:
> `npx pm2-runtime start ecosystem.config.js`

### Б. Проверка данных в базе (через эндпоинт)
Вы можете проверить, есть ли данные в кэше, открыв в браузере (или через Postman):
`https://yapiko-auto-km-backend.onrender.com/api/dashboard/latest`
*(Требуется заголовок `Authorization: Bearer <ваш_токен>`)*

Если вы получаете:
```json
{
  "success": false,
  "error": "Данные дашборда пока недоступны"
}
```
Это означает, что таблица `api_dashboard_cache` пуста. Фетчер либо не запущен, либо не смог авторизоваться во внешнем API.

### В. Отслеживание WebSocket (В браузере)
В Chrome DevTools:
1. Откройте вкладку **Network**.
2. Отфильтруйте по типу **WS** (WebSockets).
3. Найдите подключение к `socket.io`.
4. Во вкладке **Messages** вы увидите входящие события `dashboard:update`.

## 3. Решение распространенных проблем

| Проблема | Причина | Решение |
| :--- | :--- | :--- |
| **"Данные недоступны"** | Фетчер не запущен | Измените Start Command на `npx pm2-runtime start ecosystem.config.js` |
| **"websocket error"** | Лимиты Render или CORS | Установите в `socketService.ts` и `simple_server.js` порядок транспортов `['polling', 'websocket']` |
| **Нет обновлений** | Ошибка API Fastopertor | Проверьте `EXTERNAL_API_KEY` в переменных окружения на Render |

## 4. Полезные команды для отладки
Если у вас есть доступ к SSH или вы хотите добавить временные логи:
- Добавьте `console.log(JSON.stringify(responseData))` в `fetchForDepartment` внутри `dashboardFetcher.js` для вывода всего ответа API в логи Render.
- Проверьте `status_code` в БД: `SELECT status_code, created_at FROM api_dashboard_cache ORDER BY created_at DESC LIMIT 5;`
