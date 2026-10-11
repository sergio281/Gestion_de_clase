import { Injectable } from '@angular/core';
import { send } from '@emailjs/browser';

// credenciales de emailjs
const SERVICE_ID = 'service_cg719jq';
const TEMPLATE_ID = 'template_mvwj92s';
const PUBLIC_KEY = '3VxMvN_G8EhKc4N_7';

// plantilla para los correos de rechazo 
export const PLANTILLA_RECHAZO = 'template_0m6gkkh';

// emailjs rechaza envíos muy seguidos
const PAUSA_ENTRE_CORREOS_MS = 1200;

// los nombres tienen que ser iguales a las variables {{...}} de la plantilla
export interface DatosCorreo {
  asunto: string;
  asignatura: string;
  programa: string;
  salon: string;
  profesor: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: string;
  hora_inicio: string;
  hora_fin: string;
  recursos: string;
}

export interface ResultadoEnvio {
  enviados: string[];
  fallidos: { correo: string; motivo: string }[];
}

export class ErrorCorreo extends Error {
  constructor(mensaje: string, readonly estado = 0) {
    super(mensaje);
  }
}

@Injectable({ providedIn: 'root' })
export class ServicioCorreo {

  estaConfigurado(): boolean {
    return !SERVICE_ID.startsWith('TU_') && !TEMPLATE_ID.startsWith('TU_') && !PUBLIC_KEY.startsWith('TU_');
  }

  // envía un solo correo
  async enviarCorreo(destinatario: string, datos: DatosCorreo, plantilla = TEMPLATE_ID): Promise<void> {
    try {
      await send(
        SERVICE_ID,
        plantilla,
        {
          to_email: destinatario,
          message: datos.asunto, // compatibilidad con la plantilla anterior
          ...datos,
        },
        { publicKey: PUBLIC_KEY },
      );
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  // envía uno por uno sin repetir correos, si da 429 espera y reintenta una vez
  async enviarVarios(destinatarios: string[], datos: DatosCorreo): Promise<ResultadoEnvio> {
    const correos = [...new Set(destinatarios.map(c => c.trim().toLowerCase()).filter(c => c))];
    const resultado: ResultadoEnvio = { enviados: [], fallidos: [] };

    for (let i = 0; i < correos.length; i++) {
      if (i > 0) await this.esperar(PAUSA_ENTRE_CORREOS_MS);
      const correo = correos[i];
      try {
        try {
          await this.enviarCorreo(correo, datos);
        } catch (error) {
          if (error instanceof ErrorCorreo && error.estado === 429) {
            await this.esperar(3000);
            await this.enviarCorreo(correo, datos);
          } else {
            throw error;
          }
        }
        resultado.enviados.push(correo);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : 'Error desconocido.';
        resultado.fallidos.push({ correo, motivo });
      }
    }
    return resultado;
  }

  private esperar(milisegundos: number): Promise<void> {
    return new Promise(resolver => setTimeout(resolver, milisegundos));
  }

  // errores de emailjs en español
  private traducirError(error: unknown): ErrorCorreo {
    const respuesta = error as { status?: number; text?: string } | null;
    const estado = typeof respuesta?.status === 'number' ? respuesta.status : 0;
    const texto = respuesta?.text ?? (error instanceof Error ? error.message : '');

    const mensajes: Record<number, string> = {
      400: 'EmailJS rechazó la solicitud: revisa SERVICE_ID, TEMPLATE_ID y la clave pública.',
      412: 'El servicio de correo (Gmail) de EmailJS perdió el permiso: reconéctalo en Email Services.',
      422: 'La plantilla de EmailJS no tiene destinatario: en "To Email" escribe {{to_email}}.',
      429: 'Demasiados envíos seguidos. Espera un momento e inténtalo de nuevo.',
    };

    if (estado === 0 && !texto) {
      return new ErrorCorreo('No se pudo conectar con EmailJS. Revisa tu conexión a internet.', 0);
    }
    return new ErrorCorreo(mensajes[estado] ?? `EmailJS respondió con un error${texto ? ': ' + texto : '.'}`, estado);
  }
}