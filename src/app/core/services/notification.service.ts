import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
  title?: string;
}

// Servicio global para gestionar notificaciones modales / flotantes en el centro
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  readonly activeNotification = signal<AppNotification | null>(null);
  private timer: any = null;

  // Muestra notificacion de exito
  showSuccess(message: string, title: string = 'Exito'): void {
    this.show('success', message, title);
  }

  // Muestra notificacion de error
  showError(message: string, title: string = 'Error'): void {
    this.show('error', message, title);
  }

  // Muestra notificacion de advertencia
  showWarning(message: string, title: string = 'Advertencia'): void {
    this.show('warning', message, title);
  }

  // Muestra notificacion informativa
  showInfo(message: string, title: string = 'Informacion'): void {
    this.show('info', message, title);
  }

  // Despliega la notificacion con temporizador de cierre automatico
  private show(type: NotificationType, message: string, title?: string): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.activeNotification.set({
      id: Date.now(),
      type,
      message,
      title
    });

    this.timer = setTimeout(() => {
      this.dismiss();
    }, 4000);
  }

  // Cierra la notificacion activa
  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.activeNotification.set(null);
  }
}
