/* ============================================================
   CobranzaPro — app.js
   Base de datos: Supabase (PostgreSQL)
   ============================================================ */

const SUPABASE_URL = 'https://gekinishaxgtfynxjkgb.supabase.co';
const SUPABASE_KEY =  'sb_publishable_jvMZqLbqrGDCPwApQoA4DQ_xlxGwANZ';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CONEXIÓN ──────────────────────────────────────────────
async function initDB() {
  try {
    const { error } = await db.from('clientes').select('id').limit(1);
    if (error) throw error;
    setStatus(true);
    return true;
  } catch (e) {
    console.error(e);
    setStatus(false);
    toast('Error al conectar con Supabase', 'error');
    return false;
  }
}

function setStatus(ok) {
  document.getElementById('dbDot').className = 'db-dot ' + (ok ? 'ok' : 'err');
  document.getElementById('dbStatus').textContent = ok ? 'BD conectada' : 'Error BD';
}

// ── CLIENTES CRUD ─────────────────────────────────────────
async function obtenerClientes(filtro = '', estado = '') {
  let q = db.from('clientes').select('*').order('id', { ascending: false });

  if (estado) q = q.eq('estado', estado);
  if (filtro) {
    const f = filtro.toLowerCase();
    q = q.or(`codigo.ilike.%${f}%,nombre.ilike.%${f}%,telefono.ilike.%${f}%`);
  }

  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data;
}

async function agregarCliente(datos) {
  const { data, error } = await db.from('clientes').insert([datos]).select().single();
  if (error) throw error;
  return data;
}

async function editarCliente(id, datos) {
  const { data, error } = await db.from('clientes').update(datos).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function eliminarCliente(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre} y todos sus pagos? Esta acción no se puede deshacer.`)) return;
  const { error: ep } = await db.from('pagos').delete().eq('cliente_id', id);
  if (ep) { toast('Error al eliminar pagos', 'error'); return; }
  const { error: ec } = await db.from('clientes').delete().eq('id', id);
  if (ec) { toast('Error al eliminar cliente', 'error'); return; }
  toast('Cliente eliminado', 'info');
  renderClientes();
  renderDashboard();
}

async function registrarPago(datos) {
  const { data, error } = await db.from('pagos').insert([datos]).select().single();
  if (error) throw error;
  return data;
}

// ── DATOS CALCULADOS DEL CLIENTE ──────────────────────────
async function datosCliente(clienteId, montoTotal, frecuencia) {
  const { data: pagosRows } = await db
    .from('pagos')
    .select('monto, fecha')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false });

  const totalPagado = (pagosRows || []).reduce((s, p) => s + parseFloat(p.monto), 0);
  const ultimoPago  = pagosRows?.length ? pagosRows[0].fecha : null;
  const saldo       = Math.max(0, parseFloat(montoTotal) - totalPagado);
  const pct         = montoTotal > 0 ? Math.min(100, (totalPagado / montoTotal) * 100) : 0;
  const proximoPago = ultimoPago ? calcularProximoPago(ultimoPago, frecuencia) : '—';
  const periodos    = calcularPeriodosRestantes(saldo, montoTotal, frecuencia);
  return { totalPagado, ultimoPago, saldo, pct, proximoPago, periodos };
}

// ── GENERADOR DE CÓDIGO ───────────────────────────────────
async function generarCodigo() {
  const { data } = await db
    .from('clientes')
    .select('codigo')
    .like('codigo', 'CLT%')
    .order('codigo', { ascending: false })
    .limit(1);

  let max = 0;
  if (data?.length) {
    const num = parseInt(data[0].codigo.replace('CLT', ''), 10);
    if (!isNaN(num)) max = num;
  }
  return 'CLT' + String(max + 1).padStart(4, '0');
}

// ── UTILS ─────────────────────────────────────────────────
function fmt(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function calcularProximoPago(ultimoPago, frecuencia) {
  if (!ultimoPago) return '—';
  const d = new Date(ultimoPago + 'T12:00:00');
  if (frecuencia === 'Semanal')      d.setDate(d.getDate() + 7);
  else if (frecuencia === 'Quincenal') d.setDate(d.getDate() + 15);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

function calcularPeriodosRestantes(saldo, montoTotal, frecuencia) {
  if (!montoTotal || saldo <= 0) return 0;
  const pagoPeriodo = montoTotal / (frecuencia === 'Semanal' ? 12 : frecuencia === 'Quincenal' ? 6 : 4);
  if (pagoPeriodo <= 0) return 0;
  return Math.ceil(saldo / pagoPeriodo);
}

function estadoBadge(estado) {
  const map = { Activo: 'green', Atrasado: 'red', Liquidado: 'indigo', Cancelado: 'gray' };
  return `<span class="badge badge--${map[estado] || 'gray'}">${estado}</span>`;
}

function progressColor(pct) {
  if (pct >= 100) return '#38BDF8';
  if (pct >= 80)  return '#4F6EF7';
  if (pct >= 50)  return '#22C47A';
  if (pct >= 25)  return '#F5A623';
  return '#EF4444';
}

function barraProgreso(pct) {
  const color = progressColor(pct);
  return `<div class="progress-wrap">
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="progress-label">${pct.toFixed(0)}%</span>
  </div>`;
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-fade');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ── NAVEGACIÓN ────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const sec = el.dataset.section;
    navegar(sec);
    if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('mobile-open');
  });
});

function navegar(sec) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === sec));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'section-' + sec));
  const titulos = { dashboard: 'Dashboard', clientes: 'Clientes', pagos: 'Pagos', reportes: 'Reportes' };
  document.getElementById('pageTitle').textContent = titulos[sec] || sec;

  if (sec === 'dashboard') renderDashboard();
  if (sec === 'clientes')  renderClientes();
  if (sec === 'pagos')     renderPagos();
}

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('mobile-open');
});

// ── DASHBOARD ─────────────────────────────────────────────
async function renderDashboard() {
  const { data: clientes } = await db.from('clientes').select('id, estado, monto_total, frecuencia');
  const todos = clientes || [];

  const total      = todos.length;
  const activos    = todos.filter(c => c.estado === 'Activo').length;
  const atrasados  = todos.filter(c => c.estado === 'Atrasado').length;
  const liquidados = todos.filter(c => c.estado === 'Liquidado').length;

  // Cobrado este mes
  const now    = new Date();
  const mesIni = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const mesFin = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const { data: pagosMes } = await db
    .from('pagos')
    .select('monto')
    .gte('fecha', mesIni)
    .lte('fecha', mesFin);

  const cobradoMes = (pagosMes || []).reduce((s, p) => s + parseFloat(p.monto), 0);

  // Saldo pendiente total
  const activos_no_cancelados = todos.filter(c => c.estado !== 'Cancelado');
  let saldoPendiente = 0;
  for (const c of activos_no_cancelados) {
    const { data: pp } = await db.from('pagos').select('monto').eq('cliente_id', c.id);
    const pagado = (pp || []).reduce((s, p) => s + parseFloat(p.monto), 0);
    saldoPendiente += Math.max(0, parseFloat(c.monto_total) - pagado);
  }

  document.getElementById('m-total').textContent      = total;
  document.getElementById('m-activos').textContent    = activos;
  document.getElementById('m-atrasados').textContent  = atrasados;
  document.getElementById('m-liquidados').textContent = liquidados;
  document.getElementById('m-mes').textContent        = fmt(cobradoMes);
  document.getElementById('m-pendiente').textContent  = fmt(saldoPendiente);
  document.getElementById('badge-atrasados').textContent = atrasados;

  // Tabla atrasados
  const { data: listAtr } = await db
    .from('clientes')
    .select('*')
    .eq('estado', 'Atrasado')
    .limit(10);

  const tbA = document.querySelector('#tbl-atrasados tbody');
  tbA.innerHTML = '';
  if (!listAtr?.length) {
    tbA.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>Sin clientes atrasados</p></div></td></tr>';
  } else {
    for (const c of listAtr) {
      const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
      tbA.innerHTML += `<tr>
        <td class="td-mono">${c.codigo}</td>
        <td><a href="#" onclick="abrirFicha(${c.id});return false;" style="color:var(--indigo);text-decoration:none;">${c.nombre}</a></td>
        <td>${c.telefono || '—'}</td>
        <td class="td-money" style="color:var(--red)">${fmt(d.saldo)}</td>
        <td>${d.ultimoPago ? fmtDate(d.ultimoPago) : '—'}</td>
      </tr>`;
    }
  }

  // Tabla próximos a liquidar (≥80%)
  const { data: allC } = await db.from('clientes').select('*').neq('estado', 'Cancelado');
  const proximos = [];
  for (const c of (allC || [])) {
    const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
    if (d.pct >= 80 && d.pct < 100) proximos.push({ ...c, ...d });
    if (proximos.length >= 10) break;
  }

  document.getElementById('badge-proximos').textContent = proximos.length;
  const tbP = document.querySelector('#tbl-proximos tbody');
  tbP.innerHTML = '';
  if (!proximos.length) {
    tbP.innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>Sin clientes próximos a liquidar</p></div></td></tr>';
  } else {
    proximos.forEach(c => {
      tbP.innerHTML += `<tr>
        <td class="td-mono">${c.codigo}</td>
        <td><a href="#" onclick="abrirFicha(${c.id});return false;" style="color:var(--indigo);text-decoration:none;">${c.nombre}</a></td>
        <td class="td-money" style="color:var(--yellow)">${fmt(c.saldo)}</td>
        <td>${barraProgreso(c.pct)}</td>
      </tr>`;
    });
  }
}

// ── CLIENTES ──────────────────────────────────────────────
async function renderClientes(filtro = '', estado = '') {
  const rows = await obtenerClientes(filtro, estado);
  const tbody = document.getElementById('tbody-clientes');
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>No se encontraron clientes</p></div></td></tr>`;
    return;
  }

  for (const c of rows) {
    const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
    tbody.innerHTML += `<tr>
      <td class="td-mono">${c.codigo}</td>
      <td><a href="#" onclick="abrirFicha(${c.id});return false;" style="color:var(--indigo);text-decoration:none;font-weight:500">${c.nombre}</a></td>
      <td>${c.telefono || '—'}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${c.paquete || '—'}</td>
      <td class="td-money">${fmt(c.monto_total)}</td>
      <td class="td-money" style="color:var(--red)">${fmt(d.saldo)}</td>
      <td>${barraProgreso(d.pct)}</td>
      <td>${estadoBadge(c.estado)}</td>
      <td><div class="td-actions">
        <button class="btn btn--icon btn--outline" title="Ver ficha" onclick="abrirFicha(${c.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="btn btn--icon btn--outline" title="Registrar pago" onclick="abrirPagoCliente(${c.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="btn btn--icon btn--outline" title="Editar" onclick="abrirEditarCliente(${c.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn--icon btn--danger" title="Eliminar" onclick="eliminarCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`;
  }
}

// Búsqueda y filtro
let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderClientes(e.target.value, document.getElementById('filterEstado').value);
  }, 300);
});
document.getElementById('filterEstado').addEventListener('change', e => {
  renderClientes(document.getElementById('searchInput').value, e.target.value);
});

document.getElementById('btnNuevoCliente').addEventListener('click', async () => {
  document.getElementById('clienteId').value = '';
  document.getElementById('formCliente').reset();
  document.getElementById('fCodigo').value = await generarCodigo();
  document.getElementById('fFechaContrato').value = today();
  document.getElementById('modalClienteTitulo').textContent = 'Nuevo Cliente';
  abrirModal('modalCliente');
});

async function abrirEditarCliente(id) {
  const { data: c, error } = await db.from('clientes').select('*').eq('id', id).single();
  if (error || !c) return;
  document.getElementById('clienteId').value       = c.id;
  document.getElementById('fCodigo').value         = c.codigo;
  document.getElementById('fNombre').value         = c.nombre;
  document.getElementById('fTelefono').value       = c.telefono;
  document.getElementById('fDireccion').value      = c.direccion;
  document.getElementById('fPaquete').value        = c.paquete;
  document.getElementById('fMonto').value          = c.monto_total;
  document.getElementById('fFechaContrato').value  = c.fecha_contrato;
  document.getElementById('fFrecuencia').value     = c.frecuencia;
  document.getElementById('fEstado').value         = c.estado;
  document.getElementById('fObservaciones').value  = c.observaciones;
  document.getElementById('modalClienteTitulo').textContent = 'Editar Cliente';
  abrirModal('modalCliente');
}

async function guardarCliente() {
  const id      = document.getElementById('clienteId').value;
  const nombre  = document.getElementById('fNombre').value.trim();
  const monto   = parseFloat(document.getElementById('fMonto').value);
  const fecha   = document.getElementById('fFechaContrato').value;

  if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
  if (!fecha) { toast('La fecha de contratación es obligatoria', 'error'); return; }

  const datos = {
    nombre,
    telefono:      document.getElementById('fTelefono').value.trim(),
    direccion:     document.getElementById('fDireccion').value.trim(),
    paquete:       document.getElementById('fPaquete').value.trim(),
    monto_total:   monto,
    fecha_contrato: fecha,
    frecuencia:    document.getElementById('fFrecuencia').value,
    estado:        document.getElementById('fEstado').value,
    observaciones: document.getElementById('fObservaciones').value.trim(),
  };

  try {
    if (id) {
      await editarCliente(id, datos);
      toast('Cliente actualizado', 'success');
    } else {
      datos.codigo = await generarCodigo();
      await agregarCliente(datos);
      toast('Cliente registrado', 'success');
    }
    cerrarModal('modalCliente');
    renderClientes();
    renderDashboard();
  } catch (e) {
    console.error(e);
    toast('Error al guardar cliente: ' + (e.message || e), 'error');
  }
}

// ── FICHA CLIENTE ─────────────────────────────────────────
async function abrirFicha(id) {
  const { data: c, error } = await db.from('clientes').select('*').eq('id', id).single();
  if (error || !c) return;

  const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
  const { data: historial } = await db
    .from('pagos')
    .select('*')
    .eq('cliente_id', id)
    .order('fecha', { ascending: false });

  const iniciales = c.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const freq = c.frecuencia.toLowerCase() === 'semanal' ? 'semanas'
             : c.frecuencia.toLowerCase() === 'quincenal' ? 'quincenas' : 'meses';

  document.getElementById('fichaClienteNombre').textContent = c.nombre;

  let histHTML = '';
  if (!historial?.length) {
    histHTML = '<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg><p>Sin pagos registrados</p></div>';
  } else {
    histHTML = `<table class="data-table"><thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Comentarios</th><th></th></tr></thead><tbody>`;
    historial.forEach(p => {
      histHTML += `<tr>
        <td>${fmtDate(p.fecha)}</td>
        <td class="td-money" style="color:var(--green)">${fmt(p.monto)}</td>
        <td><span class="badge badge--indigo">${p.metodo}</span></td>
        <td style="color:var(--text-muted);font-size:0.82rem">${p.comentarios || '—'}</td>
        <td><button class="btn btn--icon btn--danger" onclick="eliminarPago(${p.id},${id})" title="Eliminar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button></td>
      </tr>`;
    });
    histHTML += '</tbody></table>';
  }

  document.getElementById('fichaBody').innerHTML = `
    <div class="ficha-header">
      <div class="ficha-avatar">${iniciales}</div>
      <div class="ficha-info">
        <h3>${c.nombre}</h3>
        <p>${c.codigo} · ${c.telefono || 'Sin teléfono'} · ${c.frecuencia}</p>
        <p style="margin-top:2px">${c.direccion || ''}</p>
        ${c.paquete ? `<p style="margin-top:2px;color:var(--text-muted)">${c.paquete}</p>` : ''}
      </div>
      <div class="ficha-estado">${estadoBadge(c.estado)}</div>
    </div>

    <div class="ficha-stats">
      <div class="ficha-stat">
        <div class="ficha-stat-label">Monto Total</div>
        <div class="ficha-stat-value">${fmt(c.monto_total)}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">Total Pagado</div>
        <div class="ficha-stat-value ficha-stat-value--green">${fmt(d.totalPagado)}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">Saldo Pendiente</div>
        <div class="ficha-stat-value ficha-stat-value--red">${fmt(d.saldo)}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">Último Abono</div>
        <div class="ficha-stat-value ficha-stat-value--yellow">${d.ultimoPago ? fmtDate(d.ultimoPago) : '—'}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">Próximo Pago</div>
        <div class="ficha-stat-value ficha-stat-value--indigo">${d.proximoPago !== '—' ? fmtDate(d.proximoPago) : '—'}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">${freq.charAt(0).toUpperCase()+freq.slice(1)} Restantes</div>
        <div class="ficha-stat-value">${d.periodos}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">Contratación</div>
        <div class="ficha-stat-value" style="font-size:0.82rem">${fmtDate(c.fecha_contrato)}</div>
      </div>
      <div class="ficha-stat">
        <div class="ficha-stat-label">Observaciones</div>
        <div class="ficha-stat-value" style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font)">${c.observaciones || '—'}</div>
      </div>
    </div>

    <div class="ficha-progress">
      <div class="ficha-progress-label">
        <span>Progreso de liquidación</span>
        <span>${d.pct.toFixed(1)}%</span>
      </div>
      <div class="ficha-progress-bar">
        <div class="ficha-progress-fill" style="width:${d.pct}%;background:${progressColor(d.pct)}"></div>
      </div>
    </div>

    <div class="card-header" style="padding:0 0 12px 0;border:none">
      <h3 style="font-size:0.9rem">Historial de Pagos (${historial?.length || 0})</h3>
      <button class="btn btn--sm btn--primary" onclick="abrirPagoCliente(${id})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Registrar Pago
      </button>
    </div>
    <div class="table-wrap">${histHTML}</div>
  `;

  abrirModal('modalFicha');
}

// ── PAGOS ─────────────────────────────────────────────────
async function renderPagos(filtro = '') {
  let q = db
    .from('pagos')
    .select('*, clientes(nombre, codigo)')
    .order('fecha', { ascending: false });

  const { data: rows } = await q;
  let filtrados = rows || [];

  if (filtro) {
    const f = filtro.toLowerCase();
    filtrados = filtrados.filter(p =>
      p.clientes?.nombre?.toLowerCase().includes(f) ||
      p.clientes?.codigo?.toLowerCase().includes(f)
    );
  }

  const tbody = document.getElementById('tbody-pagos');
  tbody.innerHTML = '';

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      <p>No se encontraron pagos</p></div></td></tr>`;
    return;
  }

  filtrados.forEach(p => {
    tbody.innerHTML += `<tr>
      <td class="td-mono">#${p.id}</td>
      <td class="td-mono">${p.clientes?.codigo || '—'}</td>
      <td>${p.clientes?.nombre || '—'}</td>
      <td>${fmtDate(p.fecha)}</td>
      <td class="td-money" style="color:var(--green)">${fmt(p.monto)}</td>
      <td><span class="badge badge--indigo">${p.metodo}</span></td>
      <td style="color:var(--text-muted);font-size:0.82rem">${p.comentarios || '—'}</td>
      <td><div class="td-actions">
        <button class="btn btn--icon btn--danger" onclick="eliminarPago(${p.id},${p.cliente_id})" title="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div></td>
    </tr>`;
  });
}

document.getElementById('searchPagos').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderPagos(e.target.value), 300);
});

document.getElementById('btnNuevoPago').addEventListener('click', async () => {
  document.getElementById('pagoId').value = '';
  document.getElementById('formPago').reset();
  document.getElementById('fPagoFecha').value = today();
  await poblarSelectClientes();
  document.getElementById('modalPagoTitulo').textContent = 'Registrar Pago';
  abrirModal('modalPago');
});

async function abrirPagoCliente(clienteId) {
  document.getElementById('pagoId').value = '';
  document.getElementById('formPago').reset();
  document.getElementById('fPagoFecha').value = today();
  await poblarSelectClientes(clienteId);
  document.getElementById('modalPagoTitulo').textContent = 'Registrar Pago';
  abrirModal('modalPago');
}

async function poblarSelectClientes(selId = null) {
  const { data: rows } = await db
    .from('clientes')
    .select('id, codigo, nombre')
    .not('estado', 'in', '("Cancelado","Liquidado")')
    .order('nombre');

  const sel = document.getElementById('fPagoCliente');
  sel.innerHTML = (rows || []).map(c =>
    `<option value="${c.id}" ${selId == c.id ? 'selected' : ''}>${c.codigo} — ${c.nombre}</option>`
  ).join('');
}

async function guardarPago() {
  const clienteId   = document.getElementById('fPagoCliente').value;
  const fecha       = document.getElementById('fPagoFecha').value;
  const monto       = parseFloat(document.getElementById('fPagoMonto').value);
  const metodo      = document.getElementById('fPagoMetodo').value;
  const comentarios = document.getElementById('fPagoComentarios').value.trim();

  if (!clienteId) { toast('Selecciona un cliente', 'error'); return; }
  if (!fecha)     { toast('La fecha es obligatoria', 'error'); return; }
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }

  try {
    await registrarPago({ cliente_id: parseInt(clienteId), fecha, monto, metodo, comentarios });

    // Auto-actualizar estado del cliente
    const { data: c } = await db.from('clientes').select('*').eq('id', clienteId).single();
    if (c) {
      const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
      if (d.saldo <= 0) {
        await db.from('clientes').update({ estado: 'Liquidado' }).eq('id', clienteId);
      } else if (c.estado === 'Atrasado') {
        await db.from('clientes').update({ estado: 'Activo' }).eq('id', clienteId);
      }
    }

    toast('Pago registrado', 'success');
    cerrarModal('modalPago');
    renderPagos();
    renderDashboard();
    if (document.getElementById('modalFicha').classList.contains('open')) {
      abrirFicha(parseInt(clienteId));
    }
  } catch (e) {
    console.error(e);
    toast('Error al registrar pago: ' + (e.message || e), 'error');
  }
}

async function eliminarPago(id, clienteIdHint) {
  if (!confirm('¿Eliminar este pago?')) return;

  const { data: p } = await db.from('pagos').select('cliente_id').eq('id', id).single();
  const { error } = await db.from('pagos').delete().eq('id', id);
  if (error) { toast('Error al eliminar pago', 'error'); return; }

  toast('Pago eliminado', 'info');
  renderPagos();
  renderDashboard();
  renderClientes();

  const cid = p?.cliente_id || clienteIdHint;
  if (cid && document.getElementById('modalFicha').classList.contains('open')) {
    abrirFicha(cid);
  }
}

// ── REPORTES ──────────────────────────────────────────────
let reporteActual = { tipo: '', datos: [] };

async function generarReporte(tipo) {
  let datos = [];
  let titulo = '';
  let html   = '';
  let columnas = [];

  if (tipo === 'atrasados') {
    titulo = 'Clientes Atrasados';
    const { data: clientes } = await db.from('clientes').select('*').eq('estado', 'Atrasado');
    for (const c of (clientes || [])) {
      const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
      datos.push({ ...c, ...d });
    }
    columnas = ['Código','Nombre','Teléfono','Monto Total','Total Pagado','Saldo','Último Pago','Próximo Pago'];
    html = `<table class="data-table"><thead><tr>${columnas.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    datos.forEach(r => {
      html += `<tr>
        <td class="td-mono">${r.codigo}</td>
        <td>${r.nombre}</td>
        <td>${r.telefono||'—'}</td>
        <td class="td-money">${fmt(r.monto_total)}</td>
        <td class="td-money" style="color:var(--green)">${fmt(r.totalPagado)}</td>
        <td class="td-money" style="color:var(--red)">${fmt(r.saldo)}</td>
        <td>${r.ultimoPago ? fmtDate(r.ultimoPago) : '—'}</td>
        <td>${r.proximoPago !== '—' ? fmtDate(r.proximoPago) : '—'}</td>
      </tr>`;
    });
    html += '</tbody></table>';

  } else if (tipo === 'proximos') {
    titulo = 'Próximos a Liquidar (≥80%)';
    const { data: clientes } = await db.from('clientes').select('*');
    for (const c of (clientes || [])) {
      const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
      if (d.pct >= 80 && d.pct < 100) datos.push({ ...c, ...d });
    }
    datos.sort((a, b) => b.pct - a.pct);
    columnas = ['Código','Nombre','Monto Total','Saldo','% Liquidado','Períodos Restantes'];
    html = `<table class="data-table"><thead><tr>${columnas.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    datos.forEach(r => {
      html += `<tr>
        <td class="td-mono">${r.codigo}</td>
        <td>${r.nombre}</td>
        <td class="td-money">${fmt(r.monto_total)}</td>
        <td class="td-money" style="color:var(--yellow)">${fmt(r.saldo)}</td>
        <td>${barraProgreso(r.pct)}</td>
        <td style="text-align:center">${r.periodos}</td>
      </tr>`;
    });
    html += '</tbody></table>';

  } else if (tipo === 'mes') {
    titulo = 'Cobranza del Mes';
    const now = new Date();
    const ini = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const lastDayRep = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const fin = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(lastDayRep).padStart(2,'0')}`;

    const { data: pagos } = await db
      .from('pagos')
      .select('*, clientes(nombre, codigo)')
      .gte('fecha', ini)
      .lte('fecha', fin)
      .order('fecha', { ascending: false });

    datos = (pagos || []).map(p => ({
      ...p,
      cliente_nombre: p.clientes?.nombre,
      cliente_codigo: p.clientes?.codigo,
    }));

    const total = datos.reduce((s, p) => s + parseFloat(p.monto), 0);
    columnas = ['#','Código','Cliente','Fecha','Monto','Método','Comentarios'];
    html = `<div style="padding:12px 16px;background:var(--surface2);border-radius:6px;margin-bottom:12px;display:flex;align-items:center;gap:16px">
      <span style="font-size:0.82rem;color:var(--text-muted)">${datos.length} pagos registrados</span>
      <span style="font-size:1.1rem;font-weight:700;color:var(--green);font-family:var(--font-mono)">Total: ${fmt(total)}</span>
    </div>`;
    html += `<table class="data-table"><thead><tr>${columnas.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    datos.forEach(p => {
      html += `<tr>
        <td class="td-mono">#${p.id}</td>
        <td class="td-mono">${p.cliente_codigo}</td>
        <td>${p.cliente_nombre}</td>
        <td>${fmtDate(p.fecha)}</td>
        <td class="td-money" style="color:var(--green)">${fmt(p.monto)}</td>
        <td><span class="badge badge--indigo">${p.metodo}</span></td>
        <td style="color:var(--text-muted);font-size:0.82rem">${p.comentarios||'—'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  }

  reporteActual = { tipo, datos, titulo };

  const contenedor = document.getElementById('reporte-resultado');
  document.getElementById('reporte-titulo').textContent = titulo;
  document.getElementById('reporte-tabla').innerHTML = html;
  contenedor.style.display = '';
  contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportarReporteExcel() {
  const { tipo, datos, titulo } = reporteActual;
  if (!datos.length) { toast('No hay datos para exportar', 'error'); return; }

  let wsData = [];
  if (tipo === 'atrasados') {
    wsData = [['Código','Nombre','Teléfono','Monto Total','Total Pagado','Saldo','Último Pago','Próximo Pago']];
    datos.forEach(r => wsData.push([r.codigo, r.nombre, r.telefono, r.monto_total, r.totalPagado, r.saldo, r.ultimoPago || '', r.proximoPago !== '—' ? r.proximoPago : '']));
  } else if (tipo === 'proximos') {
    wsData = [['Código','Nombre','Monto Total','Saldo','% Liquidado','Períodos Restantes']];
    datos.forEach(r => wsData.push([r.codigo, r.nombre, r.monto_total, r.saldo, r.pct.toFixed(1)+'%', r.periodos]));
  } else if (tipo === 'mes') {
    wsData = [['ID','Código','Cliente','Fecha','Monto','Método','Comentarios']];
    datos.forEach(p => wsData.push([p.id, p.cliente_codigo, p.cliente_nombre, p.fecha, p.monto, p.metodo, p.comentarios]));
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 30));
  XLSX.writeFile(wb, `${titulo.replace(/\s+/g,'_')}.xlsx`);
  toast('Reporte exportado', 'success');
}

async function exportarExcel() {
  const { data: clientes } = await db.from('clientes').select('*').order('id');
  const wsClientes = [['Código','Nombre','Teléfono','Dirección','Paquete','Monto Total','Total Pagado','Saldo','% Liquidado','Fecha Contrato','Frecuencia','Estado','Observaciones']];

  for (const c of (clientes || [])) {
    const d = await datosCliente(c.id, c.monto_total, c.frecuencia);
    wsClientes.push([c.codigo, c.nombre, c.telefono, c.direccion, c.paquete, c.monto_total, d.totalPagado, d.saldo, d.pct.toFixed(1)+'%', c.fecha_contrato, c.frecuencia, c.estado, c.observaciones]);
  }

  const { data: pagos } = await db
    .from('pagos')
    .select('*, clientes(nombre, codigo)')
    .order('fecha', { ascending: false });

  const wsPagos = [['ID','Código Cliente','Cliente','Fecha','Monto','Método','Comentarios']];
  (pagos || []).forEach(p => wsPagos.push([p.id, p.clientes?.codigo, p.clientes?.nombre, p.fecha, p.monto, p.metodo, p.comentarios]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsClientes), 'Clientes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsPagos), 'Pagos');
  XLSX.writeFile(wb, 'CobranzaPro_Export.xlsx');
  toast('Excel exportado correctamente', 'success');
}

// ── MODALS ────────────────────────────────────────────────
function abrirModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) cerrarModal(m.id);
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modalCliente','modalPago','modalFicha'].forEach(id => {
      if (document.getElementById(id)?.classList.contains('open')) cerrarModal(id);
    });
  }
});

// ── FECHA TOPBAR ──────────────────────────────────────────
function actualizarFecha() {
  const ahora = new Date();
  document.getElementById('topbarDate').textContent = ahora.toLocaleDateString('es-MX', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

// ── ARRANQUE ──────────────────────────────────────────────
(async () => {
  actualizarFecha();
  setInterval(actualizarFecha, 60000);

  const ok = await initDB();
  if (ok) {
    await renderDashboard();
    await renderClientes();
    await renderPagos();
  }
})();
