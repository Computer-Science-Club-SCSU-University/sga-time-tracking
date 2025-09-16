// Environment configuration
export const config = {
  // API Configuration
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
    timeout: 10000, // 10 seconds
  },
  
  // App Configuration
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Time Tracker',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  },
  
  // Feature Flags
  features: {
    analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    debugMode: process.env.NEXT_PUBLIC_ENABLE_DEBUG_MODE === 'true',
  },
  
  // Development
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
}; 