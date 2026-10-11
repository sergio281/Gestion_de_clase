export type RolUsuario = 'administrativo' | 'director-academico';

// tabla perfiles
export interface PerfilUsuario {
    id: string;
    nombre: string;
    correo: string;
    documento: string | null;
    telefono: string | null;
    rol: RolUsuario;
    programa_id: number | null;
    // 'activo' o 'inactivo' (un director inactivo no recibe asignaciones automáticas)
    estado?: 'activo' | 'inactivo' | null;
}

// dias: 0 = lunes ... 6 = domingo
export interface FranjaHoraria {
    dias: number[];
    inicio: number;
    fin: number;
}

export interface Programa {
    id: number;
    nombre: string;
    horario_texto?: string;
    ventanas?: FranjaHoraria[] | null;
}

// planta: '1' o '2'
// dotacion: ['TV'], ['Py'], ['Inf.', 'TV']... un arreglo vacío significa sin dotación (NG)
export interface Salon {
    id: number;
    nombre: string;
    planta: string;
    dotacion: string[];
}

// tabla equipos (inventario de préstamo)
export interface Equipo {
    id: number;
    nombre: string;
    estado: 'disponible' | 'prestado' | 'mantenimiento';
}

// tabla reservas (solicitud o materia asignada)
export interface Reserva {
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
}

export interface Estudiante {
    id: number;
    correo: string;
    programa_id: number;
}

// respuesta del login de supabase
export interface RespuestaSesion {
    access_token: string;
    user: { id: string };
}

// datos del formulario de registro
export interface DatosRegistro {
    nombreCompleto: string;
    correo: string;
    documento: string;
    telefono: string;
    programaId: number;
    clave: string;
}