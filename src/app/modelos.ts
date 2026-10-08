// Tipos y constantes compartidas por todo el proyecto.

/** Roles del sistema. */
export type RolUsuario = 'administrativo' | 'director-academico';

/** Datos de una persona registrada (tabla "perfiles"). */
export interface PerfilUsuario {
    id: string;
    nombre: string;
    correo: string;
    documento: string | null;
    telefono: string | null;
    rol: RolUsuario;
    programa_id: number | null;
}

/** Franja oficial de un programa: días (0 = lunes ... 6 = domingo) y horas. */
export interface FranjaHoraria {
    dias: number[];
    inicio: number;
    fin: number;
}

export interface Programa {
    id: number;
    nombre: string;
}

export interface Salon {
    id: number;
    nombre: string;
    dotacion: string[];
}

/** Solicitud de salón (tabla "reservas"). */
export interface SolicitudSalon {
    id: number;
    salon_id: number | null;
    programa_id: number;
    director_id: string;
    asignatura: string;
    fecha_inicio: string;
    fecha_fin: string;
    dias: number[];
    hora_inicio: number;
    hora_fin: number;
    necesidad: string | null;
    estado: 'pendiente' | 'aprobada';
    salon?: { nombre: string } | null;
    programa?: { nombre: string } | null;
    director?: { nombre: string; correo: string } | null;
}

/** Respuesta de Supabase al iniciar sesión. */
export interface RespuestaSesion {
    access_token: string;
    user: { id: string };
}

/** Datos que pide el formulario de registro. */
export interface DatosRegistro {
    nombreCompleto: string;
    correo: string;
    documento: string;
    telefono: string;
    programaId: number;
    clave: string;
}

export const NOMBRES_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const OPCIONES_NECESIDAD = ['Cualquiera', 'Televisor', 'Proyector', 'Sala de informática', 'Laboratorio'];