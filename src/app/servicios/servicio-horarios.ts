import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Equipo, Estudiante, PerfilUsuario, Programa, Reserva, Salon } from '../modelos';
import { ServicioApi } from './servicio-api';

// programas que se usan por ahora
export const PROGRAMAS_DE_EJEMPLO = ['Ingeniería Informática', 'Agroindustria'];

// datos que necesita la matriz
export interface DatosPanel {
  salones: Salon[];
  reservas: Reserva[];
  programas: Programa[];
  directores: PerfilUsuario[];
  estudiantes: Estudiante[];
  equipos: Equipo[];
  equiposPrestados: number;
}

@Injectable({ providedIn: 'root' })
export class ServicioHorarios {
  private servicioApi = inject(ServicioApi);

  // todas las consultas van en paralelo
  async cargarDatos(): Promise<DatosPanel> {
    const api = this.servicioApi;
    const [salones, reservas, programas, directores, estudiantes, equipos] = await Promise.all([
      firstValueFrom(api.obtener<Salon>('salones', 'select=*&order=id')),
      firstValueFrom(api.obtener<Reserva>('reservas', 'select=*&order=fecha_inicio')),
      firstValueFrom(api.obtener<Programa>('programas', 'select=*&order=nombre')),
      firstValueFrom(api.obtener<PerfilUsuario>('perfiles', 'select=*&rol=eq.director-academico&order=nombre')),
      firstValueFrom(api.obtener<Estudiante>('estudiantes', 'select=*&order=correo')),
      firstValueFrom(api.obtener<Equipo>('equipos', 'select=*&order=id')),
    ]);
    return {
      salones, reservas, directores, estudiantes, equipos,
      programas: programas.filter(p => PROGRAMAS_DE_EJEMPLO.includes(p.nombre)),
      equiposPrestados: equipos.filter(e => e.estado === 'prestado').length,
    };
  }

  async crearReserva(reserva: Omit<Reserva, 'id'>): Promise<void> {
    await firstValueFrom(this.servicioApi.crear('reservas', reserva));
  }

  async actualizarReserva(id: number, cambios: Partial<Reserva>): Promise<void> {
    await firstValueFrom(this.servicioApi.actualizar('reservas', `id=eq.${id}`, cambios));
  }

  async eliminarReserva(id: number): Promise<void> {
    await firstValueFrom(this.servicioApi.eliminar('reservas', `id=eq.${id}`));
  }

  // salones

  async crearSalon(salon: Omit<Salon, 'id'>): Promise<void> {
    await firstValueFrom(this.servicioApi.crear('salones', salon));
  }

  async actualizarSalon(id: number, cambios: Partial<Salon>): Promise<void> {
    await firstValueFrom(this.servicioApi.actualizar('salones', `id=eq.${id}`, cambios));
  }

  async eliminarSalon(id: number): Promise<void> {
    await firstValueFrom(this.servicioApi.eliminar('salones', `id=eq.${id}`));
  }

  // directores (perfiles con rol director-academico)

  async actualizarDirector(id: string, cambios: Partial<PerfilUsuario>): Promise<void> {
    await firstValueFrom(this.servicioApi.actualizar('perfiles', `id=eq.${id}`, cambios));
  }

  // en la base de datos un trigger también borra su usuario de acceso (auth.users)
  async eliminarDirector(id: string): Promise<void> {
    await firstValueFrom(this.servicioApi.eliminar('perfiles', `id=eq.${id}`));
  }

  // equipos

  async crearEquipo(equipo: Omit<Equipo, 'id'>): Promise<void> {
    await firstValueFrom(this.servicioApi.crear('equipos', equipo));
  }

  async actualizarEquipo(id: number, cambios: Partial<Equipo>): Promise<void> {
    await firstValueFrom(this.servicioApi.actualizar('equipos', `id=eq.${id}`, cambios));
  }

  async eliminarEquipo(id: number): Promise<void> {
    await firstValueFrom(this.servicioApi.eliminar('equipos', `id=eq.${id}`));
  }

  // devuelve cuántos correos eran nuevos
  async agregarEstudiantes(programaId: number, correos: string[]): Promise<number> {
    const filas = correos.map(correo => ({ correo, programa_id: programaId }));
    const agregados = await firstValueFrom(
      this.servicioApi.crear<Estudiante>('estudiantes', filas, 'on_conflict=correo', 'resolution=ignore-duplicates,return=representation'),
    );
    return agregados.length;
  }
}