
// separa los correos pegados en válidos (@ucaldas.edu.co) y no válidos, sin repetidos
export function extraerCorreos(texto: string): { buenos: string[]; malos: string[] } {
    const lista = [...new Set(texto.split(/[\s,;]+/).map(correo => correo.trim().toLowerCase()).filter(correo => correo))];
    const esValido = (correo: string) => /^[^\s@]+@ucaldas\.edu\.co$/.test(correo);
    return { buenos: lista.filter(esValido), malos: lista.filter(correo => !esValido(correo)) };
}
///^[^\s@]+@(gmail\.com|ucaldas\.edu\.co|hotmail\.com)$/