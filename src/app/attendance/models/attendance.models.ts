import { Student } from '../../students/models/student.models';

// Modelos para el modulo de asistencia
export type AttendanceStatus = 'PRESENTE' | 'TARDANZA' | 'FALTA';

export interface AttendanceRecord {
  id: number;
  sessionId: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  status: AttendanceStatus;
  checkInTime: string;
  confidenceScore?: number | null;
  capturePhotoUrl?: string | null;
  createdAt: string;
}

export interface AttendanceSession {
  id: number;
  courseId: number;
  courseName: string;
  courseCode: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  lateThresholdMinutes: number;
  sessionToken: string;
  active: boolean;
  totalStudents: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  records: AttendanceRecord[];
  createdAt: string;
}

export interface CreateAttendanceSessionRequest {
  startTime: string;
  endTime: string;
  toleranceMinutes?: number;
  lateThresholdMinutes?: number;
}

export interface PublicSessionResponse {
  sessionToken: string;
  courseName: string;
  courseCode: string;
  section: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  lateThresholdMinutes: number;
  active: boolean;
  students: Student[];
}

export interface CheckInRequest {
  studentId: number;
  confidenceScore?: number;
  capturePhotoUrl?: string;
}
