import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Programa } from '../../modelos';
import { ServicioApi } from '../../servicios/servicio-api';
import { ServicioAutenticacion } from '../../servicios/servicio-autenticacion';

/** Registro del director académico. */
@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro.html',
  styleUrl: './registro.css',
})
export class Registro implements OnInit {
  private servicioApi = inject(ServicioApi);
  private servicioAutenticacion = inject(ServicioAutenticacion);

  programas = signal<Programa[]>([]);
  mensajeError = signal('');
  registroExitoso = signal(false);
  cargando = signal(false);

  // Ojos de las dos contraseñas
  claveVisible = signal(false);
  confirmarVisible = signal(false);

  formularioRegistro = new FormGroup({
    nombreCompleto: new FormControl('', { nonNullable: true }),
    correo: new FormControl('', { nonNullable: true }),
    documento: new FormControl('', { nonNullable: true }),
    telefono: new FormControl('', { nonNullable: true }),
    programaId: new FormControl<number | null>(null),
    clave: new FormControl('', { nonNullable: true }),
    confirmarClave: new FormControl('', { nonNullable: true }),
    aceptaPolitica: new FormControl(false, { nonNullable: true }),
  });

  /** Al abrir la página se cargan los programas para el selector. */
  ngOnInit(): void {
    this.servicioApi.obtener<Programa>('programas', 'select=id,nombre&order=nombre').subscribe({
      next: programas => this.programas.set(programas),
      error: error => this.mensajeError.set(this.servicioApi.obtenerMensajeError(error)),
    });
  }

  alternarClave(): void {
    this.claveVisible.update(visible => !visible);
  }

  alternarConfirmar(): void {
    this.confirmarVisible.update(visible => !visible);
  }

  /** Revisa lo básico y envía el registro. */
  enviarDatosFormulario(): void {
    this.mensajeError.set('');
    const v = this.formularioRegistro.getRawValue();
    const nombreCompleto = v.nombreCompleto.trim();
    const correo = v.correo.trim().toLowerCase();
    const documento = v.documento.trim();
    const telefono = v.telefono.trim();

    if (!nombreCompleto || !correo || !documento || !telefono || !v.programaId || !v.clave) {
      this.mensajeError.set('Completa todos los campos.');
      return;
    }
    if (v.clave.length < 8) {
      this.mensajeError.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (v.clave !== v.confirmarClave) {
      this.mensajeError.set('Las contraseñas no coinciden.');
      return;
    }

    this.cargando.set(true);
    this.servicioAutenticacion
      .registrarDirectorAcademico({ nombreCompleto, correo, documento, telefono, programaId: v.programaId, clave: v.clave })
      .subscribe({
        next: () => {
          this.cargando.set(false);
          this.formularioRegistro.reset();
          this.registroExitoso.set(true);
        },
        error: (error: Error) => {
          this.cargando.set(false);
          this.mensajeError.set(error.message);
        },
      });
  }
}