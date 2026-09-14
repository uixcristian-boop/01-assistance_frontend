import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AttendanceService } from '../../services/attendance.service';
import { AttendanceRecord, PublicSessionResponse } from '../../models/attendance.models';
import { Student } from '../../../students/models/student.models';
import { FaceBiometrics } from '../../../core/utils/face-biometrics';

// Componente publico para escaneo facial y automarcado de asistencia del alumno
@Component({
  selector: 'app-student-checkin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-checkin.component.html',
  styleUrl: './student-checkin.component.css'
})
export class StudentCheckinComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly attendanceService = inject(AttendanceService);

  @ViewChild('videoPlayer') videoPlayer?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas?: ElementRef<HTMLCanvasElement>;

  // Estados de la sesion
  readonly sessionToken = signal<string>('');
  readonly sessionData = signal<PublicSessionResponse | null>(null);
  readonly isLoadingSession = signal<boolean>(true);
  readonly sessionError = signal<string | null>(null);

  // Estados de camara y escaneo facial
  readonly isCameraActive = signal<boolean>(false);
  readonly isScanning = signal<boolean>(false);
  readonly scanStatusText = signal<string>('Posicione su rostro dentro del marco');
  readonly recognizedStudent = signal<Student | null>(null);
  readonly matchConfidence = signal<number>(0);
  readonly isSubmittingCheckin = signal<boolean>(false);
  readonly checkInResult = signal<AttendanceRecord | null>(null);

  private mediaStream: MediaStream | null = null;
  private scanIntervalId: any = null;

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const token = params['token'];
      if (token) {
        this.sessionToken.set(token);
        this.loadSession(token);
      } else {
        this.isLoadingSession.set(false);
        this.sessionError.set('Enlace de asistencia no válido.');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  // Carga los datos de la sesion publica
  private loadSession(token: string): void {
    this.isLoadingSession.set(true);
    this.sessionError.set(null);

    this.attendanceService.getPublicSession(token).subscribe({
      next: (data) => {
        this.sessionData.set(data);
        this.isLoadingSession.set(false);
        if (!data.active) {
          this.sessionError.set('Esta sesión de asistencia ya fue finalizada por el docente.');
        } else {
          this.startCamera();
        }
      },
      error: (err) => {
        this.isLoadingSession.set(false);
        const msg = err.error?.message || 'Sesión no válida o expirada.';
        this.sessionError.set(msg);
      }
    });
  }

  private isAnalyzingFrame = false;

  // Inicia la camara frontal del dispositivo movil o laptop
  async startCamera(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      // Espera a que el elemento video esté montado en el DOM
      const videoEl = await this.waitForVideoElement();
      if (videoEl) {
        videoEl.srcObject = this.mediaStream;
        await videoEl.play();
        this.isCameraActive.set(true);
        this.startFaceRecognitionLoop();
      } else {
        this.scanStatusText.set('No se pudo inicializar el visor de cámara.');
      }
    } catch (err) {
      console.error('Error de acceso a camara:', err);
      this.scanStatusText.set('No se pudo acceder a la cámara. Conceda los permisos requeridos.');
    }
  }

  // Espera activa a que ViewChild('#videoPlayer') exista en el DOM
  private async waitForVideoElement(): Promise<HTMLVideoElement | null> {
    for (let i = 0; i < 30; i++) {
      if (this.videoPlayer?.nativeElement) {
        return this.videoPlayer.nativeElement;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  // Detiene la camara y bucle de reconocimiento
  private stopCamera(): void {
    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    this.isCameraActive.set(false);
  }

  // Bucle periodico de reconocimiento facial contra los alumnos del curso
  private startFaceRecognitionLoop(): void {
    this.isScanning.set(true);
    const canvas = this.scanCanvas?.nativeElement || document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    let consecutiveMatches = 0;
    let candidateStudent: Student | null = null;
    let candidateConfidence = 0;

    this.scanIntervalId = setInterval(async () => {
      if (this.isAnalyzingFrame || this.checkInResult() || this.isSubmittingCheckin()) {
        return;
      }

      const video = this.videoPlayer?.nativeElement;
      if (!video || video.videoWidth === 0 || !ctx) return;

      const students = this.sessionData()?.students || [];
      const studentsWithFace = students.filter(s => s.hasFaceDescriptor || (s.faceDescriptor && s.faceDescriptor.trim().length > 10));

      if (students.length === 0) {
        this.scanStatusText.set('No hay alumnos registrados en esta clase.');
        return;
      }

      if (studentsWithFace.length === 0) {
        this.scanStatusText.set('Los alumnos de esta clase no tienen rostro registrado aún.');
        return;
      }

      this.isAnalyzingFrame = true;
      try {
        const analysis = await FaceBiometrics.processFrame(video);
        if (!analysis || !analysis.hasFace) {
          consecutiveMatches = 0;
          candidateStudent = null;
          this.scanStatusText.set(analysis?.reason || 'Centra tu rostro dentro del marco ovalado');
          return;
        }

        const capturedDesc = analysis.descriptor;

        let bestStudent: Student | null = null;
        let highestSimilarity = 0;
        let secondSimilarity = 0;

        for (const st of studentsWithFace) {
          const parsedDesc = FaceBiometrics.parseDescriptor(st.faceDescriptor);
          if (parsedDesc) {
            const sim = FaceBiometrics.calculateSimilarity(capturedDesc, parsedDesc);
            if (sim > highestSimilarity) {
              secondSimilarity = highestSimilarity;
              highestSimilarity = sim;
              bestStudent = st;
            } else if (sim > secondSimilarity) {
              secondSimilarity = sim;
            }
          }
        }

        // Umbral calibrado de coincidencia facial (>= 70%)
        const targetThreshold = 70;

        if (highestSimilarity >= targetThreshold && bestStudent) {
          if (candidateStudent?.id === bestStudent.id) {
            consecutiveMatches++;
          } else {
            candidateStudent = bestStudent;
            consecutiveMatches = 1;
          }
          candidateConfidence = highestSimilarity;

          this.scanStatusText.set(`¡Rostro reconocido! ${bestStudent.lastName} ${bestStudent.firstName} (${highestSimilarity}%) [${consecutiveMatches}/2]`);

          // Al confirmar 2 lecturas consecutivas estables (~300ms), registra la asistencia
          if (consecutiveMatches >= 2) {
            const size = Math.min(video.videoWidth, video.videoHeight);
            const startX = (video.videoWidth - size) / 2;
            const startY = (video.videoHeight - size) / 2;
            ctx.drawImage(video, startX, startY, size, size, 0, 0, 320, 320);
            this.executeCheckIn(bestStudent, candidateConfidence, canvas);
          }
        } else {
          consecutiveMatches = 0;
          candidateStudent = null;
          if (bestStudent && highestSimilarity > 35) {
            this.scanStatusText.set(`Analizando: ${bestStudent.lastName} ${bestStudent.firstName} (${highestSimilarity}% / meta: ${targetThreshold}%)`);
          } else {
            this.scanStatusText.set('Rostro enfocado. Mantén la mirada fija hacia la cámara...');
          }
        }
      } catch (err) {
        console.error('Error durante análisis facial:', err);
      } finally {
        this.isAnalyzingFrame = false;
      }
    }, 150);
  }

  // Registra la asistencia en el backend
  private executeCheckIn(student: Student, confidence: number, canvas: HTMLCanvasElement): void {
    this.isSubmittingCheckin.set(true);
    this.stopCamera();

    const photoUrl = canvas.toDataURL('image/jpeg', 0.85);

    this.attendanceService.checkIn(this.sessionToken(), {
      studentId: student.id,
      confidenceScore: confidence,
      capturePhotoUrl: photoUrl
    }).subscribe({
      next: (record) => {
        this.isSubmittingCheckin.set(false);
        this.recognizedStudent.set(student);
        this.matchConfidence.set(confidence);
        this.checkInResult.set(record);
      },
      error: (err) => {
        this.isSubmittingCheckin.set(false);
        const msg = err.error?.message || 'Error al validar asistencia.';
        this.sessionError.set(msg);
      }
    });
  }

  // Reinicia el escaneo
  retryScan(): void {
    this.checkInResult.set(null);
    this.sessionError.set(null);
    this.startCamera();
  }
}
