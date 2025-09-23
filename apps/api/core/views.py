from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Q, Count, Sum
from django.http import HttpResponse
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.models import User as AuthUser
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
import csv
from datetime import datetime, timedelta

from .models import User, TimeLog, AllowedIP, Committee, UserCommittee
from .serializers import (
    UserSerializer, UserCreateSerializer, TimeLogSerializer,
    ClockInSerializer, ClockOutSerializer, TimeLogExportSerializer,
    LoginRequestSerializer, LoginResponseSerializer, AllowedIPSerializer,
    CommitteeSerializer, CommitteeCreateSerializer, CommitteeUpdateSerializer
)
from .permissions import IsMember, IsChair, IsAdmin, IsOwnerOrChair, IsTeamMemberOrChair


class LoginView(APIView):
    """Handle user login using access code with session authentication"""
    permission_classes = [permissions.AllowAny]  # Public for login
    
    def _detect_app_type(self, request):
        """Detect which app is making the request"""
        origin = request.META.get('HTTP_ORIGIN', '')
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        app_type_header = request.META.get('HTTP_X_APP_TYPE', '').lower()
        
        # Check if request is from clock app (port 3000) or hub app (port 3001)
        if app_type_header == 'clock' or 'localhost:3000' in origin or '127.0.0.1:3000' in origin or 'clock' in user_agent.lower():
            return 'clock'
        elif app_type_header == 'hub' or 'localhost:3001' in origin or '127.0.0.1:3001' in origin or 'hub' in user_agent.lower():
            return 'hub'
        else:
            # Default to clock app for security
            return 'clock'
    
    def post(self, request):
        # Detect app type for session configuration
        app_type = self._detect_app_type(request)
        
        serializer = LoginRequestSerializer(data=request.data)
        if serializer.is_valid():
            access_code = serializer.validated_data['access_code']
            
            # CRITICAL FIX: Always validate the provided access code
            # Check if this access code belongs to a different user than currently authenticated
            if request.user.is_authenticated:
                # Check if the provided access code is different from the current user
                current_access_code = request.user.username if hasattr(request.user, 'username') else None
                
                if current_access_code != access_code:
                    # Different user trying to log in - must log out current user first
                    logout(request)
                    # Clear the session completely
                    if hasattr(request, 'session'):
                        request.session.flush()
                else:
                    # Same user logging in again - return their data
                    try:
                        custom_user = User.objects.get(access_code=access_code)
                        return Response({
                            'user_id': custom_user.id,
                            'access_code': custom_user.access_code,
                            'full_name': custom_user.full_name,
                            'role': custom_user.role,
                            'app_type': app_type,
                            'target_hours_per_week': custom_user.target_hours_per_week
                        }, status=status.HTTP_200_OK)
                    except User.DoesNotExist:
                        # User doesn't exist anymore, proceed with fresh login
                        logout(request)
                        if hasattr(request, 'session'):
                            request.session.flush()
            
            # Authenticate user using custom backend
            auth_user = authenticate(request, access_code=access_code)
            
            if auth_user is not None:
                # Log the user in
                login(request, auth_user)
                
                # Get the custom user data
                custom_user = User.objects.get(access_code=access_code)
                
                # Prepare response data
                response_data = {
                    'user_id': custom_user.id,
                    'access_code': custom_user.access_code,
                    'full_name': custom_user.full_name,
                    'role': custom_user.role,
                    'app_type': app_type,  # Include app type in response
                    'target_hours_per_week': custom_user.target_hours_per_week
                }
                
                return Response(response_data, status=status.HTTP_200_OK)
            else:
                return Response(
                    {
                        'error': 'Invalid access code',
                        'details': f'No user found with access code: {access_code}'
                    }, 
                    status=status.HTTP_401_UNAUTHORIZED
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    """Handle user logout"""
    permission_classes = [permissions.AllowAny]  # Public for logout
    
    def post(self, request):
        # Clear the session data explicitly FIRST
        if hasattr(request, 'session'):
            try:
                request.session.flush()  # This both deletes the session and creates a new empty one
            except Exception as e:
                print(f"Error flushing session: {e}")
        
        # Then use Django's logout to clear auth
        logout(request)
        
        # Create response
        response = Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)
        
        # Delete all possible session cookies with various path combinations
        cookie_names = ['hub_sessionid', 'clock_sessionid', 'sessionid']
        paths = ['/api/', '/', '/api', '']  # Try all possible paths
        
        for cookie_name in cookie_names:
            for path in paths:
                try:
                    response.delete_cookie(cookie_name, path=path)
                except Exception:
                    pass  # Ignore errors when deleting non-existent cookies
        
        return response


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('full_name')
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]  # Only admins can manage users
    pagination_class = None


class TimeLogViewSet(viewsets.ModelViewSet):
    queryset = TimeLog.objects.all()
    serializer_class = TimeLogSerializer
    permission_classes = [IsOwnerOrChair]  # Users can only see their own logs, chairs can see all

    def get_queryset(self):
        """Filter by authenticated user from session"""
        queryset = TimeLog.objects.all()
        
        # Get the authenticated user from session
        if self.request.user.is_authenticated:
            # Find our custom user by the auth user's username (which is the access_code)
            try:
                custom_user = User.objects.get(access_code=self.request.user.username)
                queryset = queryset.filter(user=custom_user)
            except User.DoesNotExist:
                # If custom user doesn't exist, return empty queryset
                return TimeLog.objects.none()
        else:
            # If user not authenticated, return empty queryset
            return TimeLog.objects.none()
        
        # Order by most recent first
        return queryset.order_by('-clock_in')

    @action(detail=False, methods=['post'])
    def clock_in(self, request):
        """Clock in the authenticated user"""
        # Get the authenticated user from session
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            custom_user = User.objects.get(access_code=request.user.username)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user is already clocked in
        active_log = TimeLog.objects.filter(
            user=custom_user,
            clock_out__isnull=True
        ).first()
        
        if active_log:
            return Response(
                {'error': 'User is already clocked in'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create new time log
        time_log = TimeLog.objects.create(
            user=custom_user,
            clock_in=timezone.now()
        )
        
        return Response(
            TimeLogSerializer(time_log).data, 
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['post'])
    def clock_out(self, request):
        """Clock out the authenticated user"""
        # Get the authenticated user from session
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            custom_user = User.objects.get(access_code=request.user.username)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Find active time log
        active_log = TimeLog.objects.filter(
            user=custom_user,
            clock_out__isnull=True
        ).first()
        
        if not active_log:
            return Response(
                {'error': 'No active clock-in session found'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Clock out
        active_log.clock_out = timezone.now()
        active_log.save()
        
        return Response(
            TimeLogSerializer(active_log).data, 
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['get'])
    def current_status(self, request):
        """Get current clock status for authenticated user"""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            custom_user = User.objects.get(access_code=request.user.username)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get current active session
        active_log = TimeLog.objects.filter(
            user=custom_user,
            clock_out__isnull=True
        ).first()
        
        return Response({
            'is_clocked_in': active_log is not None,
            'current_session': TimeLogSerializer(active_log).data if active_log else None
        })

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        """Export time logs as CSV"""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            custom_user = User.objects.get(access_code=request.user.username)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get date range from query params
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        
        queryset = TimeLog.objects.filter(user=custom_user)
        
        if start_date:
            queryset = queryset.filter(clock_in__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(clock_in__date__lte=end_date)
        
        # Create CSV response
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="time_logs_{custom_user.access_code}.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Date', 'Clock In', 'Clock Out', 'Duration (hours)'])
        
        for log in queryset.order_by('-clock_in'):
            duration = log.duration.total_seconds() / 3600 if log.duration else None
            writer.writerow([
                log.clock_in.strftime('%Y-%m-%d'),
                log.clock_in.strftime('%H:%M:%S'),
                log.clock_out.strftime('%H:%M:%S') if log.clock_out else '',
                f'{duration:.2f}' if duration else ''
            ])
        
        return response


class MeView(APIView):
    """Get current authenticated user information"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        try:
            custom_user = User.objects.get(access_code=request.user.username)
            return Response({
                'user_id': custom_user.id,
                'access_code': custom_user.access_code,
                'full_name': custom_user.full_name,
                'role': custom_user.role
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )


class TeamViewSet(viewsets.ViewSet):
    """Team management endpoints for chairs and admins"""
    permission_classes = [IsChair]
    
    def list(self, request):
        """Get team members based on user role and committee filter"""
        try:
            custom_user = User.objects.get(access_code=request.user.username)
            committee_id = request.GET.get('committee_id')
            
            # Role-based team member filtering
            if custom_user.role == 'admin':
                # Admins can see all users
                if committee_id:
                    # Filter by specific committee if requested
                                            team_members = User.objects.filter(
                            usercommittee__committee_id=committee_id
                        ).exclude(id=custom_user.id).distinct().order_by('full_name')
                else:
                    # All users except the requesting user
                    team_members = User.objects.exclude(id=custom_user.id).order_by('full_name')
                    
            elif custom_user.role == 'chair':
                if committee_id:
                    # Specific committee requested - check if user chairs it
                    try:
                        committee = Committee.objects.get(id=committee_id, chair=custom_user)
                        team_members = User.objects.filter(
                            usercommittee__committee=committee
                        ).exclude(id=custom_user.id).distinct().order_by('full_name')
                    except Committee.DoesNotExist:
                        return Response(
                            {'error': 'Committee not found or access denied'}, 
                            status=status.HTTP_403_FORBIDDEN
                        )
                else:
                    # No specific committee - show all members from committees they chair
                    chaired_committees = Committee.objects.filter(chair=custom_user)
                    team_members = User.objects.filter(
                        usercommittee__committee__in=chaired_committees
                    ).exclude(id=custom_user.id).distinct().order_by('full_name')
            else:
                # Members don't have team access
                return Response(
                    {'error': 'Insufficient permissions'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Add time tracking statistics for each member
            team_data = []
            for member in team_members:
                try:
                    # Get this week's hours (including ongoing sessions)
                    week_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
                    week_start = week_start - timedelta(days=week_start.weekday())
                    now = timezone.now()
                    
                    # Calculate total hours for the week
                    weekly_hours = 0
                    
                    # Get all time logs for this user that overlap with the current week
                    time_logs = TimeLog.objects.filter(user=member)
                    
                    for log in time_logs:
                        # Check if this log overlaps with the current week
                        clock_in = log.clock_in
                        clock_out = log.clock_out if log.clock_out else now
                        
                        # If session overlaps with the week, include it
                        if clock_in <= week_start + timedelta(days=7) and clock_out >= week_start:
                            # Calculate the overlap with the week
                            overlap_start = max(clock_in, week_start)
                            overlap_end = min(clock_out, week_start + timedelta(days=7))
                            duration = overlap_end - overlap_start
                            weekly_hours += duration.total_seconds() / 3600
                    
                    team_data.append({
                        'id': str(member.id),  # Convert to string to match frontend expectations
                        'name': member.full_name,
                        'role': member.role,
                        'target_hours_per_week': member.target_hours_per_week,
                        'access_code': member.access_code,
                        'totalHoursThisWeek': round(weekly_hours, 2)
                    })
                except Exception as e:
                    # Log the error but continue with other members
                    team_data.append({
                        'id': str(member.id),
                        'name': member.full_name,
                        'role': member.role,
                        'target_hours_per_week': member.target_hours_per_week,
                        'access_code': member.access_code,
                        'totalHoursThisWeek': 0
                    })
            
            return Response(team_data)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': 'Internal server error'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def member_timesheet(self, request, pk=None):
        """Get timesheet for a specific team member"""
        try:
            member = User.objects.get(id=pk)
            custom_user = User.objects.get(access_code=request.user.username)
            
            # Check if user has permission to view this member's data
            if custom_user.role == 'member' and custom_user.id != member.id:
                return Response(
                    {'error': 'Permission denied'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Get time logs for the member
            time_logs = TimeLog.objects.filter(user=member).order_by('-clock_in')
            
            return Response(TimeLogSerializer(time_logs, many=True).data)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )


class AdminViewSet(viewsets.ViewSet):
    """Admin-only endpoints"""
    permission_classes = [IsAdmin]
    
    def list(self, request):
        """Get system statistics for admin dashboard"""
        try:
            # Get basic statistics
            total_users = User.objects.count()
            total_logs = TimeLog.objects.count()
            active_sessions = TimeLog.objects.filter(clock_out__isnull=True).count()
            
            # Get role distribution
            role_stats = User.objects.values('role').annotate(count=Count('id'))
            
            # Get recent activity
            recent_logs = TimeLog.objects.select_related('user').order_by('-clock_in')[:10]
            
            return Response({
                'total_users': total_users,
                'total_logs': total_logs,
                'active_sessions': active_sessions,
                'role_distribution': list(role_stats),
                'recent_activity': TimeLogSerializer(recent_logs, many=True).data
            })
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def create_user(self, request):
        """Create a new user (admin only) - access_code is auto-generated by database"""
        serializer = UserCreateSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Return the full user data including the auto-generated access_code
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['delete'])
    def delete_user(self, request, pk=None):
        """Delete a user (admin only)"""
        try:
            user = User.objects.get(id=pk)
            user.delete()
            return Response({'message': 'User deleted successfully'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['patch'])
    def update_user_role(self, request, pk=None):
        """Update user role (admin only)"""
        try:
            user = User.objects.get(id=pk)
            new_role = request.data.get('role')
            
            if new_role not in ['member', 'chair', 'admin']:
                return Response(
                    {'error': 'Invalid role'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            user.role = new_role
            user.save()
            
            return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def regenerate_access_code(self, request, pk=None):
        """Regenerate access code for a user (admin only)"""
        try:
            user = User.objects.get(id=pk)
            old_access_code = user.access_code
            
            # Generate new unique access code
            import random
            while True:
                new_access_code = str(random.randint(100000, 999999))
                if not User.objects.filter(access_code=new_access_code).exists():
                    break
            
            user.access_code = new_access_code
            user.save()
            
            return Response({
                'message': 'Access code regenerated successfully',
                'user': UserSerializer(user).data,
                'old_access_code': old_access_code,
                'new_access_code': new_access_code
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )


class ChairViewSet(viewsets.ViewSet):
    """Chair-specific endpoints"""
    permission_classes = [IsChair]
    
    @action(detail=False, methods=['get'])
    def my_committees(self, request):
        """Get committees that the current user chairs"""
        try:
            custom_user = User.objects.get(access_code=request.user.username)
            
            # Get committees chaired by this user
            chaired_committees = Committee.objects.filter(chair=custom_user).order_by('name')
            serializer = CommitteeSerializer(chaired_committees, many=True)
            
            return Response(serializer.data)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def team_summary(self, request):
        """Get team summary for chairs"""
        try:
            custom_user = User.objects.get(access_code=request.user.username)
            
            # Get all team members
            team_members = User.objects.exclude(id=custom_user.id).order_by('full_name')
            
            # Calculate team statistics
            week_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = week_start - timedelta(days=week_start.weekday())
            
            team_stats = []
            for member in team_members:
                # Get this week's hours (including ongoing sessions)
                now = timezone.now()
                
                # Calculate total hours for the week
                weekly_hours = 0
                
                # Get all time logs for this user that overlap with the current week
                time_logs = TimeLog.objects.filter(user=member)
                
                for log in time_logs:
                    # Check if this log overlaps with the current week
                    clock_in = log.clock_in
                    clock_out = log.clock_out if log.clock_out else now
                    
                    # If session overlaps with the week, include it
                    if clock_in <= week_start + timedelta(days=7) and clock_out >= week_start:
                        # Calculate the overlap with the week
                        overlap_start = max(clock_in, week_start)
                        overlap_end = min(clock_out, week_start + timedelta(days=7))
                        duration = overlap_end - overlap_start
                        weekly_hours += duration.total_seconds() / 3600
                
                # Get active sessions
                active_sessions = TimeLog.objects.filter(
                    user=member,
                    clock_out__isnull=True
                ).count()
                
                team_stats.append({
                    'id': str(member.id),  # Convert to string to match frontend expectations
                    'name': member.full_name,
                    'role': member.role,
                    'target_hours_per_week': member.target_hours_per_week,
                    'weeklyHours': round(weekly_hours, 2),
                    'activeSessions': active_sessions,
                    'isOnline': active_sessions > 0
                })
            
            # Calculate team totals
            total_team_hours = sum(stat['weeklyHours'] for stat in team_stats)
            total_active_sessions = sum(stat['activeSessions'] for stat in team_stats)
            
            return Response({
                'team_members': team_stats,
                'total_team_hours': total_team_hours,
                'total_active_sessions': total_active_sessions,
                'online_members': len([s for s in team_stats if s['isOnline']])
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )


class AllowedIPViewSet(viewsets.ModelViewSet):
    """Allowed IP management endpoints"""
    queryset = AllowedIP.objects.all().order_by('label', 'ip_address')
    serializer_class = AllowedIPSerializer
    permission_classes = [IsAdmin]
    
    def perform_create(self, serializer):
        """Set the created_by field to the current user"""
        serializer.save(created_by=self._get_custom_user())
    
    def _get_custom_user(self):
        """Get the custom user from the authenticated session user"""
        try:
            return User.objects.get(access_code=self.request.user.username)
        except User.DoesNotExist:
            return None


class IpCheckView(APIView):
    """Check if the current IP is allowed to access the clock app"""
    permission_classes = [permissions.AllowAny]  # Public endpoint
    
    def _get_client_ip(self, request):
        """Get the real client IP address"""
        # Check for forwarded headers first (for proxy setups)
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # Take the first IP in the list
            return x_forwarded_for.split(',')[0].strip()
        
        # Fall back to REMOTE_ADDR
        return request.META.get('REMOTE_ADDR', '127.0.0.1')
    
    def _is_clock_app_request(self, request):
        """Check if request is from clock app"""
        origin = request.META.get('HTTP_ORIGIN', '')
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        app_type_header = request.META.get('HTTP_X_APP_TYPE', '').lower()
        
        return (
            app_type_header == 'clock' or
            'localhost:3001' in origin or 
            '127.0.0.1:3001' in origin or
            'clock' in user_agent.lower()
        )
    
    def get(self, request):
        """Check IP access for clock app"""
        client_ip = self._get_client_ip(request)
        is_clock_app = self._is_clock_app_request(request)
        
        # If not a clock app request, always allow
        if not is_clock_app:
            return Response({
                'allowed': True,
                'ip_address': client_ip,
                'message': 'Not a clock app request'
            })
        
        # Check if IP is in allowed list
        try:
            is_allowed = AllowedIP.objects.filter(ip_address=client_ip).exists()
            
            if is_allowed:
                return Response({
                    'allowed': True,
                    'ip_address': client_ip,
                    'message': 'IP address is authorized'
                })
            else:
                return Response({
                    'allowed': False,
                    'ip_address': client_ip,
                    'message': f'IP address {client_ip} is not authorized to access the clock app. Please contact an administrator.'
                }, status=status.HTTP_403_FORBIDDEN)
                
        except Exception as e:
            # If there's any error checking the database, deny access for security
            return Response({
                'allowed': False,
                'ip_address': client_ip,
                'message': 'Error checking IP authorization. Access denied for security.'
            }, status=status.HTTP_403_FORBIDDEN)


class CommitteeViewSet(viewsets.ModelViewSet):
    """Committee management endpoints"""
    queryset = Committee.objects.all().order_by('name')
    serializer_class = CommitteeSerializer
    permission_classes = [IsAdmin]  # Only admins can manage committees
    pagination_class = None
    
    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'create':
            return CommitteeCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return CommitteeUpdateSerializer
        return CommitteeSerializer
    
    def list(self, request):
        """List all committees with member information"""
        committees = Committee.objects.all().order_by('name')
        serializer = CommitteeSerializer(committees, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new committee"""
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            committee = serializer.save()
            
            # Update chair's role to 'chair' if they were a member
            if committee.chair and committee.chair.role == 'member':
                committee.chair.role = 'chair'
                committee.chair.save()
            
            # Add chair to committee members if not already there
            if committee.chair:
                UserCommittee.objects.get_or_create(user=committee.chair, committee=committee)
            
            # Add additional members if provided
            member_ids = request.data.get('members', [])
            for member_id in member_ids:
                try:
                    user = User.objects.get(id=member_id)
                    UserCommittee.objects.get_or_create(user=user, committee=committee)
                except User.DoesNotExist:
                    continue
            
            # Return the full committee data
            return Response(CommitteeSerializer(committee).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        """Update a committee"""
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            old_chair = instance.chair
            
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            if serializer.is_valid():
                committee = serializer.save()
                new_chair = committee.chair
                
                # Handle chair changes
                if old_chair != new_chair:
                    # Handle old chair
                    if old_chair:
                        # Check if old chair has other committees they chair
                        other_committees = Committee.objects.filter(chair=old_chair).exclude(id=committee.id)
                        if not other_committees.exists() and old_chair.role != 'admin':
                            old_chair.role = 'member'
                            old_chair.save()
                        elif old_chair.role == 'admin':
                            pass
                        else:
                            pass
                        
                        # Ensure old chair remains in committee as a member
                        UserCommittee.objects.get_or_create(user=old_chair, committee=committee)
                    
                    # Handle new chair
                    if new_chair:
                        # Update new chair's role if they were a member (but not if they're admin)
                        if new_chair.role == 'member':
                            new_chair.role = 'chair'
                            new_chair.save()
                        
                        # Add new chair to committee members if not already there
                        UserCommittee.objects.get_or_create(user=new_chair, committee=committee)
                
                # Handle member updates if provided
                if 'members' in request.data:
                    member_ids = request.data.get('members', [])
                    # Remove all current members except chair
                    UserCommittee.objects.filter(committee=committee).exclude(user=committee.chair).delete()
                    # Add new members
                    for member_id in member_ids:
                        try:
                            user = User.objects.get(id=member_id)
                            UserCommittee.objects.get_or_create(user=user, committee=committee)
                        except User.DoesNotExist:
                            continue
                
                # Return the full committee data
                return Response(CommitteeSerializer(committee).data)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'Failed to update committee: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def add_members(self, request, pk=None):
        """Add members to a committee"""
        try:
            committee = Committee.objects.get(id=pk)
            member_ids = request.data.get('member_ids', [])
            
            # Add members to committee
            for member_id in member_ids:
                try:
                    user = User.objects.get(id=member_id)
                    UserCommittee.objects.get_or_create(user=user, committee=committee)
                except User.DoesNotExist:
                    continue
            
            return Response(CommitteeSerializer(committee).data)
        except Committee.DoesNotExist:
            return Response(
                {'error': 'Committee not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def remove_members(self, request, pk=None):
        """Remove members from a committee"""
        try:
            committee = Committee.objects.get(id=pk)
            member_ids = request.data.get('member_ids', [])
            
            # Remove members from committee
            UserCommittee.objects.filter(
                committee=committee,
                user_id__in=member_ids
            ).delete()
            
            return Response(CommitteeSerializer(committee).data)
        except Committee.DoesNotExist:
            return Response(
                {'error': 'Committee not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
    
    def destroy(self, request, *args, **kwargs):
        """Delete a committee and handle chair role downgrade"""
        try:
            committee = self.get_object()
            chair = committee.chair
            
            # Before deleting, check if chair needs to be downgraded
            if chair:
                # Check if chair has other committees they chair (excluding this one)
                other_committees = Committee.objects.filter(chair=chair).exclude(id=committee.id)
                
                if not other_committees.exists() and chair.role != 'admin':
                    chair.role = 'member'
                    chair.save()
                elif chair.role == 'admin':
                    pass
                else:
                    pass
            
            # Now perform the actual deletion
            return super().destroy(request, *args, **kwargs)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to delete committee: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            ) 