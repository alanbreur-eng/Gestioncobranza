/* ============================================================
   CobranzaPro — app.js
   Base de datos: sql.js (SQLite en el navegador)
   ============================================================ */

let DB = null;

// ── Init ──────────────────────────────────────────────────
async function initDB() {
  try {
    const SQL = await initSqlJs({
      locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
    });

    const saved = localStorage.getItem('cobranza_db');
    if (saved) {
      const arr = new Uint8Array(JSON.parse(saved));
      DB = new SQL.Database(arr);
    } else {
      DB = new SQL.Database();
    }

    crearTablas();
    setStatus(true);
    return true;
  } catch (e) {
    console.error(e);
    setStatus(false);
    toast('Error al iniciar la base de datos', 'error');
    return false;
  }
}

function crearTablas() {
  DB.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo       TEXT UNIQUE NOT NULL,
      nombre       TEXT NOT NULL,
      telefono     TEXT DEFAULT '',
      direccion    TEXT DEFAULT '',
      paquete      TEXT DEFAULT '',
      monto_total  REAL NOT NULL DEFAULT 0,
      fecha_contrato TEXT NOT NULL,
      frecuencia   TEXT DEFAULT 'Semanal',
      estado       TEXT DEFAULT 'Activo',
      observaciones TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS pagos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      fecha      TEXT NOT NULL,
      monto      REAL NOT NULL,
      metodo     TEXT DEFAULT 'Efectivo',
      comentarios TEXT DEFAULT '',
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );
  `);
  guardarDB();
}

function guardarDB() {
  if (!DB) return;
  const data = DB.export();
  localStorage.setItem('cobranza_db', JSON.stringify(Array.from(data)));
}

function setStatus(ok) {
  document.getElementById('dbDot').className = 'db-dot ' + (ok ? 'ok' : 'err');
  document.getElementById('dbStatus').textContent = ok ? 'BD conectada' : 'Error BD';
}

// ── Helpers SQL ───────────────────────────────────────────
function query(sql, params = []) {
  try {
    const stmt = DB.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) { console.error(sql, e); return []; }
}

function run(sql, params = []) {
  try { DB.run(sql, params); guardarDB(); return true; }
  catch (e) { console.error(sql, e); return false; }
}

// ── Utils ─────────────────────────────────────────────────
function generarCodigo() {
  const rows = query("SELECT MAX(CAST(SUBSTR(codigo,4) AS INTEGER)) as mx FROM clientes WHERE codigo LIKE 'CLT%'");
  const n = (rows[0]?.mx || 0) + 1;
  return 'CLT' + String(n).padStart(4, '0');
}

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
  if (frecuencia === 'Semanal')    d.setDate(d.getDate() + 7);
  else if (frecuencia === 'Quincenal') d.setDate(d.getDate() + 15);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

function calcularPeriodosRestantes(saldo, montoTotal, frecuencia) {
  if (!montoTotal || saldo <= 0) return 0;
  // Estimamos pago por periodo como monto_total / periodos_totales_tipicos
  // Si no hay pagos, calculamos respecto al monto total
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

// ── Datos del cliente (calculados) ────────────────────────
function datosCliente(c) {
  const pagosRows = query("SELECT SUM(monto) as total, MAX(fecha) as ultimo FROM pagos WHERE cliente_id = ?", [c.id]);
  const totalPagado = parseFloat(pagosRows[0]?.total || 0);
  const ultimoPago  = pagosRows[0]?.ultimo || null;
  const saldo       = Math.max(0, parseFloat(c.monto_total) - totalPagado);
  const pct         = c.monto_total > 0 ? Math.min(100, (totalPagado / c.monto_total) * 100) : 0;
  const proximoPago = ultimoPago ? calcularProximoPago(ultimoPago, c.frecuencia) : '—';
  const periodos    = calcularPeriodosRestantes(saldo, c.monto_total, c.frecuencia);
  return { totalPagado, ultimoPago, saldo, pct, proximoPago, periodos };
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

  if (sec === 'dashboard')  renderDashboard();
  if (sec === 'clientes')   renderClientes();
  if (sec === 'pagos')      renderPagos();
}

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('mobile-open');
});

// ── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  const total      = query("SELECT COUNT(*) as n FROM clientes")[0]?.n || 0;
  const activos    = query("SELECT COUNT(*) as n FROM clientes WHERE estado='Activo'")[0]?.n || 0;
  const atrasados  = query("SELECT COUNT(*) as n FROM clientes WHERE estado='Atrasado'")[0]?.n || 0;
  const liquidados = query("SELECT COUNT(*) as n FROM clientes WHERE estado='Liquidado'")[0]?.n || 0;

  const now = new Date();
  const mesIni = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const mesFin = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;
  const cobradoMes = parseFloat(query("SELECT SUM(monto) as t FROM pagos WHERE fecha >= ? AND fecha <= ?", [mesIni, mesFin])[0]?.t || 0);

  // Saldo pendiente
  let saldoPendiente = 0;
  const todos = query("SELECT id, monto_total FROM clientes WHERE estado != 'Cancelado'");
  todos.forEach(c => {
    const p = parseFloat(query("SELECT SUM(monto) as t FROM pagos WHERE cliente_id=?", [c.id])[0]?.t || 0);
    saldoPendiente += Math.max(0, parseFloat(c.monto_total) - p);
  });

  document.getElementById('m-total').textContent      = total;
  document.getElementById('m-activos').textContent    = activos;
  document.getElementById('m-atrasados').textContent  = atrasados;
  document.getElementById('m-liquidados').textContent = liquidados;
  document.getElementById('m-mes').textContent        = fmt(cobradoMes);
  document.getElementById('m-pendiente').textContent  = fmt(saldoPendiente);
  document.getElementById('badge-atrasados').textContent = atrasados;

  // Tabla atrasados
  const listAtr = query("SELECT * FROM clientes WHERE estado='Atrasado' LIMIT 10");
  const tbA = document.querySelector('#tbl-atrasados tbody');
  tbA.innerHTML = '';
  if (!listAtr.length) {
    tbA.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>Sin clientes atrasados</p></div></td></tr>';
  } else {
    listAtr.forEach(c => {
      const d = datosCliente(c);
      tbA.innerHTML += `<tr>
        <td class="td-mono">${c.codigo}</td>
        <td><a href="#" onclick="abrirFicha(${c.id});return false;" style="color:var(--indigo);text-decoration:none;">${c.nombre}</a></td>
        <td>${c.telefono || '—'}</td>
        <td class="td-money" style="color:var(--red)">${fmt(d.saldo)}</td>
        <td>${d.ultimoPago ? fmtDate(d.ultimoPago) : '—'}</td>
      </tr>`;
    });
  }

  // Tabla proximos a liquidar (>80%)
  const allClients = query("SELECT * FROM clientes WHERE estado != 'Cancelado'");
  const proximos = allClients.filter(c => {
    const d = datosCliente(c);
    return d.pct >= 80 && d.pct < 100;
  }).slice(0, 10);

  document.getElementById('badge-proximos').textContent = proximos.length;
  const tbP = document.querySelector('#tbl-proximos tbody');
  tbP.innerHTML = '';
  if (!proximos.length) {
    tbP.innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>Sin clientes próximos a liquidar</p></div></td></tr>';
  } else {
    proximos.forEach(c => {
      const d = datosCliente(c);
      tbP.innerHTML += `<tr>
        <td class="td-mono">${c.codigo}</td>
        <td><a href="#" onclick="abrirFicha(${c.id});return false;" style="color:var(--indigo);text-decoration:none;">${c.nombre}</a></td>
        <td class="td-money" style="color:var(--yellow)">${fmt(d.saldo)}</td>
        <td>${barraProgreso(d.pct)}</td>
      </tr>`;
    });
  }
}

function barraProgreso(pct) {
  const color = progressColor(pct);
  return `<div class="progress-wrap">
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="progress-label">${pct.toFixed(0)}%</span>
  </div>`;
}

// ── CLIENTES ──────────────────────────────────────────────
function renderClientes(filtro = '', estado = '') {
  const q = `%${filtro.toLowerCase()}%`;
  let sql = "SELECT * FROM clientes WHERE (LOWER(codigo) LIKE ? OR LOWER(nombre) LIKE ? OR telefono LIKE ?)";
  const params = [q, q, q];
  if (estado) { sql += " AND estado = ?"; params.push(estado); }
  sql += " ORDER BY id DESC";

  const rows = query(sql, params);
  const tbody = document.getElementById('tbody-clientes');
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>No se encontraron clientes</p></div></td></tr>`;
    return;
  }

  rows.forEach(c => {
    const d = datosCliente(c);
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
        <button class="btn btn--icon btn--outline" title="Editar" onclick="editarCliente(${c.id})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn--icon btn--danger" title="Eliminar" onclick="eliminarCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`;
  });
}

// Búsqueda y filtro
let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderClientes(e.target.value, document.getElementById('filterEstado').value);
  }, 200);
});
document.getElementById('filterEstado').addEventListener('change', e => {
  renderClientes(document.getElementById('searchInput').value, e.target.value);
});

document.getElementById('btnNuevoCliente').addEventListener('click', () => {
  document.getElementById('clienteId').value = '';
  document.getElementById('formCliente').reset();
  document.getElementById('fCodigo').value = generarCodigo();
  document.getElementById('fFechaContrato').value = today();
  document.getElementById('modalClienteTitulo').textContent = 'Nuevo Cliente';
  abrirModal('modalCliente');
});

function editarCliente(id) {
  const c = query("SELECT * FROM clientes WHERE id=?", [id])[0];
  if (!c) return;
  document.getElementById('clienteId').value  = c.id;
  document.getElementById('fCodigo').value     = c.codigo;
  document.getElementById('fNombre').value     = c.nombre;
  document.getElementById('fTelefono').value   = c.telefono;
  document.getElementById('fDireccion').value  = c.direccion;
  document.getElementById('fPaquete').value    = c.paquete;
  document.getElementById('fMonto').value      = c.monto_total;
  document.getElementById('fFechaContrato').value = c.fecha_contrato;
  document.getElementById('fFrecuencia').value = c.frecuencia;
  document.getElementById('fEstado').value     = c.estado;
  document.getElementById('fObservaciones').value = c.observaciones;
  document.getElementById('modalClienteTitulo').textContent = 'Editar Cliente';
  abrirModal('modalCliente');
}

function guardarCliente() {
  const id       = document.getElementById('clienteId').value;
  const nombre   = document.getElementById('fNombre').value.trim();
  const monto    = parseFloat(document.getElementById('fMonto').value);
  const fecha    = document.getElementById('fFechaContrato').value;

  if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
  if (!fecha) { toast('La fecha de contratación es obligatoria', 'error'); return; }

  const datos = [
    document.getElementById('fNombre').value.trim(),
    document.getElementById('fTelefono').value.trim(),
    document.getElementById('fDireccion').value.trim(),
    document.getElementById('fPaquete').value.trim(),
    monto, fecha,
    document.getElementById('fFrecuencia').value,
    document.getElementById('fEstado').value,
    document.getElementById('fObservaciones').value.trim()
  ];

  if (id) {
    run("UPDATE clientes SET nombre=?,telefono=?,direccion=?,paquete=?,monto_total=?,fecha_contrato=?,frecuencia=?,estado=?,observaciones=? WHERE id=?",
      [...datos, id]);
    toast('Cliente actualizado', 'success');
  } else {
    const codigo = generarCodigo();
    run("INSERT INTO clientes (codigo,nombre,telefono,direccion,paquete,monto_total,fecha_contrato,frecuencia,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [codigo, ...datos]);
    toast('Cliente registrado', 'success');
  }

  cerrarModal('modalCliente');
  renderClientes();
  renderDashboard();
}

function eliminarCliente(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre} y todos sus pagos? Esta acción no se puede deshacer.`)) return;
  run("DELETE FROM pagos WHERE cliente_id=?", [id]);
  run("DELETE FROM clientes WHERE id=?", [id]);
  toast('Cliente eliminado', 'info');
  renderClientes();
  renderDashboard();
}

// ── FICHA CLIENTE ─────────────────────────────────────────
function abrirFicha(id) {
  const c = query("SELECT * FROM clientes WHERE id=?", [id])[0];
  if (!c) return;
  const d = datosCliente(c);
  const historial = query("SELECT * FROM pagos WHERE cliente_id=? ORDER BY fecha DESC", [id]);

  const iniciales = c.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const freq = c.frecuencia.toLowerCase() === 'semanal' ? 'semanas' : c.frecuencia.toLowerCase() === 'quincenal' ? 'quincenas' : 'meses';

  document.getElementById('fichaClienteNombre').textContent = c.nombre;

  let histHTML = '';
  if (!historial.length) {
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
      <h3 style="font-size:0.9rem">Historial de Pagos (${historial.length})</h3>
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
function renderPagos(filtro = '') {
  const q = `%${filtro.toLowerCase()}%`;
  const rows = query(`
    SELECT p.*, c.nombre as cliente_nombre, c.codigo as cliente_codigo
    FROM pagos p JOIN clientes c ON p.cliente_id = c.id
    WHERE LOWER(c.nombre) LIKE ? OR c.codigo LIKE ?
    ORDER BY p.fecha DESC, p.id DESC
  `, [q, q]);

  const tbody = document.getElementById('tbody-pagos');
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      <p>No se encontraron pagos</p></div></td></tr>`;
    return;
  }

  rows.forEach(p => {
    tbody.innerHTML += `<tr>
      <td class="td-mono">#${p.id}</td>
      <td class="td-mono">${p.cliente_codigo}</td>
      <td>${p.cliente_nombre}</td>
      <td>${fmtDate(p.fecha)}</td>
      <td class="td-money" style="color:var(--green)">${fmt(p.monto)}</td>
      <td><span class="badge badge--indigo">${p.metodo}</span></td>
      <td style="color:var(--text-muted);font-size:0.82rem">${p.comentarios || '—'}</td>
      <td><div class="td-actions">
        <button class="btn btn--icon btn--danger" onclick="eliminarPago(${p.id},null)" title="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div></td>
    </tr>`;
  });
}

document.getElementById('searchPagos').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderPagos(e.target.value), 200);
});

document.getElementById('btnNuevoPago').addEventListener('click', () => {
  document.getElementById('pagoId').value = '';
  document.getElementById('formPago').reset();
  document.getElementById('fPagoFecha').value = today();
  poblarSelectClientes();
  document.getElementById('modalPagoTitulo').textContent = 'Registrar Pago';
  abrirModal('modalPago');
});

function abrirPagoCliente(clienteId) {
  document.getElementById('pagoId').value = '';
  document.getElementById('formPago').reset();
  document.getElementById('fPagoFecha').value = today();
  poblarSelectClientes(clienteId);
  document.getElementById('modalPagoTitulo').textContent = 'Registrar Pago';
  abrirModal('modalPago');
}

function poblarSelectClientes(selId = null) {
  const rows = query("SELECT id, codigo, nombre FROM clientes WHERE estado != 'Cancelado' AND estado != 'Liquidado' ORDER BY nombre");
  const sel = document.getElementById('fPagoCliente');
  sel.innerHTML = rows.map(c => `<option value="${c.id}" ${selId == c.id ? 'selected' : ''}>${c.codigo} — ${c.nombre}</option>`).join('');
}

function guardarPago() {
  const clienteId = document.getElementById('fPagoCliente').value;
  const fecha     = document.getElementById('fPagoFecha').value;
  const monto     = parseFloat(document.getElementById('fPagoMonto').value);
  const metodo    = document.getElementById('fPagoMetodo').value;
  const comentarios = document.getElementById('fPagoComentarios').value.trim();

  if (!clienteId) { toast('Selecciona un cliente', 'error'); return; }
  if (!fecha)     { toast('La fecha es obligatoria', 'error'); return; }
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }

  run("INSERT INTO pagos (cliente_id,fecha,monto,metodo,comentarios) VALUES (?,?,?,?,?)",
    [clienteId, fecha, monto, metodo, comentarios]);

  // Auto-actualizar estado del cliente
  const c = query("SELECT * FROM clientes WHERE id=?", [clienteId])[0];
  if (c) {
    const d = datosCliente(c);
    if (d.saldo <= 0) {
      run("UPDATE clientes SET estado='Liquidado' WHERE id=?", [clienteId]);
    } else if (c.estado === 'Atrasado') {
      run("UPDATE clientes SET estado='Activo' WHERE id=?", [clienteId]);
    }
  }

  toast('Pago registrado', 'success');
  cerrarModal('modalPago');
  renderPagos();
  renderDashboard();
  // Si hay ficha abierta, refrescarla
  if (document.getElementById('modalFicha').classList.contains('open')) {
    abrirFicha(clienteId);
  }
}

function eliminarPago(id, clienteIdHint) {
  if (!confirm('¿Eliminar este pago?')) return;
  const p = query("SELECT * FROM pagos WHERE id=?", [id])[0];
  run("DELETE FROM pagos WHERE id=?", [id]);
  toast('Pago eliminado', 'info');
  renderPagos();
  renderDashboard();
  renderClientes();
  if (p && document.getElementById('modalFicha').classList.contains('open')) {
    abrirFicha(p.cliente_id);
  }
}

// ── REPORTES ──────────────────────────────────────────────
let reporteActual = { tipo: '', datos: [] };

function generarReporte(tipo) {
  let datos = [];
  let titulo = '';
  let columnas = [];
  let html = '';

  const allClients = query("SELECT * FROM clientes");

  if (tipo === 'atrasados') {
    titulo = 'Clientes Atrasados';
    datos = allClients.filter(c => c.estado === 'Atrasado').map(c => {
      const d = datosCliente(c);
      return { ...c, ...d };
    });
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
  }

  else if (tipo === 'proximos') {
    titulo = 'Próximos a Liquidar (≥80%)';
    datos = allClients.map(c => ({ ...c, ...datosCliente(c) }))
      .filter(c => c.pct >= 80 && c.pct < 100)
      .sort((a, b) => b.pct - a.pct);
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
  }

  else if (tipo === 'mes') {
    titulo = 'Cobranza del Mes';
    const now = new Date();
    const ini = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const fin = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;
    datos = query(`
      SELECT p.*, c.nombre as cliente_nombre, c.codigo as cliente_codigo
      FROM pagos p JOIN clientes c ON p.cliente_id = c.id
      WHERE p.fecha >= ? AND p.fecha <= ?
      ORDER BY p.fecha DESC
    `, [ini, fin]);
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

function exportarExcel() {
  const clientes = query("SELECT * FROM clientes ORDER BY id");
  const wsClientes = [['Código','Nombre','Teléfono','Dirección','Paquete','Monto Total','Total Pagado','Saldo','% Liquidado','Fecha Contrato','Frecuencia','Estado','Observaciones']];

  clientes.forEach(c => {
    const d = datosCliente(c);
    wsClientes.push([c.codigo, c.nombre, c.telefono, c.direccion, c.paquete, c.monto_total, d.totalPagado, d.saldo, d.pct.toFixed(1)+'%', c.fecha_contrato, c.frecuencia, c.estado, c.observaciones]);
  });

  const pagos = query("SELECT p.*, c.codigo, c.nombre as cliente FROM pagos p JOIN clientes c ON p.cliente_id=c.id ORDER BY p.fecha DESC");
  const wsPagos = [['ID','Código Cliente','Cliente','Fecha','Monto','Método','Comentarios']];
  pagos.forEach(p => wsPagos.push([p.id, p.codigo, p.cliente, p.fecha, p.monto, p.metodo, p.comentarios]));

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

// ── SEED DATA (si BD vacía) ───────────────────────────────
function seedData() {
  const hay = query("SELECT COUNT(*) as n FROM clientes")[0]?.n;
  if (hay > 0) return;

  const clientes = [
    ['CLT0001','María López Torres','6381234567','Av. Sonora 123','Plan 12 Semanas',2400,'2025-04-01','Semanal','Atrasado','Cliente frecuente'],
    ['CLT0002','Carlos Mendoza R.','6389876543','Calle 5 de Mayo 45','Plan Quincenal',3600,'2025-03-15','Quincenal','Activo',''],
    ['CLT0003','Ana García Ruiz','6382345678','Col. Hidalgo #77','Plan Mensual',5000,'2025-02-01','Mensual','Liquidado','Pagó completo'],
    ['CLT0004','Roberto Sánchez','6383456789','Blvd. Benito Juárez','Plan 8 Semanas',1600,'2025-05-10','Semanal','Activo',''],
    ['CLT0005','Patricia Vega M.','6384567890','Calle Reforma 200','Plan Quincenal',2800,'2025-01-20','Quincenal','Atrasado','Llamar martes'],
  ];

  clientes.forEach(c => {
    run("INSERT INTO clientes (codigo,nombre,telefono,direccion,paquete,monto_total,fecha_contrato,frecuencia,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)", c);
  });

  const ids = query("SELECT id, monto_total FROM clientes");
  ids.forEach((c, i) => {
    const montos = [400, 720, 5000, 800, 280];
    if (montos[i]) {
      const abonos = i === 2 ? [[c.monto_total, '2025-05-01']] : [[montos[i]/2, '2025-05-15'],[montos[i]/2, '2025-06-01']];
      abonos.forEach(([monto, fecha]) => {
        run("INSERT INTO pagos (cliente_id,fecha,monto,metodo,comentarios) VALUES (?,?,?,'Efectivo','')", [c.id, fecha, monto]);
      });
    }
  });
}

// ── ARRANQUE ──────────────────────────────────────────────
(async () => {
  actualizarFecha();
  setInterval(actualizarFecha, 60000);

  await initDB();
  seedData();
  renderDashboard();
  renderClientes();
  renderPagos();
})();
