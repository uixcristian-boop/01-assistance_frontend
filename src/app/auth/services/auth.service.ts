import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterProfessorRequest, UserSession } from '../models/auth.models';
import { environment } from '../../../environments/environment';

// Servicio para comunicacion con la API de autenticacion
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly tokenKey = 'assistance_token';
  private readonly userKey = 'assistance_user';

  // Signals para estado reactivo de sesion
  readonly currentUser = signal<UserSession | null>(this.getStoredUser());
  readonly isAuthenticated = signal<boolean>(!!this.getToken());

  // Envia credenciales para inicio de sesion
  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response.token && response.id && response.fullName && response.email && response.role) {
          this.saveSession(response.token, {
            id: response.id,
            fullName: response.fullName,
            email: response.email,
            role: response.role,
            profilePicture: response.profilePicture
          });
        }
      })
    );
  }

  // Registra a un nuevo profesor y dispara el envio de contraseña por correo
  registerProfessor(data: RegisterProfessorRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register-professor`, data);
  }

  // Obtiene el perfil actualizado del usuario desde el backend
  getProfile(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${environment.apiUrl}/users/profile`).pipe(
      tap(response => {
        if (response.id && response.fullName && response.email && response.role) {
          const updatedUser: UserSession = {
            id: response.id,
            fullName: response.fullName,
            email: response.email,
            role: response.role,
            profilePicture: response.profilePicture
          };
          localStorage.setItem(this.userKey, JSON.stringify(updatedUser));
          this.currentUser.set(updatedUser);
        }
      })
    );
  }

  // Actualiza el perfil (nombre y foto) en el backend
  updateProfile(data: { fullName: string; profilePicture?: string }): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`${environment.apiUrl}/users/profile`, data).pipe(
      tap(response => {
        if (response.id && response.fullName && response.email && response.role) {
          const updatedUser: UserSession = {
            id: response.id,
            fullName: response.fullName,
            email: response.email,
            role: response.role,
            profilePicture: response.profilePicture
          };
          localStorage.setItem(this.userKey, JSON.stringify(updatedUser));
          this.currentUser.set(updatedUser);
        }
      })
    );
  }

  // Guarda el token y usuario en almacenamiento local
  private saveSession(token: string, user: UserSession): void {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
  }

  // Obtiene el token actual
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  // Obtiene la sesion almacenada
  private getStoredUser(): UserSession | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Cierra la sesion del usuario
  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }
}
