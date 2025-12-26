import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

type RegisterPayload = {
  email: string;
  password: string;
  role: 'customer' | 'tuner';
  captchaToken?: string;
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CommonModule],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss']
})
export class RegisterPage implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  form = this.fb.group({
    role: ['customer', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(50),
        Validators.pattern(PASSWORD_REGEX),
      ],
    ]
  });

  loading = false;
  captchaToken: string | null = null;

  ngOnInit(): void {
    const type = this.route.snapshot.queryParamMap.get('type');
    if (type === 'tuner') {
      this.form.patchValue({ role: 'tuner' });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    const value = this.form.value as any;
    const payload: RegisterPayload = {
      email: value.email,
      password: value.password,
      role: (value.role as 'customer' | 'tuner') || 'customer',
      captchaToken: this.captchaToken || undefined,
    };

    this.auth.register(payload).subscribe({
      next: (response: any) => {
        const message = response?.message || 'User created successfully.';
        console.log(message);
        if (response?.requiresVerification) {
          this.router.navigate(['/pending-verification'], {
            queryParams: { email: this.form.value.email }
          });
        } else {
          this.router.navigateByUrl('/login');
        }
      },
      error: (error: unknown) => {
        const msg = this.extractErrorMessage(error) || 'Registration failed';
        console.error(msg);
      }
    }).add(() => {
      this.loading = false;
    });
  }

  onCaptcha(token: string | null): void {
    this.captchaToken = token;
  }

  selectRole(role: 'customer' | 'tuner'): void {
    this.form.patchValue({ role });
  }

  onGoogleLogin(): void {
    console.log('Google login not yet implemented');
  }

  onTwitterLogin(): void {
    console.log('Twitter login not yet implemented');
  }

  private extractErrorMessage(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    if ('error' in error && error.error && typeof error.error === 'object') {
      const inner = error.error as { message?: string };
      return inner.message ?? null;
    }
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message;
    }
    return null;
  }
}
