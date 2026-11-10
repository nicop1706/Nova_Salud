// Datos maestros de demostración para Nova Salud (productos típicos de botica en Perú).
// Los códigos de barras, RUC, DNI y correos son ficticios.

export const CATEGORIES = [
  { name: 'Analgésicos y antiinflamatorios', description: 'Dolor, fiebre e inflamación' },
  { name: 'Antibióticos', description: 'Antibacterianos (venta con receta)' },
  { name: 'Antigripales y respiratorio', description: 'Resfríos, tos, alergias y vías respiratorias' },
  { name: 'Vitaminas y suplementos', description: 'Vitaminas, minerales y suplementos nutricionales' },
  { name: 'Gastrointestinal', description: 'Acidez, diarrea, gases y digestión' },
  { name: 'Cuidado personal', description: 'Higiene, protección e higiene íntima' },
  { name: 'Primeros auxilios', description: 'Botiquín y curaciones' },
  { name: 'Dermatología', description: 'Cremas y lociones de uso tópico' },
  { name: 'Enfermedades crónicas', description: 'Hipertensión, diabetes, colesterol y tiroides (con receta)' },
];

export const SUPPLIERS = [
  { name: 'Distribuidora Andina de Medicamentos S.A.C.', ruc: '20501234561', contact: 'Jorge Salinas', phone: '(01) 411-2200', email: 'ventas@andinamed.example', address: 'Av. Argentina 2450, Callao' },
  { name: 'Droguería Lima Norte S.R.L.', ruc: '20502345672', contact: 'Patricia Delgado', phone: '(01) 522-3300', email: 'pedidos@limanorte.example', address: 'Av. Túpac Amaru 3100, Comas' },
  { name: 'Química Pacífico E.I.R.L.', ruc: '20503456783', contact: 'Ricardo Montoya', phone: '(01) 433-4400', email: 'comercial@quimicapacifico.example', address: 'Jr. Cusco 780, Cercado de Lima' },
  { name: 'Comercial Salud Total S.A.C.', ruc: '20504567894', contact: 'Silvia Paredes', phone: '(01) 344-5500', email: 'contacto@saludtotal.example', address: 'Av. La Marina 1820, San Miguel' },
  { name: 'Importaciones Cuidado Vital S.A.C.', ruc: '20505678905', contact: 'Daniel Ochoa', phone: '(01) 255-6600', email: 'ventas@cuidadovital.example', address: 'Av. Industrial 950, Ate' },
];

export const CUSTOMERS = [
  { docType: 'DNI', docNumber: '45821937', name: 'María Elena Quispe Huamán', phone: '987654321', email: 'maria.quispe@example.com' },
  { docType: 'DNI', docNumber: '07412856', name: 'Carlos Alberto Rojas Vega', phone: '986123456', email: 'carlos.rojas@example.com' },
  { docType: 'DNI', docNumber: '71234509', name: 'Lucía Fernanda Mendoza Paredes', phone: '945612378', email: null },
  { docType: 'DNI', docNumber: '40981276', name: 'José Luis Ramírez Torres', phone: '999112233', email: 'jose.ramirez@example.com' },
  { docType: 'RUC', docNumber: '20512345678', name: 'Inversiones Los Cedros S.A.C.', phone: '(01) 345-6789', email: 'compras@loscedros.example' },
  { docType: 'DNI', docNumber: '46127753', name: 'Rosa Angélica Flores Salas', phone: '954321876', email: null },
  { docType: 'DNI', docNumber: '09876543', name: 'Pedro Pablo Castillo Díaz', phone: '987001122', email: 'pedro.castillo@example.com' },
  { docType: 'DNI', docNumber: '72811406', name: 'Ana Sofía Gutiérrez Luna', phone: '936548712', email: 'ana.gutierrez@example.com' },
  { docType: 'DNI', docNumber: '43256789', name: 'Miguel Ángel Herrera Cárdenas', phone: '991234567', email: null },
  { docType: 'RUC', docNumber: '10412345674', name: 'Teresa Jiménez Ponce', phone: '976543210', email: 'tere.jimenez@example.com' },
];

/**
 * Perfil de stock (para que el panel de alertas muestre casos reales):
 *  N normal · L stock bajo · O agotado · E por vencer (≤ 60 d) · D por vencer (61-90 d) · X con lote vencido
 */
export type Profile = 'N' | 'L' | 'O' | 'E' | 'D' | 'X';

export interface ProductSeed {
  sku: string;
  name: string;
  activeIngredient: string;
  laboratory: string;
  presentation: string;
  cat: number; // índice en CATEGORIES
  sup: number; // índice en SUPPLIERS
  buy: number; // precio de compra
  sell: number; // precio de venta (IGV incluido)
  min: number;
  rx: boolean;
  profile: Profile;
  pop: number; // popularidad 1-5 (frecuencia de venta)
  barcode: string;
}

type T = [string, string, string, string, string, number, number, number, number, number, boolean, Profile, number];

const raw: T[] = [
  // --- Analgésicos y antiinflamatorios ---
  ['ANA-001', 'Paracetamol 500 mg', 'Paracetamol', 'Genfar', 'Caja x 100 tabletas', 0, 0, 14.0, 21.0, 12, false, 'N', 5],
  ['ANA-002', 'Panadol Forte 500 mg', 'Paracetamol', 'GSK', 'Caja x 16 tabletas', 0, 0, 7.2, 10.5, 15, false, 'N', 4],
  ['ANA-003', 'Ibuprofeno 400 mg', 'Ibuprofeno', 'Portugal', 'Caja x 100 tabletas', 0, 1, 22.0, 32.0, 10, false, 'N', 4],
  ['ANA-004', 'Naproxeno 550 mg', 'Naproxeno sódico', 'Farmindustria', 'Caja x 20 tabletas', 0, 1, 9.5, 15.0, 8, false, 'N', 3],
  ['ANA-005', 'Diclofenaco 50 mg', 'Diclofenaco sódico', 'Medifarma', 'Caja x 100 tabletas', 0, 1, 16.0, 24.0, 8, false, 'L', 3],
  ['ANA-006', 'Aspirina 500 mg', 'Ácido acetilsalicílico', 'Bayer', 'Caja x 20 tabletas', 0, 0, 8.0, 12.5, 8, false, 'N', 3],
  ['ANA-007', 'Dolo-Neurobión', 'Diclofenaco + Vitaminas B1, B6, B12', 'Merck', 'Caja x 30 grageas', 0, 2, 38.0, 52.0, 5, false, 'N', 2],
  ['ANA-008', 'Ketorolaco 10 mg', 'Ketorolaco trometamina', 'Hersil', 'Caja x 100 tabletas', 0, 1, 24.0, 36.0, 6, true, 'L', 2],
  ['ANA-009', 'Meloxicam 15 mg', 'Meloxicam', 'Teva', 'Caja x 30 tabletas', 0, 2, 12.0, 19.0, 6, true, 'N', 2],
  ['ANA-010', 'Ibuprofeno suspensión 100 mg/5 ml', 'Ibuprofeno', 'Portugal', 'Frasco x 120 ml', 0, 1, 6.5, 10.5, 8, false, 'N', 3],
  ['ANA-011', 'Paracetamol jarabe 120 mg/5 ml', 'Paracetamol', 'Genfar', 'Frasco x 60 ml', 0, 0, 3.2, 5.5, 10, false, 'O', 4],

  // --- Antibióticos (con receta) ---
  ['ANB-001', 'Amoxicilina 500 mg', 'Amoxicilina', 'Portugal', 'Caja x 100 cápsulas', 1, 0, 38.0, 55.0, 6, true, 'N', 4],
  ['ANB-002', 'Amoxicilina + Ác. clavulánico 875/125 mg', 'Amoxicilina + Ácido clavulánico', 'GSK', 'Caja x 14 tabletas', 1, 0, 28.0, 42.0, 4, true, 'N', 3],
  ['ANB-003', 'Azitromicina 500 mg', 'Azitromicina', 'Medifarma', 'Caja x 3 tabletas', 1, 1, 6.5, 11.0, 8, true, 'L', 3],
  ['ANB-004', 'Ciprofloxacino 500 mg', 'Ciprofloxacino', 'Genfar', 'Caja x 10 tabletas', 1, 1, 7.0, 12.0, 6, true, 'N', 3],
  ['ANB-005', 'Cefalexina 500 mg', 'Cefalexina', 'Farmindustria', 'Caja x 20 cápsulas', 1, 2, 14.0, 22.0, 5, true, 'N', 2],
  ['ANB-006', 'Claritromicina 500 mg', 'Claritromicina', 'Abbott', 'Caja x 14 tabletas', 1, 2, 35.0, 52.0, 3, true, 'E', 1],
  ['ANB-007', 'Metronidazol 500 mg', 'Metronidazol', 'Genfar', 'Caja x 20 tabletas', 1, 1, 9.0, 15.0, 6, true, 'N', 3],
  ['ANB-008', 'Trimetoprima + Sulfametoxazol 160/800 mg', 'Trimetoprima + Sulfametoxazol', 'Portugal', 'Caja x 20 tabletas', 1, 0, 8.0, 13.0, 5, true, 'N', 2],
  ['ANB-009', 'Doxiciclina 100 mg', 'Doxiciclina', 'Hersil', 'Caja x 10 cápsulas', 1, 2, 6.0, 10.5, 5, true, 'X', 1],
  ['ANB-010', 'Amoxicilina suspensión 250 mg/5 ml', 'Amoxicilina', 'Genfar', 'Frasco x 60 ml', 1, 0, 7.5, 12.5, 5, true, 'O', 4],

  // --- Antigripales y respiratorio ---
  ['RES-001', 'Panadol Antigripal', 'Paracetamol + Fenilefrina + Clorfenamina', 'GSK', 'Caja x 24 tabletas', 2, 0, 24.0, 34.0, 10, false, 'N', 5],
  ['RES-002', 'Sinutab Forte', 'Paracetamol + Fenilefrina + Clorfenamina', 'Pfizer', 'Caja x 20 tabletas', 2, 3, 14.0, 21.0, 8, false, 'N', 3],
  ['RES-003', 'Fluimucil 600 mg', 'Acetilcisteína', 'Zambon', 'Caja x 10 sobres efervescentes', 2, 3, 22.0, 32.0, 5, false, 'E', 2],
  ['RES-004', 'Ambroxol jarabe 15 mg/5 ml', 'Ambroxol', 'Medifarma', 'Frasco x 120 ml', 2, 1, 5.5, 9.0, 6, false, 'N', 3],
  ['RES-005', 'Loratadina 10 mg', 'Loratadina', 'Genfar', 'Caja x 100 tabletas', 2, 0, 9.0, 15.0, 8, false, 'N', 4],
  ['RES-006', 'Cetirizina 10 mg', 'Cetirizina', 'Portugal', 'Caja x 10 tabletas', 2, 1, 2.5, 5.0, 10, false, 'N', 4],
  ['RES-007', 'Desloratadina 5 mg', 'Desloratadina', 'Medifarma', 'Caja x 10 tabletas', 2, 1, 5.0, 9.0, 6, false, 'E', 2],
  ['RES-008', 'Salbutamol inhalador 100 mcg', 'Salbutamol', 'GSK', 'Inhalador x 200 dosis', 2, 3, 12.5, 19.0, 4, true, 'N', 3],
  ['RES-009', 'Strepsils miel y limón', 'Amilmetacresol + Alcohol diclorobencílico', 'Reckitt', 'Bolsa x 24 pastillas', 2, 3, 9.0, 14.0, 8, false, 'N', 4],
  ['RES-010', 'Suero nasal cloruro de sodio 0.9 %', 'Cloruro de sodio', 'Medifarma', 'Frasco gotero x 15 ml', 2, 1, 3.0, 6.0, 6, false, 'L', 2],
  ['RES-011', 'Vick VapoRub 50 g', 'Mentol + Alcanfor + Eucalipto', 'P&G', 'Pote x 50 g', 2, 3, 11.0, 17.0, 5, false, 'N', 3],

  // --- Vitaminas y suplementos ---
  ['VIT-001', 'Vitamina C 500 mg', 'Ácido ascórbico', 'Genfar', 'Caja x 100 tabletas', 3, 0, 17.0, 28.0, 6, false, 'N', 4],
  ['VIT-002', 'Redoxon Doble Acción', 'Vitamina C + Zinc', 'Bayer', 'Tubo x 10 tabletas efervescentes', 3, 3, 16.0, 24.0, 5, false, 'N', 3],
  ['VIT-003', 'Complejo B', 'Vitaminas B1, B6 y B12', 'Medifarma', 'Frasco x 30 tabletas', 3, 1, 6.0, 11.0, 5, false, 'N', 3],
  ['VIT-004', 'Centrum Adultos', 'Multivitamínico y minerales', 'Haleon', 'Frasco x 30 tabletas', 3, 3, 38.0, 55.0, 4, false, 'N', 2],
  ['VIT-005', 'Calcio + Vitamina D3 600 mg', 'Carbonato de calcio + Colecalciferol', 'Roemmers', 'Frasco x 60 tabletas', 3, 4, 22.0, 34.0, 4, false, 'D', 2],
  ['VIT-006', 'Omega 3 1000 mg', 'Ácidos grasos omega 3', 'Natura', 'Frasco x 60 cápsulas', 3, 4, 28.0, 44.0, 4, false, 'N', 2],
  ['VIT-007', 'Sulfato ferroso 300 mg', 'Sulfato ferroso', 'Genfar', 'Caja x 100 tabletas', 3, 0, 12.0, 19.0, 5, false, 'N', 2],
  ['VIT-008', 'Ácido fólico 5 mg', 'Ácido fólico', 'Portugal', 'Caja x 100 tabletas', 3, 1, 8.0, 14.0, 5, false, 'L', 2],
  ['VIT-009', 'Vitamina D3 2000 UI', 'Colecalciferol', 'Roemmers', 'Frasco x 30 cápsulas', 3, 4, 20.0, 32.0, 4, false, 'N', 1],
  ['VIT-010', 'Zinc 50 mg', 'Gluconato de zinc', 'Natura', 'Frasco x 30 tabletas', 3, 4, 14.0, 22.0, 4, false, 'X', 1],

  // --- Gastrointestinal ---
  ['GAS-001', 'Omeprazol 20 mg', 'Omeprazol', 'Genfar', 'Caja x 30 cápsulas', 4, 0, 4.5, 8.0, 10, false, 'N', 5],
  ['GAS-002', 'Buscapina 10 mg', 'Hioscina butilbromuro', 'Boehringer Ingelheim', 'Caja x 20 grageas', 4, 3, 12.0, 18.0, 6, false, 'N', 4],
  ['GAS-003', 'Loperamida 2 mg', 'Loperamida', 'Medifarma', 'Caja x 10 cápsulas', 4, 1, 2.5, 4.5, 8, false, 'L', 3],
  ['GAS-004', 'Sales de rehidratación oral', 'Sales de rehidratación', 'Medifarma', 'Sobre x 1 dosis', 4, 1, 1.2, 2.5, 20, false, 'N', 4],
  ['GAS-005', 'Alka-Seltzer', 'Ácido acetilsalicílico + Bicarbonato', 'Bayer', 'Caja x 24 tabletas efervescentes', 4, 3, 14.0, 21.0, 6, false, 'N', 3],
  ['GAS-006', 'Hidróxido de aluminio y magnesio suspensión', 'Hidróxido de aluminio + Hidróxido de magnesio', 'Portugal', 'Frasco x 360 ml', 4, 1, 11.0, 17.0, 5, false, 'N', 2],
  ['GAS-007', 'Domperidona 10 mg', 'Domperidona', 'Genfar', 'Caja x 30 tabletas', 4, 0, 7.0, 12.0, 5, false, 'N', 2],
  ['GAS-008', 'Simeticona 80 mg', 'Simeticona', 'Medifarma', 'Caja x 10 tabletas masticables', 4, 1, 4.5, 8.0, 6, false, 'E', 2],
  ['GAS-009', 'Lactulosa jarabe 66.7 %', 'Lactulosa', 'Roemmers', 'Frasco x 120 ml', 4, 4, 9.0, 15.0, 4, false, 'N', 1],

  // --- Cuidado personal ---
  ['CUI-001', 'Alcohol medicinal 70°', 'Alcohol etílico 70 %', 'Quimera', 'Frasco x 250 ml', 5, 4, 2.8, 5.0, 20, false, 'N', 5],
  ['CUI-002', 'Alcohol en gel', 'Alcohol etílico 70 %', 'Quimera', 'Frasco x 250 ml', 5, 4, 4.5, 8.0, 15, false, 'N', 4],
  ['CUI-003', 'Mascarilla quirúrgica', 'Mascarilla descartable 3 capas', 'Protex', 'Caja x 50 unidades', 5, 4, 5.5, 10.0, 10, false, 'N', 3],
  ['CUI-004', 'Protector solar FPS 50', 'Filtros UVA/UVB', 'Eucerin', 'Tubo x 120 ml', 5, 4, 28.0, 45.0, 4, false, 'N', 2],
  ['CUI-005', 'Preservativos lubricados', 'Látex', 'Sico', 'Caja x 3 unidades', 5, 4, 3.5, 6.5, 15, false, 'O', 4],
  ['CUI-006', 'Toallas higiénicas', 'Toalla higiénica con alas', 'Nosotras', 'Paquete x 10 unidades', 5, 4, 2.6, 4.5, 15, false, 'N', 4],
  ['CUI-007', 'Pasta dental 75 ml', 'Fluoruro de sodio', 'Colgate', 'Tubo x 75 ml', 5, 4, 3.5, 6.0, 10, false, 'N', 3],
  ['CUI-008', 'Shampoo anticaspa 200 ml', 'Piritionato de zinc', 'Head & Shoulders', 'Frasco x 200 ml', 5, 4, 10.0, 17.0, 5, false, 'E', 2],
  ['CUI-009', 'Jabón antibacterial 100 g', 'Triclosán', 'Protex', 'Barra x 100 g', 5, 4, 2.2, 4.0, 12, false, 'N', 2],

  // --- Primeros auxilios ---
  ['PRI-001', 'Algodón hidrófilo 100 g', 'Algodón', 'Protex', 'Paquete x 100 g', 6, 4, 3.2, 5.5, 10, false, 'N', 3],
  ['PRI-002', 'Gasas estériles 10 x 10 cm', 'Gasa estéril', 'Protex', 'Paquete x 10 unidades', 6, 4, 2.5, 4.5, 10, false, 'N', 3],
  ['PRI-003', 'Curitas adhesivas', 'Apósito adhesivo', '3M', 'Caja x 100 unidades', 6, 4, 6.5, 11.0, 6, false, 'N', 4],
  ['PRI-004', 'Povidona yodada 10 %', 'Povidona yodada', 'Medifarma', 'Frasco x 120 ml', 6, 1, 5.5, 9.0, 6, false, 'N', 3],
  ['PRI-005', 'Agua oxigenada 10 vol.', 'Peróxido de hidrógeno', 'Quimera', 'Frasco x 120 ml', 6, 4, 1.8, 3.5, 8, false, 'N', 3],
  ['PRI-006', 'Termómetro digital', 'Termómetro clínico digital', 'Omron', 'Unidad', 6, 4, 9.0, 16.0, 4, false, 'N', 2],
  ['PRI-007', 'Esparadrapo 1/2 pulgada', 'Cinta microporosa', '3M', 'Rollo x 5 m', 6, 4, 2.0, 3.8, 6, false, 'L', 2],
  ['PRI-008', 'Suero fisiológico 0.9 %', 'Cloruro de sodio', 'Medifarma', 'Frasco x 500 ml', 6, 1, 4.5, 8.0, 5, false, 'N', 1],

  // --- Dermatología ---
  ['DER-001', 'Clotrimazol crema 1 %', 'Clotrimazol', 'Genfar', 'Tubo x 20 g', 7, 0, 3.8, 7.0, 5, false, 'N', 3],
  ['DER-002', 'Hidrocortisona crema 1 %', 'Hidrocortisona', 'Portugal', 'Tubo x 15 g', 7, 1, 6.0, 10.5, 5, false, 'N', 2],
  ['DER-003', 'Betametasona + Gentamicina crema', 'Betametasona + Gentamicina', 'Medifarma', 'Tubo x 15 g', 7, 1, 7.5, 13.0, 4, true, 'N', 2],
  ['DER-004', 'Aciclovir crema 5 %', 'Aciclovir', 'Genfar', 'Tubo x 5 g', 7, 0, 9.0, 15.0, 4, false, 'D', 2],
  ['DER-005', 'Loción de calamina', 'Calamina + Óxido de zinc', 'Roemmers', 'Frasco x 120 ml', 7, 4, 6.0, 10.0, 4, false, 'X', 1],

  // --- Enfermedades crónicas (con receta) ---
  ['CRO-001', 'Losartán 50 mg', 'Losartán potásico', 'Genfar', 'Caja x 30 tabletas', 8, 0, 5.0, 9.5, 8, true, 'N', 4],
  ['CRO-002', 'Metformina 850 mg', 'Metformina clorhidrato', 'Portugal', 'Caja x 100 tabletas', 8, 1, 14.0, 22.0, 6, true, 'N', 4],
  ['CRO-003', 'Atorvastatina 20 mg', 'Atorvastatina cálcica', 'Medifarma', 'Caja x 30 tabletas', 8, 1, 9.0, 16.0, 6, true, 'N', 3],
  ['CRO-004', 'Enalapril 10 mg', 'Enalapril maleato', 'Genfar', 'Caja x 30 tabletas', 8, 0, 4.0, 8.0, 6, true, 'L', 3],
  ['CRO-005', 'Amlodipino 5 mg', 'Amlodipino besilato', 'Portugal', 'Caja x 30 tabletas', 8, 1, 3.5, 7.0, 6, true, 'N', 3],
  ['CRO-006', 'Glibenclamida 5 mg', 'Glibenclamida', 'Genfar', 'Caja x 30 tabletas', 8, 0, 3.0, 6.5, 5, true, 'N', 2],
  ['CRO-007', 'Levotiroxina 100 mcg', 'Levotiroxina sódica', 'Merck', 'Caja x 50 tabletas', 8, 2, 18.0, 29.0, 4, true, 'E', 1],
];

export const PRODUCTS: ProductSeed[] = raw.map(([sku, name, activeIngredient, laboratory, presentation, cat, sup, buy, sell, min, rx, profile, pop], i) => ({
  sku,
  name,
  activeIngredient,
  laboratory,
  presentation,
  cat,
  sup,
  buy,
  sell,
  min,
  rx,
  profile,
  pop,
  // código de barras ficticio EAN-13 (prefijo 775 = Perú) para la demostración
  barcode: `7750${String(100000000 + i * 37).padStart(9, '0')}`,
}));
