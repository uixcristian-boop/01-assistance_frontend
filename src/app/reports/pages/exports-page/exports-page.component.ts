import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../../courses/services/course.service';
import { StudentService } from '../../../students/services/student.service';
import { AuthService } from '../../../auth/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Course } from '../../../courses/models/course.models';
import { Student } from '../../../students/models/student.models';
import { DocumentExporter } from '../../../core/utils/document-exporter';

// Componente para generacion y exportacion de reportes en formatos Excel y PDF
@Component({
  selector: 'app-exports-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exports-page.component.html',
  styleUrl: './exports-page.component.css'
})
export class ExportsPageComponent implements OnInit {
  readonly courseService = inject(CourseService);
  readonly studentService = inject(StudentService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);

  // Estados reactivos
  readonly selectedCourseId = signal<number>(0);
  readonly isCourseDropdownOpen = signal<boolean>(false);
  readonly statusFilter = signal<'ALL' | 'ENROLLED' | 'PENDING'>('ALL');
  readonly searchQuery = signal<string>('');
  readonly isExportingExcel = signal<boolean>(false);
  readonly isExportingPdf = signal<boolean>(false);

  // Curso seleccionado
  readonly currentCourse = computed<Course | null>(() => {
    const id = this.selectedCourseId();
    if (!id) return null;
    return this.courseService.courses().find(c => c.id === id) || null;
  });

  // Metricas reactivas
  readonly totalStudentsCount = computed<number>(() => this.studentService.students().length);
  readonly enrolledStudentsCount = computed<number>(() =>
    this.studentService.students().filter(s => s.hasFaceDescriptor).length
  );
  readonly pendingStudentsCount = computed<number>(() =>
    this.studentService.students().filter(s => !s.hasFaceDescriptor).length
  );
  readonly coveragePercentage = computed<number>(() => {
    const total = this.totalStudentsCount();
    if (total === 0) return 0;
    return Math.round((this.enrolledStudentsCount() / total) * 100);
  });

  // Alumnos filtrados para previsualizacion
  readonly filteredStudents = computed<Student[]>(() => {
    const list = this.studentService.students();
    const filter = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();

    return list
      .filter(student => {
        // Filtro de estado
        if (filter === 'ENROLLED' && !student.hasFaceDescriptor) return false;
        if (filter === 'PENDING' && student.hasFaceDescriptor) return false;

        // Filtro de busqueda
        if (query) {
          const matchCode = student.code.toLowerCase().includes(query);
          const matchFirst = student.firstName.toLowerCase().includes(query);
          const matchLast = student.lastName.toLowerCase().includes(query);
          const matchEmail = (student.email || '').toLowerCase().includes(query);
          return matchCode || matchFirst || matchLast || matchEmail;
        }

        return true;
      })
      .sort((a, b) => {
        const cmp = a.lastName.localeCompare(b.lastName, 'es', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' });
      });
  });

  ngOnInit(): void {
    this.courseService.loadCourses().subscribe();
  }

  // Abre / cierra el dropdown animado de cursos
  toggleCourseDropdown(event: Event): void {
    event.stopPropagation();
    this.isCourseDropdownOpen.update(v => !v);
  }

  // Selecciona un curso del dropdown
  onSelectCourse(course: Course): void {
    this.selectedCourseId.set(course.id);
    this.isCourseDropdownOpen.set(false);
    this.studentService.loadStudents(course.id).subscribe();
  }

  // Limpia la seleccion de curso volviendo al estado inicial
  clearSelection(event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedCourseId.set(0);
    this.isCourseDropdownOpen.set(false);
    this.studentService.students.set([]);
  }

  // Cierra el menu desplegable al hacer clic fuera
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.isCourseDropdownOpen()) {
      this.isCourseDropdownOpen.set(false);
    }
  }

  // Establece el filtro de estado
  setFilter(filter: 'ALL' | 'ENROLLED' | 'PENDING'): void {
    this.statusFilter.set(filter);
  }

  // Exporta los alumnos filtrados o totales a Excel
  async exportExcel(): Promise<void> {
    const course = this.currentCourse();
    const students = this.filteredStudents();
    if (!course || students.length === 0) {
      this.notificationService.showWarning('No hay alumnos para exportar en este curso.');
      return;
    }

    this.isExportingExcel.set(true);
    try {
      const professorName = this.authService.currentUser()?.fullName || 'Docente UCSS';
      await DocumentExporter.exportToExcel(course, students, professorName);
      this.notificationService.showSuccess('Documento Excel descargado correctamente.');
    } catch (err) {
      console.error('Error al exportar Excel:', err);
      this.notificationService.showError('No se pudo generar el documento Excel.');
    } finally {
      this.isExportingExcel.set(false);
    }
  }

  // Exporta los alumnos filtrados o totales a PDF
  async exportPdf(): Promise<void> {
    const course = this.currentCourse();
    const students = this.filteredStudents();
    if (!course || students.length === 0) {
      this.notificationService.showWarning('No hay alumnos para exportar en este curso.');
      return;
    }

    this.isExportingPdf.set(true);
    try {
      const professorName = this.authService.currentUser()?.fullName || 'Docente UCSS';
      await DocumentExporter.exportToPdf(course, students, professorName);
      this.notificationService.showSuccess('Documento PDF descargado correctamente.');
    } catch (err) {
      console.error('Error al exportar PDF:', err);
      this.notificationService.showError('No se pudo generar el documento PDF.');
    } finally {
      this.isExportingPdf.set(false);
    }
  }
}
