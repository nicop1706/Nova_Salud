import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, ExpiryBadge, Modal, StockBadge } from '../components/ui';
import { money } from '../lib/format';
import { computeTotals } from '../lib/totals';

describe('StockBadge', () => {
  it('muestra el estado y la cantidad en español', () => {
    const { rerender } = render(<StockBadge status="OUT" qty={0} />);
    expect(screen.getByText(/Agotado/)).toBeInTheDocument();
    rerender(<StockBadge status="LOW" qty={3} />);
    expect(screen.getByText(/3 · Stock bajo/)).toBeInTheDocument();
    rerender(<StockBadge status="OK" qty={50} />);
    expect(screen.getByText(/50 · Disponible/)).toBeInTheDocument();
  });
});

describe('ExpiryBadge', () => {
  it('distingue vencidos y próximos a vencer', () => {
    const { rerender } = render(<ExpiryBadge days={-5} />);
    expect(screen.getByText('Vencido hace 5 d')).toBeInTheDocument();
    rerender(<ExpiryBadge days={12} />);
    expect(screen.getByText('12 d')).toBeInTheDocument();
  });
});

describe('Modal / ConfirmDialog', () => {
  it('cierra con Escape y es accesible', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Prueba"><button>ok</button></Modal>);
    expect(screen.getByRole('dialog', { name: 'Prueba' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('pide confirmación antes de ejecutar una acción destructiva', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ConfirmDialog open danger title="Anular" message="¿Seguro?" confirmLabel="Anular venta" onConfirm={onConfirm} onClose={onClose} />);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('formato y totales del POS', () => {
  it('formatea soles', () => {
    expect(money(1234.5)).toMatch(/S\/\s?1[.,\s]?234[.,]50/);
  });
  it('desglosa el IGV 18 % a partir del precio con IGV', () => {
    const t = computeTotals([{ unitPrice: 11.8, quantity: 10, discountPct: 0 }], 0);
    expect(t.total).toBe(118);
    expect(t.subtotal).toBe(100);
    expect(t.igv).toBe(18);
  });
  it('aplica descuentos por ítem y global', () => {
    const t = computeTotals([{ unitPrice: 10, quantity: 2, discountPct: 10 }], 5);
    expect(t.total).toBe(17.1);
    expect(t.discount).toBe(2.9);
  });
});
