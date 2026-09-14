import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';
import { NotificationToastComponent } from '../../core/components/notification-toast/notification-toast.component';
import { NotificationService } from '../../core/services/notification.service';

// Componente de diseño principal con barra lateral, navegacion y gestion de perfil
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationToastComponent],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.css'
})
export class DashboardLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  // Estados del usuario, menu y modales
  readonly currentUser = this.authService.currentUser;
  readonly isSidebarOpen = signal<boolean>(false);
  readonly showWelcomeToast = signal<boolean>(true);

  // Estados para editar perfil
  readonly isProfileModalOpen = signal<boolean>(false);
  readonly isSavingProfile = signal<boolean>(false);
  readonly profileName = signal<string>('');
  readonly previewAvatar = signal<string | null>(null);
  readonly profileError = signal<string | null>(null);

  ngOnInit(): void {
    this.authService.getProfile().subscribe();
  }

  // Cierra el modal de bienvenida al presionar continuar o cerrar
  dismissToast(): void {
    this.showWelcomeToast.set(false);
  }

  // Alterna la visibilidad del menu en pantallas moviles
  toggleSidebar(): void {
    this.isSidebarOpen.update(v => !v);
  }

  // Cierra el menu lateral
  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  // Abre el modal para editar perfil
  openProfileModal(): void {
    const user = this.currentUser();
    this.profileName.set(user?.fullName || '');
    this.previewAvatar.set(user?.profilePicture || null);
    this.profileError.set(null);
    this.isProfileModalOpen.set(true);
  }

  // Cierra el modal de editar perfil
  closeProfileModal(): void {
    this.isProfileModalOpen.set(false);
  }

  // Procesa y comprime la seleccion de imagen desde el dispositivo
  onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.profileError.set('Por favor seleccione un archivo de imagen válido.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 320;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          this.previewAvatar.set(compressedDataUrl);
          this.profileError.set(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Elimina la foto de perfil seleccionada
  removeAvatar(): void {
    this.previewAvatar.set(null);
  }

  // Guarda los cambios del perfil en el backend
  saveProfile(): void {
    const name = this.profileName().trim();
    if (!name) {
      this.profileError.set('El nombre completo es obligatorio.');
      return;
    }

    this.isSavingProfile.set(true);
    this.profileError.set(null);

    this.authService.updateProfile({
      fullName: name,
      profilePicture: this.previewAvatar() || ''
    }).subscribe({
      next: () => {
        this.isSavingProfile.set(false);
        this.closeProfileModal();
        this.notificationService.showSuccess('Perfil actualizado exitosamente.');
      },
      error: (err) => {
        this.isSavingProfile.set(false);
        const errorMsg = err.error?.message || 'No se pudo actualizar el perfil. Intente nuevamente.';
        this.profileError.set(errorMsg);
      }
    });
  }

  // Cierra sesion y redirige al login
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
