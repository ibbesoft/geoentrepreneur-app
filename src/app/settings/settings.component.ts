import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { BackendConfigService } from '../services/backend-config.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly backendConfig = inject(BackendConfigService);
  private readonly router = inject(Router);

  backendUrl = this.backendConfig.getBaseUrl();
  loading = false;
  savedMessage = '';

  async ngOnInit(): Promise<void> {
    await this.authService.restoreSession();
  }

  save(): void {
    this.backendConfig.setBaseUrl(this.backendUrl);
    this.backendUrl = this.backendConfig.getBaseUrl();
    this.savedMessage = 'Backend URL saved.';
  }

  reset(): void {
    this.backendConfig.reset();
    this.backendUrl = this.backendConfig.getBaseUrl();
    this.savedMessage = 'Backend URL reset to default.';
  }

  async done(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.router.navigate(['/assignments']);
      return;
    }

    await this.router.navigate(['/login']);
  }
}