// app.js - Versión corregida para Vercel
const express = require('express');
const { Client } = require('pg');

const app = express();

// Middleware básico
app.use(express.json());

// ⚠️ IMPORTANTE: Usa variable de entorno para la conexión
const neonConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_N3dFkaV2cyRi@ep-bold-tooth-a4681eud-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
};

// 1. Verificar columnas
app.get('/api/columnas', async (req, res) => {
  const client = new Client(neonConfig);
  try {
    await client.connect();
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'pacientes' 
      ORDER BY ordinal_position
    `);
    res.json({ success: true, columnas: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await client.end();
  }
});

// 2. Listar pacientes
app.get('/api/pacientes', async (req, res) => {
  const client = new Client(neonConfig);
  try {
    const { buscar = '', pagina = 1, limite = 50 } = req.query;
    const offset = (pagina - 1) * limite;
    
    await client.connect();
    
    let query = `SELECT * FROM pacientes`;
    const params = [];
    
    if (buscar) {
      query += ` WHERE (
        CAST(pac_id AS TEXT) ILIKE $1 OR
        pac_nombre ILIKE $1 OR 
        pac_apellidos_cif ILIKE $1 OR
        pac_email ILIKE $1 OR
        pac_telefono1 ILIKE $1
      )`;
      params.push(`%${buscar}%`);
    }
    
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as subquery`;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    query += ` ORDER BY pac_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limite), offset);
    
    const result = await client.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      paginacion: {
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(total / limite)
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await client.end();
  }
});

// 3. Detalle de paciente
app.get('/api/paciente/:id', async (req, res) => {
  const client = new Client(neonConfig);
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    
    await client.connect();
    
    const query = `SELECT * FROM pacientes WHERE pac_id = $1`;
    const result = await client.query(query, [parseInt(id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Paciente no encontrado' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await client.end();
  }
});

// 4. Estadísticas
app.get('/api/estadisticas', async (req, res) => {
  const client = new Client(neonConfig);
  try {
    await client.connect();
    
    const totalResult = await client.query('SELECT COUNT(*) as total FROM pacientes');
    const antecedentesResult = await client.query(`
      SELECT COUNT(*) as con_antecedentes 
      FROM pacientes 
      WHERE pac_antecedentes IS NOT NULL AND pac_antecedentes != ''
    `);
    
    res.json({
      success: true,
      data: {
        total: parseInt(totalResult.rows[0].total),
        con_antecedentes: parseInt(antecedentesResult.rows[0].con_antecedentes)
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await client.end();
  }
});

// 5. Interfaz HTML
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Visualizador de Pacientes</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #f8f9fa; padding: 20px; font-family: Arial, sans-serif; }
            .header { background: #0d6efd; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
            .search-box { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
            .stats { margin-bottom: 20px; }
            .stats .card { border: none; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .table-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .table th { background: #f8f9fa; border-bottom: 2px solid #dee2e6; }
            .antecedentes-cell { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .antecedentes-cell:hover { white-space: normal; overflow: visible; position: absolute; background: white; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 8px; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1><i class="fas fa-users me-2"></i>Visualizador de Pacientes</h1>
                <p class="mb-0">Base de datos PostgreSQL - Neon</p>
            </div>
            
            <div class="search-box">
                <div class="row">
                    <div class="col-md-8">
                        <div class="input-group">
                            <input type="text" class="form-control" id="searchInput" placeholder="Buscar por nombre, apellido, ID...">
                            <button class="btn btn-primary" onclick="buscar()">Buscar</button>
                        </div>
                    </div>
                    <div class="col-md-4 text-end">
                        <button class="btn btn-outline-secondary" onclick="limpiar()">Limpiar</button>
                    </div>
                </div>
            </div>
            
            <div class="row stats">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <h5 id="totalPacientes">0</h5>
                            <small class="text-muted">Total Pacientes</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <h5 id="conAntecedentes">0</h5>
                            <small class="text-muted">Con Antecedentes</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <h5 id="mostrando">0</h5>
                            <small class="text-muted">Mostrando</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="table-container">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nombre</th>
                                <th>Apellido</th>
                                <th>Email</th>
                                <th>Teléfono</th>
                                <th>Antecedentes</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="pacientesTable">
                            <tr>
                                <td colspan="7" class="text-center py-5">
                                    <div class="spinner-border text-primary"></div>
                                    <p class="mt-2">Cargando pacientes...</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="p-3 border-top">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <button class="btn btn-sm btn-outline-primary" onclick="cambiarPagina(-1)" id="btnPrev">← Anterior</button>
                            <span class="mx-3" id="pageInfo">Página 1</span>
                            <button class="btn btn-sm btn-outline-primary" onclick="cambiarPagina(1)" id="btnNext">Siguiente →</button>
                        </div>
                        <div>
                            <select class="form-select form-select-sm" id="pageSize" onchange="cambiarLimite()" style="width: auto;">
                                <option value="25">25 por página</option>
                                <option value="50" selected>50 por página</option>
                                <option value="100">100 por página</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal fade" id="detalleModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Detalles del Paciente</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="detalleContent">
                            Cargando...
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 text-center text-muted small">
                <p>Visualizador simple - Neon PostgreSQL</p>
            </div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
        <script>
            let paginaActual = 1;
            let totalPaginas = 1;
            let totalRegistros = 0;
            let busqueda = '';
            let limite = 50;
            
            document.addEventListener('DOMContentLoaded', () => {
                cargarEstadisticas();
                cargarPacientes();
                
                document.getElementById('searchInput').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') buscar();
                });
            });
            
            async function cargarEstadisticas() {
                try {
                    const response = await fetch('/api/estadisticas');
                    const data = await response.json();
                    
                    if (data.success) {
                        document.getElementById('totalPacientes').textContent = data.data.total;
                        document.getElementById('conAntecedentes').textContent = data.data.con_antecedentes;
                    }
                } catch (error) {
                    console.error('Error estadísticas:', error);
                }
            }
            
            async function cargarPacientes() {
                try {
                    mostrarCargando(true);
                    
                    let url = \`/api/pacientes?pagina=\${paginaActual}&limite=\${limite}\`;
                    if (busqueda) {
                        url += \`&buscar=\${encodeURIComponent(busqueda)}\`;
                    }
                    
                    const response = await fetch(url);
                    const data = await response.json();
                    
                    if (data.success) {
                        mostrarPacientes(data.data);
                        actualizarPaginacion(data.paginacion);
                        document.getElementById('mostrando').textContent = data.data.length;
                    }
                } catch (error) {
                    console.error('Error pacientes:', error);
                    mostrarError('Error cargando pacientes');
                } finally {
                    mostrarCargando(false);
                }
            }
            
            function mostrarPacientes(pacientes) {
                const tbody = document.getElementById('pacientesTable');
                
                if (!pacientes || pacientes.length === 0) {
                    tbody.innerHTML = \`
                        <tr>
                            <td colspan="7" class="text-center py-5">
                                No se encontraron pacientes
                            </td>
                        </tr>
                    \`;
                    return;
                }
                
                let html = '';
                pacientes.forEach(p => {
                    const antecedentes = p.pac_antecedentes ? 
                        \`<div class="antecedentes-cell" title="\${p.pac_antecedentes}">
                            \${p.pac_antecedentes.substring(0, 100)}\${p.pac_antecedentes.length > 100 ? '...' : ''}
                         </div>\` : 
                        '<span class="text-muted">N/A</span>';
                    
                    html += \`
                        <tr>
                            <td>\${p.pac_id}</td>
                            <td>\${p.pac_nombre || 'N/A'}</td>
                            <td>\${p.pac_apellidos_cif || 'N/A'}</td>
                            <td>\${p.pac_email || 'N/A'}</td>
                            <td>\${p.pac_telefono1 || 'N/A'}</td>
                            <td>\${antecedentes}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary" onclick="verDetalle(\${p.pac_id})">
                                    Ver
                                </button>
                            </td>
                        </tr>
                    \`;
                });
                
                tbody.innerHTML = html;
            }
            
            async function verDetalle(id) {
                try {
                    const response = await fetch(\`/api/paciente/\${id}\`);
                    const data = await response.json();
                    
                    if (data.success) {
                        mostrarModalDetalle(data.data);
                    } else {
                        mostrarError(data.error || 'Error cargando detalle');
                    }
                } catch (error) {
                    console.error('Error detalle:', error);
                    mostrarError('Error cargando detalles');
                }
            }
            
            function mostrarModalDetalle(paciente) {
                const content = document.getElementById('detalleContent');
                
                content.innerHTML = \`
                    <div class="row">
                        <div class="col-md-6">
                            <h6>Información Personal</h6>
                            <table class="table table-sm">
                                \${paciente.pac_id ? \`<tr><td><strong>ID:</strong></td><td>\${paciente.pac_id}</td></tr>\` : ''}
                                \${paciente.pac_nombre ? \`<tr><td><strong>Nombre:</strong></td><td>\${paciente.pac_nombre}</td></tr>\` : ''}
                                \${paciente.pac_apellidos_cif ? \`<tr><td><strong>Apellido:</strong></td><td>\${paciente.pac_apellidos_cif}</td></tr>\` : ''}
                            </table>
                        </div>
                        <div class="col-md-6">
                            <h6>Contacto</h6>
                            <table class="table table-sm">
                                \${paciente.pac_email ? \`<tr><td><strong>Email:</strong></td><td>\${paciente.pac_email}</td></tr>\` : ''}
                                \${paciente.pac_telefono1 ? \`<tr><td><strong>Teléfono 1:</strong></td><td>\${paciente.pac_telefono1}</td></tr>\` : ''}
                                \${paciente.pac_telefono2 ? \`<tr><td><strong>Teléfono 2:</strong></td><td>\${paciente.pac_telefono2}</td></tr>\` : ''}
                            </table>
                        </div>
                    </div>
                    <div class="row mt-3">
                        <div class="col-12">
                            <h6>Antecedentes Médicos</h6>
                            <div class="border rounded p-3 bg-light">
                                \${paciente.pac_antecedentes || 'No hay antecedentes registrados'}
                            </div>
                        </div>
                    </div>
                \`;
                
                const modal = new bootstrap.Modal(document.getElementById('detalleModal'));
                modal.show();
            }
            
            function buscar() {
                busqueda = document.getElementById('searchInput').value;
                paginaActual = 1;
                cargarPacientes();
            }
            
            function limpiar() {
                document.getElementById('searchInput').value = '';
                busqueda = '';
                paginaActual = 1;
                cargarPacientes();
            }
            
            function cambiarPagina(delta) {
                const nuevaPagina = paginaActual + delta;
                if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
                    paginaActual = nuevaPagina;
                    cargarPacientes();
                }
            }
            
            function cambiarLimite() {
                limite = parseInt(document.getElementById('pageSize').value);
                paginaActual = 1;
                cargarPacientes();
            }
            
            function actualizarPaginacion(paginacion) {
                totalPaginas = paginacion.totalPaginas;
                totalRegistros = paginacion.total;
                
                document.getElementById('pageInfo').textContent = 
                    \`Página \${paginaActual} de \${totalPaginas}\`;
                
                document.getElementById('btnPrev').disabled = paginaActual === 1;
                document.getElementById('btnNext').disabled = paginaActual === totalPaginas;
            }
            
            function mostrarCargando(mostrar) {
                const tbody = document.getElementById('pacientesTable');
                if (mostrar) {
                    tbody.innerHTML = \`
                        <tr>
                            <td colspan="7" class="text-center py-5">
                                <div class="spinner-border text-primary"></div>
                                <p class="mt-2">Cargando...</p>
                            </td>
                        </tr>
                    \`;
                }
            }
            
            function mostrarError(mensaje) {
                alert(mensaje);
            }
        </script>
    </body>
    </html>
  `);
});

// ⚠️ CRÍTICO: Exportar para Vercel (sin app.listen)
module.exports = app;

// Solo para desarrollo local
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}