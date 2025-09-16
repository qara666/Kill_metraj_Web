import * as XLSX from 'xlsx';
import { GoogleMapsService } from './GoogleMapsService';

export interface ExcelRow {
  courierName?: string;
  orderNumber?: string;
  address?: string;
  [key: string]: any;
}

export interface ProcessedOrder {
  courierName: string;
  orderNumber: string;
  originalAddress: string;
  geocodedAddress?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  geocodingSuccess: boolean;
  error?: string;
  placeId?: string;
  types?: string[];
}

export interface ExcelProcessingResult {
  orders: ProcessedOrder[];
  summary: {
    totalOrders: number;
    successfulGeocoding: number;
    failedGeocoding: number;
    couriers: string[];
    errors: string[];
  };
}

export class ExcelService {
  private mapsService: GoogleMapsService;

  constructor(apiKey: string) {
    this.mapsService = new GoogleMapsService(apiKey);
  }

  /**
   * Parse Excel file and extract data
   */
  parseExcelFile(buffer: Buffer): ExcelRow[] {
    try {
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        cellDates: true,
        cellNF: false,
        cellText: false
      });
      
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('Excel file has no worksheets');
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        raw: false
      }) as string[][];

      if (jsonData.length < 2) {
        throw new Error('Excel file must have at least 2 rows (header + data)');
      }

      const headers = jsonData[0].map(h => h.toString().toLowerCase().trim());
      const rows = jsonData.slice(1);

      // Map common column names to standardized names
      const columnMapping: { [key: string]: string } = {
        // Courier name variations
        'courier': 'courierName',
        'courier name': 'courierName',
        'кур\'єр': 'courierName',
        'имя курьера': 'courierName',
        'курьер': 'courierName',
        'driver': 'courierName',
        'водитель': 'courierName',
        
        // Order number variations
        'order': 'orderNumber',
        'order number': 'orderNumber',
        'номер заказа': 'orderNumber',
        'номер замовлення': 'orderNumber',
        'order id': 'orderNumber',
        'id заказа': 'orderNumber',
        'id замовлення': 'orderNumber',
        
        // Address variations
        'address': 'address',
        'адрес': 'address',
        'адреса': 'address',
        'location': 'address',
        'место': 'address',
        'місце': 'address'
      };

      const processedRows: ExcelRow[] = rows
        .map(row => {
          const obj: ExcelRow = {};
          
          headers.forEach((header, index) => {
            const mappedKey = columnMapping[header] || header;
            const value = row[index]?.toString().trim() || '';
            
            // Only add non-empty values
            if (value) {
              obj[mappedKey] = value;
            }
          });

          return obj;
        })
        .filter(row => 
          // Must have all required fields
          row.courierName && 
          row.orderNumber && 
          row.address &&
          // Values must not be empty strings
          row.courierName.toString().trim() !== '' &&
          row.orderNumber.toString().trim() !== '' &&
          row.address.toString().trim() !== ''
        );

      if (processedRows.length === 0) {
        throw new Error('No valid rows found. Please ensure your Excel file has columns for courier name, order number, and address.');
      }

      return processedRows;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse Excel file: ${error.message}`);
      }
      throw new Error('Failed to parse Excel file: Unknown error');
    }
  }

  /**
   * Process orders with geocoding
   */
  async processOrdersWithGeocoding(
    orders: ExcelRow[],
    options: {
      delayMs?: number;
      validateUkraine?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<ExcelProcessingResult> {
    const { delayMs = 100, validateUkraine = true, maxRetries = 3 } = options;
    
    const results: ProcessedOrder[] = [];
    const errors: string[] = [];
    
    console.log(`Processing ${orders.length} orders with geocoding...`);
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      const processedOrder: ProcessedOrder = {
        courierName: order.courierName?.toString().trim() || '',
        orderNumber: order.orderNumber?.toString().trim() || '',
        originalAddress: order.address?.toString().trim() || '',
        geocodingSuccess: false
      };

      if (order.address) {
        let retryCount = 0;
        let success = false;
        
        while (retryCount < maxRetries && !success) {
          try {
            const geocodingResult = await this.mapsService.geocodeAddress(order.address.toString());
            
            if (geocodingResult) {
              // Validate coordinates are within Ukraine if required
              if (validateUkraine && !this.mapsService.isWithinUkraine(
                geocodingResult.geometry.location.lat,
                geocodingResult.geometry.location.lng
              )) {
                processedOrder.error = 'Address is outside Ukraine';
                break;
              }
              
              processedOrder.geocodedAddress = geocodingResult.formattedAddress;
              processedOrder.coordinates = {
                lat: geocodingResult.geometry.location.lat,
                lng: geocodingResult.geometry.location.lng
              };
              processedOrder.placeId = geocodingResult.placeId;
              processedOrder.types = geocodingResult.types;
              processedOrder.geocodingSuccess = true;
              success = true;
            } else {
              processedOrder.error = 'Address not found';
              break;
            }
          } catch (error) {
            retryCount++;
            const errorMessage = error instanceof Error ? error.message : 'Geocoding failed';
            
            if (retryCount >= maxRetries) {
              processedOrder.error = errorMessage;
              errors.push(`Order ${processedOrder.orderNumber}: ${errorMessage}`);
            } else {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, delayMs * retryCount));
            }
          }
        }
      } else {
        processedOrder.error = 'No address provided';
      }

      results.push(processedOrder);
      
      // Add delay between requests to respect API limits
      if (i < orders.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      // Log progress every 10 orders
      if ((i + 1) % 10 === 0) {
        console.log(`Processed ${i + 1}/${orders.length} orders`);
      }
    }

    // Calculate summary
    const successfulGeocoding = results.filter(r => r.geocodingSuccess).length;
    const failedGeocoding = results.length - successfulGeocoding;
    const couriers = [...new Set(results.map(r => r.courierName))];

    return {
      orders: results,
      summary: {
        totalOrders: results.length,
        successfulGeocoding,
        failedGeocoding,
        couriers,
        errors
      }
    };
  }

  /**
   * Group orders by courier
   */
  groupOrdersByCourier(orders: ProcessedOrder[]): Map<string, ProcessedOrder[]> {
    const grouped = new Map<string, ProcessedOrder[]>();
    
    orders.forEach(order => {
      if (!grouped.has(order.courierName)) {
        grouped.set(order.courierName, []);
      }
      grouped.get(order.courierName)!.push(order);
    });

    return grouped;
  }

  /**
   * Validate Excel file structure
   */
  validateExcelStructure(buffer: Buffer): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      if (workbook.SheetNames.length === 0) {
        errors.push('Excel file has no worksheets');
        return { isValid: false, errors };
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: ''
      }) as string[][];

      if (jsonData.length < 2) {
        errors.push('Excel file must have at least 2 rows (header + data)');
        return { isValid: false, errors };
      }

      const headers = jsonData[0].map(h => h.toString().toLowerCase().trim());
      
      // Check for required columns
      const hasCourierColumn = headers.some(h => 
        ['courier', 'courier name', 'кур\'єр', 'имя курьера', 'курьер'].includes(h)
      );
      
      const hasOrderColumn = headers.some(h => 
        ['order', 'order number', 'номер заказа', 'номер замовлення', 'order id'].includes(h)
      );
      
      const hasAddressColumn = headers.some(h => 
        ['address', 'адрес', 'адреса', 'location', 'место', 'місце'].includes(h)
      );

      if (!hasCourierColumn) {
        errors.push('Excel file must have a column for courier name (e.g., "Courier", "Кур\'єр")');
      }
      
      if (!hasOrderColumn) {
        errors.push('Excel file must have a column for order number (e.g., "Order", "Номер заказа")');
      }
      
      if (!hasAddressColumn) {
        errors.push('Excel file must have a column for address (e.g., "Address", "Адрес")');
      }

      return { isValid: errors.length === 0, errors };
    } catch (error) {
      errors.push('Failed to read Excel file');
      return { isValid: false, errors };
    }
  }

  /**
   * Get sample Excel template
   */
  generateSampleExcel(): Buffer {
    const sampleData = [
      ['Courier Name', 'Order Number', 'Address'],
      ['Іван Петренко', 'ORD-001', 'вул. Хрещатик, 15, Київ, Україна'],
      ['Марія Коваленко', 'ORD-002', 'проспект Науки, 45, Київ, Україна'],
      ['Олексій Сидоренко', 'ORD-003', 'вул. Богдана Хмельницького, 22, Київ, Україна']
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
