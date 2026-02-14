// src/computo/extractor-ifc.ts

import * as OBC from "@thatopen/components";
import { DatosElementoIFC, ResumenTipo } from "./tipos";

export class ExtractorIFC {
  private components: OBC.Components;
  private fragmentsManager: OBC.FragmentsManager;

  constructor(components: OBC.Components) {
    this.components = components;
    this.fragmentsManager = components.get(OBC.FragmentsManager);
  }

  /**
   * Extrae todos los elementos del modelo
   */
  async extraerTodosLosElementos(): Promise<DatosElementoIFC[]> {
    const todosLosElementos: DatosElementoIFC[] = [];
    
    console.log("🔍 Iniciando extracción de datos...");
    
    for (const model of this.fragmentsManager.list.values()) {
      const modelAny = model as any;
      console.log(`📦 Procesando modelo: ${modelAny.uuid || 'sin UUID'}`);
      
      // Intentar obtener propiedades de diferentes ubicaciones
      const properties = await this.obtenerPropiedadesModelo(modelAny);
      
      if (!properties) {
        console.warn("⚠️ No se encontraron propiedades en el modelo");
        console.log("Estructura del modelo:", Object.keys(model));
        continue;
      }

      console.log(`✅ Propiedades encontradas, procesando...`);
      
      // Procesar cada elemento
      let contador = 0;
      for (const [expressIdStr, props] of Object.entries(properties)) {
        const expressID = Number(expressIdStr);
        
        if (props && typeof props === 'object') {
          const datos = this.procesarElemento(expressID, props);
          
          if (datos) {
            todosLosElementos.push(datos);
            contador++;
          }
        }
      }
      
      console.log(`✅ Extraídos ${contador} elementos de este modelo`);
    }
    
    console.log(`✅ Total extraído: ${todosLosElementos.length} elementos`);
    return todosLosElementos;
  }

  /**
   * Intenta obtener propiedades de diferentes ubicaciones del modelo
   */
  private async obtenerPropiedadesModelo(model: any): Promise<any> {
    const modelAny = model as any;
    
    // Intentar múltiples ubicaciones donde pueden estar las propiedades
    const posiblesUbicaciones = [
      modelAny.data?.properties,
      modelAny.properties,
      modelAny.ifcMetadata?.properties,
      modelAny._properties,
      modelAny.streamSettings?.propertiesManager?.data,
    ];
    
    for (const ubicacion of posiblesUbicaciones) {
      if (ubicacion && typeof ubicacion === 'object' && Object.keys(ubicacion).length > 0) {
        console.log(`✅ Propiedades encontradas en ubicación`);
        return ubicacion;
      }
    }
    
    // Si no encontramos propiedades, intentar obtenerlas del fragmentsManager
    try {
      const classifier = this.components.get(OBC.Classifier);
      const groups = await classifier.find({ models: [model] });
      
      if (groups instanceof Set && groups.size > 0) {
        console.log(`✅ Usando clasificador para obtener elementos`);
        return this.obtenerPropiedadesDesdeClasificador(model, groups);
      }
    } catch (error) {
      console.log("No se pudo usar el clasificador");
    }
    
    return null;
  }

  /**
   * Obtiene propiedades usando el clasificador
   */
  private obtenerPropiedadesDesdeClasificador(model: any, groups: any): any {
    const properties: any = {};
    
    // Aquí deberíamos iterar sobre los grupos y obtener propiedades
    // Por ahora retornamos null para usar otro método
    return null;
  }

  /**
   * Procesa un elemento individual
   */
  private procesarElemento(expressID: number, props: any): DatosElementoIFC | null {
    try {
      // Verificar que tenga un tipo válido
      if (!props.type) {
        return null;
      }

      const tipo = this.obtenerNombreTipo(props.type);
      
      // Filtrar elementos no físicos
      if (this.esElementoFiltrable(tipo)) {
        return null;
      }

      const nombre = this.extraerNombre(props);
      const cantidades = this.extraerCantidades(props);
      const material = this.extraerMaterial(props);

      return {
        expressId: expressID,
        tipo,
        nombre,
        ...cantidades,
        material,
        propiedadesPersonalizadas: props,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Determina si un elemento debe ser filtrado
   */
  private esElementoFiltrable(tipo: string): boolean {
    const tiposFiltrar = [
      'IfcProject',
      'IfcSite',
      'IfcBuilding',
      'IfcBuildingStorey',
      'IfcSpace',
      'IfcOpeningElement',
      'IfcPropertySet',
      'IfcElementQuantity',
      'IfcRelationship',
      'IfcOwnerHistory',
      'IfcRepresentation',
      'IfcMaterial',
      'IfcPresentationStyle',
    ];
    
    return tiposFiltrar.some(filtro => tipo.includes(filtro));
  }

  /**
   * Extrae cantidades de PropertySets IFC
   */
  private extraerCantidades(props: any) {
    const cantidades = {
      area: undefined as number | undefined,
      volumen: undefined as number | undefined,
      longitud: undefined as number | undefined,
      alto: undefined as number | undefined,
      ancho: undefined as number | undefined,
      espesor: undefined as number | undefined,
    };

    // Buscar en diferentes PropertySets
    const propertysets = this.buscarPropertySets(props);

    // Para muros
    const qtoWall = propertysets['Qto_WallBaseQuantities'];
    if (qtoWall) {
      cantidades.area = this.obtenerValor(qtoWall.NetSideArea) || this.obtenerValor(qtoWall.GrossSideArea);
      cantidades.volumen = this.obtenerValor(qtoWall.NetVolume) || this.obtenerValor(qtoWall.GrossVolume);
      cantidades.longitud = this.obtenerValor(qtoWall.Length);
      cantidades.alto = this.obtenerValor(qtoWall.Height);
      cantidades.ancho = this.obtenerValor(qtoWall.Width);
    }

    // Para losas
    const qtoSlab = propertysets['Qto_SlabBaseQuantities'];
    if (qtoSlab) {
      cantidades.area = this.obtenerValor(qtoSlab.NetArea) || this.obtenerValor(qtoSlab.GrossArea);
      cantidades.volumen = this.obtenerValor(qtoSlab.NetVolume) || this.obtenerValor(qtoSlab.GrossVolume);
      cantidades.espesor = this.obtenerValor(qtoSlab.Thickness) || this.obtenerValor(qtoSlab.Width);
    }

    // Para columnas
    const qtoColumn = propertysets['Qto_ColumnBaseQuantities'];
    if (qtoColumn) {
      cantidades.volumen = this.obtenerValor(qtoColumn.NetVolume) || this.obtenerValor(qtoColumn.GrossVolume);
      cantidades.longitud = this.obtenerValor(qtoColumn.Length);
      cantidades.alto = this.obtenerValor(qtoColumn.Height);
    }

    // Para vigas
    const qtoBeam = propertysets['Qto_BeamBaseQuantities'];
    if (qtoBeam) {
      cantidades.volumen = this.obtenerValor(qtoBeam.NetVolume) || this.obtenerValor(qtoBeam.GrossVolume);
      cantidades.longitud = this.obtenerValor(qtoBeam.Length);
    }

    return cantidades;
  }

  /**
   * Busca PropertySets en el objeto de propiedades
   */
  private buscarPropertySets(props: any): Record<string, any> {
    const psets: Record<string, any> = {};
    
    // Buscar directamente en el objeto
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('Qto_') || key.startsWith('Pset_')) {
        psets[key] = value;
      }
    }
    
    return psets;
  }

  /**
   * Obtiene el valor de una propiedad
   */
  private obtenerValor(prop: any): number | undefined {
    if (!prop) return undefined;
    
    if (prop.value !== undefined) {
      return typeof prop.value === 'number' ? prop.value : undefined;
    }
    
    if (typeof prop === 'number') {
      return prop;
    }
    
    return undefined;
  }

  /**
   * Extrae el nombre del elemento
   */
  private extraerNombre(props: any): string {
    const nombre = 
      this.obtenerValorTexto(props.Name) ||
      this.obtenerValorTexto(props.LongName) ||
      this.obtenerValorTexto(props.Tag) ||
      this.obtenerValorTexto(props.ObjectType) ||
      "Sin nombre";
    
    return nombre;
  }

  /**
   * Obtiene valor de texto
   */
  private obtenerValorTexto(prop: any): string | undefined {
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
   * Extrae el material
   */
  private extraerMaterial(props: any): string | undefined {
    const propertysets = this.buscarPropertySets(props);
    const psetMaterial = propertysets['Pset_MaterialCommon'];
    
    if (psetMaterial?.Material) {
      return this.obtenerValorTexto(psetMaterial.Material);
    }
    
    return this.obtenerValorTexto(props.ObjectType) || 
           this.obtenerValorTexto(props.PredefinedType);
  }

  /**
   * Convierte número de tipo a nombre
   */
  private obtenerNombreTipo(typeNumber: number): string {
    const tipos: Record<number, string> = {
      103090709: 'IfcWall',
      3856911033: 'IfcWallStandardCase',
      1073191201: 'IfcMember',
      3495092785: 'IfcColumn',
      1335981549: 'IfcBeam',
      1484403080: 'IfcSlab',
      3127900445: 'IfcSlabStandardCase',
      900683007: 'IfcFooting',
      2016517767: 'IfcRoof',
      331165859: 'IfcStair',
      395920057: 'IfcDoor',
      3304561284: 'IfcWindow',
      2391406946: 'IfcCovering',
      1260505505: 'IfcPlate',
      3612865200: 'IfcPipeSegment',
      3518393246: 'IfcDuctSegment',
    };
    
    return tipos[typeNumber] || `IfcType-${typeNumber}`;
  }

  // MÉTODOS ÚTILES

  filtrarPorTipo(elementos: DatosElementoIFC[], tipo: string): DatosElementoIFC[] {
    return elementos.filter(elem => 
      elem.tipo.toLowerCase().includes(tipo.toLowerCase())
    );
  }

  agruparPorTipo(elementos: DatosElementoIFC[]): Map<string, DatosElementoIFC[]> {
    const grupos = new Map<string, DatosElementoIFC[]>();
    for (const elemento of elementos) {
      const grupo = grupos.get(elemento.tipo) || [];
      grupo.push(elemento);
      grupos.set(elemento.tipo, grupo);
    }
    return grupos;
  }

  calcularTotales(elementos: DatosElementoIFC[]) {
    return {
      cantidad: elementos.length,
      areaTotal: elementos.reduce((sum, e) => sum + (e.area || 0), 0),
      volumenTotal: elementos.reduce((sum, e) => sum + (e.volumen || 0), 0),
      longitudTotal: elementos.reduce((sum, e) => sum + (e.longitud || 0), 0),
    };
  }

  async generarResumenPorTipo(): Promise<ResumenTipo[]> {
    const elementos = await this.extraerTodosLosElementos();
    const grupos = this.agruparPorTipo(elementos);
    const resumen: ResumenTipo[] = [];

    for (const [tipo, items] of grupos) {
      const totales = this.calcularTotales(items);
      resumen.push({
        tipo,
        cantidad: totales.cantidad,
        areaTotal: totales.areaTotal,
        volumenTotal: totales.volumenTotal,
        longitudTotal: totales.longitudTotal,
      });
    }

    return resumen.sort((a, b) => b.cantidad - a.cantidad);
  }

  /**
   * MÉTODO DE DEBUGGING - Imprime la estructura del modelo
   */
  async depurarEstructuraModelo(): Promise<void> {
    console.log("=== DEBUGGING: Estructura del Modelo ===");
    
    for (const model of this.fragmentsManager.list.values()) {
      console.log("📦 Modelo UUID:", (model as any).uuid);
      console.log("📦 Propiedades del modelo:", Object.keys(model));
      
      const modelAny = model as any;
      
      if (modelAny.data) {
        console.log("  ✅ model.data existe");
        console.log("  📁 Keys en data:", Object.keys(modelAny.data));
      }
      
      if (modelAny.properties) {
        console.log("  ✅ model.properties existe");
        console.log("  📊 Cantidad de propiedades:", Object.keys(modelAny.properties).length);
      }
      
      if (modelAny.ifcMetadata) {
        console.log("  ✅ model.ifcMetadata existe");
        console.log("  📁 Keys en ifcMetadata:", Object.keys(modelAny.ifcMetadata));
      }
    }
  }
}