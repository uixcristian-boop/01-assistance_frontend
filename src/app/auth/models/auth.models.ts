// Interfaces para solicitudes y respuestas de autenticacion
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterProfessorRequest {
  fullName: string;
  email: string;
}

export interface AuthResponse {
  token?: string;
  type?: string;
  id?: number;
  fullName?: string;
  email?: string;
  role?: string;
  profilePicture?: string;
  message?: string;
  temporaryPassword?: string;
}

export interface UserSession {
  id: number;
  fullName: string;
  email: string;
  role: string;
  profilePicture?: string;
}

export interface UpdateProfileRequest {
  fullName: string;
  profilePicture?: string;
}
