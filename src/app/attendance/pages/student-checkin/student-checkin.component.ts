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

      if (this.videoPlayer?.nativeElement) {
        this.videoPlayer.nativeElement.srcObject = this.mediaStream;
        await this.videoPlayer.nativeElement.play();
        this.isCameraActive.set(true);
        this.startFaceRecognitionLoop();
      }
    } catch (err) {
      console.error('Error de acceso a camara:', err);
      this.scanStatusText.set('No se pudo acceder a la cámara. Conceda los permisos requeridos.');
    }
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
      if (this.checkInResult() || this.isSubmittingCheckin()) {
        return;
      }

      const video = this.videoPlayer?.nativeElement;
      if (!video || video.videoWidth === 0 || !ctx) return;

      const analysis = await FaceBiometrics.processFrame(video);
      if (!analysis || !analysis.hasFace) {
        consecutiveMatches = 0;
        candidateStudent = null;
        this.scanStatusText.set(analysis?.reason || 'Centra tu rostro dentro del marco ovalado');
        return;
      }

      const capturedDesc = analysis.descriptor;
      const students = this.sessionData()?.students || [];

      let bestStudent: Student | null = null;
      let highestSimilarity = 0;
      let secondSimilarity = 0;

      for (const st of students) {
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

      // Umbral estricto de coincidencia de alta precision (>= 90%)
      const hasConfidenceMargin = students.length <= 1 || (highestSimilarity - secondSimilarity >= 4);

      if (highestSimilarity >= 90 && bestStudent && hasConfidenceMargin) {
        if (candidateStudent?.id === bestStudent.id) {
          consecutiveMatches++;
        } else {
          candidateStudent = bestStudent;
          consecutiveMatches = 1;
        }
        candidateConfidence = highestSimilarity;

        this.scanStatusText.set(`Identificando: ${bestStudent.lastName} ${bestStudent.firstName} (${highestSimilarity}%) [${consecutiveMatches}/4]`);

        // Al confirmar 4 lecturas consecutivas seguras (aprox 1 segundo estable), registra la asistencia
        if (consecutiveMatches >= 4) {
          // Captura fotograma final
          const size = Math.min(video.videoWidth, video.videoHeight);
          const startX = (video.videoWidth - size) / 2;
          const startY = (video.videoHeight - size) / 2;
          ctx.drawImage(video, startX, startY, size, size, 0, 0, 320, 320);
          this.executeCheckIn(bestStudent, candidateConfidence, canvas);
        }
      } else {
        consecutiveMatches = 0;
        candidateStudent = null;
        this.scanStatusText.set(`Rostro detectado (468 puntos 3D). Mantén la vista fija...`);
      }
    }, 200);
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
