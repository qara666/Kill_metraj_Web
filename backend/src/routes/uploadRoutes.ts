import express from 'express';
import multer from 'multer';
import { UploadController } from '../controllers/UploadController';

const router = express.Router();
const uploadController = new UploadController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel and CSV files
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv' // .csv alternative
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.'));
    }
  }
});

// POST /api/upload/excel - Upload and process Excel file
router.post('/excel', upload.single('file'), uploadController.uploadExcelFile.bind(uploadController));

// POST /api/upload/create-routes - Create routes from processed orders
router.post('/create-routes', uploadController.createRoutesFromOrders.bind(uploadController));

// GET /api/upload/sample-template - Download sample Excel template
router.get('/sample-template', uploadController.getSampleTemplate.bind(uploadController));

// POST /api/upload/test-api-key - Test Google Maps API key
router.post('/test-api-key', uploadController.testApiKey.bind(uploadController));

// POST /api/upload/batch-geocode - Batch geocode addresses
router.post('/batch-geocode', uploadController.batchGeocodeAddresses.bind(uploadController));

export default router;
