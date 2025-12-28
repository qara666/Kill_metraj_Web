import { processExcelFile } from '../utils/excelProcessor';

describe('Excel Processor Utility', () => {
  it('should process excel files correctly', async () => {
    const mockFile = new File(['column1,column2\nvalue1,value2'], 'test.csv', { type: 'text/csv' });
    
    const result = await processExcelFile(mockFile);
    
    expect(result.orders.length).toBeGreaterThan(0); // Проверяем, что заказы были обработаны
    // Добавьте дополнительные проверки по необходимости
  });
});