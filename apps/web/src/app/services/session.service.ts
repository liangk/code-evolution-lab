import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private apiUrl = 'http://localhost:3000/api/sessions';

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
