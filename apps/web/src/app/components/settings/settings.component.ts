import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  activeSection = signal<string>('account');
  saving = signal(false);
  successMessage = signal<string | null>(null);
  error = signal<string | null>(null);

  notifications = {
    analysisCompleted: true,
    weeklySummary: true,
    marketingUpdates: false
  };

  appearance = {
    theme: 'light',
    language: 'en'
  };

  constructor(private authService: AuthService, private router: Router) {}

  setActiveSection(section: string) {
    this.activeSection.set(section);
    this.successMessage.set(null);
    this.error.set(null);
  }

  saveNotifications() {
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.successMessage.set('Notification preferences saved');
      setTimeout(() => this.successMessage.set(null), 3000);
    }, 500);
  }

  saveAppearance() {
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.successMessage.set('Appearance settings saved');
      setTimeout(() => this.successMessage.set(null), 3000);
    }, 500);
  }

  changePassword() {
    // Navigate to password change flow or show modal
    console.log('Change password clicked');
  }

  deleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      console.log('Delete account confirmed');
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
