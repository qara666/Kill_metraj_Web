const express = require('express');
const { CourierController } = require('../controllers/CourierController');

const router = express.Router();
const courierController = new CourierController();

// GET /api/couriers - Get all couriers
router.get('/', courierController.getCouriers.bind(courierController));

// GET /api/couriers/:id - Get courier by ID
router.get('/:id', courierController.getCourierById.bind(courierController));

// GET /api/couriers/:id/statistics - Get courier statistics
router.get('/:id/statistics', courierController.getCourierStatistics.bind(courierController));

// POST /api/couriers - Create new courier
router.post('/', courierController.createCourier.bind(courierController));

// PUT /api/couriers/:id - Update courier
router.put('/:id', courierController.updateCourier.bind(courierController));

// DELETE /api/couriers/:id - Delete (archive) courier
router.delete('/:id', courierController.deleteCourier.bind(courierController));

module.exports = router;
