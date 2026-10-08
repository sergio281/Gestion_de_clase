import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ServicioAutenticacion } from '../../servicios/servicio-autenticacion';

@Component({
  selector: 'app-director-academico',
  imports: [],
  templateUrl: './director-academico.html',
  styleUrl: './director-academico.css',
})
export class DirectorAcademico {
  private enrutador = inject(Router);
  private servicioAutenticacion = inject(ServicioAutenticacion);

  perfil = this.servicioAutenticacion.perfilActual;

  salir(): void {
    this.servicioAutenticacion.cerrarSesion();
    this.enrutador.navigate(['/inicio']);
  }
}