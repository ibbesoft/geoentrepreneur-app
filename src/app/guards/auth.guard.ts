import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = async (): Promise<boolean> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.restoreSession();

  if (authService.isAuthenticated()) {
    return true;
  }

  await router.navigate(['/login']);
  return false;
};