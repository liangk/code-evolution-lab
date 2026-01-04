import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth initialization to complete before checking login status
  return authService.authInitialized$.pipe(
    filter(initialized => initialized),
    take(1),
    map(() => {
      if (authService.isLoggedIn) {
        return true;
      }
      return router.createUrlTree(['/login']);
    })
  );
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth initialization to complete before checking login status
  return authService.authInitialized$.pipe(
    filter(initialized => initialized),
    take(1),
    map(() => {
      if (!authService.isLoggedIn) {
        return true;
      }
      return router.createUrlTree(['/dashboard']);
    })
  );
};
