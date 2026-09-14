import { Course } from '../../courses/models/course.models';
import { Student } from '../../students/models/student.models';

// Utilidad para la generacion y descarga de reportes en formatos Excel (.xlsx) y PDF (.pdf)
export class DocumentExporter {

  // Ordena la lista de alumnos alfabeticamente por apellido (A-Z) y nombre (A-Z)
  private static sortStudentsAlphabetically(students: Student[]): Student[] {
    return [...students].sort((a, b) => {
      const cmpLast = a.lastName.localeCompare(b.lastName, 'es', { sensitivity: 'base' });
      if (cmpLast !== 0) return cmpLast;
      return a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' });
    });
  }

  // Carga asincrona de dependencias CDN
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

  // Exporta el listado de alumnos a formato Excel (.xlsx)
  static async exportToExcel(course: Course, students: Student[], professorName: string = 'Docente'): Promise<void> {
    const sortedStudents = this.sortStudentsAlphabetically(students);
    const fileName = `Reporte_Alumnos_${course.code.replace(/[^a-zA-Z0-9]/g, '_')}_Sec_${course.section}.xlsx`;

    try {
      if (!(window as any).XLSX) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      }

      const XLSX = (window as any).XLSX;
      if (!XLSX) {
        this.fallbackExportCsv(course, students);
        return;
      }

      const now = new Date();
      const formattedDate = now.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const enrolledCount = sortedStudents.filter(s => s.hasFaceDescriptor).length;
      const pendingCount = sortedStudents.length - enrolledCount;
      const coverage = sortedStudents.length > 0 ? Math.round((enrolledCount / sortedStudents.length) * 100) : 0;

      // Estructura de filas para el libro de Excel
      const sheetData: any[][] = [
        ['UNIVERSIDAD CATÓLICA SEDES SAPIENTIAE'],
        ['SISTEMA DE ASISTENCIA Y CONTROL BIOMÉTRICO FACIAL 3D'],
        [],
        ['INFORMACIÓN DEL CURSO'],
        ['Asignatura:', course.name],
        ['Código del Curso:', course.code, 'Sección:', course.section],
        ['Docente a Cargo:', professorName],
        ['Fecha de Emisión:', formattedDate],
        [],
        ['MÉTRICAS DE ENROLAMIENTO BIOMÉTRICO'],
        ['Total Matriculados:', sortedStudents.length, 'Enrolados (3D):', enrolledCount, 'Pendientes:', pendingCount, 'Cobertura Facial:', `${coverage}%`],
        [],
        ['N°', 'CÓDIGO', 'APELLIDOS', 'NOMBRES', 'CORREO INSTITUCIONAL', 'ESTADO BIOMÉTRICO']
      ];

      // Filas de alumnos
      sortedStudents.forEach((st, index) => {
        sheetData.push([
          index + 1,
          st.code,
          st.lastName.toUpperCase(),
          st.firstName,
          st.email || 'No registrado',
          st.hasFaceDescriptor ? 'ENROLADO (3D)' : 'PENDIENTE'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Anchos de columnas
      ws['!cols'] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 26 },
        { wch: 26 },
        { wch: 34 },
        { wch: 22 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Alumnos y Biometría');
      XLSX.writeFile(wb, fileName);

    } catch (err) {
      console.warn('Fallo la carga de XLSX desde CDN, usando descarga CSV como respaldo:', err);
      this.fallbackExportCsv(course, sortedStudents);
    }
  }

  // Exporta el listado de alumnos a formato PDF (.pdf)
  static async exportToPdf(course: Course, students: Student[], professorName: string = 'Docente'): Promise<void> {
    const sortedStudents = this.sortStudentsAlphabetically(students);
    const fileName = `Reporte_Alumnos_${course.code.replace(/[^a-zA-Z0-9]/g, '_')}_Sec_${course.section}.pdf`;

    try {
      if (!(window as any).jspdf) {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }
      if (!(window as any).jspdf?.jsPDF?.API?.autoTable) {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      }

      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const now = new Date();
      const formattedDate = now.toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const enrolledCount = sortedStudents.filter(s => s.hasFaceDescriptor).length;
      const pendingCount = sortedStudents.length - enrolledCount;
      const coverage = sortedStudents.length > 0 ? Math.round((enrolledCount / sortedStudents.length) * 100) : 0;

      // Encabezado institucional
      doc.setFillColor(11, 87, 208); // Azul institucional #0b57d0
      doc.rect(0, 0, 210, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('UNIVERSIDAD CATÓLICA SEDES SAPIENTIAE', 14, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Sistema de Asistencia y Control Biométrico Facial 3D', 14, 18);

      // Bloque de datos del curso
      doc.setFillColor(248, 250, 253);
      doc.roundedRect(14, 30, 182, 34, 3, 3, 'F');
      doc.setDrawColor(218, 220, 224);
      doc.roundedRect(14, 30, 182, 34, 3, 3, 'S');

      doc.setTextColor(31, 31, 31);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(course.name, 18, 38);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(95, 99, 104);
      doc.text(`Código: ${course.code}   |   Sección: ${course.section}   |   Docente: ${professorName}`, 18, 45);
      doc.text(`Fecha de Emisión: ${formattedDate}`, 18, 51);

      // Barra de resumen de metricas
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(11, 87, 208);
      doc.text(`Total: ${sortedStudents.length} alumnos   |   Enrolados: ${enrolledCount}   |   Pendientes: ${pendingCount}   |   Cobertura: ${coverage}%`, 18, 58);

      // Tabla de alumnos
      const tableRows = sortedStudents.map((st, idx) => [
        (idx + 1).toString(),
        st.code,
        `${st.lastName.toUpperCase()}, ${st.firstName}`,
        st.email || '-',
        st.hasFaceDescriptor ? 'ENROLADO (3D)' : 'PENDIENTE'
      ]);

      (doc as any).autoTable({
        startY: 69,
        head: [['N°', 'Código', 'Apellidos y Nombres', 'Correo Institucional', 'Estado Biométrico']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [11, 87, 208],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left'
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: [31, 31, 31]
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 26, fontStyle: 'bold' },
          2: { cellWidth: 62 },
          3: { cellWidth: 54 },
          4: { cellWidth: 30, halign: 'center' }
        },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.raw === 'ENROLADO (3D)') {
              data.cell.styles.textColor = [19, 115, 51]; // Verde
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [176, 96, 0]; // Naranja
            }
          }
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data: any) => {
          // Pie de pagina
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(128, 134, 139);
          doc.text(
            `Página ${data.pageNumber} de ${pageCount}  •  UIXCRISTIAN - UCSS Asistencia`,
            105,
            290,
            { align: 'center' }
          );
        }
      });

      doc.save(fileName);

    } catch (err) {
      console.warn('Fallo la generacion de PDF con jsPDF, abriendo ventana de impresion:', err);
      this.fallbackPrintPdf(course, sortedStudents, professorName);
    }
  }

  // Respaldo de descarga CSV
  private static fallbackExportCsv(course: Course, students: Student[]): void {
    const sorted = this.sortStudentsAlphabetically(students);
    const headers = ['N°', 'Código', 'Apellidos', 'Nombres', 'Correo', 'Estado Biométrico'];
    const rows = sorted.map((st, i) => [
      i + 1,
      `"${st.code}"`,
      `"${st.lastName}"`,
      `"${st.firstName}"`,
      `"${st.email || ''}"`,
      st.hasFaceDescriptor ? 'ENROLADO (3D)' : 'PENDIENTE'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_${course.code}_Sec_${course.section}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Respaldo de impresion nativa de navegador
  private static fallbackPrintPdf(course: Course, students: Student[], professorName: string): void {
    const sorted = this.sortStudentsAlphabetically(students);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = sorted.map((s, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="font-weight:bold;">${s.code}</td>
        <td>${s.lastName.toUpperCase()}, ${s.firstName}</td>
        <td>${s.email || '-'}</td>
        <td style="text-align:center; font-weight:bold; color:${s.hasFaceDescriptor ? '#137333' : '#b06000'};">
          ${s.hasFaceDescriptor ? 'ENROLADO' : 'PENDIENTE'}
        </td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reporte ${course.name} - ${course.code}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #1f1f1f; }
          h2 { margin: 0 0 5px 0; color: #0b57d0; }
          .meta { margin-bottom: 20px; color: #5f6368; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #dadce0; padding: 8px 10px; font-size: 13px; text-align: left; }
          th { background-color: #f1f3f4; color: #1f1f1f; }
        </style>
      </head>
      <body>
        <h2>${course.name}</h2>
        <div class="meta">
          Código: ${course.code} | Sección: ${course.section} | Docente: ${professorName}
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Código</th>
              <th>Apellidos y Nombres</th>
              <th>Correo Institucional</th>
              <th>Estado Facial</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
}
