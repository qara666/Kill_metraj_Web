const express = require('express');
const { UploadController } = require('../controllers/UploadController');

const router = express.Router();
const uploadController = new UploadController();

// Configure multer
const upload = uploadController.configureMulter();

// POST /api/upload/excel - Upload Excel file
router.post('/excel', upload.single('file'), uploadController.uploadExcel.bind(uploadController));

module.exports = router;
