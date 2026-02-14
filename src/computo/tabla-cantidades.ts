// src/computo/tabla-cantidades.ts

import type { DatosMuro, ResumenMuros } from "./tipos-muros";

export class TablaCantidades {
  
  /**
   * Genera una tabla HTML con los datos de muros
   */
  static generarTablaHTML(resumen: ResumenMuros): string {
    const { muros, cantidadTotal, volumenTotal, areaTotal } = resumen;

    // Si no hay muros, mostrar mensaje
    if (cantidadTotal === 0) {
      return `
        <div class="no-data">
          <h3>⚠️ No se encontraron muros en el modelo</h3>
          <p>Asegúrate de que el archivo IFC contenga elementos tipo IfcWall con cantidades base.</p>
        </div>
      `;
    }

    // Generar filas de la tabla
    const filas = muros.map((muro: DatosMuro, index: number) => `
      <tr>
        <td>${index + 1}</td>
        <td class="nombre-muro">${muro.nombre}</td>
        <td class="numero">${this.formatearNumero(muro.volumenNeto || muro.volumenBruto)}</td>
        <td class="numero">${this.formatearNumero(muro.areaSuperficial)}</td>
        <td class="numero">${this.formatearNumero(muro.longitud)}</td>
        <td class="numero">${this.formatearNumero(muro.alto)}</td>
        <td class="numero">${this.formatearNumero(muro.ancho)}</td>
        <td>${muro.material || '-'}</td>
      </tr>
    `).join('');

    // HTML completo de la tabla
    return `
      <div class="tabla-cantidades-container">
        <!-- Resumen General -->
        <div class="resumen-cards">
          <div class="card card-cantidad">
            <div class="card-icon">🧱</div>
            <div class="card-content">
              <h4>Total Muros</h4>
              <p class="card-number">${cantidadTotal}</p>
            </div>
          </div>
          
          <div class="card card-volumen">
            <div class="card-icon">📦</div>
            <div class="card-content">
              <h4>Volumen Total</h4>
              <p class="card-number">${volumenTotal.toFixed(2)} m³</p>
            </div>
          </div>
          
          <div class="card card-area">
            <div class="card-icon">📐</div>
            <div class="card-content">
              <h4>Área Total</h4>
              <p class="card-number">${areaTotal.toFixed(2)} m²</p>
            </div>
          </div>
        </div>

        <!-- Tabla Detallada -->
        <div class="tabla-wrapper">
          <h3>📋 Detalle de Muros</h3>
          <table class="tabla-muros">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Volumen (m³)</th>
                <th>Área (m²)</th>
                <th>Longitud (m)</th>
                <th>Alto (m)</th>
                <th>Ancho (m)</th>
                <th>Material</th>
              </tr>
            </thead>
            <tbody>
              ${filas}
            </tbody>
            <tfoot>
              <tr class="fila-total">
                <td colspan="2"><strong>TOTALES</strong></td>
                <td class="numero"><strong>${volumenTotal.toFixed(2)}</strong></td>
                <td class="numero"><strong>${areaTotal.toFixed(2)}</strong></td>
                <td colspan="4"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Botones de Exportación -->
        <div class="botones-exportar">
          <button class="btn-exportar btn-csv" id="btn-exportar-csv">
            📊 Exportar CSV
          </button>
          <button class="btn-exportar btn-json" id="btn-exportar-json">
            💾 Exportar JSON
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Genera CSS para la tabla
   */
  static generarEstilosCSS(): string {
    return `
      <style>
        .tabla-cantidades-container {
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          max-width: 1400px;
          margin: 20px auto;
        }

        /* Cards de Resumen */
        .resumen-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 25px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 20px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          transition: transform 0.3s;
        }

        .card:hover {
          transform: translateY(-5px);
        }

        .card-cantidad {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .card-volumen {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .card-area {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .card-icon {
          font-size: 3em;
        }

        .card-content h4 {
          margin: 0;
          font-size: 0.9em;
          opacity: 0.9;
          font-weight: 500;
        }

        .card-number {
          margin: 5px 0 0 0;
          font-size: 2em;
          font-weight: bold;
        }

        /* Tabla */
        .tabla-wrapper {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .tabla-wrapper h3 {
          margin: 0 0 20px 0;
          color: #2c3e50;
        }

        .tabla-muros {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        .tabla-muros thead {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .tabla-muros th {
          padding: 15px 10px;
          text-align: left;
          font-weight: 600;
          font-size: 0.9em;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .tabla-muros tbody tr {
          border-bottom: 1px solid #ecf0f1;
          transition: background 0.2s;
        }

        .tabla-muros tbody tr:hover {
          background: #f8f9fa;
        }

        .tabla-muros td {
          padding: 12px 10px;
          font-size: 0.95em;
          color: #2c3e50;
        }

        .tabla-muros .nombre-muro {
          font-weight: 500;
          color: #3498db;
        }

        .tabla-muros .numero {
          text-align: right;
          font-family: 'Courier New', monospace;
          color: #7f8c8d;
        }

        .tabla-muros tfoot {
          background: #ecf0f1;
        }

        .tabla-muros .fila-total td {
          padding: 15px 10px;
          font-size: 1.1em;
        }

        /* Botones de Exportación */
        .botones-exportar {
          display: flex;
          gap: 15px;
          justify-content: center;
          margin-top: 20px;
        }

        .btn-exportar {
          padding: 12px 30px;
          border: none;
          border-radius: 8px;
          font-size: 1em;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .btn-csv {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
          color: white;
        }

        .btn-json {
          background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
          color: white;
        }

        .btn-exportar:hover {
          transform: translateY(-3px);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }

        .btn-exportar:active {
          transform: translateY(-1px);
        }

        /* Sin datos */
        .no-data {
          text-align: center;
          padding: 60px 20px;
          color: #7f8c8d;
        }

        .no-data h3 {
          color: #e74c3c;
          margin-bottom: 15px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .tabla-cantidades-container {
            padding: 15px;
          }

          .resumen-cards {
            grid-template-columns: 1fr;
          }

          .tabla-muros {
            font-size: 0.85em;
          }

          .tabla-muros th,
          .tabla-muros td {
            padding: 8px 5px;
          }

          .botones-exportar {
            flex-direction: column;
          }
        }
      </style>
    `;
  }

  /**
   * Exporta los datos a CSV
   */
  static exportarCSV(muros: DatosMuro[]): void {
    // Encabezados
    const headers = [
      'Nombre',
      'Volumen (m³)',
      'Área (m²)',
      'Longitud (m)',
      'Alto (m)',
      'Ancho (m)',
      'Material'
    ];

    // Filas de datos
    const filas = muros.map((muro: DatosMuro) => [
      muro.nombre,
      (muro.volumenNeto || muro.volumenBruto || 0).toFixed(2),
      (muro.areaSuperficial || 0).toFixed(2),
      (muro.longitud || 0).toFixed(2),
      (muro.alto || 0).toFixed(2),
      (muro.ancho || 0).toFixed(2),
      muro.material || '-'
    ]);

    // Construir CSV
    const csv = [
      headers.join(','),
      ...filas.map((fila: string[]) => fila.join(','))
    ].join('\n');

    // Descargar archivo
    this.descargarArchivo(csv, 'cantidades-muros.csv', 'text/csv');
  }

  /**
   * Exporta los datos a JSON
   */
  static exportarJSON(resumen: ResumenMuros): void {
    const json = JSON.stringify(resumen, null, 2);
    this.descargarArchivo(json, 'cantidades-muros.json', 'application/json');
  }

  /**
   * Descarga un archivo
   */
  private static descargarArchivo(contenido: string, nombreArchivo: string, tipo: string): void {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Formatea un número para mostrarlo (2 decimales o '-' si es undefined)
   */
  private static formatearNumero(valor: number | undefined): string {
    if (valor === undefined || valor === null) {
      return '-';
    }
    return valor.toFixed(2);
  }

  /**
   * Muestra la tabla en un contenedor HTML
   */
  static mostrarEnContenedor(resumen: ResumenMuros, contenedorId: string): void {
    const contenedor = document.getElementById(contenedorId);
    
    if (!contenedor) {
      console.error(`No se encontró el contenedor con ID: ${contenedorId}`);
      return;
    }

    // Insertar estilos y tabla
    const html = this.generarEstilosCSS() + this.generarTablaHTML(resumen);
    contenedor.innerHTML = html;

    // Conectar eventos de los botones
    const btnCSV = document.getElementById('btn-exportar-csv');
    const btnJSON = document.getElementById('btn-exportar-json');

    if (btnCSV) {
      btnCSV.addEventListener('click', () => this.exportarCSV(resumen.muros));
    }

    if (btnJSON) {
      btnJSON.addEventListener('click', () => this.exportarJSON(resumen));
    }

    console.log('✅ Tabla de cantidades mostrada correctamente');
  }

  /**
   * Crea un panel flotante con la tabla
   */
  static crearPanelFlotante(resumen: ResumenMuros): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'panel-cantidades-muros';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 1200px;
      max-height: 90vh;
      overflow-y: auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 10px 50px rgba(0,0,0,0.3);
      z-index: 10000;
      padding: 0;
    `;

    // Botón de cerrar
    const btnCerrar = document.createElement('button');
    btnCerrar.innerHTML = '✕';
    btnCerrar.style.cssText = `
      position: absolute;
      top: 15px;
      right: 15px;
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: 50%;
      width: 35px;
      height: 35px;
      font-size: 1.5em;
      cursor: pointer;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    btnCerrar.addEventListener('click', () => {
      panel.remove();
      overlay.remove();
    });

    // Overlay oscuro
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 9999;
    `;
    overlay.addEventListener('click', () => {
      panel.remove();
      overlay.remove();
    });

    // Contenido
    panel.innerHTML = this.generarEstilosCSS() + this.generarTablaHTML(resumen);
    panel.appendChild(btnCerrar);

    // Agregar al DOM
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Conectar eventos
    setTimeout(() => {
      const btnCSV = document.getElementById('btn-exportar-csv');
      const btnJSON = document.getElementById('btn-exportar-json');

      if (btnCSV) {
        btnCSV.addEventListener('click', () => this.exportarCSV(resumen.muros));
      }

      if (btnJSON) {
        btnJSON.addEventListener('click', () => this.exportarJSON(resumen));
      }
    }, 100);

    return panel;
  }
}