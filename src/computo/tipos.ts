// src/computo/tipos.ts

export type UnidadMedida = 'm2' | 'm3' | 'ml' | 'un' | 'kg' | 'gls';

export interface DatosElementoIFC {
  expressId: number;
  tipo: string;
  nombre?: string;
  area?: number;
  volumen?: number;
  longitud?: number;
  alto?: number;
  ancho?: number;
  espesor?: number;
  material?: string;
  propiedadesPersonalizadas?: Record<string, any>;
}

export interface ResumenTipo {
  tipo: string;
  cantidad: number;
  areaTotal: number;
  volumenTotal: number;
  longitudTotal: number;
}