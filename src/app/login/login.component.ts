import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  async ngOnInit(): Promise<void> {
    await this.authService.restoreSession();

    if (this.authService.isAuthenticated()) {
      await this.router.navigate(['/assignments']);
    }
  }

  async onSubmit(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    const result = await this.authService.login({
      email: this.email,
      password: this.password
    });

    this.loading = false;

    if (result.success) {
      await this.router.navigate(['/assignments']);
      return;
    }

    this.errorMessage = result.error || 'Login failed';
  }
}