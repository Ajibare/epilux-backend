# Environment Setup Guide

## Overview

This guide will help you set up the environment configuration for the Epilux API server.

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Environment Variables

The application uses environment variables for configuration. Create a `.env` file in the root directory of the server folder.

### Required Environment Variables

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

### Optional Environment Variables

```bash
# Email Configuration (for future email services)
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# File Upload Configuration
MAX_FILE_SIZE=5242880  # 5MB in bytes
UPLOAD_PATH=uploads/

# Payment Configuration (for future payment integration)
PAYSTACK_PUBLIC_KEY=your-paystack-public-key
PAYSTACK_SECRET_KEY=your-paystack-secret-key

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=100

# Pagination Defaults
DEFAULT_PAGE_LIMIT=10
MAX_PAGE_LIMIT=100

# Cache Configuration
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600  # 1 hour in seconds
```

## Environment Files

### 1. `.env` (Local Development)

Create this file for your local development environment:

```bash
# Copy this template and fill in your values
cp .env.example .env
```

### 2. `.env.production` (Production)

For production deployment, create a production-specific environment file:

```bash
# Production Configuration
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://your-production-db:27017/epilux
JWT_SECRET=your-production-jwt-secret-key
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d
CORS_ORIGIN=https://your-frontend-domain.com
```

### 3. `.env.test` (Testing)

For testing environment:

```bash
# Test Configuration
NODE_ENV=test
PORT=5001
MONGODB_URI=mongodb://localhost:27017/epilux_test
JWT_SECRET=test-jwt-secret-key
JWT_EXPIRE=1h
CORS_ORIGIN=http://localhost:3000
```

## Configuration Validation

The application validates environment variables on startup. If required variables are missing or invalid, the application will not start.

### Validation Rules

- **PORT**: Must be between 1 and 65535
- **MONGODB_URI**: Must be a valid MongoDB connection string
- **JWT_SECRET**: Must be at least 32 characters long
- **JWT_EXPIRE**: Must be in format like "7d", "1h", "30m", etc.
- **CORS_ORIGIN**: Must be a valid URL starting with http
- **MAX_FILE_SIZE**: Must be between 1KB and 50MB
- **RATE_LIMIT_WINDOW_MS**: Must be between 1 second and 1 hour
- **RATE_LIMIT_MAX_REQUESTS**: Must be between 1 and 10000
- **DEFAULT_PAGE_LIMIT**: Must be between 1 and 100
- **MAX_PAGE_LIMIT**: Must be greater than DEFAULT_PAGE_LIMIT and less than 1000
- **CACHE_TTL**: Must be between 60 seconds and 24 hours

## Security Considerations

### JWT Secret

- Use a strong, randomly generated secret key
- Minimum 32 characters recommended
- Use different secrets for development and production
- Rotate secrets periodically in production

### Database URI

- Never commit database credentials to version control
- Use environment-specific databases (development, test, production)
- Consider using MongoDB Atlas for production deployments

### Email and Payment Keys

- Store sensitive keys securely
- Use environment-specific keys
- Regularly rotate API keys

## Development vs Production

### Development

- Uses default values for most configurations
- Logs configuration status on startup
- Less strict validation rules
- Development-specific CORS settings

### Production

- Requires all mandatory environment variables
- Stricter validation rules
- Production-specific security settings
- Enhanced logging and monitoring

## Testing Configuration

To test your configuration:

```bash
# Start the server
npm start

# Or in development mode
npm run dev

# Check configuration status
curl http://localhost:5000/health
```

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check if MongoDB is running
   - Verify MONGODB_URI is correct
   - Ensure MongoDB credentials are valid

2. **JWT Secret Too Short**
   - Generate a longer secret key (minimum 32 characters)
   - Use: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

3. **CORS Issues**
   - Verify CORS_ORIGIN matches your frontend URL
   - Check if frontend is running on the specified port

4. **Port Already in Use**
   - Change PORT in .env file
   - Or stop the process using the port

### Debug Mode

Set `LOG_LEVEL=debug` in your `.env` file for detailed logging:

```bash
LOG_LEVEL=debug
```

## Deployment

### Docker Environment

For Docker deployment, use environment variables in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=5000
  - MONGODB_URI=mongodb://mongodb:27017/epilux
  - JWT_SECRET=${JWT_SECRET}
```

### Cloud Deployment

For cloud platforms (AWS, Heroku, etc.), use the platform's environment variable management:

```bash
# Heroku example
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-key
heroku config:set MONGODB_URI=your-mongodb-uri
```

## Best Practices

1. **Never commit .env files to version control**
2. **Use different environments for development, testing, and production**
3. **Regularly rotate secrets and API keys**
4. **Monitor configuration changes**
5. **Document environment-specific configurations**
6. **Use configuration validation in all environments**
7. **Implement proper logging for configuration issues**

## Support

If you encounter any configuration issues:

1. Check the validation errors on server startup
2. Review the SETUP.md documentation
3. Ensure all required environment variables are set
4. Verify the format of environment variables
5. Check the logs for detailed error messages
