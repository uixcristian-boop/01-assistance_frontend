import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { CreateStudentRequest, SaveFaceDescriptorRequest, Student, UpdateStudentRequest } from '../models/student.models';
import { environment } from '../../../environments/environment';

// Servicio para la comunicacion con la API de alumnos
@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/courses`;

  // Signals reactivos
  readonly students = signal<Student[]>([]);
  readonly isLoading = signal<boolean>(false);

  // Ordena la lista de alumnos alfabeticamente por apellido (A-Z) y nombre (A-Z)
  private sortAlphabetically(list: Student[]): Student[] {
    return [...list].sort((a, b) => {
      const cmpLast = a.lastName.localeCompare(b.lastName, 'es', { sensitivity: 'base' });
      if (cmpLast !== 0) return cmpLast;
      return a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' });
    });
  }

  // Obtiene los alumnos de un curso
  loadStudents(courseId: number): Observable<Student[]> {
    this.isLoading.set(true);
    return this.http.get<Student[]>(`${this.baseUrl}/${courseId}/students`).pipe(
      tap({
        next: (list) => {
          this.students.set(this.sortAlphabetically(list || []));
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      })
    );
  }

  // Registra un nuevo alumno en el curso
  createStudent(courseId: number, data: CreateStudentRequest): Observable<Student> {
    return this.http.post<Student>(`${this.baseUrl}/${courseId}/students`, data).pipe(
      tap((newStudent) => {
        this.students.update(list => this.sortAlphabetically([newStudent, ...list]));
      })
    );
  }

  // Actualiza los datos de un alumno
  updateStudent(courseId: number, studentId: number, data: UpdateStudentRequest): Observable<Student> {
    return this.http.put<Student>(`${this.baseUrl}/${courseId}/students/${studentId}`, data).pipe(
      tap((updated) => {
        this.students.update(list => this.sortAlphabetically(list.map(s => s.id === studentId ? updated : s)));
      })
    );
  }

  // Guarda el vector biometrico facial capturado
  saveFaceDescriptor(courseId: number, studentId: number, data: SaveFaceDescriptorRequest): Observable<Student> {
    return this.http.put<Student>(`${this.baseUrl}/${courseId}/students/${studentId}/face-descriptor`, data).pipe(
      tap((updated) => {
        this.students.update(list => this.sortAlphabetically(list.map(s => s.id === studentId ? updated : s)));
      })
    );
  }

  // Elimina un alumno del curso
  deleteStudent(courseId: number, studentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${courseId}/students/${studentId}`).pipe(
      tap(() => {
        this.students.update(list => list.filter(s => s.id !== studentId));
      })
    );
  }
}
