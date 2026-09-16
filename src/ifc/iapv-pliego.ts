/** Especificación técnica del Pliego IAPV asociada a un elemento: la
 *  designación de Item/SubItem del Presupuesto Oficial (PSets `IAPV_Item` /
 *  `IAPV_Suitem`, texto — ej. "5.1 De ladrillos huecos cerámicos…") y la URL
 *  al artículo del Pliego correspondiente (cualquier propiedad cuyo VALOR
 *  tenga forma de URL — el nombre de la propiedad varía según el
 *  IFC/exportador: 'URL del Pliego', IAPV_URL, Weblink, etc.).
 *
 *  Extraído a un módulo propio para que el Cómputo (computo-tool.ts) y el
 *  Panel de Información (properties-panel.ts) lean el mismo dato con la
 *  misma regex, en vez de mantener cada uno su copia. */

export interface PsetLike {
  name: string;
  properties: Record<string, string>;
}

const IAPV_ITEM_KEY = /^IAPV_Item$/i;
const IAPV_SUBITEM_KEY = /^IAPV_Suitem$/i;
export const URL_PATTERN = /^https?:\/\//i;

export function findPropertyValue(psets: PsetLike[], pattern: RegExp): string | null {
  for (const pset of psets) {
    for (const [key, value] of Object.entries(pset.properties)) {
      if (pattern.test(key) && value && value !== "—") return value;
    }
  }
  return null;
}

export function findUrlPropertyValue(psets: PsetLike[]): string | null {
  for (const pset of psets) {
    for (const value of Object.values(pset.properties)) {
      if (value && URL_PATTERN.test(value.trim())) return value.trim();
    }
  }
  return null;
}

export interface IapvPliegoInfo {
  iapvItem: string;
  iapvSubItem: string;
  urlPliego: string;
}

export function getIapvPliegoInfo(psets: PsetLike[]): IapvPliegoInfo {
  return {
    iapvItem: findPropertyValue(psets, IAPV_ITEM_KEY) ?? "",
    iapvSubItem: findPropertyValue(psets, IAPV_SUBITEM_KEY) ?? "",
    urlPliego: findUrlPropertyValue(psets) ?? "",
  };
}
