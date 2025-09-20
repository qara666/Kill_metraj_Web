# 🗄️ НАСТРОЙКА MONGODB ДЛЯ RENDER

## ❌ Ошибка: `querySrv ENOTFOUND _mongodb._tcp.cluster.mongodb.net`

Эта ошибка означает, что строка подключения к MongoDB неправильная или кластер недоступен.

## 🔧 РЕШЕНИЕ:

### 1. **Проверьте строку подключения MongoDB**

Правильный формат для MongoDB Atlas:
```
mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority
```

### 2. **Создайте MongoDB Atlas кластер (если еще не создан)**

1. Перейдите на [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Создайте аккаунт или войдите
3. Создайте новый кластер
4. Создайте пользователя базы данных
5. Добавьте IP адрес Render в whitelist

### 3. **Настройте переменные окружения на Render**

В Render Dashboard добавьте:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/kill_metraj?retryWrites=true&w=majority
```

**Замените:**
- `username` - ваш username MongoDB
- `password` - ваш password MongoDB  
- `cluster` - название вашего кластера
- `kill_metraj` - название базы данных

### 4. **Проверьте настройки кластера**

1. **Network Access**: Добавьте IP адрес Render (0.0.0.0/0 для всех IP)
2. **Database Access**: Создайте пользователя с правами read/write
3. **Cluster Status**: Убедитесь, что кластер активен

### 5. **Примеры правильных строк подключения**

#### MongoDB Atlas (рекомендуется):
```
mongodb+srv://myuser:mypassword@cluster0.abc123.mongodb.net/kill_metraj?retryWrites=true&w=majority
```

#### Локальная MongoDB:
```
mongodb://localhost:27017/kill_metraj
```

#### MongoDB Atlas с дополнительными параметрами:
```
mongodb+srv://myuser:mypassword@cluster0.abc123.mongodb.net/kill_metraj?retryWrites=true&w=majority&authSource=admin&ssl=true
```

### 6. **Проверка подключения**

После настройки проверьте:
1. Логи в Render Dashboard
2. Health check: `https://your-app.onrender.com/health`
3. API endpoints: `https://your-app.onrender.com/api/couriers`

## 🆘 Устранение неполадок

### Ошибка: `ENOTFOUND`
- Проверьте правильность строки подключения
- Убедитесь, что кластер активен
- Проверьте сетевые настройки

### Ошибка: `authentication failed`
- Проверьте username и password
- Убедитесь, что пользователь имеет права доступа

### Ошибка: `timeout`
- Проверьте статус кластера
- Убедитесь, что IP адрес добавлен в whitelist

## 📋 Чек-лист

- [ ] MongoDB Atlas кластер создан
- [ ] Пользователь базы данных создан
- [ ] IP адрес добавлен в Network Access
- [ ] Строка подключения правильная
- [ ] Переменная MONGODB_URI настроена в Render
- [ ] Кластер активен и доступен

## 🔗 Полезные ссылки

- [MongoDB Atlas](https://www.mongodb.com/atlas)
- [MongoDB Connection String](https://docs.mongodb.com/manual/reference/connection-string/)
- [Render Environment Variables](https://render.com/docs/environment-variables)

---

**После настройки MongoDB backend должен успешно подключиться! 🎉**
