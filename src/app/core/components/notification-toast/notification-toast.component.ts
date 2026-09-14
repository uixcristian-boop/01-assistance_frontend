import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

// Componente global para notificaciones centradas y esteticas
@Component({
  selector: 'app-notification-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-toast.component.html',
  styleUrl: './notification-toast.component.css'
})
export class NotificationToastComponent {
  readonly notificationService = inject(NotificationService);

  // Cierra la notificacion actual
  close(): void {
    this.notificationService.dismiss();
  }
}
