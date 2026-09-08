/**
 * Evaluador de fórmulas de ajuste de cantidad del Cómputo. La fórmula la
 * escribe el usuario en Configuración → Cómputo → Reglas y se aplica al valor
 * final ya medido de un ítem, escrita en términos de `x` (la cantidad medida):
 *
 *   x * 0.9        descuenta un 10% (ej. solapamiento de cubiertas)
 *   x + x * 0.05   agrega un 5% de desperdicio
 *   max(x - 2, 0)  resta 2 sin bajar de cero
 *
 * Es un parser de descenso recursivo — NO usa `eval`/`new Function`, así que
 * cualquier entrada es inofensiva. Gramática:
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := power (('*' | '/') power)*
 *   power   := unary ('^' power)?
 *   unary   := ('+' | '-') unary | primary
 *   primary := number | 'x' | '(' expr ')' | func '(' expr (',' expr)* ')'
 *   func    := min | max | round | floor | ceil | abs | sqrt
 */

const FUNCS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  round: ([v]) => Math.round(v),
  floor: ([v]) => Math.floor(v),
  ceil: ([v]) => Math.ceil(v),
  abs: ([v]) => Math.abs(v),
  sqrt: ([v]) => Math.sqrt(v),
};

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "name"; value: string };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let j = i + 1;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) j++;
      const num = parseFloat(src.slice(i, j));
      if (!Number.isFinite(num)) return null;
      tokens.push({ type: "num", value: num });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: "name", value: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    return null; // carácter no permitido
  }
  return tokens;
}

/** Evalúa `formula` con la variable `x` = cantidad medida. Devuelve el número
 *  resultante, o `null` si la fórmula está vacía, es sintácticamente inválida,
 *  usa un nombre desconocido o da un valor no finito. */
export function evalQuantityFormula(formula: string, x: number): number | null {
  const tokens = tokenize(formula);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  let failed = false;
  const peek = (): Token | undefined => tokens[pos];
  const fail = (): number => { failed = true; return NaN; };

  function parseExpr(): number {
    let v = parseTerm();
    while (!failed) {
      const t = peek();
      if (!t || t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      pos++;
      const r = parseTerm();
      v = t.value === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parsePower();
    while (!failed) {
      const t = peek();
      if (!t || t.type !== "op" || (t.value !== "*" && t.value !== "/")) break;
      pos++;
      const r = parsePower();
      v = t.value === "*" ? v * r : v / r;
    }
    return v;
  }
  function parsePower(): number {
    const v = parseUnary();
    const t = peek();
    if (!failed && t && t.type === "op" && t.value === "^") {
      pos++;
      return Math.pow(v, parsePower());
    }
    return v;
  }
  function parseUnary(): number {
    const t = peek();
    if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      pos++;
      const v = parseUnary();
      return t.value === "-" ? -v : v;
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const t = peek();
    if (!t) return fail();
    pos++;
    if (t.type === "num") return t.value;
    if (t.type === "op" && t.value === "(") {
      const v = parseExpr();
      const close = peek();
      if (!close || close.type !== "op" || close.value !== ")") return fail();
      pos++;
      return v;
    }
    if (t.type === "name") {
      if (t.value === "x") return x;
      const fn = FUNCS[t.value];
      if (!fn) return fail();
      const open = peek();
      if (!open || open.type !== "op" || open.value !== "(") return fail();
      pos++;
      const args: number[] = [parseExpr()];
      while (!failed) {
        const sep = peek();
        if (!sep || sep.type !== "op" || sep.value !== ",") break;
        pos++;
        args.push(parseExpr());
      }
      const close = peek();
      if (!close || close.type !== "op" || close.value !== ")") return fail();
      pos++;
      return fn(args);
    }
    return fail();
  }

  const result = parseExpr();
  if (failed || pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}

/** `true` si `formula` está vacía (= sin fórmula) o si evalúa a un número
 *  finito. Se usa para el feedback visual del campo en Configuración. */
export function isValidQuantityFormula(formula: string): boolean {
  if (!formula.trim()) return true;
  return evalQuantityFormula(formula, 1) !== null;
}
