import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  mobileMenuOpen = false;
  profileMenuOpen = false;
  auth = inject(AuthService);

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  closeProfileMenu(): void {
    this.profileMenuOpen = false;
  }

  logout(): void {
    this.auth.logout().subscribe();
    this.closeProfileMenu();
  }

  getUserInitials(): string {
    const user = this.auth.currentUser;
    if (!user) return '?';
    if (user.name) {
      return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user.email ? user.email[0].toUpperCase() : '?';
  }

  getUserName(): string {
    const user = this.auth.currentUser;
    return user?.name || user?.email || 'User';
  }
}
