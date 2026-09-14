import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
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


