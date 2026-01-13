import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../services/session.service';

interface Session {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  lastActive: Date;
  createdAt: Date;
  isActive: boolean;
  isCurrent: boolean;
}

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './sessions.component.html',
  styleUrls: ['./sessions.component.scss']
})
export class SessionsComponent implements OnInit {
  sessions = signal<Session[]>([]);
  loading = signal(false);
  revoking = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  error = signal<string | null>(null);

  constructor(private sessionService: SessionService) {}

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.loading.set(true);
    this.sessionService.getSessions().subscribe({
      next: (response: any) => {
        const sessions = (response.sessions || []).map((s: any) => ({
          ...s,
          lastActive: new Date(s.lastActive),
          createdAt: new Date(s.createdAt)
        }));
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load sessions');
        this.loading.set(false);
      }
    });
  }

  revokeSession(sessionId: string) {
    if (confirm('Are you sure you want to revoke this session?')) {
      this.revoking.set(sessionId);
      this.sessionService.revokeSession(sessionId).subscribe({
        next: () => {
          this.sessions.update(sessions => sessions.filter(s => s.id !== sessionId));
          this.revoking.set(null);
          this.successMessage.set('Session revoked successfully');
          setTimeout(() => this.successMessage.set(null), 3000);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to revoke session');
          this.revoking.set(null);
        }
      });
    }
  }

  revokeAllOtherSessions() {
    if (confirm('Are you sure you want to revoke all other sessions? You will remain logged in on this device only.')) {
      this.loading.set(true);
      this.sessionService.revokeAllOtherSessions().subscribe({
        next: () => {
          this.sessions.update(sessions => sessions.filter(s => s.isCurrent));
          this.loading.set(false);
          this.successMessage.set('All other sessions have been revoked');
          setTimeout(() => this.successMessage.set(null), 3000);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to revoke sessions');
          this.loading.set(false);
        }
      });
    }
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${days} days ago`;
  }

  getDeviceIcon(device: string): string {
    switch (device.toLowerCase()) {
      case 'mobile': return 'MB';
      case 'tablet': return 'TB';
      default: return 'DT';
    }
  }

  trackBySessionId(index: number, session: Session): string {
    return session.id;
  }

  getOtherSessions(): Session[] {
    return this.sessions().filter(s => !s.isCurrent);
  }
}
