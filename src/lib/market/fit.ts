import { MIN_FIT_ROWS } from "./types";

export type FitResult = {
  name: "Linear" | "Quadratic" | "Exp decay";
  c1: [number, number];
  c2: [number, number, number];
  c3: [number, number];
  kmSorted: number[];
  n: number;
};

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function r2Score(y: number[], yhat: number[]) {
  const yMean = mean(y);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yhat[i]) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function aic(y: number[], yhat: number[], k: number) {
  const n = y.length;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - yhat[i]) ** 2;
  return n * Math.log(sse / n) + 2 * k;
}

/** Least-squares polyfit; returns coeffs highest degree first (numpy style). */
function polyfit(x: number[], y: number[], degree: number): number[] {
  const n = x.length;
  const m = degree + 1;
  const A: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  const b: number[] = Array(m).fill(0);

  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    for (let row = 0; row < m; row++) {
      for (let col = 0; col < m; col++) {
        A[row][col] += xi ** (row + col);
      }
      b[row] += yi * xi ** row;
    }
  }

  // Solve A c = b (coeffs lowest degree first), then reverse
  const c = gaussianSolve(A, b);
  return c.reverse();
}

function gaussianSolve(Ain: number[][], bin: number[]): number[] {
  const n = bin.length;
  const A = Ain.map((row, i) => [...row, bin[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const div = A[col][col] || 1e-12;
    for (let j = col; j <= n; j++) A[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j <= n; j++) A[row][j] -= factor * A[col][j];
    }
  }
  return A.map((row) => row[n]);
}

function polyval(coeffs: number[], x: number): number {
  // coeffs highest degree first
  let y = 0;
  for (const c of coeffs) y = y * x + c;
  return y;
}

export function fitModels(km: number[], price: number[]): FitResult | null {
  if (km.length < MIN_FIT_ROWS) return null;
  const c1 = polyfit(km, price, 1) as [number, number];
  const c2 = polyfit(km, price, 2) as [number, number, number];
  const logPrice = price.map((p) => Math.log(p));
  const c3 = polyfit(km, logPrice, 1) as [number, number];

  const yhat1 = km.map((k) => polyval(c1, k));
  const yhat2 = km.map((k) => polyval(c2, k));
  const yhat3 = km.map((k) => Math.exp(polyval(c3, k)));

  const models = [
    {
      name: "Linear" as const,
      aic: aic(price, yhat1, 2),
      r2: r2Score(price, yhat1),
    },
    {
      name: "Quadratic" as const,
      aic: aic(price, yhat2, 3),
      r2: r2Score(price, yhat2),
    },
    {
      name: "Exp decay" as const,
      aic: aic(price, yhat3, 2),
      r2: r2Score(price, yhat3),
    },
  ];
  const best = models.reduce((a, b) => (b.aic < a.aic ? b : a));
  const kmSorted = [...km].sort((a, b) => a - b);

  return { name: best.name, c1, c2, c3, kmSorted, n: km.length };
}

export function modelPriceAt(km: number, fit: FitResult): number {
  if (fit.name === "Linear") return polyval(fit.c1, km);
  if (fit.name === "Quadratic") return polyval(fit.c2, km);
  return Math.exp(polyval(fit.c3, km));
}

export function bestCurve(fit: FitResult): { name: string; x: number[]; y: number[] } {
  const x = fit.kmSorted;
  const y = x.map((k) => modelPriceAt(k, fit));
  return { name: fit.name, x, y };
}
