import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { entorno } from '../../entorno';

/**
 * Servicio HTTP general. Todas las peticiones a Supabase pasan por aquí:
 * agrega las cabeceras necesarias y traduce los errores a mensajes legibles.
 */
@Injectable({ providedIn: 'root' })
export class ServicioApi {
  private clienteHttp = inject(HttpClient);

  /** Token de la sesión activa. Lo asigna el servicio de autenticación. */
  tokenSesion: string | null = null;

  /** Cabeceras comunes: la clave pública y, si hay sesión, el token del usuario. */
  private crearEncabezados(devolverRegistros: boolean): HttpHeaders {
    let encabezados = new HttpHeaders({
      apikey: entorno.supabaseClave,
      'Content-Type': 'application/json',
    });
    if (this.tokenSesion) {
      encabezados = encabezados.set('Authorization', `Bearer ${this.tokenSesion}`);
    }
    if (devolverRegistros) {
      encabezados = encabezados.set('Prefer', 'return=representation');
    }
    return encabezados;
  }

  /** Arma la dirección de una tabla con sus filtros, por ejemplo "estado=eq.pendiente". */
  private direccionTabla(tabla: string, filtros: string): string {
    return `${entorno.supabaseUrl}/rest/v1/${tabla}${filtros ? '?' + filtros : ''}`;
  }

  /** Consulta registros de una tabla. */
  obtener<T>(tabla: string, filtros = ''): Observable<T[]> {
    return this.clienteHttp.get<T[]>(this.direccionTabla(tabla, filtros), { headers: this.crearEncabezados(false) });
  }

  /** Crea un registro. */
  crear<T>(tabla: string, cuerpo: unknown): Observable<T[]> {
    return this.clienteHttp.post<T[]>(this.direccionTabla(tabla, ''), cuerpo, { headers: this.crearEncabezados(true) });
  }

  /** Modifica los registros que cumplan el filtro. */
  actualizar<T>(tabla: string, filtros: string, cuerpo: unknown): Observable<T[]> {
    return this.clienteHttp.patch<T[]>(this.direccionTabla(tabla, filtros), cuerpo, { headers: this.crearEncabezados(true) });
  }

  /** Elimina los registros que cumplan el filtro. */
  eliminar(tabla: string, filtros: string): Observable<unknown> {
    return this.clienteHttp.delete(this.direccionTabla(tabla, filtros), { headers: this.crearEncabezados(false) });
  }

  /** Llama al servicio de autenticación de Supabase (inicio de sesión y registro). */
  autenticar<T>(ruta: string, cuerpo: unknown): Observable<T> {
    const encabezados = new HttpHeaders({ apikey: entorno.supabaseClave, 'Content-Type': 'application/json' });
    return this.clienteHttp.post<T>(`${entorno.supabaseUrl}/auth/v1/${ruta}`, cuerpo, { headers: encabezados });
  }

  /** Convierte cualquier error en un mensaje claro para mostrar al usuario. */
  /** Convierte cualquier error en un mensaje claro, siempre en español. */
  obtenerMensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';

      const cuerpo = error.error;
      const codigo = String(cuerpo?.error_code ?? cuerpo?.code ?? '');

      const mensajesPorCodigo: Record<string, string> = {
        invalid_credentials: 'Correo o contraseña incorrectos.',
        email_not_confirmed: 'Debes confirmar tu correo antes de ingresar.',
        user_already_exists: 'Ya existe una cuenta con ese correo.',
        email_exists: 'Ya existe una cuenta con ese correo.',
        over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.',
        over_request_rate_limit: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        weak_password: 'La contraseña es demasiado débil. Usa al menos 8 caracteres.',
        signup_disabled: 'El registro está deshabilitado en este momento.',
        email_address_invalid: 'El correo no es válido.',
        validation_failed: 'Los datos enviados no son válidos.',
        bad_jwt: 'Tu sesión expiró. Vuelve a iniciar sesión.',
        '23505': 'Ya existe un registro con ese valor (por ejemplo, el documento o el correo).',
        '42501': 'No tienes permiso para realizar esta acción.',
      };
      if (mensajesPorCodigo[codigo]) return mensajesPorCodigo[codigo];

      // Respaldo: se busca el texto del error cuando no viene un código conocido
      const texto = `${cuerpo?.msg ?? ''} ${cuerpo?.message ?? ''} ${cuerpo?.error_description ?? ''}`.toLowerCase();
      if (texto.includes('database error')) return 'No se pudo crear la cuenta: revisa que el correo y el documento no estén repetidos.';
      if (texto.includes('duplicate key')) return 'Ya existe un registro con ese valor (por ejemplo, el documento o el correo).';
      if (texto.includes('jwt expired')) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
      if (texto.includes('row-level security')) return 'No tienes permiso para realizar esta acción.';
      if (texto.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';

      if (error.status === 401 || error.status === 403) return 'No tienes permiso para realizar esta acción.';
      if (error.status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
    }
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
  }
}