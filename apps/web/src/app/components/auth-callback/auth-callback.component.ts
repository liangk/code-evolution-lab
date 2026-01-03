import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="loading-spinner">
        <p>Completing social login...</p>
        <div class="spinner"></div>
      </div>
    </div>
  `,
  styles: [`
    .callback-container { display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; }
    .loading-spinner { text-align: center; }
    .spinner { margin: 20px auto; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      const state = params['state'];

      console.log('[AuthCallback] Received params:', { code: code ? 'present' : 'missing', state });

      if (code && state) {
        this.auth.handleSocialCallback(code, state).subscribe({
          next: (response) => {
            console.log('[AuthCallback] Social login response:', response);
            this.router.navigate(['/dashboard']);
          },
          error: (err) => {
            console.error('[AuthCallback] Social login error details:', err);
            this.router.navigate(['/login'], { queryParams: { error: 'social_auth_failed' } });
          }
        });
      } else {
        console.error('[AuthCallback] Missing code or state in URL');
        this.router.navigate(['/login']);
      }
    });
  }
}
