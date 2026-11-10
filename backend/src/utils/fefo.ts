// FEFO: First Expired, First Out. Función pura (sin acceso a BD) para planificar
// de qué lotes se descuenta una cantidad. Se usa dentro de la transacción de venta
// con los lotes ya bloqueados (SELECT ... FOR UPDATE).

export interface FefoBatch {
  id: number;
  quantity: number;
  expiresAt: string; // YYYY-MM-DD
}

export interface FefoAllocation {
  batchId: number;
  quantity: number;
}

export interface FefoPlan {
  allocations: FefoAllocation[];
  shortage: number; // unidades que no se pudieron cubrir
}

/**
 * @param batches lotes candidatos
 * @param needed unidades requeridas
 * @param today fecha (YYYY-MM-DD) para excluir lotes vencidos; por defecto no excluye
 */
export function planFefo(batches: FefoBatch[], needed: number, today?: string): FefoPlan {
  const sorted = batches
    .filter((b) => b.quantity > 0 && (!today || b.expiresAt >= today))
    .sort((a, b) => (a.expiresAt === b.expiresAt ? a.id - b.id : a.expiresAt < b.expiresAt ? -1 : 1));

  const allocations: FefoAllocation[] = [];
  let remaining = needed;
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    allocations.push({ batchId: b.id, quantity: take });
    remaining -= take;
  }
  return { allocations, shortage: Math.max(remaining, 0) };
}
