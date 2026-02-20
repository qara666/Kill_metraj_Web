export interface PaymentMethodBadgeProps {
  text: string
  bgColorClass: string
  textColorClass: string
}

export const getPaymentMethodBadgeProps = (method: string, isDark: boolean): PaymentMethodBadgeProps => {
  const lowerMethod = method.toLowerCase()
  let text = method
  let bgColorClass = ''
  let textColorClass = ''

  if (lowerMethod.includes('отказ')) {
    text = 'ОТКАЗ'
    bgColorClass = isDark ? 'bg-red-600/20' : 'bg-red-100'
    textColorClass = isDark ? 'text-red-300' : 'text-red-800'
  }
  // IMPORTANT: Check Безготівка/Онлайн BEFORE Готівка
  // because "безготівка" contains substring "готівка"
  if (lowerMethod.includes('безготівка') || lowerMethod.includes('qr') || lowerMethod.includes('портмоне') || lowerMethod.includes('liqpay') || lowerMethod.includes('онлайн') || lowerMethod.includes('online') || lowerMethod.includes('перевод') || lowerMethod.includes('переказ') || lowerMethod.includes('сайт') || lowerMethod.includes('site')) {
    text = 'Безготівка/Онлайн'
    bgColorClass = isDark ? 'bg-green-600/20' : 'bg-green-100'
    textColorClass = isDark ? 'text-green-300' : 'text-green-800'
  }
  // Терминал / Карта
  else if (lowerMethod.includes('терминал') || lowerMethod.includes('карта') || lowerMethod.includes('карт') || lowerMethod.includes('card') || lowerMethod.includes('pos') || lowerMethod.includes('terminal')) {
    text = 'Терминал/Карта'
    bgColorClass = isDark ? 'bg-blue-600/20' : 'bg-blue-100'
    textColorClass = isDark ? 'text-blue-300' : 'text-blue-800'
  }
  // Наличные / Готівка (checked LAST so безготівка doesn't match)
  else if (lowerMethod.includes('наличные') || lowerMethod.includes('налич') || lowerMethod.includes('готівка') || lowerMethod.includes('cash')) {
    text = 'Готівка'
    bgColorClass = isDark ? 'bg-amber-600/20' : 'bg-amber-100'
    textColorClass = isDark ? 'text-amber-300' : 'text-amber-800'
  }
  // Другое (серый)
  else {
    bgColorClass = isDark ? 'bg-gray-600/20' : 'bg-gray-100'
    textColorClass = isDark ? 'text-gray-300' : 'text-gray-700'
  }

  return { text, bgColorClass, textColorClass }
}

