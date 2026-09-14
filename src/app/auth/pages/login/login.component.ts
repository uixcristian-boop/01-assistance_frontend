import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// Componente para la vista de inicio de sesion y registro de profesores
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Estados reactivos del componente
  readonly isRegisterMode = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal<boolean>(false);

  // Formulario reactivo para login
  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  // Formulario reactivo para registro de profesores
  readonly registerForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]]
  });

  ngOnInit(): void {
    // Si ya existe sesion activa en almacenamiento local, redirige de inmediato al panel
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard/courses']);
      return;
    }

    // Limpia el mensaje de error tan pronto como el usuario modifica algun campo
    this.loginForm.valueChanges.subscribe(() => {
      if (this.errorMessage()) {
        this.errorMessage.set(null);
      }
    });

    this.registerForm.valueChanges.subscribe(() => {
      if (this.errorMessage()) {
        this.errorMessage.set(null);
      }
    });
  }

  // Cambia el modo entre login y registro
  toggleMode(register: boolean): void {
    this.isRegisterMode.set(register);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  // Alterna la visualizacion de la contraseña
  toggleShowPassword(): void {
    this.showPassword.update(val => !val);
  }

  // Procesa el envio del formulario de login
  onLoginSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService.login(this.loginForm.value).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.successMessage.set(`Bienvenido, ${res.fullName}. Sesion iniciada correctamente.`);
        // Redirige al panel principal de cursos
        setTimeout(() => {
          this.router.navigate(['/dashboard/courses']);
        }, 500);
      },
      error: (err) => {
        this.isLoading.set(false);
        const raw = err.error?.message || err.error?.error || '';
        let errorMsg = 'No se pudo iniciar sesión. Verifica tu correo o contraseña.';
        if (raw.toLowerCase().includes('credencial') || raw.toLowerCase().includes('bad credential') || err.status === 401) {
          errorMsg = 'Contraseña o correo incorrectos. Vuelve a intentarlo.';
        } else if (raw) {
          errorMsg = raw;
        }
        this.errorMessage.set(errorMsg);
      }
    });
  }

  // Procesa el envio del formulario de registro
  onRegisterSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService.registerProfessor(this.registerForm.value).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        let msg = res.message || 'Profesor registrado. La contraseña fue enviada al correo.';
        if (res.temporaryPassword) {
          msg += ` | Clave temporal: ${res.temporaryPassword}`;
        }
        this.successMessage.set(msg);
        this.registerForm.reset();
      },
      error: (err) => {
        this.isLoading.set(false);
        const errorMsg = err.error?.message || err.error?.error || 'Error al registrar profesor. Intente nuevamente.';
        this.errorMessage.set(errorMsg);
      }
    });
  }
}
