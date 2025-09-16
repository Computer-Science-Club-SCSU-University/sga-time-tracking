from django.conf import settings
from django.contrib.sessions.middleware import SessionMiddleware
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from django.core.exceptions import PermissionDenied
from django.middleware.csrf import CsrfViewMiddleware
from django.views.decorators.csrf import csrf_exempt
import re
from .models import AllowedIP
from .session import set_app_type


class AppSpecificSessionMiddleware(MiddlewareMixin):
    """
    Middleware that sets the app type for session isolation.
    This ensures that clock app sessions (shared devices) are isolated from hub app sessions (personal devices).
    """
    
    def process_request(self, request):
        # Determine which app is making the request
        app_type = self._detect_app_type(request)
        
        # Set app type in thread-local storage for session store to use
        set_app_type(app_type)
        
        # Store app type in request for other middleware/views to use
        request.app_type = app_type
        
        # Get the appropriate config and apply session cookie settings
        if app_type == 'clock':
            config = settings.CLOCK_APP_SESSION_CONFIG
        elif app_type == 'hub':
            config = settings.HUB_APP_SESSION_CONFIG
        else:
            config = settings.CLOCK_APP_SESSION_CONFIG  # Default to clock for security
        
        # Store config in request for response processing
        request.app_session_config = config
        
        # IMPORTANT: Set the correct session cookie name for Django to use
        cookie_name = config.get('SESSION_COOKIE_NAME', 'sessionid')
        
        # Temporarily override SESSION_COOKIE_NAME for this request
        request.session_cookie_name = cookie_name
        
        # If the app-specific cookie exists, make it available to Django's session middleware
        if cookie_name in request.COOKIES:
            # Store the original cookies
            original_cookies = request.COOKIES.copy()
            # Set the sessionid to the app-specific cookie value for Django to process
            request.COOKIES = request.COOKIES.copy()
            request.COOKIES['sessionid'] = request.COOKIES[cookie_name]
            # Store original for later restoration if needed
            request._original_cookies = original_cookies
    
    def process_response(self, request, response):
        """Apply app-specific session cookie settings to the response"""
        if hasattr(request, 'app_session_config'):
            config = request.app_session_config
            
            # Apply session cookie configuration to the response
            if hasattr(request, 'session') and request.session.session_key:
                # Get cookie settings from config
                cookie_name = config.get('SESSION_COOKIE_NAME', 'sessionid')
                cookie_age = config.get('SESSION_COOKIE_AGE', settings.SESSION_COOKIE_AGE)
                cookie_secure = config.get('SESSION_COOKIE_SECURE', settings.SESSION_COOKIE_SECURE)
                cookie_httponly = config.get('SESSION_COOKIE_HTTPONLY', True)  # Default to True for security
                cookie_samesite = config.get('SESSION_COOKIE_SAMESITE', settings.SESSION_COOKIE_SAMESITE)
                cookie_path = config.get('SESSION_COOKIE_PATH', '/')
                cookie_domain = config.get('SESSION_COOKIE_DOMAIN', None)
                
                # Set the session cookie with app-specific name and settings
                response.set_cookie(
                    cookie_name,
                    request.session.session_key,
                    max_age=cookie_age,
                    secure=cookie_secure,
                    httponly=cookie_httponly,
                    samesite=cookie_samesite,
                    path=cookie_path,
                    domain=cookie_domain
                )
                
                # Remove default Django session cookie to prevent cross-app cookie bleed
                if cookie_name != 'sessionid':
                    try:
                        response.delete_cookie('sessionid')
                    except Exception:
                        pass
        
        return response
    
    def _detect_app_type(self, request):
        """Detect which app is making the request"""
        origin = request.META.get('HTTP_ORIGIN', '')
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        app_type_header = request.META.get('HTTP_X_APP_TYPE', '').lower()
        
        if '/api/clock/' in request.path:
            return 'clock'
        elif '/api/hub/' in request.path or '/api/admin/' in request.path:
            return 'hub'
        # Fallback to header only if path is ambiguous
        return request.META.get('HTTP_X_APP_TYPE', 'clock').lower()


class IPRestrictionMiddleware(MiddlewareMixin):
    """
    Middleware that restricts access to the clock app based on allowed IP addresses.
    Only applies to clock app endpoints.
    """
    
    def process_request(self, request):
        # Only apply IP restriction to clock app endpoints
        if not self._is_clock_app_request(request):
            return None
        
        # Get client IP using the same method as IP check endpoint
        ip = self._get_client_ip(request)
        
        # Debug logging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"IP Restriction Check - Path: {request.path}")
        logger.info(f"IP Restriction Check - Detected IP: {ip}")
        logger.info(f"IP Restriction Check - REMOTE_ADDR: {request.META.get('REMOTE_ADDR')}")
        logger.info(f"IP Restriction Check - X-Forwarded-For: {request.META.get('HTTP_X_FORWARDED_FOR')}")
        logger.info(f"IP Restriction Check - Origin: {request.META.get('HTTP_ORIGIN')}")
        logger.info(f"IP Restriction Check - X-App-Type: {request.META.get('HTTP_X_APP_TYPE')}")
        
        # Check if IP is allowed for the clock app
        is_allowed = self._is_ip_allowed(ip)
        logger.info(f"IP Restriction Check - Is IP {ip} allowed: {is_allowed}")
        
        if not is_allowed:
            # List all allowed IPs for debugging
            from .models import AllowedIP
            allowed_ips = list(AllowedIP.objects.values_list('ip_address', flat=True))
            logger.warning(f"IP Restriction Check - Allowed IPs in database: {allowed_ips}")
            
            return JsonResponse({
                'error': 'Access denied',
                'message': f'Your IP address {ip} is not authorized to access the clock app. Contact admin to add this IP.',
                'debug_info': {
                    'detected_ip': ip,
                    'remote_addr': request.META.get('REMOTE_ADDR'),
                    'x_forwarded_for': request.META.get('HTTP_X_FORWARDED_FOR'),
                    'allowed_ips': allowed_ips
                }
            }, status=403)
        
        # Store IP in request for later use
        request.client_ip = ip
        return None
    
    def _is_clock_app_request(self, request):
        """Check if the request is from the clock app"""
        origin = request.META.get('HTTP_ORIGIN', '')
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        app_type_header = request.META.get('HTTP_X_APP_TYPE', '').lower()
        
        # First, explicitly check if this is a hub request - if so, no IP restrictions
        is_hub = (
            app_type_header == 'hub' or
            'localhost:3001' in origin or 
            '127.0.0.1:3001' in origin or
            'hub' in user_agent.lower()
        )
        
        if is_hub:
            return False  # Hub requests should not have IP restrictions
        
        # Check if request is from clock app (port 3000)
        is_clock = (
            app_type_header == 'clock' or
            'localhost:3000' in origin or 
            '127.0.0.1:3000' in origin or
            'clock' in user_agent.lower()
        )
        
        # Also check for specific clock API endpoints
        if not is_clock and request.path.startswith('/api/'):
            # Check if this is a clock-specific endpoint
            clock_endpoints = ['/api/clock/', '/api/ip-check/']
            is_clock = any(request.path.startswith(endpoint) for endpoint in clock_endpoints)
        
        return is_clock
    
    def _get_client_ip(self, request):
        """Get the real client IP address (same method as IP check endpoint)"""
        # Check for forwarded headers first (for proxy setups)
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # Take the first IP in the list
            return x_forwarded_for.split(',')[0].strip()
        
        # Fall back to REMOTE_ADDR
        return request.META.get('REMOTE_ADDR', '127.0.0.1')
    
    def _is_ip_allowed(self, ip):
        """Check if the IP is in the allowed list"""
        # Always allow localhost
        if ip in ['127.0.0.1', 'localhost', '::1']:
            return True
        
        # Check database for allowed IPs
        from .models import AllowedIP
        return AllowedIP.objects.filter(ip_address=ip).exists()


# SessionConfigMiddleware removed - no longer needed with custom session store


class CsrfExemptApiMiddleware(MiddlewareMixin):
    """
    Middleware to selectively apply CSRF protection based on request type.
    Safe methods (GET, HEAD, OPTIONS) don't need CSRF.
    API endpoints are exempt from CSRF but protected by origin validation.
    """
    
    def process_request(self, request):
        # Exempt all API endpoints from CSRF checks
        # Security is handled by origin validation in CsrfViewMiddlewareExempt
        if request.path.startswith('/api/'):
            request._dont_enforce_csrf_checks = True


class CsrfViewMiddlewareExempt(CsrfViewMiddleware):
    """
    Enhanced CSRF middleware with additional security checks for API endpoints.
    """
    
    def process_view(self, request, callback, callback_args, callback_kwargs):
        # For API endpoints, perform origin validation but be more permissive
        if request.path.startswith('/api/'):
            # Check Origin or Referer header for unsafe methods
            if request.method not in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
                origin = request.META.get('HTTP_ORIGIN', '')
                referer = request.META.get('HTTP_REFERER', '')
                
                # Get allowed origins from settings
                from django.conf import settings
                allowed_origins = getattr(settings, 'CORS_ALLOWED_ORIGINS', [])
                
                # Also allow requests with no origin/referer (for testing, Postman, etc.)
                # or from localhost/127.0.0.1 during development
                if origin:
                    # Check if origin is allowed
                    if origin not in allowed_origins:
                        # Also check for localhost variants during development
                        if settings.DEBUG:
                            # In debug mode, allow any localhost origin
                            from urllib.parse import urlparse
                            parsed = urlparse(origin)
                            if parsed.hostname not in ['localhost', '127.0.0.1', '::1']:
                                from django.http import JsonResponse
                                return JsonResponse(
                                    {'error': 'Invalid origin for request', 'origin': origin},
                                    status=403
                                )
                        else:
                            from django.http import JsonResponse
                            return JsonResponse(
                                {'error': 'Invalid origin for request'},
                                status=403
                            )
                elif referer:
                    # Extract origin from referer
                    from urllib.parse import urlparse
                    referer_origin = f"{urlparse(referer).scheme}://{urlparse(referer).netloc}"
                    if referer_origin not in allowed_origins:
                        # Check for localhost in debug mode
                        if settings.DEBUG:
                            parsed = urlparse(referer)
                            if parsed.hostname not in ['localhost', '127.0.0.1', '::1']:
                                from django.http import JsonResponse
                                return JsonResponse(
                                    {'error': 'Invalid referer for request', 'referer': referer},
                                    status=403
                                )
                        else:
                            from django.http import JsonResponse
                            return JsonResponse(
                                {'error': 'Invalid referer for request'},
                                status=403
                            )
                # If no origin or referer, allow the request (for tools like Postman, curl, etc.)
            
            # API endpoints are already exempted from CSRF by CsrfExemptApiMiddleware
            return None
        
        # For non-API endpoints, use standard CSRF protection
        return super().process_view(request, callback, callback_args, callback_kwargs)