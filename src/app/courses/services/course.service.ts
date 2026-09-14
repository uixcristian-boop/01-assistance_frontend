import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Course, CreateCourseRequest, UpdateCourseRequest } from '../models/course.models';
import { environment } from '../../../environments/environment';

// Servicio para comunicacion con la API de cursos
@Injectable({
  providedIn: 'root'
})
export class CourseService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/courses`;

  // Signal con la lista reactiva de cursos
  readonly courses = signal<Course[]>([]);
  readonly isLoading = signal<boolean>(false);

  // Obtiene los cursos del profesor desde el backend
  loadCourses(): Observable<Course[]> {
    this.isLoading.set(true);
    return this.http.get<Course[]>(this.apiUrl).pipe(
      tap({
        next: (list) => {
          this.courses.set(list);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      })
    );
  }

  // Registra un nuevo curso en el backend
  createCourse(courseData: CreateCourseRequest): Observable<Course> {
    return this.http.post<Course>(this.apiUrl, courseData).pipe(
      tap((newCourse) => {
        this.courses.update(current => [newCourse, ...current]);
      })
    );
  }

  // Actualiza un curso existente en el backend
  updateCourse(id: number, courseData: UpdateCourseRequest): Observable<Course> {
    return this.http.put<Course>(`${this.apiUrl}/${id}`, courseData).pipe(
      tap((updatedCourse) => {
        this.courses.update(current =>
          current.map(c => c.id === id ? updatedCourse : c)
        );
      })
    );
  }
}
