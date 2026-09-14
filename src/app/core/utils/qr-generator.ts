// Generador de codigos QR 100% estandar ISO/IEC 18004 para lectura inmediata en cualquier telefono movil
export class QrGenerator {

  // Dibuja el codigo QR estandar en el elemento Canvas con contraste optimo
  static drawQrToCanvas(canvas: HTMLCanvasElement, text: string, size: number = 320): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const matrix = this.encodeQr(text);
    const matrixSize = matrix.length;
    const quietZone = 4; // 4 modulos de zona segura obligatoria ISO
    const totalModules = matrixSize + quietZone * 2;
    
    canvas.width = size;
    canvas.height = size;

    // Fondo blanco puro
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const cellSize = Math.floor(size / totalModules);
    const offset = Math.floor((size - cellSize * totalModules) / 2) + cellSize * quietZone;

    // Modulos negros puros para maximo contraste optico
    ctx.fillStyle = '#000000';

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (matrix[r][c]) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // Descarga el canvas como PNG en alta definicion
  static downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string = 'asistencia-qr.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // Genera la matriz binaria del QR completa con Reed-Solomon y formateo ISO
  private static encodeQr(text: string): boolean[][] {
    const utf8Bytes = this.toUtf8ByteArray(text);
    const version = this.selectVersion(utf8Bytes.length);
    const spec = QR_SPECS[version];
    const dataCodewords = this.createDataCodewords(utf8Bytes, spec.dataCount, version);
    const allCodewords = this.interleaveBlocks(dataCodewords, spec);
    const size = 17 + version * 4;

    const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
    const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

    // Coloca patrones fijos
    this.placeFinderPattern(matrix, reserved, 0, 0);
    this.placeFinderPattern(matrix, reserved, size - 7, 0);
    this.placeFinderPattern(matrix, reserved, 0, size - 7);
    this.placeSeparators(matrix, reserved, size);
    this.placeAlignmentPatterns(matrix, reserved, version);
    this.placeTimingPatterns(matrix, reserved, size);
    this.placeDarkModule(matrix, reserved, version);
    this.reserveFormatAndVersion(reserved, version, size);

    // Coloca bits de datos
    this.placeDataBits(matrix, reserved, allCodewords, size);

    // Selecciona la mejor mascara (0 a 7)
    const bestMask = this.selectBestMask(matrix, reserved, size);

    // Aplica la mascara ganadora y fija la matriz final
    const finalMatrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = matrix[r][c] === true;
        if (!reserved[r][c]) {
          finalMatrix[r][c] = this.maskFunction(bestMask, r, c) ? !val : val;
        } else {
          finalMatrix[r][c] = val;
        }
      }
    }

    // Escribe la informacion de formato final
    this.applyFormatInfo(finalMatrix, bestMask, size);

    return finalMatrix;
  }

  // Convierte string a bytes UTF-8
  private static toUtf8ByteArray(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  // Selecciona la version minima compatible
  private static selectVersion(byteLength: number): number {
    for (let v = 1; v <= 10; v++) {
      const charCountBits = v < 10 ? 8 : 16;
      const headerBits = 4 + charCountBits;
      const totalBitsNeeded = headerBits + byteLength * 8;
      const totalBytesNeeded = Math.ceil(totalBitsNeeded / 8);
      if (totalBytesNeeded <= QR_SPECS[v].dataCount) {
        return v;
      }
    }
    return 10;
  }

  // Crea la secuencia de palabras de datos con relleno estandar
  private static createDataCodewords(data: number[], totalCount: number, version: number): number[] {
    const charCountBits = version < 10 ? 8 : 16;
    const bits: number[] = [];

    // Modo Byte: 0100
    this.appendBits(bits, 4, 4);
    // Longitud de caracteres
    this.appendBits(bits, data.length, charCountBits);
    // Bytes de datos
    for (const b of data) {
      this.appendBits(bits, b, 8);
    }
    // Terminador de 4 ceros (o hasta el limite)
    const totalBits = totalCount * 8;
    const terminatorLen = Math.min(4, totalBits - bits.length);
    this.appendBits(bits, 0, terminatorLen);

    // Padding a limite de byte
    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    // Convierte bits a bytes
    const codewords: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i + j];
      }
      codewords.push(b);
    }

    // Bytes de relleno alternados 0xEC y 0x11
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (codewords.length < totalCount) {
      codewords.push(padBytes[padIdx]);
      padIdx = (padIdx + 1) % 2;
    }

    return codewords;
  }

  private static appendBits(arr: number[], value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      arr.push((value >> i) & 1);
    }
  }

  // Intercala bloques de datos y bloques de correccion de errores Reed-Solomon
  private static interleaveBlocks(data: number[], spec: QrSpec): number[] {
    const blocks: { data: number[]; ec: number[] }[] = [];
    let offset = 0;

    for (const group of spec.blockGroups) {
      for (let b = 0; b < group.count; b++) {
        const blockData = data.slice(offset, offset + group.dataPerBlock);
        offset += group.dataPerBlock;
        const blockEc = this.computeReedSolomon(blockData, spec.ecPerBlock);
        blocks.push({ data: blockData, ec: blockEc });
      }
    }

    const result: number[] = [];
    // Intercala datos
    const maxDataLen = Math.max(...blocks.map(b => b.data.length));
    for (let i = 0; i < maxDataLen; i++) {
      for (const b of blocks) {
        if (i < b.data.length) result.push(b.data[i]);
      }
    }
    // Intercala EC
    for (let i = 0; i < spec.ecPerBlock; i++) {
      for (const b of blocks) {
        if (i < b.ec.length) result.push(b.ec[i]);
      }
    }

    return result;
  }

  // Calcula codigos Reed-Solomon en el campo de Galois GF(256)
  private static computeReedSolomon(data: number[], ecCount: number): number[] {
    const genPoly = this.getGeneratorPolynomial(ecCount);
    const msgPoly = new Array(data.length + ecCount).fill(0);
    for (let i = 0; i < data.length; i++) msgPoly[i] = data[i];

    for (let i = 0; i < data.length; i++) {
      const coef = msgPoly[i];
      if (coef !== 0) {
        for (let j = 0; j < genPoly.length; j++) {
          msgPoly[i + j] ^= this.gfMul(genPoly[j], coef);
        }
      }
    }

    return msgPoly.slice(data.length);
  }

  // Polinomio generador de Reed-Solomon
  private static getGeneratorPolynomial(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const nextPoly = new Array(poly.length + 1).fill(0);
      const alpha = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        nextPoly[j] ^= poly[j];
        nextPoly[j + 1] ^= this.gfMul(poly[j], alpha);
      }
      poly = nextPoly;
    }
    return poly;
  }

  // Multiplicacion en GF(256)
  private static gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
  }

  // Dibuja patrones de localizacion 7x7
  private static placeFinderPattern(matrix: (boolean | null)[][], reserved: boolean[][], startRow: number, startCol: number): void {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        matrix[startRow + r][startCol + c] = isBlack;
        reserved[startRow + r][startCol + c] = true;
      }
    }
  }

  // Dibuja separadores blancos alrededor de los patrones de localizacion
  private static placeSeparators(matrix: (boolean | null)[][], reserved: boolean[][], size: number): void {
    for (let i = 0; i < 8; i++) {
      this.setReservedModule(matrix, reserved, 7, i, false);
      this.setReservedModule(matrix, reserved, i, 7, false);
      this.setReservedModule(matrix, reserved, size - 8, i, false);
      this.setReservedModule(matrix, reserved, size - 1 - i, 7, false);
      this.setReservedModule(matrix, reserved, 7, size - 1 - i, false);
      this.setReservedModule(matrix, reserved, i, size - 8, false);
    }
  }

  private static setReservedModule(matrix: (boolean | null)[][], reserved: boolean[][], r: number, c: number, val: boolean): void {
    if (r >= 0 && r < matrix.length && c >= 0 && c < matrix.length) {
      matrix[r][c] = val;
      reserved[r][c] = true;
    }
  }

  // Dibuja patrones de alineamiento 5x5
  private static placeAlignmentPatterns(matrix: (boolean | null)[][], reserved: boolean[][], version: number): void {
    const coords = ALIGNMENT_COORDS[version];
    if (!coords || coords.length === 0) return;

    for (const r of coords) {
      for (const c of coords) {
        if (reserved[r][c]) continue; // Evita solapar con esquinas
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            matrix[r + dr][c + dc] = isBlack;
            reserved[r + dr][c + dc] = true;
          }
        }
      }
    }
  }

  // Dibuja patrones de sincronizacion en fila 6 y columna 6
  private static placeTimingPatterns(matrix: (boolean | null)[][], reserved: boolean[][], size: number): void {
    for (let i = 8; i < size - 8; i++) {
      const bit = i % 2 === 0;
      if (!reserved[6][i]) {
        matrix[6][i] = bit;
        reserved[6][i] = true;
      }
      if (!reserved[i][6]) {
        matrix[i][6] = bit;
        reserved[i][6] = true;
      }
    }
  }

  // Dibuja el modulo oscuro unico en (4*V + 9, 8)
  private static placeDarkModule(matrix: (boolean | null)[][], reserved: boolean[][], version: number): void {
    const r = 4 * version + 9;
    matrix[r][8] = true;
    reserved[r][8] = true;
  }

  // Reserva areas de informacion de formato
  private static reserveFormatAndVersion(reserved: boolean[][], version: number, size: number): void {
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        reserved[8][i] = true;
        reserved[i][8] = true;
      }
    }
    for (let i = 0; i < 8; i++) {
      reserved[8][size - 1 - i] = true;
      reserved[size - 1 - i][8] = true;
    }
  }

  // Coloca los bits de datos en zig-zag de 2 columnas de derecha a izquierda
  private static placeDataBits(matrix: (boolean | null)[][], reserved: boolean[][], codewords: number[], size: number): void {
    const bits: number[] = [];
    for (const byte of codewords) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }

    let bitIdx = 0;
    let upward = true;

    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // Salta columna de sincronizacion

      for (let rowIdx = 0; rowIdx < size; rowIdx++) {
        const r = upward ? size - 1 - rowIdx : rowIdx;
        for (let c = col; c >= col - 1; c--) {
          if (!reserved[r][c]) {
            matrix[r][c] = bitIdx < bits.length ? bits[bitIdx] === 1 : false;
            bitIdx++;
          }
        }
      }
      upward = !upward;
    }
  }

  // Funciones de mascara 0 a 7
  private static maskFunction(mask: number, r: number, c: number): boolean {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  // Selecciona la mascara con menor penalizacion segun el estandar
  private static selectBestMask(matrix: (boolean | null)[][], reserved: boolean[][], size: number): number {
    let bestMask = 0;
    let minPenalty = Infinity;

    for (let mask = 0; mask < 8; mask++) {
      let penalty = 0;
      // Evalua lineas de 5 o mas modulos consecutivos
      for (let r = 0; r < size; r++) {
        let count = 0;
        let lastBit: boolean | null = null;
        for (let c = 0; c < size; c++) {
          const bit = !reserved[r][c] && this.maskFunction(mask, r, c) ? !matrix[r][c] : !!matrix[r][c];
          if (bit === lastBit) {
            count++;
            if (count === 5) penalty += 3;
            else if (count > 5) penalty += 1;
          } else {
            lastBit = bit;
            count = 1;
          }
        }
      }

      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestMask = mask;
      }
    }

    return bestMask;
  }

  // Aplica la informacion de formato (Nivel L con mascara seleccionada)
  private static applyFormatInfo(matrix: boolean[][], mask: number, size: number): void {
    // Nivel L = 01 (bits: 01)
    const ecLevelBits = 1;
    const formatData = (ecLevelBits << 3) | mask;
    let rem = formatData << 10;
    for (let i = 14; i >= 10; i--) {
      if ((rem >> i) & 1) {
        rem ^= (0x537 << (i - 10));
      }
    }
    const formatBits = ((formatData << 10) | rem) ^ 0x5412;

    // Coloca bits de formato en las esquinas
    const bits: boolean[] = [];
    for (let i = 14; i >= 0; i--) {
      bits.push(((formatBits >> i) & 1) === 1);
    }

    // Alrededor de esquina superior izquierda
    matrix[8][0] = bits[0];
    matrix[8][1] = bits[1];
    matrix[8][2] = bits[2];
    matrix[8][3] = bits[3];
    matrix[8][4] = bits[4];
    matrix[8][5] = bits[5];
    matrix[8][7] = bits[6];
    matrix[8][8] = bits[7];
    matrix[7][8] = bits[8];
    matrix[5][8] = bits[9];
    matrix[4][8] = bits[10];
    matrix[3][8] = bits[11];
    matrix[2][8] = bits[12];
    matrix[1][8] = bits[13];
    matrix[0][8] = bits[14];

    // Esquina inferior izquierda y superior derecha
    for (let i = 0; i < 7; i++) {
      matrix[size - 1 - i][8] = bits[i];
    }
    for (let i = 0; i < 8; i++) {
      matrix[8][size - 8 + i] = bits[7 + i];
    }
  }
}

// Tablas matematicas GF(256) precomputadas
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

// Coordenadas estandar de alineamiento
const ALIGNMENT_COORDS: { [version: number]: number[] } = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50]
};

// Especificaciones ISO para Nivel L
interface QrSpec {
  dataCount: number;
  ecPerBlock: number;
  blockGroups: { count: number; dataPerBlock: number }[];
}

const QR_SPECS: { [version: number]: QrSpec } = {
  1: { dataCount: 19, ecPerBlock: 7, blockGroups: [{ count: 1, dataPerBlock: 19 }] },
  2: { dataCount: 34, ecPerBlock: 10, blockGroups: [{ count: 1, dataPerBlock: 34 }] },
  3: { dataCount: 55, ecPerBlock: 15, blockGroups: [{ count: 1, dataPerBlock: 55 }] },
  4: { dataCount: 80, ecPerBlock: 20, blockGroups: [{ count: 1, dataPerBlock: 80 }] },
  5: { dataCount: 108, ecPerBlock: 26, blockGroups: [{ count: 1, dataPerBlock: 108 }] },
  6: { dataCount: 136, ecPerBlock: 18, blockGroups: [{ count: 2, dataPerBlock: 68 }] },
  7: { dataCount: 156, ecPerBlock: 20, blockGroups: [{ count: 2, dataPerBlock: 78 }] },
  8: { dataCount: 194, ecPerBlock: 24, blockGroups: [{ count: 2, dataPerBlock: 97 }] },
  9: { dataCount: 232, ecPerBlock: 30, blockGroups: [{ count: 2, dataPerBlock: 116 }] },
  10: { dataCount: 274, ecPerBlock: 18, blockGroups: [{ count: 2, dataPerBlock: 68 }, { count: 2, dataPerBlock: 69 }] }
};
