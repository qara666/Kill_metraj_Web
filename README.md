# Kill_metraj Web Application

A comprehensive web application for courier route management and address geocoding, based on the iOS app functionality.

## 🚀 Features

- **Excel File Processing**: Upload and process Excel files with courier data
- **Address Geocoding**: Automatic address geocoding using Google Maps API
- **Route Optimization**: Create optimized routes for couriers
- **Courier Management**: Track courier performance and statistics
- **Interactive Maps**: Visualize routes on interactive maps
- **Real-time Analytics**: Monitor delivery statistics and efficiency

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: MongoDB with Mongoose
- **Maps**: Google Maps API
- **File Processing**: xlsx library
- **UI Components**: Headless UI + Heroicons

## 📋 Prerequisites

- Node.js 18+ and npm
- MongoDB (local or cloud)
- Google Maps API key with Geocoding and Directions APIs enabled

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Kill_metraj_Web
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Setup environment variables**
   ```bash
   cp backend/env.example backend/.env
   # Edit backend/.env with your configuration
   ```

4. **Start development servers**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## 📊 Usage

1. **Upload Excel File**: Upload an Excel file with columns for courier names, order numbers, and addresses
2. **Process Data**: The system will geocode addresses and validate data
3. **Create Routes**: Generate optimized routes for each courier
4. **Monitor Performance**: Track courier statistics and route efficiency
5. **View Maps**: Visualize routes on interactive maps

## 🔑 Google Maps API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Geocoding API and Directions API
3. Create an API key
4. Add the API key to your `.env` file

## 📁 Project Structure

```
Kill_metraj_Web/
├── frontend/           # React frontend application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Main application pages
│   │   ├── services/   # API calls and utilities
│   │   ├── types/      # TypeScript interfaces
│   │   └── utils/      # Helper functions
├── backend/            # Node.js backend API
│   ├── src/
│   │   ├── controllers/ # Route handlers
│   │   ├── models/      # Database models
│   │   ├── services/    # Business logic
│   │   ├── routes/      # API routes
│   │   └── utils/       # Utilities
├── shared/             # Shared types and utilities
└── docs/              # Documentation
```

## 🗄️ Database Models

### Courier
- Personal information (name, phone, location)
- Vehicle type (car/motorcycle)
- Performance statistics
- Route assignments

### Route
- Start and end points
- Waypoints with order information
- Distance and duration
- Courier assignment
- Status tracking

### Address
- Scanned and formatted addresses
- GPS coordinates
- Order numbers
- Geocoding metadata

## 🔌 API Endpoints

### Couriers
- `GET /api/couriers` - Get all couriers
- `POST /api/couriers` - Create courier
- `GET /api/couriers/:id` - Get courier details
- `PUT /api/couriers/:id` - Update courier
- `DELETE /api/couriers/:id` - Archive courier

### Routes
- `GET /api/routes` - Get all routes
- `POST /api/routes` - Create route
- `POST /api/routes/from-waypoints` - Create route from waypoints
- `PUT /api/routes/:id/complete` - Complete route
- `PUT /api/routes/:id/archive` - Archive route

### Upload
- `POST /api/upload/excel` - Upload Excel file
- `POST /api/upload/create-routes` - Create routes from orders
- `GET /api/upload/sample-template` - Download sample template
- `POST /api/upload/test-api-key` - Test Google Maps API key

### Analytics
- `GET /api/analytics/dashboard` - Get dashboard analytics
- `GET /api/analytics/courier-performance` - Get courier performance
- `GET /api/analytics/route-analytics` - Get route analytics

## 📊 Excel File Format

The application expects Excel files with the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| Courier Name | Name of the courier | Іван Петренко |
| Order Number | Unique order identifier | ORD-001 |
| Address | Delivery address | вул. Хрещатик, 15, Київ, Україна |

### Supported Column Names
- **Courier**: `Courier`, `Courier Name`, `Кур'єр`, `Имя курьера`
- **Order**: `Order`, `Order Number`, `Номер заказа`, `Номер замовлення`
- **Address**: `Address`, `Адрес`, `Адреса`, `Location`

## 🚀 Deployment

### Backend Deployment
1. Build the backend:
   ```bash
   cd backend
   npm run build
   ```

2. Set environment variables in production
3. Start the server:
   ```bash
   npm start
   ```

### Frontend Deployment
1. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Deploy the `dist` folder to your hosting service

## 🔒 Security Considerations

- API keys are stored securely in environment variables
- Rate limiting is implemented for API endpoints
- Input validation and sanitization
- CORS configuration for cross-origin requests
- Helmet.js for security headers

## 🧪 Testing

```bash
# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

## 📈 Performance

- MongoDB indexing for fast queries
- React Query for efficient data fetching
- Image optimization and lazy loading
- API response caching
- Rate limiting to prevent abuse

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review Google Maps API documentation

## 🔮 Future Enhancements

- [ ] Real-time route tracking
- [ ] Mobile app integration
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Offline mode
- [ ] Push notifications
- [ ] Integration with other mapping services
- [ ] Batch route optimization
- [ ] Custom route preferences
- [ ] Export to various formats

## 📞 Contact

Created by Maks Sun - [GitHub](https://github.com/yourusername)

---

**Note**: This application is based on the iOS app "Kill_metraj" and provides the same core functionality in a web-based format.
