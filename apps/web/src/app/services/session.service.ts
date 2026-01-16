import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private apiUrl = `${environment.apiUrl}/sessions`;

  constructor(private http: HttpClient) {}

  getSessions(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  revokeSession(sessionId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${sessionId}/revoke`, {});
  }

  revokeAllOtherSessions(): Observable<any> {
    return this.http.post(`${this.apiUrl}/revoke-all-others`, {});
  }
}
