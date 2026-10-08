import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ServicioAutenticacion } from '../../servicios/servicio-autenticacion';

@Component({
  selector: 'app-administrativos',
  imports: [],
  templateUrl: './administrativos.html',
  styleUrl: './administrativos.css',
})
export class Administrativos {
  private enrutador = inject(Router);
  private servicioAutenticacion = inject(ServicioAutenticacion);

  perfil = this.servicioAutenticacion.perfilActual;

  salir(): void {
    this.servicioAutenticacion.cerrarSesion();
    this.enrutador.navigate(['/inicio']);
  }
}