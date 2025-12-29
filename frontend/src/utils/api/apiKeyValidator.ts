export const validateApiKey = (key: string): boolean => {
  if (!key) return false
  if (key.length < 30) return false
  
  // Базовые проверки
  const pattern = /^[A-Za-z0-9_-]+$/
  return pattern.test(key)
}

export const validateGoogleMapsApiKey = validateApiKey

export const formatApiKey = (key: string): string => {
  if (!key) return ''
  return key.trim()
}

