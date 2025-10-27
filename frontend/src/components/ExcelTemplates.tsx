import React, { useState } from 'react'
import { 
  DocumentArrowDownIcon,
  DocumentTextIcon,
  TableCellsIcon,
  InformationCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'

export const ExcelTemplates: React.FC = () => {
  const [showTemplates, setShowTemplates] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState<string | null>(null)

  const templates = [
    {
      id: 'basic',
      name: 'Базовый шаблон',
      description: 'Основные поля: адрес, номер заказа, курьер, способ оплаты, сумма',
      fields: ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'],
      fileName: 'template_basic.csv'
    },
    {
      id: 'extended',
      name: 'Расширенный шаблон',
      description: 'Все поля: включая телефон, имя клиента, комментарии, зоны',
      fields: ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма', 'Телефон', 'Имя клиента', 'Комментарий', 'Зона доставки'],
      fileName: 'template_extended.csv'
    },
    {
      id: 'csv',
      name: 'CSV шаблон',
      description: 'Простой CSV файл для быстрого импорта',
      fields: ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'],
      fileName: 'template.csv'
    }
  ]

  const handleDownloadTemplate = async (template: typeof templates[0]) => {
    setDownloadingTemplate(template.id)
    
    try {
      // Создаем тестовые данные для шаблона
      const sampleData = createSampleData(template.fields)
      
      // Создаем CSV файл (более простой подход)
      const csvContent = sampleData.map(row => 
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n')
      
      // Создаем и скачиваем файл
      const blob = new Blob([csvContent], { 
        type: template.id === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = template.fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success(`Шаблон "${template.name}" загружен`)
    } catch (error) {
      console.error('Ошибка создания шаблона:', error)
      toast.error('Ошибка при создании шаблона')
    } finally {
      setDownloadingTemplate(null)
    }
  }

  const createSampleData = (fields: string[]) => {
    const data = [fields] // Заголовки
    
    // Добавляем примеры данных
    const sampleRows = [
      ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500', '+380501234567', 'Петр Иванов', 'Доставить до 18:00', 'Центр'],
      ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750', '+380509876543', 'Анна Петрова', 'Звонок перед доставкой', 'Печерск'],
      ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300', '+380501112233', 'Сергей Козлов', '', 'Оболонь']
    ]
    
    // Добавляем только те поля, которые есть в шаблоне
    sampleRows.forEach(row => {
      const filteredRow = fields.map((_, index) => row[index] || '')
      data.push(filteredRow)
    })
    
    return data
  }

  return (
    <div className="space-y-4">
      {/* Кнопка для показа шаблонов */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="btn-outline flex items-center"
        >
          <TableCellsIcon className="h-4 w-4 mr-2" />
          Шаблоны Excel
        </button>
        
        {showTemplates && (
          <button
            onClick={() => setShowTemplates(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Список шаблонов */}
      {showTemplates && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-2 text-blue-600" />
              Шаблоны Excel файлов
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Выберите подходящий шаблон для создания Excel файла с заказами
            </p>
          </div>

          <div className="space-y-4">
            {templates.map((template) => (
              <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{template.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">Поля в шаблоне:</p>
                      <div className="flex flex-wrap gap-1">
                        {template.fields.map((field, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="ml-4">
                    <button
                      onClick={() => handleDownloadTemplate(template)}
                      disabled={downloadingTemplate === template.id}
                      className="btn-primary flex items-center"
                    >
                      {downloadingTemplate === template.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Создание...
                        </>
                      ) : (
                        <>
                          <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                          Скачать
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Инструкции */}
          <div className="mt-6 bg-blue-50 rounded-lg border border-blue-200 p-4">
            <div className="flex items-start">
              <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <h4 className="font-medium mb-2">Как использовать шаблоны:</h4>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Скачайте подходящий шаблон</li>
                  <li>Заполните данные в Excel или другом редакторе</li>
                  <li>Сохраните файл в формате .xlsx или .csv</li>
                  <li>Загрузите заполненный файл в систему</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


