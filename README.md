# Epilux API Server

A comprehensive Node.js/Express API server for the Epilux e-commerce platform with MongoDB integration, JWT authentication, and robust error handling.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Database Integration**: MongoDB with Mongoose ODM for data modeling
- **API Endpoints**: RESTful APIs for users, products, and orders
- **Validation**: Comprehensive input validation using express-validator
- **Error Handling**: Centralized error handling with custom error classes
- **Environment Configuration**: Flexible environment-based configuration
- **Logging**: Request logging and error tracking
- **Security**: CORS, rate limiting, and security best practices
- **Documentation**: Comprehensive API documentation and setup guides

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd epilux/server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment

```bash
# Run the environment setup script
npm run setup

# Or manually create .env file
cp .env.example .env
```

### 4. Configure Environment Variables

Edit the `.env` file with your configuration:

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/epilux

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

### 5. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# For macOS (using Homebrew)
brew services start mongodb-community

# For Ubuntu/Debian
sudo systemctl start mongod

# For Windows
net start MongoDB
```

## 🚀 Running the Server

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Smart Startup (Recommended)

```bash
npm run start:smart
```

This performs pre-startup checks and ensures everything is ready before starting the server.

## 📊 API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login user | No |
| POST | `/api/auth/logout` | Logout user | Yes |
| GET | `/api/auth/profile` | Get user profile | Yes |
| PUT | `/api/auth/profile` | Update user profile | Yes |
| PUT | `/api/auth/password` | Change password | Yes |

### Products

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/api/products` | Get all products (paginated) | No | - |
| GET | `/api/products/:id` | Get single product | No | - |
| POST | `/api/products` | Create new product | Yes | Admin |
| PUT | `/api/products/:id` | Update product | Yes | Admin |
| DELETE | `/api/products/:id` | Delete product | Yes | Admin |
| GET | `/api/products/categories/list` | Get product categories | No | - |
| GET | `/api/products/brands/list` | Get product brands | No | - |

### Orders

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/api/orders` | Get all orders (admin) | Yes | Admin |
| GET | `/api/orders/my-orders` | Get user orders | Yes | User |
| GET | `/api/orders/:id` | Get single order | Yes | User/Admin |
| POST | `/api/orders` | Create new order | Yes | User |
| PUT | `/api/orders/:id/status` | Update order status | Yes | Admin |
| PUT | `/api/orders/:id/payment-status` | Update payment status | Yes | Admin |
| GET | `/api/orders/stats/summary` | Get order statistics | Yes | Admin |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |

## 🔧 Configuration

### Environment Variables

See [SETUP.md](SETUP.md) for detailed configuration options.

### Configuration Validation

The server validates configuration on startup. To validate manually:

```bash
npm run config:validate
```

To check configuration status:

```bash
npm run config:status
```

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start server in production mode |
| `npm run dev` | Start server in development mode with nodemon |
| `npm run setup` | Set up environment files and directories |
| `npm run config:validate` | Validate configuration |
| `npm run config:status` | Show configuration status |
| `npm run logs:clear` | Clear log files |
| `npm run logs:view` | View logs in real-time |

## 🏗️ Project Structure

```text
server/
├── config/
│   ├── environment.js      # Environment configuration
│   └── validation.js       # Configuration validation
├── middleware/
│   ├── auth.js            # Authentication middleware
│   ├── errorHandler.js    # Error handling middleware
│   └── validation.js      # Input validation middleware
├── models/
│   ├── User.js            # User model
│   ├── Product.js         # Product model
│   └── Order.js           # Order model
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── products.js        # Product routes
│   └── orders.js          # Order routes
├── scripts/
│   ├── setup-env.js       # Environment setup script
│   └── start.js           # Smart startup script
├── uploads/               # File upload directory
├── logs/                  # Log files directory
├── index.js               # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (local)
├── .env.example           # Environment variables template
└── README.md              # This file
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs for secure password storage
- **Input Validation**: Comprehensive validation using express-validator
- **CORS Protection**: Configurable CORS settings
- **Rate Limiting**: Protection against brute force attacks
- **Error Handling**: Secure error responses without sensitive information
- **Environment Variables**: Secure configuration management

## 📊 Error Handling

The server implements comprehensive error handling:

- **Custom Error Classes**: Specific error types for different scenarios
- **Global Error Handler**: Centralized error processing
- **Development vs Production**: Different error responses for development and production
- **Request Logging**: Detailed logging of requests and errors
- **Graceful Shutdown**: Proper cleanup on server shutdown

## 🔄 Database Models

### User Model

```javascript
{
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  role: String, // 'user', 'admin'
  isActive: Boolean,
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Product Model

```javascript
{
  name: String,
  description: String,
  price: Number,
  category: String,
  brand: String,
  stock: Number,
  images: [String],
  isActive: Boolean,
  tags: [String],
  createdAt: Date,
  updatedAt: Date
}
```

### Order Model

```javascript
{
  orderNumber: String,
  userId: ObjectId,
  items: [{
    productId: ObjectId,
    quantity: Number,
    price: Number
  }],
  total: Number,
  status: String, // 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
  paymentStatus: String, // 'pending', 'paid', 'failed', 'refunded'
  shippingAddress: Object,
  billingAddress: Object,
  paymentMethod: String,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

## 🧪 Testing

### Running Tests

```bash
npm test
```

### Test Environment

The server supports a test environment with separate database and configuration:

```bash
# Use test environment
NODE_ENV=test npm test
```

## 🚀 Deployment

### Production Setup

1. **Environment Configuration**

   ```bash
   # Set production environment variables
   NODE_ENV=production
   MONGODB_URI=your-production-mongodb-uri
   JWT_SECRET=your-production-jwt-secret
   CORS_ORIGIN=your-frontend-domain
   ```

2. **Dependencies**

   ```bash
   npm install --production
   ```

3. **Start Server**

   ```bash
   npm start
   ```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

### PM2 Deployment

```bash
# Install PM2
npm install -g pm2

# Start server with PM2
pm2 start index.js --name "epilux-api"

# Save PM2 configuration
pm2 save
pm2 startup
```

## 📚 Documentation

- [API Documentation](docs/api.md) - Detailed API endpoint documentation
- [Setup Guide](SETUP.md) - Environment setup and configuration
- [Authentication Guide](docs/auth.md) - Authentication implementation details
- [Database Schema](docs/database.md) - Database models and relationships

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run tests and ensure they pass
6. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

If you encounter any issues:

1. Check the [troubleshooting section](SETUP.md#troubleshooting)
2. Review the [configuration validation](#configuration-validation)
3. Check the logs for detailed error messages
4. Ensure all prerequisites are met
5. Verify environment variables are correctly set

## 🔄 Changelog


### Version 1.0.0
- Initial release
- Complete authentication system
- Product and order management APIs
- Comprehensive error handling
- Environment configuration system
- Documentation and setup guides

---

**Note**: This is a backend API server. For the complete Epilux application, you'll also need to set up the frontend client application.
#   e p i l u x - b a c k e n d  
 