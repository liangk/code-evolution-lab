import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, tap, map, catchError, throwError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'tuner' | 'admin';
  emailVerified: boolean;
  profileId?: string;
  phone?: string;
  customerProfile?: any;
  tunerProfile?: any;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
  message?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role: 'customer' | 'tuner';
  captchaToken?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = `${environment.apiUrl || 'http://localhost:3000'}/auth`;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  public isAuthenticated = signal(false);
  public isCustomer = signal(false);
  public isTuner = signal(false);
  public isAdmin = signal(false);

  private authInitializedSubject = new BehaviorSubject<boolean>(false);
  public authInitialized$ = this.authInitializedSubject.asObservable();

  constructor() {
    this.initializeAuth();
  }

  private initializeAuth() {
    this.getCurrentUser().subscribe({
      next: (user) => {
        this.setUser(user);
        this.authInitializedSubject.next(true);
      },
      error: () => {
        this.clearAuth();
        this.authInitializedSubject.next(true);
      }
    });
  }

  login(credentials: LoginCredentials): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.user) {
          this.setUser(response.user);
        }
      }),
      catchError(error => {
        console.error('Login error:', error);
        return throwError(() => error);
      })
    );
  }

  googleLogin() {
    window.location.href = `${this.apiUrl}/google`;
  }

  githubLogin() {
    window.location.href = `${this.apiUrl}/github`;
  }

  register(data: RegisterData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, data).pipe(
      catchError(error => {
        console.error('Registration error:', error);
        return throwError(() => error);
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}).pipe(
      tap(() => {
        this.clearAuth();
        this.router.navigate(['/home']);
      }),
      catchError(error => {
        this.clearAuth();
        this.router.navigate(['/home']);
        return throwError(() => error);
      })
    );
  }

  refreshToken(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/refresh`, {}).pipe(
      catchError(error => {
        console.error('Refresh token error:', error);
        return throwError(() => error);
      })
    );
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/profile`).pipe(
      tap(user => {
        if (user) {
          this.setUser(user);
        }
      }),
      catchError(error => {
        console.error('Get current user error:', error);
        return throwError(() => error);
      })
    );
  }

  updateProfile(data: Partial<User>): Observable<User> {
    return this.http.patch<{ success: boolean; data: User }>(`${this.apiUrl}/profile`, data).pipe(
      tap(response => {
        if (response.success) {
          this.setUser(response.data);
        }
      }),
      map(response => response.data)
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-password`, {
      currentPassword,
      newPassword
    });
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-password`, { token, newPassword });
  }

  verifyEmail(token: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-email`, { token });
  }

  resendVerificationEmail(): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-verification`, {});
  }

  navigateAfterAuth(forceRedirect = false): void {
    const user = this.currentUser;

    const currentUrl = this.router.url;
    if (!forceRedirect && (currentUrl === '/' || currentUrl === '/home')) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get('returnUrl');
    if (returnUrl) {
      this.router.navigateByUrl(returnUrl);
      return;
    }

    if (user?.role === 'tuner') {
      this.router.navigate(['/tuner/dashboard']);
    } else if (user?.role === 'admin') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/customer/dashboard']);
    }
  }

  getAccessToken(): string | null {
    return null;
  }

  getRefreshToken(): string | null {
    return null;
  }

  private setTokens(accessToken: string, refreshToken: string) {
  }

  private setUser(user: User) {
    this.currentUserSubject.next(user);
    
    this.isAuthenticated.set(true);
    this.isCustomer.set(user.role === 'customer');
    this.isTuner.set(user.role === 'tuner');
    this.isAdmin.set(user.role === 'admin');
  }

  private clearAuth() {
    this.currentUserSubject.next(null);
    this.isAuthenticated.set(false);
    this.isCustomer.set(false);
    this.isTuner.set(false);
    this.isAdmin.set(false);
  }

  sessionExpired() {
    this.clearAuth();
    this.router.navigate(['/login']);
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.isAuthenticated();
  }
}
