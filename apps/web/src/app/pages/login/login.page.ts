import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CommonModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPage implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  loading = false;
  showCaptcha = false;
  captchaToken: string | null = null;
  errorMessage: string | null = null;

  ngOnInit() {
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    const payload = { ...(this.form.value as any), captchaToken: this.captchaToken || undefined };
    this.auth.login(payload).subscribe({
      next: (resp: any) => {
        if (resp && resp.requires2FA) {
          console.log('2FA required');
          this.router.navigateByUrl('/two-factor');
        } else {
          console.log('Logged in successfully');
          this.auth.navigateAfterAuth();
        }
      },
      error: (e) => {
        const msg = e?.error?.message || 'Login failed';
        this.errorMessage = msg;
        if (msg.toLowerCase().includes('captcha')) {
          this.showCaptcha = true;
        }
        console.error(msg);
      }
    }).add(() => this.loading = false);
  }

  onCaptcha(token: string | null) {
    this.captchaToken = token;
  }

  onGoogleLogin() {
    console.log('Google login not yet implemented');
  }

  onTwitterLogin() {
    console.log('Twitter login not yet implemented');
  }
}
