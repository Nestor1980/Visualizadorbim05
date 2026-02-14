// src/computo/computo-muros.ts

import * as OBC from "@thatopen/components";
import { DatosMuro, ResumenMuros, ConfigCalculoArea } from "./tipos-muros";

export class ComputoMuros {
  private components: OBC.Components;
  private fragmentsManager: OBC.FragmentsManager;
  
  // Configuración por defecto
  private config: ConfigCalculoArea = {
    usarAreaNeta: true,
    calcularSiNoExiste: true
  };

  constructor(components: OBC.Components) {
    this.components = components;
    this.fragmentsManager = components.get(OBC.FragmentsManager);
  }

  /**
   * MÉTODO PRINCIPAL: Extrae todos los muros del modelo
   */
  async extraerMuros(): Promise<DatosMuro[]> {
    const murosExtraidos: DatosMuro[] = [];
    
    console.log("🧱 Iniciando extracción de muros...");
    
    for (const model of this.fragmentsManager.list.values()) {
      const modelAny = model as any;
      console.log(`📦 Procesando modelo: ${modelAny.uuid || 'sin UUID'}`);
      
      // Obtener propiedades del modelo
      const properties = await this.obtenerPropiedadesModelo(modelAny);
      
      if (!properties) {
        console.warn("⚠️ No se encontraron propiedades en el modelo");
        continue;
      }

      // Procesar cada elemento del modelo
      for (const [expressIdStr, props] of Object.entries(properties)) {
        const expressID = Number(expressIdStr);
        
        // Verificar si es un muro
        if (this.esMuro(props)) {
          const datosMuro = this.procesarMuro(expressID, props);
          
          if (datosMuro) {
            murosExtraidos.push(datosMuro);
          }
        }
      }
    }
    
    console.log(`✅ Extraídos ${murosExtraidos.length} muros`);
    return murosExtraidos;
  }

  /**
   * Verifica si un elemento es un muro
   */
  private esMuro(props: any): boolean {
    if (!props || !props.type) return false;
    
    const tipo = this.obtenerNombreTipo(props.type);
    
    // Tipos de muros en IFC
    return tipo === 'IfcWall' || 
           tipo === 'IfcWallStandardCase' ||
           tipo.includes('Wall');
  }

  /**
   * Procesa un muro individual y extrae sus cantidades
   */
  private procesarMuro(expressID: number, props: any): DatosMuro | null {
    try {
      const nombre = this.extraerNombre(props);
      const globalId = this.extraerGlobalId(props);
      
      // Extraer cantidades desde PropertySets IFC
      const cantidades = this.extraerCantidadesMuro(props);
      
      // Si no hay área en IFC, calcularla
      let areaSuperficial = cantidades.area;
      if (!areaSuperficial && this.config.calcularSiNoExiste) {
        areaSuperficial = this.calcularAreaSuperficial(
          cantidades.longitud,
          cantidades.alto
        );
      }

      const datosMuro: DatosMuro = {
        expressId: expressID,
        nombre,
        globalId,
        volumenBruto: cantidades.volumenBruto,
        volumenNeto: cantidades.volumenNeto,
        areaSuperficial,
        longitud: cantidades.longitud,
        alto: cantidades.alto,
        ancho: cantidades.ancho,
        material: this.extraerMaterial(props),
        tipoMuro: this.obtenerNombreTipo(props.type),
        propiedadesIFC: props
      };

      return datosMuro;
      
    } catch (error) {
      console.error(`❌ Error procesando muro ${expressID}:`, error);
      return null;
    }
  }

  /**
   * Extrae cantidades específicas de muros desde Qto_WallBaseQuantities
   */
  private extraerCantidadesMuro(props: any) {
    const cantidades = {
      volumenBruto: undefined as number | undefined,
      volumenNeto: undefined as number | undefined,
      area: undefined as number | undefined,
      longitud: undefined as number | undefined,
      alto: undefined as number | undefined,
      ancho: undefined as number | undefined,
    };

    // Buscar el PropertySet Qto_WallBaseQuantities
    const qtoWall = this.buscarPropertySet(props, 'Qto_WallBaseQuantities');
    
    if (qtoWall) {
      // Volúmenes
      cantidades.volumenBruto = this.obtenerValor(qtoWall.GrossVolume);
      cantidades.volumenNeto = this.obtenerValor(qtoWall.NetVolume);
      
      // Áreas (NetSideArea es el área lateral sin aperturas)
      if (this.config.usarAreaNeta) {
        cantidades.area = this.obtenerValor(qtoWall.NetSideArea);
      } else {
        cantidades.area = this.obtenerValor(qtoWall.GrossSideArea);
      }
      
      // Dimensiones
      cantidades.longitud = this.obtenerValor(qtoWall.Length);
      cantidades.alto = this.obtenerValor(qtoWall.Height);
      cantidades.ancho = this.obtenerValor(qtoWall.Width);
      
      console.log(`  📐 Muro ${props.Name?.value || 'sin nombre'}:`, {
        volumen: cantidades.volumenNeto?.toFixed(2) || 'N/A',
        area: cantidades.area?.toFixed(2) || 'N/A'
      });
    } else {
      console.warn(`  ⚠️ No se encontró Qto_WallBaseQuantities para el muro`);
    }

    return cantidades;
  }

  /**
   * Calcula el área superficial como alto × longitud
   * (área de la cara mayor del muro)
   */
  private calcularAreaSuperficial(
    longitud?: number, 
    alto?: number
  ): number | undefined {
    if (!longitud || !alto) {
      return undefined;
    }
    
    const area = longitud * alto;
    console.log(`  🧮 Área calculada: ${longitud.toFixed(2)}m × ${alto.toFixed(2)}m = ${area.toFixed(2)}m²`);
    
    return area;
  }

  /**
   * Busca un PropertySet específico por nombre
   */
  private buscarPropertySet(props: any, nombrePset: string): any {
    // Buscar directamente en el objeto
    if (props[nombrePset]) {
      return props[nombrePset];
    }
    
    // Buscar en propiedades anidadas
    for (const [key, value] of Object.entries(props)) {
      if (key === nombrePset || (typeof value === 'object' && value !== null)) {
        if ((value as any).Name?.value === nombrePset) {
          return value;
        }
      }
    }
    
    return null;
  }

  /**
   * Obtiene el valor numérico de una propiedad IFC
   */
  private obtenerValor(prop: any): number | undefined {
    if (!prop) return undefined;
    
    // Formato típico: { value: 123.45 }
    if (prop.value !== undefined) {
      return typeof prop.value === 'number' ? prop.value : undefined;
    }
    
    // Formato directo: 123.45
    if (typeof prop === 'number') {
      return prop;
    }
    
    return undefined;
  }

  /**
   * Extrae el nombre del muro
   */
  private extraerNombre(props: any): string {
    return (
      this.obtenerTexto(props.Name) ||
      this.obtenerTexto(props.LongName) ||
      this.obtenerTexto(props.Tag) ||
      "Muro sin nombre"
    );
  }

  /**
   * Extrae el GlobalId (identificador único IFC)
   */
  private extraerGlobalId(props: any): string | undefined {
    return this.obtenerTexto(props.GlobalId);
  }

  /**
   * Extrae el material del muro
   */
  private extraerMaterial(props: any): string | undefined {
    const psetMaterial = this.buscarPropertySet(props, 'Pset_MaterialCommon');
    
    if (psetMaterial?.Material) {
      return this.obtenerTexto(psetMaterial.Material);
    }
    
    return this.obtenerTexto(props.ObjectType);
  }

  /**
   * Obtiene texto de una propiedad
   */
  private obtenerTexto(prop: any): string | undefined {
    if (!prop) return undefined;
    
    if (prop.value !== undefined) {
      return String(prop.value);
    }
    
    if (typeof prop === 'string') {
      return prop;
    }
    
    return undefined;
  }

  /**
   * Convierte número de tipo IFC a nombre
   */
  private obtenerNombreTipo(typeNumber: number): string {
    const tipos: Record<number, string> = {
      103090709: 'IfcWall',
      3856911033: 'IfcWallStandardCase',
    };
    
    return tipos[typeNumber] || `IfcType-${typeNumber}`;
  }

  /**
   * Obtiene propiedades del modelo
   */
  private async obtenerPropiedadesModelo(model: any): Promise<any> {
    const modelAny = model as any;
    
    const posiblesUbicaciones = [
      modelAny.data?.properties,
      modelAny.properties,
      modelAny.ifcMetadata?.properties,
      modelAny._properties,
    ];
    
    for (const ubicacion of posiblesUbicaciones) {
      if (ubicacion && typeof ubicacion === 'object' && Object.keys(ubicacion).length > 0) {
        return ubicacion;
      }
    }
    
    return null;
  }

  /**
   * MÉTODO PRINCIPAL: Genera resumen completo de muros
   */
  async generarResumen(): Promise<ResumenMuros> {
    const muros = await this.extraerMuros();
    
    // Calcular totales
    const volumenTotal = muros.reduce((sum, m) => 
      sum + (m.volumenNeto || m.volumenBruto || 0), 0
    );
    
    const areaTotal = muros.reduce((sum, m) => 
      sum + (m.areaSuperficial || 0), 0
    );
    
    const cantidadTotal = muros.length;
    
    const resumen: ResumenMuros = {
      cantidadTotal,
      volumenTotal,
      areaTotal,
      muros,
      volumenPromedio: cantidadTotal > 0 ? volumenTotal / cantidadTotal : 0,
      areaPromedio: cantidadTotal > 0 ? areaTotal / cantidadTotal : 0,
    };
    
    console.log("📊 RESUMEN DE MUROS:");
    console.log(`  Cantidad: ${resumen.cantidadTotal}`);
    console.log(`  Volumen total: ${resumen.volumenTotal.toFixed(2)} m³`);
    console.log(`  Área total: ${resumen.areaTotal.toFixed(2)} m²`);
    
    return resumen;
  }

  /**
   * Configura opciones de cálculo
   */
  configurar(config: Partial<ConfigCalculoArea>) {
    this.config = { ...this.config, ...config };
  }
}