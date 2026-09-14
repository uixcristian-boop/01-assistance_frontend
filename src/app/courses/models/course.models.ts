// Interfaces para modelos de cursos
export interface Course {
  id: number;
  name: string;
  code: string;
  section: string;
  credits?: number | null;
  type?: string | null;
  schedule?: string | null;
  professorId: number;
  active: boolean;
  createdAt: string;
}

export interface CreateCourseRequest {
  name: string;
  code: string;
  section: string;
  credits?: number | null;
  type?: string | null;
  schedule?: string | null;
}

export interface UpdateCourseRequest {
  name: string;
  code: string;
  section: string;
  credits?: number | null;
  type?: string | null;
  schedule?: string | null;
}

export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}
