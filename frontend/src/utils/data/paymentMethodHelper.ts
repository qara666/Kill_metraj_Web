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

  // Наличные / Готівка
  if (lowerMethod.includes('наличные') || lowerMethod.includes('готівка') || lowerMethod.includes('глово готівка')) {
    text = 'Готівка'
    bgColorClass = isDark ? 'bg-amber-600/20' : 'bg-amber-100'
    textColorClass = isDark ? 'text-amber-300' : 'text-amber-800'
  }
  // Терминал / Карта
  else if (lowerMethod.includes('терминал') || lowerMethod.includes('карта') || lowerMethod.includes('pos')) {
    text = 'Терминал/Карта'
    bgColorClass = isDark ? 'bg-blue-600/20' : 'bg-blue-100'
    textColorClass = isDark ? 'text-blue-300' : 'text-blue-800'
  }
  // Безготівка / Онлайн
  else if (lowerMethod.includes('безготівка') || lowerMethod.includes('глово безготівка') || lowerMethod.includes('qr мульті') || lowerMethod.includes('портмоне') || lowerMethod.includes('liqpay') || lowerMethod.includes('онлайн') || lowerMethod.includes('перевод') || lowerMethod.includes('переказ')) {
    text = 'Безготівка/Онлайн'
    bgColorClass = isDark ? 'bg-green-600/20' : 'bg-green-100'
    textColorClass = isDark ? 'text-green-300' : 'text-green-800'
  }
  // Другое (серый)
  else {
    bgColorClass = isDark ? 'bg-gray-600/20' : 'bg-gray-100'
    textColorClass = isDark ? 'text-gray-300' : 'text-gray-700'
  }

  return { text, bgColorClass, textColorClass }
}

