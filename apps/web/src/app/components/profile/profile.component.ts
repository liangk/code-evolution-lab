import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
  authProvider: string | null;
  googleId: string | null;
  githubId: string | null;
  userType: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  user = signal<UserProfile | null>(null);
  loading = signal(false);
  editing = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  editForm = {
    name: '',
    phone: ''
  };

  stats = {
    repositories: 0,
    analyses: 0,
    issuesFixed: 0
  };

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.loading.set(true);
    const currentUser = this.authService.currentUser as any;
    if (currentUser) {
      this.user.set({
        id: currentUser.id || '',
        email: currentUser.email || '',
        name: currentUser.name || null,
        avatarUrl: currentUser.avatarUrl || null,
        phone: currentUser.phone || null,
        authProvider: currentUser.authProvider || 'local',
        googleId: currentUser.googleId || null,
        githubId: currentUser.githubId || null,
        userType: currentUser.userType || 'CUSTOMER',
        createdAt: currentUser.createdAt ? new Date(currentUser.createdAt) : new Date(),
        lastLoginAt: currentUser.lastLoginAt ? new Date(currentUser.lastLoginAt) : null
      });
      this.editForm.name = currentUser.name || '';
      this.editForm.phone = currentUser.phone || '';
    }
    this.loading.set(false);
  }

  startEditing() {
    const user = this.user();
    if (user) {
      this.editForm.name = user.name || '';
      this.editForm.phone = user.phone || '';
    }
    this.editing.set(true);
    this.error.set(null);
    this.successMessage.set(null);
  }

  cancelEditing() {
    this.editing.set(false);
    this.error.set(null);
  }

  saveProfile() {
    this.saving.set(true);
    this.error.set(null);

    // Simulate API call - in real implementation, call authService.updateProfile()
    setTimeout(() => {
      const currentUser = this.user();
      if (currentUser) {
        this.user.set({
          ...currentUser,
          name: this.editForm.name,
          phone: this.editForm.phone
        });
      }
      this.saving.set(false);
      this.editing.set(false);
      this.successMessage.set('Profile updated successfully');
      setTimeout(() => this.successMessage.set(null), 3000);
    }, 500);
  }

  getInitials(): string {
    const user = this.user();
    if (!user) return '?';
    if (user.name) {
      return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user.email[0].toUpperCase();
  }

  getProviderLabel(provider: string | null): string {
    if (!provider) return 'Email';
    switch (provider.toLowerCase()) {
      case 'google': return 'Google';
      case 'github': return 'GitHub';
      default: return 'Email';
    }
  }
}
