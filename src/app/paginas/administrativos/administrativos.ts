import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Equipo, Estudiante, PerfilUsuario, Programa, Reserva, Salon } from '../../modelos';
import { ServicioAutenticacion } from '../../servicios/servicio-autenticacion';
import { PLANTILLA_RECHAZO, ServicioCorreo } from '../../servicios/servicio-correo';
import { ServicioHorarios } from '../../servicios/servicio-horarios';
import {
  ABREVIATURAS_DIAS, HORAS_TABLA, HORA_FIN_TABLA, NOMBRES_DIAS, activaEnFecha, buscarCruce, darFormatoFecha,
  obtenerDiaSemana, obtenerHoy, sumarDias, textoCruce, textoReserva, validarHorario,
} from '../../horarios';
// cualquier correo con formato válido (algo@dominio.ext)
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// plantas que siempre aparecen en el formulario de aulas
const PLANTAS_BASE = ['1', '2'];

// Supabase responde "ok" aunque las políticas (RLS) no dejen modificar la tabla
const MENSAJE_PERMISOS = 'Supabase no aplicó el cambio: revisa los permisos (RLS) de la tabla aulas.';

const MENSAJE_PERMISOS_EQUIPOS = 'Supabase no aplicó el cambio: revisa los permisos (RLS) de la tabla equipos.';

// estados posibles de un equipo y cómo se muestran
const ESTADOS_EQUIPO: Equipo['estado'][] = ['disponible', 'prestado', 'mantenimiento'];
const ETIQUETAS_ESTADO: Record<Equipo['estado'], string> = {
  disponible: 'Disponible',
  prestado: 'Prestado',
  mantenimiento: 'Mantenimiento',
};

const MENSAJE_PERMISOS_DIRECTORES = 'Supabase no aplicó el cambio: revisa los permisos (RLS) de la tabla perfiles.';

// estados posibles de un director
const ESTADOS_DIRECTOR: ('activo' | 'inactivo')[] = ['activo', 'inactivo'];

// pestañas del panel
type Vista = 'matriz' | 'solicitudes' | 'salones' | 'equipos' | 'directores';

// alto que necesita la lista de aulas
const ALTO_LISTA = 280;

// "TV, Py" -> ['TV', 'Py']; vacío o "NG" significa sin dotación
function extraerDotacion(texto: string): string[] {
  const partes = texto.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
  const unicas = [...new Set(partes)];
  return unicas.filter(p => p.toUpperCase() !== 'NG');
}

// separa por comas, espacios, punto y coma o saltos de línea
function extraerCorreos(texto: string): { buenos: string[]; malos: string[] } {
  const partes = texto.split(/[\s,;]+/).map(p => p.trim().toLowerCase()).filter(Boolean);
  const buenos = [...new Set(partes.filter(p => FORMATO_CORREO.test(p)))];
  const malos = partes.filter(p => !FORMATO_CORREO.test(p));
  return { buenos, malos };
}

interface Mensaje {
  tipo: 'exito' | 'informacion' | 'advertencia';
  texto: string;
}

// largo = cuántas horas ocupa la materia (colspan)
interface CeldaHora {
  hora: number;
  largo: number;
  reserva: Reserva | null;
}

interface FormularioAbierto {
  modo: 'crear' | 'editar';
  salon: Salon;
  reservaId: number | null;
}

interface ValoresIniciales {
  asignatura: string;
  programaId: number;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: number;
  horaFin: number;
  dias: number[];
}

interface FormularioDirectorAbierto {
  perfil: PerfilUsuario;
}

// aviso flotante abajo a la derecha
interface AvisoFlotante {
  titulo: string;
  texto: string;
}

interface FormularioEquipoAbierto {
  modo: 'crear' | 'editar';
  equipoId: number | null;
}

interface FormularioSalonAbierto {
  modo: 'crear' | 'editar';
  salonId: number | null;
}

// lista de aulas
interface ListaSalones {
  solicitud: Reserva;
  top: number;
  left: number;
  ancho: number;
}

@Component({
  selector: 'app-administrativos',
  imports: [ReactiveFormsModule],
  templateUrl: './administrativos.html',
  styleUrl: './administrativos.css',
})
export class Administrativos implements OnInit {
  private servicioHorarios = inject(ServicioHorarios);
  private servicioCorreo = inject(ServicioCorreo);
  private servicioAutenticacion = inject(ServicioAutenticacion);
  private enrutador = inject(Router);
  private elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly horasTabla = HORAS_TABLA;
  readonly horasFin = HORAS_TABLA.map(hora => hora + 1);
  readonly abreviaturasDias = ABREVIATURAS_DIAS;
  readonly textoReserva = textoReserva;
  readonly estadosEquipo = ESTADOS_EQUIPO;
  readonly estadosDirector = ESTADOS_DIRECTOR;

  // datos que vienen de supabase
  salones = signal<Salon[]>([]);
  reservas = signal<Reserva[]>([]);
  programas = signal<Programa[]>([]);
  directores = signal<PerfilUsuario[]>([]);
  estudiantes = signal<Estudiante[]>([]);
  equiposPrestados = signal(0);

  // estado de la pantalla
  fecha = signal(obtenerHoy());
  mensajes = signal<Mensaje[]>([]);
  formularioAbierto = signal<FormularioAbierto | null>(null);
  detalle = signal<Reserva | null>(null);
  diasSeleccionados = signal<number[]>([]);
  advertencia = signal('');
  guardando = signal(false);

  // pestaña activa y solicitud que está por rechazarse
  vista = signal<Vista>('matriz');
  solicitudARechazar = signal<Reserva | null>(null);

  // sección de aulas: formulario nueva/editar y aula que está por eliminarse
  formularioSalonAbierto = signal<FormularioSalonAbierto | null>(null);
  salonAEliminar = signal<Salon | null>(null);
  advertenciaSalon = signal('');

  // sección de directores: formulario de edición, director por eliminar y aviso flotante
  formularioDirectorAbierto = signal<FormularioDirectorAbierto | null>(null);
  directorAEliminar = signal<PerfilUsuario | null>(null);
  advertenciaDirector = signal('');
  aviso = signal<AvisoFlotante | null>(null);
  private temporizadorAviso: ReturnType<typeof setTimeout> | null = null;

  // sección de equipos: formulario nuevo/editar y equipo que está por eliminarse
  equipos = signal<Equipo[]>([]);
  formularioEquipoAbierto = signal<FormularioEquipoAbierto | null>(null);
  equipoAEliminar = signal<Equipo | null>(null);
  advertenciaEquipo = signal('');

  // lista de aulas desplegada en la pestaña de solicitudes (null = cerrada)
  listaSalones = signal<ListaSalones | null>(null);

  // guarda la materia que se está arrastrando
  private reservaArrastrada: Reserva | null = null;

  formularioMateria = new FormGroup({
    asignatura: new FormControl('', { nonNullable: true }),
    programaId: new FormControl(0, { nonNullable: true }),
    correoProfesor: new FormControl('', { nonNullable: true }),
    fechaInicio: new FormControl('', { nonNullable: true }),
    fechaFin: new FormControl('', { nonNullable: true }),
    horaInicio: new FormControl(8, { nonNullable: true }),
    horaFin: new FormControl(9, { nonNullable: true }),
    correosEstudiantes: new FormControl('', { nonNullable: true }),
  });

  formularioDirector = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
    programaId: new FormControl('', { nonNullable: true }),
    estado: new FormControl<'activo' | 'inactivo'>('activo', { nonNullable: true }),
  });

  formularioEquipo = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
    estado: new FormControl<Equipo['estado']>('disponible', { nonNullable: true }),
  });

  formularioSalon = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
    planta: new FormControl('1', { nonNullable: true }),
    dotacion: new FormControl('', { nonNullable: true }),
  });

  // computed

  nombreUsuario = computed(() => this.servicioAutenticacion.perfilActual()?.nombre ?? 'Administrador');
  asignaciones = computed(() => this.reservas().filter(r => r.estado === 'aprobada').length);
  solicitudesPendientes = computed(() => this.reservas().filter(r => r.estado === 'pendiente').length);
  // plantas base más cualquier otra que ya exista en las aulas
  plantas = computed(() => [...new Set([
    ...PLANTAS_BASE,
    ...this.salones().map(s => String(s.planta ?? '')).filter(Boolean),
  ])]);
  pendientes = computed(() => this.reservas().filter(r => r.estado === 'pendiente'));
  nombreDiaActual = computed(() => NOMBRES_DIAS[obtenerDiaSemana(this.fecha())]);
  fechaFormateada = computed(() => darFormatoFecha(this.fecha()));

  // arma las filas de la tabla: si una materia dura varias horas
  // se junta en una sola celda y se salta el resto de horas
  filas = computed(() => {
    const fecha = this.fecha();
    return this.salones().map(salon => {
      const celdas: CeldaHora[] = [];
      for (let i = 0; i < this.horasTabla.length; i++) {
        const hora = this.horasTabla[i];
        const reserva = this.reservas().find(r => r.salon_id === salon.id && r.estado === 'aprobada'
          && activaEnFecha(r, fecha) && r.hora_inicio <= hora && hora < r.hora_fin) ?? null;
        if (reserva && reserva.hora_inicio === hora) {
          const largo = Math.min(reserva.hora_fin, HORA_FIN_TABLA) - hora;
          celdas.push({ hora, largo, reserva });
          i += largo - 1;
        } else {
          celdas.push({ hora, largo: 1, reserva });
        }
      }
      return { salon, celdas };
    });
  });

  async ngOnInit(): Promise<void> {
    await this.cargarDatos();
  }

  async cargarDatos(): Promise<void> {
    try {
      const datos = await this.servicioHorarios.cargarDatos();
      this.salones.set(datos.salones);
      this.reservas.set(datos.reservas);
      this.programas.set(datos.programas);
      this.directores.set(datos.directores);
      this.estudiantes.set(datos.estudiantes);
      this.equipos.set(datos.equipos);
      this.equiposPrestados.set(datos.equiposPrestados);
    } catch {
      this.mensajes.set([{ tipo: 'advertencia', texto: 'No se pudieron cargar los datos. Revisa la conexión con Supabase.' }]);
    }
  }

  cerrarSesion(): void {
    this.servicioAutenticacion.cerrarSesion();
    this.enrutador.navigate(['/inicio']);
  }

  // cambiar de pestaña
  cambiarVista(vista: Vista): void {
    this.cerrarLista();
    this.mensajes.set([]);
    this.vista.set(vista);
    // al entrar a Solicitudes se recargan los datos para ver las nuevas
    if (vista === 'solicitudes') void this.cargarDatos();
  }

  // fechas

  moverFecha(dias: number): void { this.fecha.set(sumarDias(this.fecha(), dias)); }
  cambiarFecha(valor: string): void { if (valor) this.fecha.set(valor); }
  irAHoy(): void { this.fecha.set(obtenerHoy()); }

  // helpers para el html

  nombrePrograma(id: number): string { return this.programas().find(p => p.id === id)?.nombre ?? ''; }
  nombreSalon(id: number | null): string { return this.salones().find(s => s.id === id)?.nombre ?? ''; }
  correoDirector(id: string): string { return this.directores().find(d => d.id === id)?.correo ?? ''; }

  estudiantesDelPrograma(): number {
    const programaId = +this.formularioMateria.controls.programaId.value;
    return this.estudiantes().filter(e => e.programa_id === programaId).length;
  }

  // aulas

  // motivo error de Supabase (HttpErrorResponse) 
  private motivoDelError(error: unknown, porDefecto: string): string {
    const e = error as { status?: number; message?: string; error?: { message?: string; details?: string; hint?: string } };
    if (e?.status === 401 || e?.status === 403) return `${porDefecto} Sin permiso en Supabase (RLS).`;
    if (e?.status === 409) return `${porDefecto} Está en uso o ya existe.`;
    const detalle = e?.error?.message ?? e?.error?.details ?? e?.message;
    return detalle ? `${porDefecto} (${detalle})` : porDefecto;
  }

  // sin dotación se muestra NG
  etiquetasDotacion(salon: Salon): string[] {
    return salon.dotacion?.length ? salon.dotacion : ['NG'];
  }

  abrirFormularioSalonNuevo(): void {
    this.formularioSalon.reset({ nombre: '', planta: '1', dotacion: '' });
    this.advertenciaSalon.set('');
    this.formularioSalonAbierto.set({ modo: 'crear', salonId: null });
  }

  abrirFormularioSalonEditar(salon: Salon): void {
    this.formularioSalon.reset({
      nombre: salon.nombre ?? '',
      planta: String(salon.planta ?? '1'),
      dotacion: (salon.dotacion ?? []).join(', '),
    });
    this.advertenciaSalon.set('');
    this.formularioSalonAbierto.set({ modo: 'editar', salonId: salon.id });
  }

  cerrarFormularioSalon(): void {
    this.formularioSalonAbierto.set(null);
    this.advertenciaSalon.set('');
  }

  async guardarSalon(): Promise<void> {
    const abierto = this.formularioSalonAbierto();
    if (!abierto) return;
    const valores = this.formularioSalon.getRawValue();

    const nombre = valores.nombre.trim();
    if (!nombre) { this.advertenciaSalon.set('Escribe el nombre del aula.'); return; }
    if (!valores.planta) { this.advertenciaSalon.set('Elige la planta.'); return; }

    const repetido = this.salones().some(s =>
      s.id !== abierto.salonId && (s.nombre ?? '').trim().toLowerCase() === nombre.toLowerCase());
    if (repetido) { this.advertenciaSalon.set(`Ya existe un aula llamada ${nombre}.`); return; }

    const datos = { nombre, planta: valores.planta, dotacion: extraerDotacion(valores.dotacion) };

    this.guardando.set(true);
    try {
      if (abierto.modo === 'crear') await this.servicioHorarios.crearSalon(datos as Omit<Salon, 'id'>);
      else await this.servicioHorarios.actualizarSalon(abierto.salonId!, datos);

      await this.cargarDatos();

      //  compruebar cambio en la base de datos
      const guardado = this.salones().find(s =>
        abierto.modo === 'crear' ? s.nombre === nombre : s.id === abierto.salonId);
      if (!guardado || guardado.nombre !== nombre || String(guardado.planta ?? '') !== datos.planta) {
        throw new Error(MENSAJE_PERMISOS);
      }

      this.cerrarFormularioSalon();
      this.mensajes.set([{
        tipo: 'exito',
        texto: abierto.modo === 'crear' ? `Aula ${nombre} creada.` : `Aula ${nombre} actualizada.`,
      }]);
    } catch (error) {
      this.advertenciaSalon.set(this.motivoDelError(error, 'No se pudo guardar el aula.'));
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminarSalon(salon: Salon): Promise<void> {
    // un aula con asignaciones o solicitudes no se puede borrar
    const enUso = this.reservas().filter(r => r.salon_id === salon.id).length;
    if (enUso > 0) {
      this.salonAEliminar.set(null);
      this.mensajes.set([{
        tipo: 'advertencia',
        texto: `No se puede eliminar ${salon.nombre}: tiene ${enUso} asignación(es). Elimínalas primero desde la matriz.`,
      }]);
      return;
    }

    this.guardando.set(true);
    try {
      await this.servicioHorarios.eliminarSalon(salon.id);
      this.salonAEliminar.set(null);
      await this.cargarDatos();

      // el aula sigue en la lista, la base de datos no la borró
      if (this.salones().some(s => s.id === salon.id)) throw new Error(MENSAJE_PERMISOS);
      this.mensajes.set([{ tipo: 'exito', texto: `Aula ${salon.nombre || '--'} eliminada.` }]);
    } catch (error) {
      this.salonAEliminar.set(null);
      this.mensajes.set([{ tipo: 'advertencia', texto: this.motivoDelError(error, 'No se pudo eliminar el aula.') }]);
    } finally {
      this.guardando.set(false);
    }
  }

  // formulario

  //crea informacion automatica de la casilla
  private llenarFormulario(valores: ValoresIniciales): void {
    const { dias, ...campos } = valores;
    this.formularioMateria.reset({ ...campos, correoProfesor: '', correosEstudiantes: '' });
    this.diasSeleccionados.set(dias);
    this.mensajes.set([]);
  }

  // clic en celda libre
  abrirFormularioNuevo(salon: Salon, hora: number): void {
    this.llenarFormulario({
      asignatura: '',
      programaId: this.programas()[0]?.id ?? 0,
      fechaInicio: this.fecha(),
      fechaFin: this.fecha(),
      horaInicio: hora,
      horaFin: hora + 1,
      dias: [obtenerDiaSemana(this.fecha())],
    });
    this.advertencia.set('');
    this.formularioAbierto.set({ modo: 'crear', salon, reservaId: null });
  }

  // director del programa
  private directorDelPrograma(programaId: number): string {
    // toma directores activos
    const activos = this.directores().filter(d => (d.estado ?? 'activo') === 'activo');
    const director = activos.find(d => d.programa_id === programaId) ?? activos[0];
    return director?.id ?? '';
  }

  cerrarFormulario(): void {
    this.formularioAbierto.set(null);
    this.advertencia.set('');
  }

  alternarDia(indice: number): void {
    this.diasSeleccionados.update(dias =>
      dias.includes(indice) ? dias.filter(dia => dia !== indice) : [...dias, indice].sort());
  }

  // directores

  nombreProgramaDirector(director: PerfilUsuario): string {
    return director.programa_id ? (this.nombrePrograma(director.programa_id) || '--') : '--';
  }

  estadoDirector(director: PerfilUsuario): 'activo' | 'inactivo' {
    return director.estado === 'inactivo' ? 'inactivo' : 'activo';
  }

  // clases y solicitudes que tiene el director reservas aprobadas o pendientes
  private reservasDelDirector(id: string): number {
    return this.reservas().filter(r => r.director_id === id).length;
  }

  // aviso flotante se cierra solo a los 5 segundos
  private mostrarAviso(titulo: string, texto: string): void {
    if (this.temporizadorAviso) clearTimeout(this.temporizadorAviso);
    this.aviso.set({ titulo, texto });
    this.temporizadorAviso = setTimeout(() => this.aviso.set(null), 5000);
  }

  abrirFormularioDirector(director: PerfilUsuario): void {
    this.formularioDirector.reset({
      nombre: director.nombre ?? '',
      programaId: director.programa_id ? String(director.programa_id) : '',
      estado: this.estadoDirector(director),
    });
    this.advertenciaDirector.set('');
    this.formularioDirectorAbierto.set({ perfil: director });
  }

  cerrarFormularioDirector(): void {
    this.formularioDirectorAbierto.set(null);
    this.advertenciaDirector.set('');
  }

  async guardarDirector(): Promise<void> {
    const abierto = this.formularioDirectorAbierto();
    if (!abierto) return;
    const valores = this.formularioDirector.getRawValue();

    const nombre = valores.nombre.trim();
    if (!nombre) { this.advertenciaDirector.set('Escribe el nombre del director.'); return; }

    const programaId = valores.programaId ? +valores.programaId : null;
    const datos = { nombre, programa_id: programaId, estado: valores.estado };

    this.guardando.set(true);
    try {
      await this.servicioHorarios.actualizarDirector(abierto.perfil.id, datos);
      await this.cargarDatos();

      // comprueba que el cambio sí quedó en la base de datos
      const guardado = this.directores().find(d => d.id === abierto.perfil.id);
      if (!guardado || guardado.nombre !== nombre || (guardado.programa_id ?? null) !== programaId
        || this.estadoDirector(guardado) !== datos.estado) {
        throw new Error(MENSAJE_PERMISOS_DIRECTORES);
      }

      this.cerrarFormularioDirector();
      this.mensajes.set([{ tipo: 'exito', texto: `Director ${nombre} actualizado.` }]);
    } catch (error) {
      this.advertenciaDirector.set(this.motivoDelError(error, 'No se pudo guardar el director.'));
    } finally {
      this.guardando.set(false);
    }
  }

  // botón Eliminar
  pedirEliminarDirector(director: PerfilUsuario): void {
    if (this.reservasDelDirector(director.id) > 0) {
      this.mostrarAviso('No se puede eliminar', 'Ese director tiene clases o solicitudes asignadas.');
      return;
    }
    this.directorAEliminar.set(director);
  }

  async eliminarDirector(director: PerfilUsuario): Promise<void> {
    if (this.reservasDelDirector(director.id) > 0) {
      this.directorAEliminar.set(null);
      this.mostrarAviso('No se puede eliminar', 'Ese director tiene clases o solicitudes asignadas.');
      return;
    }

    this.guardando.set(true);
    try {
      await this.servicioHorarios.eliminarDirector(director.id);
      this.directorAEliminar.set(null);
      await this.cargarDatos();

      // si el director sigue en la lista, la base de datos no lo borró
      if (this.directores().some(d => d.id === director.id)) throw new Error(MENSAJE_PERMISOS_DIRECTORES);
      this.mensajes.set([{ tipo: 'exito', texto: `Director ${director.nombre} eliminado.` }]);
    } catch (error) {
      this.directorAEliminar.set(null);
      this.mensajes.set([{ tipo: 'advertencia', texto: this.motivoDelError(error, 'No se pudo eliminar el director.') }]);
    } finally {
      this.guardando.set(false);
    }
  }

  // equipos

  etiquetaEstado(estado: Equipo['estado']): string {
    return ETIQUETAS_ESTADO[estado] ?? estado;
  }

  abrirFormularioEquipoNuevo(): void {
    this.formularioEquipo.reset({ nombre: '', estado: 'disponible' });
    this.advertenciaEquipo.set('');
    this.formularioEquipoAbierto.set({ modo: 'crear', equipoId: null });
  }

  abrirFormularioEquipoEditar(equipo: Equipo): void {
    this.formularioEquipo.reset({ nombre: equipo.nombre ?? '', estado: equipo.estado });
    this.advertenciaEquipo.set('');
    this.formularioEquipoAbierto.set({ modo: 'editar', equipoId: equipo.id });
  }

  cerrarFormularioEquipo(): void {
    this.formularioEquipoAbierto.set(null);
    this.advertenciaEquipo.set('');
  }

  async guardarEquipo(): Promise<void> {
    const abierto = this.formularioEquipoAbierto();
    if (!abierto) return;
    const valores = this.formularioEquipo.getRawValue();

    const nombre = valores.nombre.trim();
    if (!nombre) { this.advertenciaEquipo.set('Escribe el nombre del equipo.'); return; }

    const repetido = this.equipos().some(e =>
      e.id !== abierto.equipoId && (e.nombre ?? '').trim().toLowerCase() === nombre.toLowerCase());
    if (repetido) { this.advertenciaEquipo.set(`Ya existe un equipo llamado ${nombre}.`); return; }

    const datos = { nombre, estado: valores.estado };

    this.guardando.set(true);
    try {
      if (abierto.modo === 'crear') await this.servicioHorarios.crearEquipo(datos);
      else await this.servicioHorarios.actualizarEquipo(abierto.equipoId!, datos);

      await this.cargarDatos();

      // comprueba que el cambio sí quedó en la base de datos
      const guardado = this.equipos().find(e =>
        abierto.modo === 'crear' ? e.nombre === nombre : e.id === abierto.equipoId);
      if (!guardado || guardado.nombre !== nombre || guardado.estado !== datos.estado) {
        throw new Error(MENSAJE_PERMISOS_EQUIPOS);
      }

      this.cerrarFormularioEquipo();
      this.mensajes.set([{
        tipo: 'exito',
        texto: abierto.modo === 'crear' ? `Equipo ${nombre} creado.` : `Equipo ${nombre} actualizado.`,
      }]);
    } catch (error) {
      this.advertenciaEquipo.set(this.motivoDelError(error, 'No se pudo guardar el equipo.'));
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminarEquipo(equipo: Equipo): Promise<void> {
    this.guardando.set(true);
    try {
      await this.servicioHorarios.eliminarEquipo(equipo.id);
      this.equipoAEliminar.set(null);
      await this.cargarDatos();

      // si el equipo sigue en la lista, la base de datos no lo borró
      if (this.equipos().some(e => e.id === equipo.id)) throw new Error(MENSAJE_PERMISOS_EQUIPOS);
      this.mensajes.set([{ tipo: 'exito', texto: `Equipo ${equipo.nombre} eliminado.` }]);
    } catch (error) {
      this.equipoAEliminar.set(null);
      this.mensajes.set([{ tipo: 'advertencia', texto: this.motivoDelError(error, 'No se pudo eliminar el equipo.') }]);
    } finally {
      this.guardando.set(false);
    }
  }

  // arrastrar y soltar

  alIniciarArrastre(evento: DragEvent, reserva: Reserva): void {
    this.reservaArrastrada = reserva;
    evento.dataTransfer?.setData('text/plain', String(reserva.id));
    if (evento.dataTransfer) evento.dataTransfer.effectAllowed = 'move';
  }

  // preventDefault
  permitirSoltar(evento: DragEvent): void {
    evento.preventDefault();
  }

  //abre el formulario en modo editar
  alSoltarEnCelda(evento: DragEvent, salon: Salon, hora: number): void {
    evento.preventDefault();
    const reserva = this.reservaArrastrada;
    this.reservaArrastrada = null;
    if (!reserva) return;

    const duracion = reserva.hora_fin - reserva.hora_inicio;
    this.llenarFormulario({
      asignatura: reserva.asignatura,
      programaId: reserva.programa_id,
      fechaInicio: reserva.fecha_inicio,
      fechaFin: reserva.fecha_fin,
      horaInicio: hora,
      horaFin: Math.min(hora + duracion, HORA_FIN_TABLA),
      dias: [...reserva.dias],
    });
    this.formularioAbierto.set({ modo: 'editar', salon, reservaId: reserva.id });
    this.revisarCruces();
  }

  // validaciones

  // devuelve true si no hay problemas
  revisarCruces(): boolean {
    const abierto = this.formularioAbierto();
    if (!abierto) return false;
    const valores = this.formularioMateria.getRawValue();

    const programa = this.programas().find(p => p.id === +valores.programaId);
    if (!programa) { this.advertencia.set('Elige un programa.'); return false; }

    const horario = {
      fecha_inicio: valores.fechaInicio,
      fecha_fin: valores.fechaFin,
      dias: this.diasSeleccionados(),
      hora_inicio: +valores.horaInicio,
      hora_fin: +valores.horaFin,
    };

    const errorDeHorario = validarHorario(programa, horario);
    if (errorDeHorario) { this.advertencia.set(errorDeHorario); return false; }

    // el director sale del programa elegido
    const directorId = this.directorDelPrograma(programa.id);

    // al editar se pasa el id para que no se cruce consigo misma
    // solo bloquea si el aula ya está ocupada por otra asignación
    if (this.salonOcupado(abierto.salon.id, { ...horario, id: abierto.reservaId ?? 0 })) {
      this.advertencia.set(`El aula ${abierto.salon.nombre} ya está ocupada en parte de ese horario.`);
      return false;
    }

    // si el director tiene otra clase a esa hora solo se avisa, no impide guardar
    const cruce = buscarCruce(
      this.reservas(),
      { ...horario, salon_id: abierto.salon.id, director_id: directorId, programa_id: programa.id },
      abierto.reservaId ?? 0);
    this.advertencia.set(cruce ? textoCruce(cruce, abierto.salon.nombre) : '');
    return true;
  }

  // guardar

  async guardarMateria(): Promise<void> {
    const abierto = this.formularioAbierto();
    if (!abierto) return;
    const valores = this.formularioMateria.getRawValue();

    if (!valores.asignatura.trim()) { this.advertencia.set('Escribe el nombre de la asignatura.'); return; }

    const correoProfesor = valores.correoProfesor.trim();
    if (!correoProfesor) { this.advertencia.set('Escribe el correo del profesor.'); return; }
    if (!FORMATO_CORREO.test(correoProfesor)) {
      this.advertencia.set('El correo del profesor no es válido.');
      return;
    }

    if (!this.revisarCruces()) return;

    const correos = extraerCorreos(valores.correosEstudiantes);
    if (correos.malos.length) {
      this.advertencia.set('Estos correos no son válidos: ' + correos.malos.slice(0, 3).join(', '));
      return;
    }

    const materia: Omit<Reserva, 'id'> = {
      salon_id: abierto.salon.id,
      programa_id: +valores.programaId,
      director_id: this.directorDelPrograma(+valores.programaId),
      asignatura: valores.asignatura.trim(),
      fecha_inicio: valores.fechaInicio,
      fecha_fin: valores.fechaFin,
      dias: this.diasSeleccionados(),
      hora_inicio: +valores.horaInicio,
      hora_fin: +valores.horaFin,
      necesidad: null,
      estado: 'aprobada',
    };

    this.guardando.set(true);
    try {
      const nuevos = correos.buenos.length
        ? await this.servicioHorarios.agregarEstudiantes(materia.programa_id, correos.buenos) : 0;

      if (abierto.modo === 'crear') await this.servicioHorarios.crearReserva(materia);
      else await this.servicioHorarios.actualizarReserva(abierto.reservaId!, materia);

      await this.cargarDatos();
      this.cerrarFormulario();

      const avisos: Mensaje[] = [{ tipo: 'exito', texto: 'Materia registrada correctamente.' }];
      if (nuevos > 0) avisos.push({ tipo: 'informacion', texto: `${nuevos} estudiante(s) nuevo(s) agregado(s) al programa.` });
      this.mensajes.set(avisos);

      // los correos se mandan después de guardar, si fallan la materia ya quedó
      const asunto = abierto.modo === 'crear' ? 'Aula asignada' : 'Cambio en tu asignación de aula';
      const avisosDeCorreo = await this.notificarPorCorreo(materia, asunto, correoProfesor);
      this.mensajes.update(actuales => [...actuales, ...avisosDeCorreo]);
    } catch (error) {
      this.advertencia.set(error instanceof Error ? error.message : 'No se pudo guardar la materia.');
    } finally {
      this.guardando.set(false);
    }
  }

  private async notificarPorCorreo(
    materia: Omit<Reserva, 'id'>, asunto: string, correoProfesor: string,
    destinatario: 'profesor' | 'director' = 'profesor',
  ): Promise<Mensaje[]> {
    if (!this.servicioCorreo.estaConfigurado()) {
      return [{ tipo: 'informacion', texto: 'EmailJS no está configurado: la materia se guardó, pero no se enviaron correos.' }];
    }

    const salon = this.salones().find(s => s.id === materia.salon_id);
    const datos = {
      asunto: `${asunto}: ${materia.asignatura}`,
      asignatura: materia.asignatura,
      programa: this.nombrePrograma(materia.programa_id),
      salon: salon?.nombre ?? '',
      profesor: correoProfesor,
      fecha_inicio: darFormatoFecha(materia.fecha_inicio),
      fecha_fin: darFormatoFecha(materia.fecha_fin),
      dias: materia.dias.map(d => ABREVIATURAS_DIAS[d]).join(', '),
      hora_inicio: `${materia.hora_inicio}:00`,
      hora_fin: `${materia.hora_fin}:00`,
      fechas: textoReserva(materia),
      horario: `${materia.hora_inicio}:00 a ${materia.hora_fin}:00`,
      recursos: salon?.dotacion.join(', ') ?? '',
    };
    const avisos: Mensaje[] = [];

    // profesor o director, según quién reciba el aviso
    if (!correoProfesor) {
      avisos.push({ tipo: 'advertencia', texto: `No hay correo registrado para el ${destinatario}.` });
    } else {
      try {
        await this.servicioCorreo.enviarCorreo(correoProfesor, datos);
        avisos.push({ tipo: 'exito', texto: `Correo enviado al ${destinatario}.` });
      } catch {
        avisos.push({ tipo: 'advertencia', texto: `No se pudo enviar el correo al ${destinatario}.` });
      }
    }

    // estudiantes
    const estudiantes = this.estudiantes().filter(e => e.programa_id === materia.programa_id);
    if (estudiantes.length) {
      const resultado = await this.servicioCorreo.enviarVarios(estudiantes.map(e => e.correo), datos);
      const enviados = resultado.enviados.length;
      avisos.push({
        tipo: enviados === estudiantes.length ? 'exito' : 'advertencia',
        texto: `Correo enviado a ${enviados} de ${estudiantes.length} estudiante(s).`,
      });
    }
    return avisos;
  }

  // eliminar

  async eliminarMateria(reserva: Reserva): Promise<void> {
    try {
      await this.servicioHorarios.eliminarReserva(reserva.id);
      this.detalle.set(null);
      await this.cargarDatos();
      this.mensajes.set([{ tipo: 'exito', texto: `Asignación «${reserva.asignatura}» eliminada.` }]);
    } catch {
      this.mensajes.set([{ tipo: 'advertencia', texto: 'No se pudo eliminar la asignación.' }]);
    }
  }

  // solicitudes

  // menú de aulas propio (lista) 
  alternarLista(evento: Event, solicitud: Reserva): void {

    if (this.listaSalones()?.solicitud.id === solicitud.id) {
      this.cerrarLista();
      return;
    }

    const boton = evento.currentTarget as HTMLElement;

    const falta = ALTO_LISTA - (window.innerHeight - boton.getBoundingClientRect().bottom);
    if (falta > 0) window.scrollBy({ top: falta, behavior: 'instant' });

    const caja = boton.getBoundingClientRect();
    const base = this.elemento.nativeElement.getBoundingClientRect();
    this.listaSalones.set({
      solicitud,
      top: caja.bottom - base.top,
      left: caja.left - base.left,
      ancho: caja.width,
    });
  }

  cerrarLista(): void {
    this.listaSalones.set(null);
  }

  // al elegir un aula en la lista se aprueba la solicitud ahí y aparece en la matriz
  elegirSalon(solicitud: Reserva, salonId: number): void {
    this.cerrarLista();
    this.aprobarSolicitud(solicitud, salonId);
  }

  // verificar si el aula está libre: mismas fechas, algún día en común y horas que se pisan
  private salonOcupado(
    salonId: number,
    solicitud: Pick<Reserva, 'fecha_inicio' | 'fecha_fin' | 'dias' | 'hora_inicio' | 'hora_fin'> & { id?: number },
  ): boolean {
    return this.reservas().some(r =>
      r.id !== solicitud.id && r.estado === 'aprobada' && r.salon_id === salonId
      && r.fecha_inicio <= solicitud.fecha_fin && solicitud.fecha_inicio <= r.fecha_fin
      && r.dias.some(d => solicitud.dias.includes(d))
      && r.hora_inicio < solicitud.hora_fin && solicitud.hora_inicio < r.hora_fin);
  }

  // lápiz del detalle
  abrirEdicion(reserva: Reserva): void {
    const salon = this.salones().find(s => s.id === reserva.salon_id);
    if (!salon) return;

    this.llenarFormulario({
      asignatura: reserva.asignatura,
      programaId: reserva.programa_id,
      fechaInicio: reserva.fecha_inicio,
      fechaFin: reserva.fecha_fin,
      horaInicio: reserva.hora_inicio,
      horaFin: reserva.hora_fin,
      dias: [...reserva.dias],
    });
    this.detalle.set(null);
    this.advertencia.set('');
    this.formularioAbierto.set({ modo: 'editar', salon, reservaId: reserva.id });
  }

  // si llega salonId usa esa aula; si no, toma la primera sin cruces (no envía correos)
  async aprobarSolicitud(reserva: Reserva, salonId?: number): Promise<void> {
    let salon: Salon | undefined;

    if (salonId) {
      salon = this.salones().find(s => s.id === salonId);
      if (!salon) return;
      if (this.salonOcupado(salon.id, reserva)) {
        this.mensajes.set([{ tipo: 'advertencia', texto: `El aula ${salon.nombre} ya está ocupada en parte de ese horario.` }]);
        return;
      }
    } else {
      salon = this.salones().find(s => !buscarCruce(this.reservas(), { ...reserva, salon_id: s.id }, reserva.id));
      if (!salon) {
        this.mensajes.set([{ tipo: 'advertencia', texto: 'No se pudo asignar: no hay aula libre o hay un cruce en ese horario.' }]);
        return;
      }
    }

    this.guardando.set(true);
    try {
      await this.servicioHorarios.actualizarReserva(reserva.id, { salon_id: salon.id, estado: 'aprobada' });
      await this.cargarDatos();
      // no se envía ningún correo: para notificar se usa el lápiz de la asignación en la matriz
      this.mensajes.set([{ tipo: 'exito', texto: `Solicitud «${reserva.asignatura}» aprobada en el aula ${salon.nombre}.` }]);
    } catch (error) {
      const motivo = (error as { message?: string })?.message;
      this.mensajes.set([{ tipo: 'advertencia', texto: 'No se pudo aprobar la solicitud.' + (motivo ? ` (${motivo})` : '') }]);
    } finally {
      this.guardando.set(false);
    }
  }

  // borra la solicitud y le avisa al director
  async rechazarSolicitud(reserva: Reserva): Promise<void> {
    this.solicitudARechazar.set(null);
    const correo = this.correoDirector(reserva.director_id);

    try {
      await this.servicioHorarios.eliminarReserva(reserva.id);
      await this.cargarDatos();
      this.mensajes.set([{ tipo: 'advertencia', texto: `Solicitud «${reserva.asignatura}» rechazada.` }]);
    } catch {
      this.mensajes.set([{ tipo: 'advertencia', texto: 'No se pudo rechazar la solicitud.' }]);
      return;
    }

    if (!this.servicioCorreo.estaConfigurado()) return;
    try {
      await this.servicioCorreo.enviarCorreo(correo, {
        asunto: `Solicitud rechazada: ${reserva.asignatura}`,
        asignatura: reserva.asignatura,
        programa: this.nombrePrograma(reserva.programa_id),
        salon: 'Sin aula asignada',
        profesor: correo,
        fecha_inicio: darFormatoFecha(reserva.fecha_inicio),
        fecha_fin: darFormatoFecha(reserva.fecha_fin),
        dias: reserva.dias.map(d => ABREVIATURAS_DIAS[d]).join(', '),
        hora_inicio: `${reserva.hora_inicio}:00`,
        hora_fin: `${reserva.hora_fin}:00`,
        recursos: reserva.necesidad ?? '',
      }, PLANTILLA_RECHAZO);
      this.mensajes.update(actuales => [...actuales, { tipo: 'exito', texto: `Correo de rechazo enviado a ${correo}.` }]);
    } catch {
      this.mensajes.update(actuales => [...actuales, { tipo: 'advertencia', texto: 'No se pudo enviar el correo de rechazo.' }]);
    }
  }
}