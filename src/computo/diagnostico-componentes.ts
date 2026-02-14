// src/computo/diagnostico-componentes.ts

import * as OBC from "@thatopen/components";

/**
 * Diagnóstico de componentes disponibles en That Open
 */
export class DiagnosticoComponentes {
  private components: OBC.Components;

  constructor(components: OBC.Components) {
    this.components = components;
  }

  /**
   * Verifica qué componentes están disponibles
   */
  verificarComponentesDisponibles() {
    console.log("=== DIAGNÓSTICO DE COMPONENTES ===\n");

    const componentesParaVerificar = [
      'IfcPropertiesManager',
      'IfcPropertiesUtils',
      'IfcRelationsIndexer',
      'PropertiesFinder',
      'PropertyManager',
    ];

    for (const nombre of componentesParaVerificar) {
      try {
        const componente = (this.components as any).get((OBC as any)[nombre]);
        if (componente) {
          console.log(`✅ ${nombre} está disponible`);
          console.log(`   Métodos:`, Object.getOwnPropertyNames(Object.getPrototypeOf(componente)));
        }
      } catch (error) {
        console.log(`❌ ${nombre} NO está disponible`);
      }
    }
  }

  /**
   * Analiza la estructura de un modelo cargado
   */
  analizarModelo(model: any) {
    console.log("\n=== ANÁLISIS DEL MODELO ===\n");
    
    console.log("📦 UUID:", model.uuid);
    console.log("📦 Name:", model.name);
    
    // Verificar propiedades
    console.log("\n🔍 Verificando ubicaciones de propiedades:");
    
    const ubicaciones = [
      { path: 'properties', obj: model.properties },
      { path: 'data', obj: model.data },
      { path: 'data.properties', obj: model.data?.properties },
      { path: 'ifcMetadata', obj: model.ifcMetadata },
      { path: 'ifcMetadata.properties', obj: model.ifcMetadata?.properties },
      { path: '_properties', obj: model._properties },
      { path: 'streamSettings', obj: model.streamSettings },
    ];

    for (const { path, obj } of ubicaciones) {
      if (obj) {
        console.log(`  ✅ model.${path} existe`);
        if (typeof obj === 'object') {
          const keys = Object.keys(obj);
          console.log(`     Cantidad de keys: ${keys.length}`);
          if (keys.length > 0 && keys.length < 10) {
            console.log(`     Keys:`, keys);
          }
        }
      } else {
        console.log(`  ❌ model.${path} NO existe`);
      }
    }

    // Verificar métodos del modelo
    console.log("\n🔧 Métodos disponibles en el modelo:");
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(model));
    const metodosRelevantes = metodos.filter(m => 
      m.includes('propert') || 
      m.includes('Propert') || 
      m.includes('get') || 
      m.includes('find')
    );
    console.log(metodosRelevantes);

    // Intentar obtener propiedades de diferentes formas
    console.log("\n🧪 Intentando obtener propiedades:");
    
    // Método 1: Directo
    try {
      const props1 = model.properties;
      if (props1) {
        console.log("  ✅ model.properties funciona");
        console.log("     Tipo:", typeof props1);
        console.log("     Es Map?", props1 instanceof Map);
        console.log("     Es Object?", typeof props1 === 'object');
      }
    } catch (error) {
      console.log("  ❌ model.properties falló:", error);
    }

    // Método 2: getProperties
    if (typeof model.getProperties === 'function') {
      try {
        console.log("  ✅ model.getProperties() existe");
        // No lo llamamos sin parámetros para evitar errores
      } catch (error) {
        console.log("  ⚠️ model.getProperties() falló:", error);
      }
    } else {
      console.log("  ❌ model.getProperties() NO existe");
    }

    // Método 3: getAllPropertiesOfType
    if (typeof model.getAllPropertiesOfType === 'function') {
      try {
        console.log("  ✅ model.getAllPropertiesOfType() existe");
      } catch (error) {
        console.log("  ⚠️ model.getAllPropertiesOfType() falló");
      }
    } else {
      console.log("  ❌ model.getAllPropertiesOfType() NO existe");
    }

    // Método 4: getAllPropertiesIDs
    if (typeof model.getAllPropertiesIDs === 'function') {
      try {
        const ids = model.getAllPropertiesIDs();
        console.log("  ✅ model.getAllPropertiesIDs() funciona");
        console.log("     Cantidad de IDs:", ids?.length || 0);
        if (ids && ids.length > 0) {
          console.log("     Primeros 5 IDs:", ids.slice(0, 5));
        }
      } catch (error) {
        console.log("  ⚠️ model.getAllPropertiesIDs() falló:", error);
      }
    } else {
      console.log("  ❌ model.getAllPropertiesIDs() NO existe");
    }

    // Método 5: getLocalProperties
    if (typeof model.getLocalProperties === 'function') {
      try {
        const props = model.getLocalProperties();
        console.log("  ✅ model.getLocalProperties() funciona");
        if (props) {
          console.log("     Tipo:", typeof props);
          console.log("     Cantidad de elementos:", Object.keys(props).length);
        }
      } catch (error) {
        console.log("  ⚠️ model.getLocalProperties() falló:", error);
      }
    } else {
      console.log("  ❌ model.getLocalProperties() NO existe");
    }
  }

  /**
   * Ejecuta diagnóstico completo
   */
  ejecutarDiagnosticoCompleto(fragmentsManager: any) {
    this.verificarComponentesDisponibles();
    
    console.log("\n" + "=".repeat(50) + "\n");
    
    for (const model of fragmentsManager.list.values()) {
      this.analizarModelo(model);
      break; // Solo analizar el primer modelo
    }
  }
}