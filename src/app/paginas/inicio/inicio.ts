import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ServicioAutenticacion } from '../../servicios/servicio-autenticacion';

@Component({
  selector: 'app-inicio',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  private enrutador = inject(Router);
  private servicioAutenticacion = inject(ServicioAutenticacion);

  mensajeError = signal('');
  cargando = signal(false);
  claveVisible = signal(false);

  formularioIngreso = new FormGroup({
    correo: new FormControl('', { nonNullable: true }),
    clave: new FormControl('', { nonNullable: true }),
  });

  // mostrar u ocultar la contraseña
  alternarVisibilidadClave(): void {
    this.claveVisible.update(visible => !visible);
  }

  // login
  enviarDatosFormulario(): void {
    this.mensajeError.set('');
    const correo = this.formularioIngreso.controls.correo.value.trim().toLowerCase();
    const clave = this.formularioIngreso.controls.clave.value;

    if (!correo || !clave) {
      this.mensajeError.set('Escribe tu correo y tu contraseña.');
      return;
    }

    this.cargando.set(true);
    this.servicioAutenticacion.iniciarSesion(correo, clave).subscribe({
      next: perfil => {
        this.cargando.set(false);
        // cada rol va a su panel
        const ruta = perfil.rol === 'administrativo' ? '/administrativos' : '/director-academico';
        this.enrutador.navigate([ruta]);
      },
      error: (error: Error) => {
        this.cargando.set(false);
        this.mensajeError.set(error.message);
      },
    });
  }
}