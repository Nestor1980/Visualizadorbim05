// src/computo/tipos-muros.ts

/**
 * Datos extraídos de un muro individual
 */
export interface DatosMuro {
  expressId: number;
  nombre: string;
  globalId?: string;
  
  // Cantidades extraídas
  volumenBruto?: number;      // m³
  volumenNeto?: number;        // m³
  areaSuperficial?: number;    // m² (cara mayor calculada)
  
  // Dimensiones base
  longitud?: number;           // m
  alto?: number;               // m
  ancho?: number;              // m (espesor)
  
  // Datos adicionales
  material?: string;
  tipoMuro?: string;
  
  // Referencia a propiedades completas
  propiedadesIFC?: any;
}

/**
 * Resumen total de cantidades de muros
 */
export interface ResumenMuros {
  cantidadTotal: number;
  volumenTotal: number;        // m³
  areaTotal: number;           // m²
  
  // Desglose
  muros: DatosMuro[];
  
  // Estadísticas
  volumenPromedio: number;
  areaPromedio: number;
}

/**
 * Configuración para cálculo de áreas
 */
export interface ConfigCalculoArea {
  usarAreaNeta: boolean;       // true = NetSideArea, false = GrossSideArea
  calcularSiNoExiste: boolean; // Si no hay área en IFC, calcular como alto × longitud
}