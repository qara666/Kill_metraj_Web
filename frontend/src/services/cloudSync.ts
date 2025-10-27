export class CloudSyncService {
  private apiUrl: string

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl
  }

  /**
   * Сохраняет данные в облаке
   */
  async saveData(data: any): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/api/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Ошибка сохранения данных в облаке:', error)
      throw error
    }
  }

  /**
   * Получает данные из облака
   */
  async getData(id: string): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/api/data/${id}`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Ошибка получения данных из облака:', error)
      throw error
    }
  }

  /**
   * Делится данными и возвращает ID для обмена
   */
  async shareData(data: any): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/api/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      return result.shareId
    } catch (error) {
      console.error('Ошибка обмена данными:', error)
      throw error
    }
  }

  /**
   * Импортирует данные по ID обмена
   */
  async importData(shareId: string): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/api/import/${shareId}`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Ошибка импорта данных:', error)
      throw error
    }
  }

  /**
   * Проверяет статус сервера
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        timeout: 5000
      } as any)

      return response.ok
    } catch (error) {
      console.error('Ошибка проверки здоровья сервера:', error)
      return false
    }
  }
}
