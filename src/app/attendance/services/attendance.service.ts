import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import {
  AttendanceRecord,
  AttendanceSession,
  CheckInRequest,
  CreateAttendanceSessionRequest,
  PublicSessionResponse
} from '../models/attendance.models';
import { environment } from '../../../environments/environment';

// Servicio para comunicacion con la API de asistencia
@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Signals reactivos para el panel de control
  readonly activeSession = signal<AttendanceSession | null>(null);
  readonly sessionHistory = signal<AttendanceSession[]>([]);
  readonly isLoading = signal<boolean>(false);

  // Inicia una sesion de clase con generador de QR
  createSession(courseId: number, data: CreateAttendanceSessionRequest): Observable<AttendanceSession> {
    this.isLoading.set(true);
    return this.http.post<AttendanceSession>(`${this.apiUrl}/courses/${courseId}/attendance/sessions`, data).pipe(
      tap({
        next: (session) => {
          this.activeSession.set(session);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      })
    );
  }

  // Obtiene la sesion activa actual
  loadActiveSession(courseId: number): Observable<AttendanceSession> {
    this.isLoading.set(true);
    return this.http.get<AttendanceSession>(`${this.apiUrl}/courses/${courseId}/attendance/active`).pipe(
      tap({
        next: (session) => {
          this.activeSession.set(session || null);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      })
    );
  }

  // Refresca los detalles y lista de asistencia de la sesion
  refreshSessionDetails(courseId: number, sessionId: number): Observable<AttendanceSession> {
    return this.http.get<AttendanceSession>(`${this.apiUrl}/courses/${courseId}/attendance/sessions/${sessionId}`).pipe(
      tap((session) => {
        this.activeSession.set(session);
      })
    );
  }

  // Cierra una sesion de asistencia
  closeSession(courseId: number, sessionId: number): Observable<AttendanceSession> {
    return this.http.put<AttendanceSession>(`${this.apiUrl}/courses/${courseId}/attendance/sessions/${sessionId}/close`, {}).pipe(
      tap((closed) => {
        if (this.activeSession()?.id === sessionId) {
          this.activeSession.set(null);
        }
      })
    );
  }

  // Obtiene el historial de sesiones de un curso
  loadSessionHistory(courseId: number): Observable<AttendanceSession[]> {
    return this.http.get<AttendanceSession[]>(`${this.apiUrl}/courses/${courseId}/attendance/sessions`).pipe(
      tap((list) => {
        this.sessionHistory.set(list || []);
      })
    );
  }

  // Elimina una sesion de asistencia del historial
  deleteSession(courseId: number, sessionId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/courses/${courseId}/attendance/sessions/${sessionId}`).pipe(
      tap(() => {
        this.sessionHistory.update(list => list.filter(s => s.id !== sessionId));
        if (this.activeSession()?.id === sessionId) {
          this.activeSession.set(null);
        }
      })
    );
  }

  // Consulta publica de datos de la sesion por el QR (Alumno)
  getPublicSession(token: string): Observable<PublicSessionResponse> {
    return this.http.get<PublicSessionResponse>(`${this.apiUrl}/attendance/public/sessions/${token}`);
  }

  // Registro publico de asistencia del alumno
  checkIn(token: string, data: CheckInRequest): Observable<AttendanceRecord> {
    return this.http.post<AttendanceRecord>(`${this.apiUrl}/attendance/public/sessions/${token}/check-in`, data);
  }
}
