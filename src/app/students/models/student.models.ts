// Modelos e interfaces para la gestion de alumnos
export interface Student {
  id: number;
  courseId: number;
  code: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  hasFaceDescriptor: boolean;
  faceDescriptor?: string | null;
  photoUrl?: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateStudentRequest {
  code: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface UpdateStudentRequest {
  code: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface SaveFaceDescriptorRequest {
  faceDescriptor: string;
  photoUrl?: string;
}
