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
    bgColorClass = isDark ? 'bg-red-600/20' : 'bg-red-50'
    textColorClass = isDark ? 'text-red-400' : 'text-red-500'
  }
  // САЙТ / LIQPAY / ОНЛАЙН (Violet/Purple)
  else if (lowerMethod.includes('сайт') || lowerMethod.includes('liqpay') || lowerMethod.includes('онлайн') || lowerMethod.includes('online') || lowerMethod.includes('портмоне') || lowerMethod.includes('безготівка')) {
    text = method.toUpperCase();
    bgColorClass = isDark ? 'bg-violet-600/20' : 'bg-violet-50'
    textColorClass = isDark ? 'text-violet-400' : 'text-violet-600'
  }
  // ТЕРМИНАЛ / КАРТА (Rose/Pink)
  else if (lowerMethod.includes('терминал') || lowerMethod.includes('карта') || lowerMethod.includes('карт') || lowerMethod.includes('pos') || lowerMethod.includes('terminal')) {
    text = method.toUpperCase();
    bgColorClass = isDark ? 'bg-rose-600/20' : 'bg-rose-50'
    textColorClass = isDark ? 'text-rose-400' : 'text-rose-600'
  }
  // ГОТІВКА / CASH (Emerald/Green)
  else if (lowerMethod.includes('налич') || lowerMethod.includes('готівка') || lowerMethod.includes('cash')) {
    text = 'ГОТІВКА'
    bgColorClass = isDark ? 'bg-emerald-600/20' : 'bg-emerald-50'
    textColorClass = isDark ? 'text-emerald-400' : 'text-emerald-600'
  }
  // Другое (серый)
  else {
    bgColorClass = isDark ? 'bg-gray-700/50' : 'bg-gray-100'
    textColorClass = isDark ? 'text-gray-400' : 'text-gray-500'
  }

  return { text, bgColorClass, textColorClass }
}

