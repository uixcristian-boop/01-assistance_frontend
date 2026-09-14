import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AttendanceService } from '../../services/attendance.service';
import { CourseService } from '../../../courses/services/course.service';
import { Course } from '../../../courses/models/course.models';
import { AttendanceSession } from '../../models/attendance.models';
import { NotificationService } from '../../../core/services/notification.service';
import { QrGenerator } from '../../../core/utils/qr-generator';
import { environment } from '../../../../environments/environment';

// Componente para el panel de control de asistencia de la clase, generacion y descarga de QR
@Component({
  selector: 'app-attendance-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './attendance-dashboard.component.html',
  styleUrl: './attendance-dashboard.component.css'
})
export class AttendanceDashboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  readonly attendanceService = inject(AttendanceService);
  private readonly courseService = inject(CourseService);
  readonly notificationService = inject(NotificationService);

  @ViewChild('qrCanvas') qrCanvas?: ElementRef<HTMLCanvasElement>;

  // Estados del curso y sesion
  readonly courseId = signal<number>(0);
  readonly currentCourse = signal<Course | null>(null);
  readonly isStartingSession = signal<boolean>(false);
  readonly isQrModalOpen = signal<boolean>(false);
  readonly activeTab = signal<'active' | 'history'>('active');
  readonly sessionToDelete = signal<AttendanceSession | null>(null);
  readonly isDeletingSession = signal<boolean>(false);

  private pollIntervalId: any = null;

  // Formulario para iniciar sesion
  readonly sessionForm: FormGroup = this.fb.group({
    startTime: ['19:10', [Validators.required]],
    endTime: ['22:20', [Validators.required]],
    toleranceMinutes: [15, [Validators.required]],
    lateThresholdMinutes: [30, [Validators.required]]
  });

  // Obtiene la hora de inicio formateada en 12h
  get displayStartTime(): string {
    const timeVal = this.sessionForm.get('startTime')?.value;
    return this.formatTimeTo12h(timeVal) || '07:10 PM';
  }

  // Obtiene la hora de fin formateada en 12h
  get displayEndTime(): string {
    const timeVal = this.sessionForm.get('endTime')?.value;
    return this.formatTimeTo12h(timeVal) || '10:20 PM';
  }

  formatTimeTo12h(timeStr?: string | null): string {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
  }

  // Formatea la fecha de la sesion para el historial (ej: "Domingo 13 de sep.")
  formatHistoryDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);

        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

        const dayName = days[date.getDay()];
        const dayNum = date.getDate();
        const monthName = months[date.getMonth()];

        return `${dayName} ${dayNum} de ${monthName}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  // Abre el modal de confirmacion de eliminacion de sesion
  openDeleteModal(session: AttendanceSession, event: Event): void {
    event.stopPropagation();
    this.sessionToDelete.set(session);
  }

  // Cancela la eliminacion
  cancelDelete(): void {
    this.sessionToDelete.set(null);
  }

  // Confirma y ejecuta la eliminacion de la sesion
  confirmDelete(): void {
    const session = this.sessionToDelete();
    if (!session) return;

    this.isDeletingSession.set(true);
    this.attendanceService.deleteSession(this.courseId(), session.id).subscribe({
      next: () => {
        this.isDeletingSession.set(false);
        this.sessionToDelete.set(null);
        this.notificationService.showSuccess('Sesión de asistencia eliminada correctamente.');
      },
      error: () => {
        this.isDeletingSession.set(false);
        this.notificationService.showError('No se pudo eliminar la sesión de asistencia.');
      }
    });
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = Number(params['id']);
      if (id) {
        this.courseId.set(id);
        this.loadCourse(id);
        this.loadInitialData(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // Carga los datos del curso actual
  private loadCourse(id: number): void {
    const cached = this.courseService.courses().find(c => c.id === id);
    if (cached) {
      this.currentCourse.set(cached);
      this.extractTimesFromSchedule(cached.schedule);
    } else {
      this.courseService.loadCourses().subscribe(courses => {
        const found = courses.find(c => c.id === id);
        if (found) {
          this.currentCourse.set(found);
          this.extractTimesFromSchedule(found.schedule);
        }
      });
    }
  }

  // Extrae y pre-completa las horas segun el horario registrado del curso
  private extractTimesFromSchedule(scheduleStr?: string | null): void {
    if (!scheduleStr) {
      const now = new Date();
      const currentH = now.getHours().toString().padStart(2, '0');
      const endH = (now.getHours() + 2).toString().padStart(2, '0');
      this.sessionForm.patchValue({
        startTime: `${currentH}:00`,
        endTime: `${endH}:00`,
        toleranceMinutes: 15,
        lateThresholdMinutes: 30
      });
      return;
    }

    // Parsea horarios (ej. "07:10 PM - 10:20 PM" o "Lunes 07:10 PM - 10:20 PM")
    const match = scheduleStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      const start24 = this.to24Hour(parseInt(match[1], 10), match[3]);
      const end24 = this.to24Hour(parseInt(match[4], 10), match[6]);
      this.sessionForm.patchValue({
        startTime: `${start24.toString().padStart(2, '0')}:${match[2]}`,
        endTime: `${end24.toString().padStart(2, '0')}:${match[5]}`,
        toleranceMinutes: 15,
        lateThresholdMinutes: 30
      });
    }
  }

  private to24Hour(hour: number, period?: string): number {
    if (!period) return hour;
    if (period.toUpperCase() === 'PM' && hour < 12) return hour + 12;
    if (period.toUpperCase() === 'AM' && hour === 12) return 0;
    return hour;
  }

  // Carga la sesion activa o historial
  private loadInitialData(courseId: number): void {
    this.attendanceService.loadActiveSession(courseId).subscribe({
      next: (session) => {
        if (session && session.active) {
          this.startPolling(courseId, session.id);
        }
      }
    });
    this.attendanceService.loadSessionHistory(courseId).subscribe();
  }

  // Inicia sondeo de actualizacion en vivo cada 4 segundos
  private startPolling(courseId: number, sessionId: number): void {
    this.stopPolling();
    this.pollIntervalId = setInterval(() => {
      this.attendanceService.refreshSessionDetails(courseId, sessionId).subscribe();
    }, 4000);
  }

  // Detiene el sondeo
  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  // Inicia una nueva sesion de clase con QR
  onStartSession(): void {
    if (this.sessionForm.invalid) {
      this.sessionForm.markAllAsTouched();
      return;
    }

    this.isStartingSession.set(true);
    const form = this.sessionForm.value;

    this.attendanceService.createSession(this.courseId(), {
      startTime: form.startTime,
      endTime: form.endTime,
      toleranceMinutes: Number(form.toleranceMinutes),
      lateThresholdMinutes: Number(form.lateThresholdMinutes)
    }).subscribe({
      next: (session) => {
        this.isStartingSession.set(false);
        this.notificationService.showSuccess('Sesión de asistencia iniciada exitosamente.');
        this.startPolling(this.courseId(), session.id);
        this.openQrModal();
      },
      error: () => {
        this.isStartingSession.set(false);
        this.notificationService.showError('No se pudo iniciar la sesión de asistencia.');
      }
    });
  }

  // Cierra la sesion activa
  onCloseActiveSession(): void {
    const session = this.attendanceService.activeSession();
    if (!session) return;

    this.attendanceService.closeSession(this.courseId(), session.id).subscribe({
      next: () => {
        this.stopPolling();
        this.notificationService.showSuccess('Sesión de clase finalizada.');
        this.attendanceService.loadSessionHistory(this.courseId()).subscribe();
      },
      error: () => {
        this.notificationService.showError('Error al finalizar sesión.');
      }
    });
  }

  // Abre el modal de QR
  openQrModal(): void {
    this.isQrModalOpen.set(true);
    setTimeout(() => {
      this.renderQrCode();
    }, 150);
  }

  // Cierra el modal de QR
  closeQrModal(): void {
    this.isQrModalOpen.set(false);
  }

  // Renderiza el QR en el canvas con la URL publica del alumno
  private renderQrCode(): void {
    const session = this.attendanceService.activeSession();
    if (!session || !this.qrCanvas?.nativeElement) return;

    const qrUrl = this.getQrFullUrl();
    QrGenerator.drawQrToCanvas(this.qrCanvas.nativeElement, qrUrl, 380);
  }

  // Descarga la imagen PNG del QR en alta calidad
  downloadQrImage(): void {
    if (!this.qrCanvas?.nativeElement) return;
    const session = this.attendanceService.activeSession();
    const courseCode = this.currentCourse()?.code || 'curso';
    const filename = `QR-Asistencia-${courseCode}-${session?.sessionDate || 'sesion'}.png`;
    QrGenerator.downloadCanvasAsPng(this.qrCanvas.nativeElement, filename);
    this.notificationService.showSuccess('Código QR descargado exitosamente.');
  }

  // Obtiene la URL completa del QR
  getQrFullUrl(): string {
    const session = this.attendanceService.activeSession();
    if (!session) return '';
    const baseUrl = environment.publicAppUrl || `${window.location.protocol}//${window.location.host}`;
    return `${baseUrl}/asistencia/${session.sessionToken}`;
  }

  // Copia el enlace de asistencia al portapapeles
  copyQrUrl(): void {
    const url = this.getQrFullUrl();
    navigator.clipboard.writeText(url).then(() => {
      this.notificationService.showSuccess('Enlace de asistencia copiado al portapapeles.');
    });
  }

  // Cambia de pestaña
  setTab(tab: 'active' | 'history'): void {
    this.activeTab.set(tab);
  }
}
