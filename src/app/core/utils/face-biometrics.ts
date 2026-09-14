// Interface para el analisis detallado de malla facial 3D
export interface FaceMeshAnalysis {
  hasFace: boolean;
  isCentered?: boolean;
  pose: 'FRONT' | 'LEFT' | 'RIGHT' | 'CENTER';
  yawRatio: number;
  landmarks: { x: number; y: number; z: number }[];
  descriptor: number[];
  confidence: number;
  reason?: string;
}

// Resultado simplificado para compatibilidad
export interface FaceDetectionResult {
  hasFace: boolean;
  confidence: number;
  pose?: 'FRONT' | 'LEFT' | 'RIGHT' | 'CENTER';
  reason?: string;
}

// Motor de analisis biometrico facial con Google MediaPipe Face Mesh (468 Puntos 3D)
export class FaceBiometrics {
  private static faceMeshInstance: any = null;
  private static isInitializing = false;
  private static initPromise: Promise<boolean> | null = null;
  private static lastResults: any = null;

  // Inicializa el modelo Google MediaPipe Face Mesh
  static async initMediaPipe(): Promise<boolean> {
    if (this.faceMeshInstance) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise(async (resolve) => {
      try {
        if (!(window as any).FaceMesh) {
          await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
        }

        const FaceMeshClass = (window as any).FaceMesh;
        if (!FaceMeshClass) {
          resolve(false);
          return;
        }

        this.faceMeshInstance = new FaceMeshClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        this.faceMeshInstance.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65
        });

        this.faceMeshInstance.onResults((results: any) => {
          this.lastResults = results;
        });

        resolve(true);
      } catch (err) {
        console.error('Error al inicializar MediaPipe Face Mesh:', err);
        resolve(false);
      }
    });

    return this.initPromise;
  }

  // Carga asincrona de scripts CDN
  private static loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${url}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Error al cargar ${url}`));
      document.head.appendChild(script);
    });
  }

  // Canvas auxiliar para evaluacion rapida de nitidez (anti-blur)
  private static sharpnessCanvas: HTMLCanvasElement | null = null;

  // Evalua la nitidez y contraste de la region facial
  private static checkImageSharpness(
    input: HTMLVideoElement | HTMLCanvasElement,
    leftCheek: any,
    rightCheek: any,
    forehead: any,
    chin: any
  ): boolean {
    try {
      if (!this.sharpnessCanvas) {
        this.sharpnessCanvas = document.createElement('canvas');
        this.sharpnessCanvas.width = 64;
        this.sharpnessCanvas.height = 64;
      }
      const ctx = this.sharpnessCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return true;

      const inW = (input as HTMLVideoElement).videoWidth || (input as HTMLCanvasElement).width || 0;
      const inH = (input as HTMLVideoElement).videoHeight || (input as HTMLCanvasElement).height || 0;
      if (!inW || !inH) return true;

      const minX = Math.min(leftCheek.x, rightCheek.x);
      const maxX = Math.max(leftCheek.x, rightCheek.x);
      const minY = Math.min(forehead.y, chin.y);
      const maxY = Math.max(forehead.y, chin.y);

      const sx = Math.max(0, minX * inW);
      const sy = Math.max(0, minY * inH);
      const sw = Math.min(inW - sx, (maxX - minX) * inW);
      const sh = Math.min(inH - sy, (maxY - minY) * inH);

      if (sw <= 20 || sh <= 20) return true;

      ctx.drawImage(input, sx, sy, sw, sh, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64).data;

      // Calculo de contraste y gradiente espacial
      let sumGrad = 0;
      let count = 0;
      for (let y = 1; y < 63; y += 2) {
        for (let x = 1; x < 63; x += 2) {
          const i = (y * 64 + x) * 4;
          const iRight = (y * 64 + (x + 1)) * 4;
          const iDown = ((y + 1) * 64 + x) * 4;

          const gray = (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
          const grayR = (imgData[iRight] + imgData[iRight + 1] + imgData[iRight + 2]) / 3;
          const grayD = (imgData[iDown] + imgData[iDown + 1] + imgData[iDown + 2]) / 3;

          sumGrad += Math.abs(gray - grayR) + Math.abs(gray - grayD);
          count++;
        }
      }

      const avgGrad = sumGrad / (count || 1);
      // Descarta fotogramas solo si estan extremadamente oscuros o borrosos
      return avgGrad >= 1.5;
    } catch {
      return true;
    }
  }

  // Procesa un fotograma con MediaPipe Face Mesh
  static async processFrame(input: HTMLVideoElement | HTMLCanvasElement): Promise<FaceMeshAnalysis | null> {
    const ready = await this.initMediaPipe();
    if (!ready || !this.faceMeshInstance) {
      return this.fallbackAnalysis(input);
    }

    try {
      await this.faceMeshInstance.send({ image: input });
      const results = this.lastResults;

      if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        return {
          hasFace: false,
          isCentered: false,
          pose: 'CENTER',
          yawRatio: 0.5,
          landmarks: [],
          descriptor: [],
          confidence: 0,
          reason: 'No se detecta rostro. Ubícate frente a la cámara.'
        };
      }

      const rawLandmarks: { x: number; y: number; z: number }[] = results.multiFaceLandmarks[0];
      if (rawLandmarks.length < 468) {
        return {
          hasFace: false,
          isCentered: false,
          pose: 'CENTER',
          yawRatio: 0.5,
          landmarks: [],
          descriptor: [],
          confidence: 0,
          reason: 'Rostro incompleto. Centra tus ojos y nariz.'
        };
      }

      // Puntos clave de anatomia facial
      const noseTip = rawLandmarks[1];       // Punta de la nariz
      const chin = rawLandmarks[152];        // Menton
      const forehead = rawLandmarks[10];     // Frente superior
      const leftCheek = rawLandmarks[234];   // Pomulo izquierdo
      const rightCheek = rawLandmarks[454];  // Pomulo derecho
      const leftEye = rawLandmarks[33];      // Ojo izquierdo
      const rightEye = rawLandmarks[263];    // Ojo derecho

      // Calculo del centro y dimensiones relativas del rostro
      const centerX = (leftCheek.x + rightCheek.x) / 2;
      const centerY = (forehead.y + chin.y) / 2;
      const faceWidth = Math.abs(rightCheek.x - leftCheek.x) || 1e-5;
      const faceHeight = Math.abs(chin.y - forehead.y) || 1e-5;

      // 1. Validacion de centrado en el encuadre (dentro del ovalo)
      const isCenteredX = centerX >= 0.18 && centerX <= 0.82;
      const isCenteredY = centerY >= 0.12 && centerY <= 0.88;

      if (!isCenteredX || !isCenteredY) {
        return {
          hasFace: false,
          isCentered: false,
          pose: 'CENTER',
          yawRatio: 0.5,
          landmarks: rawLandmarks,
          descriptor: [],
          confidence: 0,
          reason: 'Ubica y centra tu rostro dentro del óvalo guía.'
        };
      }

      // 2. Validacion de distancia / escala
      if (faceWidth < 0.12 || faceHeight < 0.15) {
        return {
          hasFace: false,
          isCentered: false,
          pose: 'CENTER',
          yawRatio: 0.5,
          landmarks: rawLandmarks,
          descriptor: [],
          confidence: 0,
          reason: 'Acércate un poco más a la cámara.'
        };
      }

      if (faceWidth > 0.95) {
        return {
          hasFace: false,
          isCentered: false,
          pose: 'CENTER',
          yawRatio: 0.5,
          landmarks: rawLandmarks,
          descriptor: [],
          confidence: 0,
          reason: 'Aléjate un poco de la cámara.'
        };
      }

      // 3. Validacion de nitidez y estabilidad
      const isSharp = this.checkImageSharpness(input, leftCheek, rightCheek, forehead, chin);
      if (!isSharp) {
        return {
          hasFace: false,
          isCentered: false,
          pose: 'CENTER',
          yawRatio: 0.5,
          landmarks: rawLandmarks,
          descriptor: [],
          confidence: 0,
          reason: 'Imagen desenfocada o en movimiento. Mantén la cámara fija.'
        };
      }

      // Calculo de angulo y giro cefalico (Yaw ratio)
      const noseOffset = noseTip.x - Math.min(leftCheek.x, rightCheek.x);
      const yawRatio = noseOffset / faceWidth;

      let pose: 'FRONT' | 'LEFT' | 'RIGHT' | 'CENTER' = 'FRONT';
      if (yawRatio < 0.38) {
        pose = 'LEFT'; // Girado a su izquierda
      } else if (yawRatio > 0.62) {
        pose = 'RIGHT'; // Girado a su derecha
      } else {
        pose = 'FRONT'; // Mirando al frente
      }

      // Extraccion de descriptor geometrico de alta discriminacion (128D)
      const descriptor = this.extract128DFromLandmarks(rawLandmarks);

      return {
        hasFace: true,
        isCentered: true,
        pose,
        yawRatio: Math.round(yawRatio * 100) / 100,
        landmarks: rawLandmarks,
        descriptor,
        confidence: 99
      };
    } catch (e) {
      return this.fallbackAnalysis(input);
    }
  }

  // Dibuja la malla facial y puntos clave sobre el canvas de overlay
  static drawFaceMesh(
    canvas: HTMLCanvasElement,
    landmarks: { x: number; y: number; z: number }[],
    pose: string
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks || landmarks.length === 0) return;

    const w = canvas.width;
    const h = canvas.height;

    // Color segun orientacion y centrado
    if (pose === 'CENTER') {
      ctx.fillStyle = 'rgba(255, 193, 7, 0.85)';
      ctx.strokeStyle = 'rgba(255, 193, 7, 0.4)';
    } else {
      ctx.fillStyle = pose === 'FRONT' ? '#00e676' : '#2979ff';
      ctx.strokeStyle = 'rgba(0, 230, 118, 0.35)';
    }
    ctx.lineWidth = 1;

    // Dibuja subconjunto de puntos anatomicos principales (ojos, nariz, boca, contorno)
    const keyIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
      148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
      33, 133, 159, 145, 362, 263, 386, 374,
      1, 2, 98, 327,
      0, 13, 14, 17, 61, 291
    ];

    for (const idx of keyIndices) {
      if (landmarks[idx]) {
        const pt = landmarks[idx];
        const px = pt.x * w;
        const py = pt.y * h;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Dibuja triangulo central de orientacion (ojos a nariz)
    if (landmarks[33] && landmarks[263] && landmarks[1]) {
      const e1 = landmarks[33];
      const e2 = landmarks[263];
      const n = landmarks[1];

      ctx.beginPath();
      ctx.moveTo(e1.x * w, e1.y * h);
      ctx.lineTo(e2.x * w, e2.y * h);
      ctx.lineTo(n.x * w, n.y * h);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Genera descriptor unitario normalizado de 128 dimensiones a partir de coordenadas 3D profundas
  private static extract128DFromLandmarks(landmarks: { x: number; y: number; z: number }[]): number[] {
    const descriptor = new Array(128).fill(0);

    // Ejes de normalizacion anatomica invariante a escala y traslacion
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const dz = (rightEye.z || 0) - (leftEye.z || 0);
    const eyeDist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;

    const nose = landmarks[1];
    const chin = landmarks[152];
    const forehead = landmarks[10];
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];

    // Puntos de referencia anatomica distribuidos
    const samplePoints = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
      152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103,
      33, 133, 159, 145, 362, 263, 386, 374, 1, 2, 98, 327, 0, 13, 14, 17,
      67, 109, 296, 336, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2
    ];

    let idx = 0;

    // Bloque 1: Distancias 3D relativas a la punta de la nariz normalizadas por distancia interpupilar
    for (let i = 0; i < samplePoints.length && idx < 64; i++) {
      const pt = landmarks[samplePoints[i]];
      if (pt) {
        const dX = pt.x - nose.x;
        const dY = pt.y - nose.y;
        const dZ = (pt.z || 0) - (nose.z || 0);
        descriptor[idx++] = Math.sqrt(dX * dX + dY * dY + dZ * dZ) / eyeDist;
      }
    }

    // Bloque 2: Ratios geometricos de triangulacion estructural
    for (let i = 0; i < samplePoints.length && idx < 100; i++) {
      const pt = landmarks[samplePoints[i]];
      if (pt) {
        const dChin = Math.hypot(pt.x - chin.x, pt.y - chin.y);
        const dFore = Math.hypot(pt.x - forehead.x, pt.y - forehead.y);
        const dNose = Math.hypot(pt.x - nose.x, pt.y - nose.y);
        descriptor[idx++] = (dChin / (dFore || 1e-4)) * (dNose / eyeDist);
      }
    }

    // Bloque 3: Relaciones orofaciales e interoculares
    const mouthWidth = Math.hypot(rightMouth.x - leftMouth.x, rightMouth.y - leftMouth.y) || 1e-4;
    descriptor[idx++] = mouthWidth / eyeDist;
    descriptor[idx++] = Math.hypot(nose.x - chin.x, nose.y - chin.y) / eyeDist;
    descriptor[idx++] = Math.hypot(nose.x - forehead.x, nose.y - forehead.y) / eyeDist;

    // Relleno armonico de dimensiones complementarias
    while (idx < 128) {
      descriptor[idx] = (descriptor[idx % 64] * 0.75) + (descriptor[(idx + 1) % 64] * 0.25);
      idx++;
    }

    return this.normalizeVector(descriptor);
  }

  // Analisis de respaldo si MediaPipe no esta listo
  private static fallbackAnalysis(input: any): FaceMeshAnalysis {
    return {
      hasFace: false,
      pose: 'CENTER',
      yawRatio: 0.5,
      landmarks: [],
      descriptor: [],
      confidence: 0,
      reason: 'Inicializando motor de visión artificial...'
    };
  }

  // Promedia descriptores multifase (Frontal, Izquierda, Derecha)
  static averageDescriptors(descriptors: number[][]): number[] {
    if (descriptors.length === 0) return new Array(128).fill(0);
    const result = new Array(128).fill(0);

    for (const desc of descriptors) {
      for (let i = 0; i < 128; i++) {
        result[i] += desc[i];
      }
    }

    for (let i = 0; i < 128; i++) {
      result[i] /= descriptors.length;
    }

    return this.normalizeVector(result);
  }

  // Calcula el porcentaje de similitud basado en similitud de coseno
  static calculateSimilarity(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length !== 128 || v2.length !== 128) return 0;
    let dotProduct = 0;
    for (let i = 0; i < 128; i++) {
      dotProduct += v1[i] * v2[i];
    }
    // Clampeado a rango 0 - 100%
    const similarity = Math.max(0, Math.min(100, dotProduct * 100));
    return Math.round(similarity * 10) / 10;
  }

  // Normaliza el vector para longitud unitaria (norma L2 = 1)
  private static normalizeVector(vector: number[]): number[] {
    let sumSquares = 0;
    for (const val of vector) {
      sumSquares += val * val;
    }
    const norm = Math.sqrt(sumSquares) || 1e-6;
    return vector.map(v => v / norm);
  }

  // Convierte un descriptor a cadena JSON
  static descriptorToString(descriptor: number[]): string {
    return JSON.stringify(descriptor);
  }

  // Parsea un descriptor desde cadena JSON
  static parseDescriptor(descriptorStr: string | null | undefined): number[] | null {
    if (!descriptorStr || !descriptorStr.trim()) return null;
    try {
      const parsed = JSON.parse(descriptorStr);
      if (Array.isArray(parsed) && parsed.length === 128) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}

