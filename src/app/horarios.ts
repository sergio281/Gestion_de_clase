import { Programa, Reserva } from './modelos';

export const NOMBRES_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const ABREVIATURAS_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// de 6:00 a 20:00
export const HORAS_TABLA = Array.from({ length: 15 }, (_, indice) => 6 + indice);

// datos que se comparan para buscar cruces
export interface DatosHorario {
    fecha_inicio: string;
    fecha_fin: string;
    dias: number[];
    hora_inicio: number;
    hora_fin: number;
}

// materia que todavía no tiene id
export interface MateriaCandidata extends DatosHorario {
    salon_id: number;
    director_id: string;
    programa_id: number;
}

export interface Cruce {
    motivo: 'salon' | 'director' | 'programa';
    reserva: Reserva;
}

// formato AAAA-MM-DD
export function obtenerHoy(): string {
    const ahora = new Date();
    ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
    return ahora.toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, cantidad: number): string {
    const resultado = new Date(fecha + 'T00:00:00');
    resultado.setDate(resultado.getDate() + cantidad);
    resultado.setMinutes(resultado.getMinutes() - resultado.getTimezoneOffset());
    return resultado.toISOString().slice(0, 10);
}

// 2026-10-01 -> 01/10/2026
export function darFormatoFecha(fecha: string): string {
    return fecha.split('-').reverse().join('/');
}

// 0 = lunes ... 6 = domingo
export function obtenerDiaSemana(fecha: string): number {
    return (new Date(fecha + 'T00:00:00').getDay() + 6) % 7;
}

// true si la materia se dicta ese día
export function activaEnFecha(reserva: Reserva, fecha: string): boolean {
    return reserva.fecha_inicio <= fecha && fecha <= reserva.fecha_fin && reserva.dias.includes(obtenerDiaSemana(fecha));
}

// ejemplo: "02/10/2026 → 30/01/2027 · Sáb"
export function textoReserva(reserva: Pick<Reserva, 'fecha_inicio' | 'fecha_fin' | 'dias'>): string {
    const fechas = reserva.fecha_inicio === reserva.fecha_fin
        ? darFormatoFecha(reserva.fecha_inicio)
        : darFormatoFecha(reserva.fecha_inicio) + ' → ' + darFormatoFecha(reserva.fecha_fin);
    return fechas + ' · ' + reserva.dias.map(dia => ABREVIATURAS_DIAS[dia]).join(', ');
}

// cuántas veces cae la materia entre las dos fechas
function contarOcurrencias(inicio: string, fin: string, dias: number[]): number {
    let total = 0;
    for (let fecha = inicio; fecha <= fin; fecha = sumarDias(fecha, 1)) {
        if (dias.includes(obtenerDiaSemana(fecha))) total++;
    }
    return total;
}

// devuelve el mensaje de error o null si todo está bien
export function validarHorario(programa: Programa, datos: DatosHorario): string | null {
    if (!datos.fecha_inicio || !datos.fecha_fin) return 'Elige la fecha de inicio y la fecha final.';
    if (datos.fecha_fin < datos.fecha_inicio) return 'La fecha final no puede ser anterior a la inicial.';
    if (datos.dias.length === 0) return 'Marca al menos un día de la semana.';
    if (contarOcurrencias(datos.fecha_inicio, datos.fecha_fin, datos.dias) === 0) {
        return 'Ninguno de los días marcados cae dentro del rango de fechas.';
    }
    if (datos.hora_fin <= datos.hora_inicio) return 'La hora final debe ser mayor que la inicial.';

    // franja oficial del programa
    const franjas = programa.ventanas;
    if (franjas) {
        const dentroDeFranja = datos.dias.every(dia =>
            franjas.some(f => f.dias.includes(dia) && datos.hora_inicio >= f.inicio && datos.hora_fin <= f.fin));
        if (!dentroDeFranja) {
            return `Horario fuera de la franja oficial de ${programa.nombre}: ${programa.horario_texto}.`;
        }
    }
    return null;
}

// hay cruce si coinciden fechas, días y horas, y además comparten salón, director o programa
export function buscarCruce(reservas: Reserva[], candidata: MateriaCandidata, ignorarId = 0): Cruce | null {
    const coinciden = reservas.filter(r =>
        r.id !== ignorarId && r.estado === 'aprobada' &&
        r.fecha_inicio <= candidata.fecha_fin && candidata.fecha_inicio <= r.fecha_fin &&
        r.dias.some(dia => candidata.dias.includes(dia)) &&
        r.hora_inicio < candidata.hora_fin && candidata.hora_inicio < r.hora_fin);

    const mismoSalon = coinciden.find(r => r.salon_id === candidata.salon_id);
    if (mismoSalon) return { motivo: 'salon', reserva: mismoSalon };
    const mismoDirector = coinciden.find(r => r.director_id === candidata.director_id);
    if (mismoDirector) return { motivo: 'director', reserva: mismoDirector };
    const mismoPrograma = coinciden.find(r => r.programa_id === candidata.programa_id);
    if (mismoPrograma) return { motivo: 'programa', reserva: mismoPrograma };
    return null;
}

// mensaje que se le muestra al usuario
export function textoCruce(cruce: Cruce, nombreSalon: string): string {
    const r = cruce.reserva;
    const hora = `${r.hora_inicio}:00 a ${r.hora_fin}:00`;
    if (cruce.motivo === 'salon') {
        return `Recuerda: esta materia se cruza con «${r.asignatura}» en el mismo salón (${nombreSalon}) de ${hora}.`;
    }
    if (cruce.motivo === 'director') {
        return `Recuerda: el director académico ya tiene la materia «${r.asignatura}» de ${hora} en esas fechas.`;
    }
    return `Recuerda: el programa ya tiene la materia «${r.asignatura}» de ${hora} en esas fechas.`;
}