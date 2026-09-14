import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { CourseService } from '../../../courses/services/course.service';
import { Course } from '../../../courses/models/course.models';
import { Student } from '../../models/student.models';
import { NotificationService } from '../../../core/services/notification.service';
import { FaceBiometrics, FaceMeshAnalysis } from '../../../core/utils/face-biometrics';

// Componente para administracion de alumnos del curso y enrolamiento facial por camara
@Component({
  selector: 'app-students-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './students-list.component.html',
  styleUrl: './students-list.component.css'
})
export class StudentsListComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly studentService = inject(StudentService);
  readonly courseService = inject(CourseService);
  readonly notificationService = inject(NotificationService);

  // Referencias a elementos del DOM
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('captureCanvas') captureCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('meshCanvas') meshCanvas?: ElementRef<HTMLCanvasElement>;

  // Estados del curso y alumnos
  readonly courseId = signal<number>(0);
  readonly currentCourse = signal<Course | null>(null);
  readonly isCourseDropdownOpen = signal<boolean>(false);
  readonly isStudentModalOpen = signal<boolean>(false);
  readonly isEditMode = signal<boolean>(false);
  readonly editingStudentId = signal<number | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly studentError = signal<string | null>(null);

  // Conteo reactivo de alumnos enrolados y pendientes
  readonly enrolledStudentsCount = computed(() =>
    this.studentService.students().filter(s => s.hasFaceDescriptor).length
  );
  readonly pendingStudentsCount = computed(() =>
    this.studentService.students().filter(s => !s.hasFaceDescriptor).length
  );

  // Estados para enrolamiento facial por camara con MediaPipe 3D
  readonly isCameraModalOpen = signal<boolean>(false);
  readonly enrollingStudent = signal<Student | null>(null);
  readonly isCapturingBurst = signal<boolean>(false);
  readonly captureProgress = signal<number>(0);
  readonly capturedFramesCount = signal<number>(0);
  readonly totalFramesToCapture = 150;
  readonly isEnrollmentSuccess = signal<boolean>(false);
  readonly previewPhoto = signal<string | null>(null);
  readonly enrollPhase = signal<'FRONT' | 'LEFT' | 'RIGHT' | 'COMPLETED'>('FRONT');
  readonly faceDetectionStatus = signal<{ hasFace: boolean; message: string; pose: string }>({
    hasFace: false,
    message: 'Centra tu rostro dentro del marco',
    pose: 'FRONT'
  });

  private mediaStream: MediaStream | null = null;
  private continuousTrackId: any = null;
  private capturedDescriptors: number[][] = [];

  // Estado para confirmacion de eliminacion
  readonly isDeleteModalOpen = signal<boolean>(false);
  readonly studentToDelete = signal<Student | null>(null);

  // Formulario reactivo
  readonly studentForm: FormGroup = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(30)]],
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.email, Validators.maxLength(150)]]
  });

  ngOnInit(): void {
    this.courseService.loadCourses().subscribe(courses => {
      if (this.courseId()) {
        this.loadCourseData(this.courseId());
      }
    });

    this.route.params.subscribe(params => {
      const id = Number(params['id']);
      if (id) {
        this.courseId.set(id);
        this.loadCourseData(id);
        this.studentService.loadStudents(id).subscribe();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  // Abre / cierra el dropdown animado de cursos
  toggleCourseDropdown(event: Event): void {
    event.stopPropagation();
    this.isCourseDropdownOpen.update(v => !v);
  }

  // Selecciona un curso del dropdown
  onSelectCourse(course: Course): void {
    this.courseId.set(course.id);
    this.currentCourse.set(course);
    this.isCourseDropdownOpen.set(false);
    this.studentService.loadStudents(course.id).subscribe();
  }

  // Limpia la seleccion de curso volviendo al estado inicial
  clearSelection(event?: Event): void {
    if (event) event.stopPropagation();
    this.courseId.set(0);
    this.currentCourse.set(null);
    this.isCourseDropdownOpen.set(false);
  }

  // Cierra el menu desplegable al hacer clic fuera
  @HostListener('document:click')
  closeDropdown(): void {
    this.isCourseDropdownOpen.set(false);
  }

  // Carga los datos del curso actual
  private loadCourseData(courseId: number): void {
    const cached = this.courseService.courses().find(c => c.id === courseId);
    if (cached) {
      this.currentCourse.set(cached);
    } else {
      this.courseService.loadCourses().subscribe(courses => {
        const found = courses.find(c => c.id === courseId);
        if (found) this.currentCourse.set(found);
      });
    }
  }

  // Abre el modal para crear un nuevo alumno
  openCreateModal(): void {
    this.isEditMode.set(false);
    this.editingStudentId.set(null);
    this.studentForm.reset();
    this.studentError.set(null);
    this.isStudentModalOpen.set(true);
  }

  // Alias para abrir el modal de registro
  openAddModal(): void {
    this.openCreateModal();
  }

  // Abre el modal para editar un alumno existente
  openEditModal(student: Student): void {
    this.isEditMode.set(true);
    this.editingStudentId.set(student.id);
    this.studentForm.patchValue({
      code: student.code,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email || ''
    });
    this.studentError.set(null);
    this.isStudentModalOpen.set(true);
  }

  // Cierra el modal de alumno
  closeStudentModal(): void {
    this.isStudentModalOpen.set(false);
    this.editingStudentId.set(null);
  }

  // Guarda o actualiza el alumno
  onSubmitStudent(): void {
    if (this.studentForm.invalid) {
      this.studentForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.studentError.set(null);

    const formVal = this.studentForm.value;
    const cid = this.courseId();

    if (this.isEditMode() && this.editingStudentId()) {
      this.studentService.updateStudent(cid, this.editingStudentId()!, {
        code: formVal.code.trim().toUpperCase(),
        firstName: formVal.firstName.trim(),
        lastName: formVal.lastName.trim(),
        email: formVal.email ? formVal.email.trim().toLowerCase() : null
      }).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.closeStudentModal();
          this.notificationService.showSuccess('Alumno actualizado exitosamente.');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const msg = err.error?.message || 'Error al actualizar alumno.';
          this.studentError.set(msg);
        }
      });
    } else {
      this.studentService.createStudent(cid, {
        code: formVal.code.trim().toUpperCase(),
        firstName: formVal.firstName.trim(),
        lastName: formVal.lastName.trim(),
        email: formVal.email ? formVal.email.trim().toLowerCase() : null
      }).subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.closeStudentModal();
          this.notificationService.showSuccess('Alumno registrado exitosamente.');
          // Pregunta si desea enrolar rostro inmediatamente
          this.openCameraModal(created);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const msg = err.error?.message || 'Error al registrar alumno.';
          this.studentError.set(msg);
        }
      });
    }
  }

  // Abre el modal de camara para enrolamiento facial
  openCameraModal(student: Student): void {
    this.enrollingStudent.set(student);
    this.isCapturingBurst.set(false);
    this.captureProgress.set(0);
    this.capturedFramesCount.set(0);
    this.isEnrollmentSuccess.set(false);
    this.previewPhoto.set(null);
    this.capturedDescriptors = [];
    this.isCameraModalOpen.set(true);

    setTimeout(() => {
      this.startCamera();
    }, 150);
  }

  // Cierra el modal de camara y detiene el flujo de video
  closeCameraModal(): void {
    this.stopCamera();
    this.isCameraModalOpen.set(false);
    this.enrollingStudent.set(null);
  }

  // Inicia el flujo de camara web o movil con MediaPipe Face Mesh
  private async startCamera(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.mediaStream;
        await this.videoElement.nativeElement.play();
        this.startContinuousTracking();
      }
    } catch (err) {
      console.error('Error al acceder a la camara:', err);
      this.notificationService.showError('No se pudo acceder a la cámara. Verifique los permisos.');
    }
  }

  // Bucle de deteccion continua y renderizado de malla facial
  private startContinuousTracking(): void {
    const video = this.videoElement?.nativeElement;
    const meshCanvas = this.meshCanvas?.nativeElement;
    if (!video || !meshCanvas) return;

    let isProcessing = false;
    this.continuousTrackId = setInterval(async () => {
      if (isProcessing || video.videoWidth === 0 || this.isEnrollmentSuccess()) return;
      isProcessing = true;

      try {
        if (meshCanvas.width !== video.videoWidth || meshCanvas.height !== video.videoHeight) {
          meshCanvas.width = video.videoWidth;
          meshCanvas.height = video.videoHeight;
        }

        const analysis = await FaceBiometrics.processFrame(video);
        if (analysis && analysis.hasFace) {
          FaceBiometrics.drawFaceMesh(meshCanvas, analysis.landmarks, analysis.pose);

          this.faceDetectionStatus.set({
            hasFace: true,
            message: this.getPhasePrompt(this.enrollPhase(), analysis.pose),
            pose: analysis.pose
          });

          // Si la ráfaga está activa, registra fotogramas según la fase correspondiente
          if (this.isCapturingBurst()) {
            this.handleBurstFrame(analysis);
          }
        } else {
          FaceBiometrics.drawFaceMesh(meshCanvas, analysis?.landmarks || [], 'CENTER');
          this.faceDetectionStatus.set({
            hasFace: false,
            message: analysis?.reason || 'Ubica y centra tu rostro dentro del óvalo guía.',
            pose: 'CENTER'
          });
        }
      } catch (e) {
        // Ignora errores transitorios de cuadro
      } finally {
        isProcessing = false;
      }
    }, 50);
  }

  // Detiene la camara y los bucles de analisis
  private stopCamera(): void {
    if (this.continuousTrackId) {
      clearInterval(this.continuousTrackId);
      this.continuousTrackId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  // Obtiene el texto de instruccion segun la fase y pose actual
  private getPhasePrompt(phase: 'FRONT' | 'LEFT' | 'RIGHT' | 'COMPLETED', currentPose: string): string {
    if (phase === 'FRONT') {
      return currentPose === 'FRONT' ? '1/3 Mirando de frente (Correcto)' : '1/3 Mira directamente al frente';
    }
    if (phase === 'LEFT') {
      return currentPose === 'LEFT' ? '2/3 Girado a la derecha (Correcto)' : '2/3 Gira suavemente a la derecha';
    }
    if (phase === 'RIGHT') {
      return currentPose === 'RIGHT' ? '3/3 Girado a la izquierda (Correcto)' : '3/3 Gira suavemente a la izquierda';
    }
    return 'Enrolamiento completado';
  }

  // Inicia la captura guiada de 3 fases
  startBurstCapture(): void {
    if (this.isCapturingBurst() || !this.videoElement?.nativeElement) return;

    this.isCapturingBurst.set(true);
    this.captureProgress.set(0);
    this.capturedFramesCount.set(0);
    this.capturedDescriptors = [];
    this.enrollPhase.set('FRONT');
  }

  // Procesa un fotograma dentro del ciclo de ráfaga
  private handleBurstFrame(analysis: FaceMeshAnalysis): void {
    const currentPhase = this.enrollPhase();
    const count = this.capturedFramesCount();

    // Fase 1: Frontal (0 a 50 cuadros)
    if (currentPhase === 'FRONT') {
      if (analysis.pose === 'FRONT') {
        this.capturedDescriptors.push(analysis.descriptor);
        const newCount = count + 1;
        this.capturedFramesCount.set(newCount);
        this.captureProgress.set(Math.round((newCount / this.totalFramesToCapture) * 100));

        if (newCount === 1 && this.captureCanvas?.nativeElement && this.videoElement?.nativeElement) {
          const c = this.captureCanvas.nativeElement;
          c.width = 320;
          c.height = 320;
          const ctx = c.getContext('2d');
          const v = this.videoElement.nativeElement;
          const size = Math.min(v.videoWidth, v.videoHeight);
          ctx?.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 320, 320);
          this.previewPhoto.set(c.toDataURL('image/jpeg', 0.85));
        }

        if (newCount >= 50) {
          this.enrollPhase.set('LEFT');
        }
      }
      return;
    }

    // Fase 2: Giro Izquierda (51 a 100 cuadros)
    if (currentPhase === 'LEFT') {
      if (analysis.pose === 'LEFT') {
        this.capturedDescriptors.push(analysis.descriptor);
        const newCount = count + 1;
        this.capturedFramesCount.set(newCount);
        this.captureProgress.set(Math.round((newCount / this.totalFramesToCapture) * 100));

        if (newCount >= 100) {
          this.enrollPhase.set('RIGHT');
        }
      }
      return;
    }

    // Fase 3: Giro Derecha (101 a 150 cuadros)
    if (currentPhase === 'RIGHT') {
      if (analysis.pose === 'RIGHT') {
        this.capturedDescriptors.push(analysis.descriptor);
        const newCount = count + 1;
        this.capturedFramesCount.set(newCount);
        this.captureProgress.set(Math.round((newCount / this.totalFramesToCapture) * 100));

        if (newCount >= 150) {
          this.enrollPhase.set('COMPLETED');
          this.finishBurstCapture();
        }
      }
    }
  }

  // Finaliza la rafaga y guarda en el backend
  private finishBurstCapture(): void {
    this.isCapturingBurst.set(false);
    const avgDescriptor = FaceBiometrics.averageDescriptors(this.capturedDescriptors);
    const descriptorString = FaceBiometrics.descriptorToString(avgDescriptor);
    const photoDataUrl = this.previewPhoto();

    const student = this.enrollingStudent();
    if (!student) return;

    this.studentService.saveFaceDescriptor(this.courseId(), student.id, {
      faceDescriptor: descriptorString,
      photoUrl: photoDataUrl || undefined
    }).subscribe({
      next: () => {
        this.isEnrollmentSuccess.set(true);
        this.notificationService.showSuccess(`Rostro de ${student.firstName} enrolado en 3 ángulos con éxito.`);
        setTimeout(() => {
          this.closeCameraModal();
        }, 1300);
      },
      error: (err) => {
        console.error('Error al guardar descriptor facial:', err);
        this.notificationService.showError('Error al guardar datos biométricos.');
      }
    });
  }

  // Solicita confirmacion para eliminar alumno
  requestDelete(student: Student): void {
    this.studentToDelete.set(student);
    this.isDeleteModalOpen.set(true);
  }

  // Cancela la eliminacion
  cancelDelete(): void {
    this.isDeleteModalOpen.set(false);
    this.studentToDelete.set(null);
  }

  // Confirma la eliminacion del alumno
  confirmDelete(): void {
    const st = this.studentToDelete();
    if (!st) return;

    this.studentService.deleteStudent(this.courseId(), st.id).subscribe({
      next: () => {
        this.notificationService.showSuccess(`Alumno ${st.firstName} ${st.lastName} eliminado.`);
        this.cancelDelete();
      },
      error: (err) => {
        this.notificationService.showError('No se pudo eliminar al alumno.');
        this.cancelDelete();
      }
    });
  }

  // Navega al panel de asistencia y QR del curso
  goToAttendance(): void {
    this.router.navigate(['/dashboard/courses', this.courseId(), 'attendance']);
  }
}
