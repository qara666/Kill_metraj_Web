const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { UploadController } = require('../controllers/UploadController');

const uploadController = new UploadController();

// Configure multer
const upload = uploadController.configureMulter();

// POST /api/upload/excel - Upload Excel file
router.post('/excel', upload.single('file'), uploadController.uploadExcel.bind(uploadController));

module.exports = router;




