import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
import { authGuard } from './core/guards/auth.guard';
import { AuthService } from './auth/services/auth.service';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [() => {
      const authService = inject(AuthService);
      const router = inject(Router);
      if (authService.isAuthenticated()) {
        router.navigate(['/dashboard/courses']);
      } else {
        router.navigate(['/login']);
      }
      return false;
    }],
    children: []
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./layout/dashboard-layout/dashboard-layout.component').then(m => m.DashboardLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'courses',
        pathMatch: 'full'
      },
      {
        path: 'courses',
        loadComponent: () => import('./courses/pages/courses-list/courses-list.component').then(m => m.CoursesListComponent)
      },
      {
        path: 'students',
        loadComponent: () => import('./students/pages/students-list/students-list.component').then(m => m.StudentsListComponent)
      },
      {
        path: 'courses/:id/students',
        loadComponent: () => import('./students/pages/students-list/students-list.component').then(m => m.StudentsListComponent)
      },
      {
        path: 'courses/:id/attendance',
        loadComponent: () => import('./attendance/pages/attendance-dashboard/attendance-dashboard.component').then(m => m.AttendanceDashboardComponent)
      },
      {
        path: 'exports',
        loadComponent: () => import('./reports/pages/exports-page/exports-page.component').then(m => m.ExportsPageComponent)
      }
    ]
  },
  {
    path: 'asistencia/:token',
    loadComponent: () => import('./attendance/pages/student-checkin/student-checkin.component').then(m => m.StudentCheckinComponent)
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];


