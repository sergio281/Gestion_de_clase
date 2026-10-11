import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, switchMap, tap, throwError } from 'rxjs';
import { DatosRegistro, PerfilUsuario, RespuestaSesion } from '../modelos';
import { ServicioApi } from './servicio-api';

const CLAVE_ALMACENAMIENTO = 'sesion-salones';

@Injectable({ providedIn: 'root' })
export class ServicioAutenticacion {
  private servicioApi = inject(ServicioApi);

  // null si no hay sesión
  perfilActual = signal<PerfilUsuario | null>(null);

  constructor() {
    this.restaurarSesion();
  }

  // login: trae el token y después el perfil con el rol
  iniciarSesion(correo: string, clave: string): Observable<PerfilUsuario> {
    const correoLimpio = correo.trim().toLowerCase();

    return this.servicioApi.autenticar<RespuestaSesion>('token?grant_type=password', { email: correoLimpio, password: clave }).pipe(
      tap(respuesta => (this.servicioApi.tokenSesion = respuesta.access_token)),
      switchMap(respuesta => this.servicioApi.obtener<PerfilUsuario>('perfiles', `id=eq.${respuesta.user.id}&select=*`)),
      map(perfiles => {
        const perfil = perfiles[0];
        if (!perfil) throw new Error('No existe un perfil para este usuario.');
        return perfil;
      }),
      tap(perfil => this.guardarSesion(perfil)),
      catchError(error => {
        this.cerrarSesion();
        return throwError(() => new Error(this.servicioApi.obtenerMensajeError(error)));
      }),
    );
  }

  registrarDirectorAcademico(datos: DatosRegistro): Observable<void> {
    const cuerpo = {
      email: datos.correo,
      password: datos.clave,
      data: {
        nombre: datos.nombreCompleto,
        documento: datos.documento,
        telefono: datos.telefono,
        programa_id: String(datos.programaId),
      },
    };
    return this.servicioApi.autenticar<unknown>('signup', cuerpo).pipe(
      map(() => undefined),
      catchError(error => throwError(() => new Error(this.servicioApi.obtenerMensajeError(error)))),
    );
  }

  cerrarSesion(): void {
    this.servicioApi.tokenSesion = null;
    this.perfilActual.set(null);
    localStorage.removeItem(CLAVE_ALMACENAMIENTO);
  }

  // se guarda en localStorage para no perder la sesión al recargar
  private guardarSesion(perfil: PerfilUsuario): void {
    this.perfilActual.set(perfil);
    localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify({ token: this.servicioApi.tokenSesion, perfil }));
  }

  private restaurarSesion(): void {
    try {
      const guardado = localStorage.getItem(CLAVE_ALMACENAMIENTO);
      if (!guardado) return;
      const { token, perfil } = JSON.parse(guardado);
      this.servicioApi.tokenSesion = token;
      this.perfilActual.set(perfil);
    } catch {
      localStorage.removeItem(CLAVE_ALMACENAMIENTO);
    }
  }
}