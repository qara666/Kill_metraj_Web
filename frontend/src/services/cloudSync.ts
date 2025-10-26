// Облачная синхронизация данных
interface CloudData {
  id: string
  data: any
  timestamp: number
  userId: string
}

interface CloudSyncOptions {
  apiUrl?: string
  userId?: string
  enabled?: boolean
}

class CloudSyncService {
  private apiUrl: string
  private userId: string
  private enabled: boolean

  constructor(options: CloudSyncOptions = {}) {
    // ВРЕМЕННО: используем localhost до деплоя на Render
    const backendUrl = import.meta.env?.VITE_BACKEND_URL || 'http://localhost:10000';
    this.apiUrl = options.apiUrl || backendUrl
    this.userId = options.userId || this.generateUserId()
    this.enabled = options.enabled || false
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2)}`
  }

  // Сохранить данные в облако
  async saveData(data: any): Promise<boolean> {
    if (!this.enabled) return false

    try {
      const cloudData: CloudData = {
        id: this.userId,
        data: data,
        timestamp: Date.now(),
        userId: this.userId
      }

      const response = await fetch(`${this.apiUrl}/sync/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cloudData)
      })

      if (response.ok) {
        console.log('Данные сохранены в облако')
        return true
      } else {
        console.error('Ошибка сохранения в облако:', response.statusText)
        return false
      }
    } catch (error) {
      console.error('Ошибка облачной синхронизации:', error)
      return false
    }
  }

  // Получить данные из облака
  async getData(): Promise<any | null> {
    if (!this.enabled) return null

    try {
      const response = await fetch(`${this.apiUrl}/sync/get/${this.userId}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('Данные получены из облака')
        return data
      } else {
        console.log('Нет данных в облаке')
        return null
      }
    } catch (error) {
      console.error('Ошибка получения данных из облака:', error)
      return null
    }
  }

  // Проверить обновления
  async checkUpdates(): Promise<any | null> {
    if (!this.enabled) return null

    try {
      const response = await fetch(`${this.apiUrl}/sync/check/${this.userId}`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.hasUpdates) {
          console.log('Найдены обновления в облаке')
          return data.data
        }
      }
      return null
    } catch (error) {
      console.error('Ошибка проверки обновлений:', error)
      return null
    }
  }

  // Поделиться данными (создать публичную ссылку)
  async shareData(data: any): Promise<string | null> {
    if (!this.enabled) return null

    try {
      const response = await fetch(`${this.apiUrl}/sync/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data })
      })

      if (response.ok) {
        const result = await response.json()
        const shareUrl = `${window.location.origin}?share=${result.shareId}`
        console.log('Создана ссылка для sharing:', shareUrl)
        return shareUrl
      } else {
        console.error('Ошибка создания ссылки для sharing')
        return null
      }
    } catch (error) {
      console.error('Ошибка sharing данных:', error)
      return null
    }
  }

  // Импортировать данные по ссылке
  async importData(shareId: string): Promise<any | null> {
    if (!this.enabled) return null

    try {
      const response = await fetch(`${this.apiUrl}/sync/import/${shareId}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('Данные импортированы из облака')
        return data
      } else {
        console.error('Ошибка импорта данных')
        return null
      }
    } catch (error) {
      console.error('Ошибка импорта данных:', error)
      return null
    }
  }
}

export default CloudSyncService

