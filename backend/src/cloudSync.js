// Простой API для облачной синхронизации данных
const express = require('express')
const cors = require('cors')
const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// In-memory хранилище (в продакшене использовать базу данных)
const dataStore = new Map()
const shareStore = new Map()

// Сохранить данные
app.post('/sync/save', (req, res) => {
  try {
    const { id, data, timestamp, userId } = req.body
    
    if (!id || !data) {
      return res.status(400).json({ error: 'Недостаточно данных' })
    }

    const cloudData = {
      id,
      data,
      timestamp,
      userId,
      lastModified: Date.now()
    }

    dataStore.set(id, cloudData)
    console.log(`Данные сохранены для пользователя ${id}`)
    
    res.json({ success: true, message: 'Данные сохранены' })
  } catch (error) {
    console.error('Ошибка сохранения:', error)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Получить данные
app.get('/sync/get/:userId', (req, res) => {
  try {
    const { userId } = req.params
    const data = dataStore.get(userId)
    
    if (data) {
      res.json(data)
    } else {
      res.status(404).json({ error: 'Данные не найдены' })
    }
  } catch (error) {
    console.error('Ошибка получения данных:', error)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Проверить обновления
app.get('/sync/check/:userId', (req, res) => {
  try {
    const { userId } = req.params
    const data = dataStore.get(userId)
    
    if (data) {
      const lastSync = req.query.lastSync || 0
      const hasUpdates = data.lastModified > lastSync
      
      res.json({
        hasUpdates,
        data: hasUpdates ? data : null,
        lastModified: data.lastModified
      })
    } else {
      res.json({ hasUpdates: false })
    }
  } catch (error) {
    console.error('Ошибка проверки обновлений:', error)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Поделиться данными
app.post('/sync/share', (req, res) => {
  try {
    const { data } = req.body
    
    if (!data) {
      return res.status(400).json({ error: 'Недостаточно данных' })
    }

    const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(2)}`
    const shareData = {
      id: shareId,
      data,
      timestamp: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24 часа
    }

    shareStore.set(shareId, shareData)
    console.log(`Создана ссылка для sharing: ${shareId}`)
    
    res.json({ shareId, success: true })
  } catch (error) {
    console.error('Ошибка создания ссылки:', error)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Импортировать данные по ссылке
app.get('/sync/import/:shareId', (req, res) => {
  try {
    const { shareId } = req.params
    const shareData = shareStore.get(shareId)
    
    if (!shareData) {
      return res.status(404).json({ error: 'Ссылка не найдена или истекла' })
    }

    // Проверяем срок действия
    if (Date.now() > shareData.expires) {
      shareStore.delete(shareId)
      return res.status(410).json({ error: 'Ссылка истекла' })
    }

    res.json(shareData.data)
  } catch (error) {
    console.error('Ошибка импорта данных:', error)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Очистка истекших ссылок
setInterval(() => {
  const now = Date.now()
  for (const [shareId, shareData] of shareStore.entries()) {
    if (now > shareData.expires) {
      shareStore.delete(shareId)
      console.log(`Удалена истекшая ссылка: ${shareId}`)
    }
  }
}, 60 * 60 * 1000) // Каждый час

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Cloud Sync API запущен на порту ${PORT}`)
})

module.exports = app
