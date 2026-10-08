import { Routes } from '@angular/router';
import { Inicio } from './paginas/inicio/inicio';
import { Registro } from './paginas/registro/registro';
import { Administrativos } from './paginas/administrativos/administrativos';
import { DirectorAcademico } from './paginas/director-academico/director-academico';

export const routes: Routes = [
    { path: '', redirectTo: 'inicio', pathMatch: 'full' },
    { path: 'inicio', component: Inicio },
    { path: 'registro', component: Registro },
    { path: 'administrativos', component: Administrativos },
    { path: 'director-academico', component: DirectorAcademico },
];