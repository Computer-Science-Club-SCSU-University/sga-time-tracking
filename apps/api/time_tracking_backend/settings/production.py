"""
Production Django settings for time_tracking_backend project.
"""

import os
import dj_database_url
from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_REDIRECT_EXEMPT = [r"^health/?$"]

# Allowed hosts - Railway and custom domains
ALLOWED_HOSTS = []

# Parse ALLOWED_HOSTS from environment variable
allowed_hosts_env = os.getenv('DJANGO_ALLOWED_HOSTS', '')
if allowed_hosts_env:
    ALLOWED_HOSTS = [host.strip() for host in allowed_hosts_env.split(',') if host.strip()]

# Railway provides these automatically
railway_domain = os.getenv('RAILWAY_PUBLIC_DOMAIN')
if railway_domain:
    ALLOWED_HOSTS.append(railway_domain)

# Railway health check domain
ALLOWED_HOSTS.append('healthcheck.railway.app')

# Fallback if no hosts specified
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ['*']  # Not recommended, but prevents deployment failures

# Database - Railway PostgreSQL
# Railway provides DATABASE_URL automatically
DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv('DATABASE_URL'),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# If DATABASE_URL is not available, fall back to individual env vars
if not DATABASES['default']:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'sga_time_tracking'),
            'USER': os.getenv('DB_USER', 'postgres'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }

# Static files - Whitenoise configuration
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

# Whitenoise settings
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
WHITENOISE_USE_FINDERS = True
WHITENOISE_AUTOREFRESH = False

# Production CORS settings
CORS_ALLOWED_ORIGINS = []

# Debug logging for CORS configuration
import logging
logger = logging.getLogger(__name__)

# Parse production frontend URLs from environment
frontend_urls_env = os.getenv('CORS_ALLOWED_ORIGINS', '')
if frontend_urls_env:
    CORS_ALLOWED_ORIGINS = [url.strip() for url in frontend_urls_env.split(',') if url.strip()]

# Fallback: If no CORS origins are configured, allow the known Railway domains
if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = [
        'https://clock-kiosk-production.up.railway.app',
        'https://members-hub-production.up.railway.app'
    ]
    logger.warning(f"No CORS origins found in env vars, using fallback: {CORS_ALLOWED_ORIGINS}")
else:
    logger.info(f"Using CORS origins from environment: {CORS_ALLOWED_ORIGINS}")

# Session security for production
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = int(os.getenv('SESSION_COOKIE_AGE', '3600'))  # 1 hour
SESSION_EXPIRE_AT_BROWSER_CLOSE = os.getenv('SESSION_EXPIRE_AT_BROWSER_CLOSE', 'True').lower() == 'true'

# Update app-specific session configs for production
CLOCK_APP_SESSION_CONFIG.update({
    'SESSION_COOKIE_SECURE': True,
})

HUB_APP_SESSION_CONFIG.update({
    'SESSION_COOKIE_SECURE': True,
})

# Security settings for production
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Force HTTPS in production
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() == 'true'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Logging configuration for production
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'core': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Cache configuration (optional - for better performance)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
    }
}

# Email configuration (if needed for notifications)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'  # Change to SMTP in production if needed
