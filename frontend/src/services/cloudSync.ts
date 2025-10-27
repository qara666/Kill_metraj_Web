const API_BASE_URL = 'http://localhost:5001'

export interface CloudData {
  userId: string
  data: any
  timestamp: number
}

class CloudSyncService {
  private async fetch(url: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      })
      return await response.json()
    } catch (error) {
      console.error('Cloud sync error:', error)
      throw error
    }
  }

  async saveData(userId: string, data: any): Promise<void> {
    await this.fetch('/sync/save', {
      method: 'POST',
      body: JSON.stringify({ userId, data, timestamp: Date.now() })
    })
  }

  async getData(userId: string): Promise<any> {
    return await this.fetch(`/sync/get/${userId}`)
  }

  async shareData(data: any): Promise<string> {
    const result = await this.fetch('/sync/share', {
      method: 'POST',
      body: JSON.stringify({ data })
    })
    return result.shareId
  }

  async importData(shareId: string): Promise<any> {
    return await this.fetch(`/sync/import/${shareId}`)
  }

  async checkUpdates(userId: string): Promise<any> {
    return await this.fetch(`/sync/check/${userId}`)
  }
}

export const cloudSyncService = new CloudSyncService()


