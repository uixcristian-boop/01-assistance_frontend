import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CourseService } from '../../services/course.service';
import { Course, CreateCourseRequest, ScheduleSlot, UpdateCourseRequest } from '../../models/course.models';
import { NotificationService } from '../../../core/services/notification.service';

// Componente para listar cursos del profesor, registrar nuevos cursos y editar con horarios
@Component({
  selector: 'app-courses-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './courses-list.component.html',
  styleUrl: './courses-list.component.css'
})
export class CoursesListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly courseService = inject(CourseService);
  readonly notificationService = inject(NotificationService);

  // Estados reactivos
  readonly isModalOpen = signal<boolean>(false);
  readonly isEditMode = signal<boolean>(false);
  readonly editingCourseId = signal<number | null>(null);
  readonly activeTab = signal<'general' | 'schedules'>('general');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // Selector animado y horarios
  readonly isDayDropdownOpen = signal<boolean>(false);
  readonly scheduleSlots = signal<ScheduleSlot[]>([]);
  readonly daysOfWeek: string[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  tempDay: string = 'Lunes';
  tempStartTime: string = '08:00 AM';
  tempEndTime: string = '10:00 AM';

  // Estado del modal de seleccion de hora
  readonly isTimePickerModalOpen = signal<boolean>(false);
  readonly timePickerTarget = signal<'start' | 'end'>('start');
  readonly pickerHour = signal<number>(8);
  readonly pickerMinute = signal<number>(0);
  readonly pickerPeriod = signal<'AM' | 'PM'>('AM');
  readonly pickerActiveUnit = signal<'hour' | 'minute'>('hour');
  readonly hoursList: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  readonly minutesList: number[] = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  // Formulario reactivo con campos requeridos y opcionales
  readonly courseForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    code: ['', [Validators.required]],
    section: ['', [Validators.required]],
    credits: [null, [Validators.min(1)]],
    type: ['']
  });

  ngOnInit(): void {
    this.courseService.loadCourses().subscribe();
  }

  // Cierra todos los menus desplegables al hacer clic afuera
  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeAllDropdowns();
  }

  // Cierra todos los dropdowns de horarios
  closeAllDropdowns(): void {
    this.isDayDropdownOpen.set(false);
  }

  // Alterna el dropdown de dias
  toggleDayDropdown(event: MouseEvent): void {
    event.stopPropagation();
    const current = this.isDayDropdownOpen();
    this.closeAllDropdowns();
    this.isDayDropdownOpen.set(!current);
  }

  // Selecciona un dia del dropdown
  selectDay(day: string): void {
    this.tempDay = day;
    this.isDayDropdownOpen.set(false);
  }

  // Abre el modal de seleccion de hora para inicio o fin
  openTimePickerModal(target: 'start' | 'end'): void {
    this.closeAllDropdowns();
    this.timePickerTarget.set(target);
    const sourceTime = target === 'start' ? this.tempStartTime : this.tempEndTime;
    this.parseTimeToPicker(sourceTime);
    this.pickerActiveUnit.set('hour');
    this.isTimePickerModalOpen.set(true);
  }

  // Cierra el modal de seleccion de hora
  closeTimePickerModal(): void {
    this.isTimePickerModalOpen.set(false);
  }

  // Parsea una cadena de hora (ej. '03:15 PM') a las señales del selector
  private parseTimeToPicker(timeStr: string): void {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const p = (match[3]?.toUpperCase() === 'PM') ? 'PM' : 'AM';
      this.pickerHour.set(h >= 1 && h <= 12 ? h : 8);
      this.pickerMinute.set(m >= 0 && m <= 59 ? m : 0);
      this.pickerPeriod.set(p);
    } else {
      this.pickerHour.set(8);
      this.pickerMinute.set(0);
      this.pickerPeriod.set('AM');
    }
  }

  // Selecciona hora y avanza automaticamente a seleccion de minutos
  setPickerHour(hour: number): void {
    this.pickerHour.set(hour);
    this.pickerActiveUnit.set('minute');
  }

  // Selecciona minuto
  setPickerMinute(minute: number): void {
    this.pickerMinute.set(minute);
  }

  // Ajusta minutos con paso fino (+1 o -1)
  adjustMinute(delta: number): void {
    let next = this.pickerMinute() + delta;
    if (next < 0) next = 59;
    if (next > 59) next = 0;
    this.pickerMinute.set(next);
  }

  // Cambia el periodo AM / PM
  setPickerPeriod(period: 'AM' | 'PM'): void {
    this.pickerPeriod.set(period);
  }

  // Confirma y guarda la hora seleccionada
  confirmTimePicker(): void {
    const formattedHour = this.pickerHour().toString().padStart(2, '0');
    const formattedMinute = this.pickerMinute().toString().padStart(2, '0');
    const formattedTime = `${formattedHour}:${formattedMinute} ${this.pickerPeriod()}`;

    if (this.timePickerTarget() === 'start') {
      this.tempStartTime = formattedTime;
    } else {
      this.tempEndTime = formattedTime;
    }
    this.closeTimePickerModal();
  }

  // Cambia la pestaña activa en el modal
  setActiveTab(tab: 'general' | 'schedules'): void {
    this.activeTab.set(tab);
    this.closeAllDropdowns();
  }

  // Evita ingresar signos negativos o caracteres no numericos en creditos
  preventNegative(event: KeyboardEvent): void {
    if (['-', '+', 'e', 'E', '.'].includes(event.key)) {
      event.preventDefault();
    }
  }

  // Bloquea cualquier tecla que no sea O, E o teclas de navegacion/edicion
  validateTypeKey(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(event.key)) {
      return;
    }
    const key = event.key.toUpperCase();
    if (key !== 'O' && key !== 'E') {
      event.preventDefault();
    }
  }

  // Convierte a mayuscula y asegura que solo quede O o E
  onTypeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.toUpperCase();
    if (value && value !== 'O' && value !== 'E') {
      value = '';
    }
    input.value = value;
    this.courseForm.get('type')?.setValue(value, { emitEvent: false });
  }

  // Abre el modal para registrar un nuevo curso
  openModal(tab: 'general' | 'schedules' = 'general'): void {
    this.isEditMode.set(false);
    this.editingCourseId.set(null);
    this.activeTab.set(tab);
    this.closeAllDropdowns();
    this.courseForm.reset();
    this.scheduleSlots.set([]);
    this.tempDay = 'Lunes';
    this.tempStartTime = '08:00 AM';
    this.tempEndTime = '10:00 AM';
    this.errorMessage.set(null);
    this.isModalOpen.set(true);
  }

  // Abre el modal para editar un curso existente
  openEditModal(course: Course, tab: 'general' | 'schedules' = 'general'): void {
    this.isEditMode.set(true);
    this.editingCourseId.set(course.id);
    this.activeTab.set(tab);
    this.closeAllDropdowns();
    this.courseForm.patchValue({
      name: course.name,
      code: course.code,
      section: course.section,
      credits: course.credits ?? null,
      type: course.type ?? ''
    });

    const parsedSlots = this.parseSchedule(course.schedule);
    this.scheduleSlots.set(parsedSlots);

    if (parsedSlots.length > 0) {
      this.tempDay = parsedSlots[0].day || 'Lunes';
      this.tempStartTime = parsedSlots[0].startTime || '08:00 AM';
      this.tempEndTime = parsedSlots[0].endTime || '10:00 AM';
    } else {
      this.tempDay = 'Lunes';
      this.tempStartTime = '08:00 AM';
      this.tempEndTime = '10:00 AM';
    }

    this.errorMessage.set(null);
    this.isModalOpen.set(true);
  }

  // Cierra el modal de registro / edicion
  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingCourseId.set(null);
    this.closeAllDropdowns();
  }

  // Agrega un bloque de horario a la lista
  addScheduleSlot(): void {
    if (!this.tempDay || !this.tempStartTime || !this.tempEndTime) {
      return;
    }
    const newSlot: ScheduleSlot = {
      day: this.tempDay,
      startTime: this.tempStartTime,
      endTime: this.tempEndTime
    };

    // Evita agregar duplicados identicos
    const exists = this.scheduleSlots().some(
      s => s.day === newSlot.day && s.startTime === newSlot.startTime && s.endTime === newSlot.endTime
    );
    if (!exists) {
      this.scheduleSlots.update(slots => [...slots, newSlot]);
    }
  }

  // Estado de confirmacion para eliminar horario
  readonly isDeleteSlotConfirmOpen = signal<boolean>(false);
  readonly slotToDeleteIndex = signal<number | null>(null);

  // Solicita confirmacion antes de eliminar un horario
  requestDeleteScheduleSlot(index: number): void {
    this.slotToDeleteIndex.set(index);
    this.isDeleteSlotConfirmOpen.set(true);
  }

  // Cancela la eliminacion del horario
  cancelDeleteScheduleSlot(): void {
    this.isDeleteSlotConfirmOpen.set(false);
    this.slotToDeleteIndex.set(null);
  }

  // Confirma y elimina el horario seleccionado
  confirmDeleteScheduleSlot(): void {
    const idx = this.slotToDeleteIndex();
    if (idx !== null) {
      this.scheduleSlots.update(slots => slots.filter((_, i) => i !== idx));
    }
    this.isDeleteSlotConfirmOpen.set(false);
    this.slotToDeleteIndex.set(null);
  }

  // Obtiene el texto representativo del horario que se va a eliminar
  getSlotToDeleteText(): string {
    const idx = this.slotToDeleteIndex();
    if (idx === null) return '';
    const slot = this.scheduleSlots()[idx];
    if (!slot) return '';
    return slot.startTime && slot.endTime ? `${slot.day} ${slot.startTime} - ${slot.endTime}` : slot.day;
  }

  // Parsea la cadena de horarios guardada
  private parseSchedule(scheduleStr: string | null | undefined): ScheduleSlot[] {
    if (!scheduleStr || !scheduleStr.trim()) return [];
    const parts = scheduleStr.split('|').map(p => p.trim()).filter(Boolean);
    const slots: ScheduleSlot[] = [];
    for (const part of parts) {
      const match = part.match(/^([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\s+([0-9]{1,2}:[0-9]{2}(?:\s*[AaPp][Mm])?)\s*-\s*([0-9]{1,2}:[0-9]{2}(?:\s*[AaPp][Mm])?)$/);
      if (match) {
        slots.push({
          day: match[1].trim(),
          startTime: match[2].trim(),
          endTime: match[3].trim()
        });
      } else {
        const fallbackMatch = part.match(/^([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)(?:\s+(.+?)\s*-\s*(.+?))?$/);
        if (fallbackMatch && fallbackMatch[2] && fallbackMatch[3]) {
          slots.push({
            day: fallbackMatch[1].trim(),
            startTime: fallbackMatch[2].trim(),
            endTime: fallbackMatch[3].trim()
          });
        } else if (fallbackMatch) {
          slots.push({ day: fallbackMatch[1].trim(), startTime: '', endTime: '' });
        }
      }
    }
    return slots;
  }

  // Formatea la lista de horarios a cadena
  private formatSchedule(slots: ScheduleSlot[]): string {
    return slots
      .filter(s => s.day)
      .map(s => s.startTime && s.endTime ? `${s.day} ${s.startTime} - ${s.endTime}` : s.day)
      .join(' | ');
  }

  // Envia el formulario para guardar o actualizar el curso
  onSubmitCourse(): void {
    if (this.courseForm.invalid) {
      this.activeTab.set('general');
      this.courseForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const formVal = this.courseForm.value;
    const typeVal = formVal.type ? formVal.type.toString().trim().toUpperCase() : null;
    const creditsVal = formVal.credits ? Number(formVal.credits) : null;

    let currentSlots = [...this.scheduleSlots()];
    // Si la lista de horarios esta vacia pero el usuario configuro dia e inicio/fin, guardarlo automaticamente
    if (currentSlots.length === 0 && this.tempDay && this.tempStartTime && this.tempEndTime) {
      currentSlots = [{
        day: this.tempDay,
        startTime: this.tempStartTime,
        endTime: this.tempEndTime
      }];
      this.scheduleSlots.set(currentSlots);
    }

    const scheduleFormatted = this.formatSchedule(currentSlots);

    if (this.isEditMode() && this.editingCourseId()) {
      const updatePayload: UpdateCourseRequest = {
        name: formVal.name.trim(),
        code: formVal.code.trim(),
        section: formVal.section.trim(),
        credits: creditsVal && creditsVal > 0 ? creditsVal : null,
        type: typeVal === 'O' || typeVal === 'E' ? typeVal : null,
        schedule: scheduleFormatted
      };

      this.courseService.updateCourse(this.editingCourseId()!, updatePayload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.closeModal();
          this.notificationService.showSuccess('Curso actualizado exitosamente.');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const errorMsg = err.error?.message || err.error?.error || 'No se pudo actualizar el curso. Intente nuevamente.';
          this.errorMessage.set(errorMsg);
          this.notificationService.showError(errorMsg);
        }
      });
    } else {
      const createPayload: CreateCourseRequest = {
        name: formVal.name.trim(),
        code: formVal.code.trim(),
        section: formVal.section.trim(),
        credits: creditsVal && creditsVal > 0 ? creditsVal : null,
        type: typeVal === 'O' || typeVal === 'E' ? typeVal : null,
        schedule: scheduleFormatted
      };

      this.courseService.createCourse(createPayload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.closeModal();
          this.notificationService.showSuccess('Curso registrado exitosamente.');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const errorMsg = err.error?.message || err.error?.error || 'No se pudo registrar el curso. Intente nuevamente.';
          this.errorMessage.set(errorMsg);
          this.notificationService.showError(errorMsg);
        }
      });
    }
  }

  // Navega al modulo de gestion de alumnos y asistencia del curso
  goToStudents(courseId: number): void {
    this.router.navigate(['/dashboard/courses', courseId, 'students']);
  }
}
