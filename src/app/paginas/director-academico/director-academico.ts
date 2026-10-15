import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Equipo, Programa, Reserva, Salon } from '../../modelos';
import { ServicioApi } from '../../servicios/servicio-api';
import { ServicioAutenticacion } from '../../servicios/servicio-autenticacion';
import { PROGRAMAS_DE_EJEMPLO } from '../../servicios/servicio-horarios';
import { ABREVIATURAS_DIAS, HORAS_TABLA, darFormatoFecha, obtenerHoy, validarHorario } from '../../horarios';

type VistaDirector = 'clases' | 'nueva';

interface MensajeDirector {
  tipo: 'exito' | 'advertencia';
  texto: string;
}

@Component({
  selector: 'app-director-academico',
  imports: [ReactiveFormsModule],
  templateUrl: './director-academico.html',
  styleUrl: './director-academico.css',
})
export class DirectorAcademico implements OnInit {
  private enrutador = inject(Router);
  private servicioAutenticacion = inject(ServicioAutenticacion);
  private servicioApi = inject(ServicioApi);

  readonly horasInicio = HORAS_TABLA;
  readonly horasFin = HORAS_TABLA.map(hora => hora + 1);
  readonly abreviaturasDias = ABREVIATURAS_DIAS;

  perfil = this.servicioAutenticacion.perfilActual;

  // datos que vienen de supabase
  reservas = signal<Reserva[]>([]);
  aulas = signal<Salon[]>([]);
  programas = signal<Programa[]>([]);
  equipos = signal<Equipo[]>([]);

  // estado de la pantalla
  vista = signal<VistaDirector>('clases');
  mensaje = signal<MensajeDirector | null>(null);
  advertencia = signal('');
  guardando = signal(false);
  dias = signal<number[]>([]);

  formularioSolicitud = new FormGroup({
    asignatura: new FormControl('', { nonNullable: true }),
    programaId: new FormControl<number | null>(null),
    equipo: new FormControl('', { nonNullable: true }),
    fechaInicio: new FormControl(obtenerHoy(), { nonNullable: true }),
    fechaFin: new FormControl(obtenerHoy(), { nonNullable: true }),
    horaInicio: new FormControl(8, { nonNullable: true }),
    horaFin: new FormControl(9, { nonNullable: true }),
  });

  nombreUsuario = computed(() => this.perfil()?.nombre ?? 'Director Académico');

  // nombres de equipos sin repetir
  nombresEquipos = computed(() => [...new Set(this.equipos().map(e => e.nombre).filter(Boolean))]);

  async ngOnInit(): Promise<void> {
    await this.cargarDatos();
  }

  async cargarDatos(): Promise<void> {
    const perfil = this.perfil();
    if (!perfil) return;
    try {
      const [reservas, aulas, programas, equipos] = await Promise.all([
        firstValueFrom(this.servicioApi.obtener<Reserva>(
          'reservas', `select=*&director_id=eq.${perfil.id}&order=fecha_inicio.desc`)),
        // la tabla en la base de datos se sigue llamando "salones"
        firstValueFrom(this.servicioApi.obtener<Salon>('aulas', 'select=*&order=id')),
        firstValueFrom(this.servicioApi.obtener<Programa>('programas', 'select=*&order=nombre')),
        firstValueFrom(this.servicioApi.obtener<Equipo>('equipos', 'select=*&order=nombre')),
      ]);
      this.reservas.set(reservas);
      this.aulas.set(aulas);
      this.programas.set(programas.filter(p => PROGRAMAS_DE_EJEMPLO.includes(p.nombre)));
      this.equipos.set(equipos);

      // el programa del director queda seleccionado por defecto
      if (this.formularioSolicitud.controls.programaId.value === null) {
        const propio = this.programas().find(p => p.id === perfil.programa_id);
        this.formularioSolicitud.controls.programaId.setValue(propio?.id ?? this.programas()[0]?.id ?? null);
      }
    } catch {
      this.mensaje.set({ tipo: 'advertencia', texto: 'No se pudieron cargar los datos. Revisa la conexión con Supabase.' });
    }
  }

  salir(): void {
    this.servicioAutenticacion.cerrarSesion();
    this.enrutador.navigate(['/inicio']);
  }

  cambiarVista(vista: VistaDirector): void {
    this.mensaje.set(null);
    this.advertencia.set('');
    this.vista.set(vista);
    if (vista === 'clases') void this.cargarDatos();
  }

  // helpers para el html

  nombreAula(id: number | null): string {
    return this.aulas().find(a => a.id === id)?.nombre ?? '—';
  }

  textoFechas(reserva: Reserva): string {
    return reserva.fecha_inicio === reserva.fecha_fin
      ? darFormatoFecha(reserva.fecha_inicio)
      : `${darFormatoFecha(reserva.fecha_inicio)} → ${darFormatoFecha(reserva.fecha_fin)}`;
  }

  textoDias(reserva: Reserva): string {
    return reserva.dias.map(d => ABREVIATURAS_DIAS[d]).join(', ');
  }

  alternarDia(indice: number): void {
    this.dias.update(dias =>
      dias.includes(indice) ? dias.filter(dia => dia !== indice) : [...dias, indice].sort());
  }

  // envía la solicitud: queda "pendiente" y aparece en Solicitudes del administrativo
  async enviarSolicitud(): Promise<void> {
    this.advertencia.set('');
    const perfil = this.perfil();
    if (!perfil) { this.advertencia.set('Tu sesión expiró. Vuelve a iniciar sesión.'); return; }

    const v = this.formularioSolicitud.getRawValue();
    const asignatura = v.asignatura.trim();
    if (!asignatura) { this.advertencia.set('Escribe el nombre de la asignatura.'); return; }

    const programa = this.programas().find(p => p.id === Number(v.programaId));
    if (!programa) { this.advertencia.set('Elige un programa.'); return; }

    const horario = {
      fecha_inicio: v.fechaInicio,
      fecha_fin: v.fechaFin,
      dias: this.dias(),
      hora_inicio: Number(v.horaInicio),
      hora_fin: Number(v.horaFin),
    };
    const errorDeHorario = validarHorario(programa, horario);
    if (errorDeHorario) { this.advertencia.set(errorDeHorario); return; }

    // sin aula asignada: el administrativo la elige al aprobar
    const solicitud: Omit<Reserva, 'id'> = {
      salon_id: null,
      programa_id: programa.id,
      director_id: perfil.id,
      asignatura,
      ...horario,
      necesidad: v.equipo || null,
      estado: 'pendiente',
    };

    this.guardando.set(true);
    try {
      const creadas = await firstValueFrom(this.servicioApi.crear<Reserva>('reservas', solicitud));
      // si Supabase no devuelve la fila, las políticas (RLS) no dejaron guardar
      if (!creadas?.length) throw new Error('Supabase no aplicó el cambio: revisa los permisos (RLS) de la tabla reservas.');

      this.formularioSolicitud.reset({
        asignatura: '',
        programaId: programa.id,
        equipo: '',
        fechaInicio: obtenerHoy(),
        fechaFin: obtenerHoy(),
        horaInicio: 8,
        horaFin: 9,
      });
      this.dias.set([]);
      await this.cargarDatos();
      this.vista.set('clases');
      this.mensaje.set({ tipo: 'exito', texto: `Solicitud «${asignatura}» enviada. Quedó pendiente de aprobación.` });
    } catch (error) {
      this.advertencia.set(error instanceof Error && error.message.startsWith('Supabase')
        ? error.message
        : this.servicioApi.obtenerMensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }
}