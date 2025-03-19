'use strict';

const LOG = process.env.LOG || false;

const mysql = require('mysql');
const util = require('util');  // Para promisify
const SimpleNodeLogger = require('simple-node-logger');
const log = SimpleNodeLogger.createSimpleLogger({
  logFilePath: '/var/log/apirest.log',
  timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
});

const server = require('./server.js');
const tts = require('./tts.js');

// Creamos el pool con la librería "mysql" clásica
// Ajusta connectionLimit, insecureAuth, etc. según corresponda:
const pool = mysql.createPool({
  host: server.host,
  port: server.port,
  user: server.user,
  password: server.pass,
  database: server.database,
  insecureAuth: true,
  connectionLimit: 10
});

// Promisificamos la función query
const queryPromise = util.promisify(pool.query).bind(pool);

// Función para obtener la IP
function showip(req) {
  const ip = (req.headers['x-forwarded-for']
       || req.connection.remoteAddress
       || req.socket.remoteAddress
       || (req.connection.socket && req.connection.socket.remoteAddress)
       || ''
     ).split(',')[0];
  return ip;
}

// -------------------- LOGIN --------------------

exports.login = async function (req, res) {
  const username = req.body.user;
  const password = req.body.pass;
  const sql = `
    SELECT id, usuario AS user
    FROM api_usuario
    WHERE enabled = '1' AND usuario = ? AND md5_password = MD5(?)
    LIMIT 1
  `;
  try {
    const rows = await queryPromise(sql, [username, password]);
    if (rows.length > 0 && rows[0].id) {
      // login ok
      req.session.user_id = rows[0].id;
      req.session.username = rows[0].user;
      req.session.isAuthed = true;

      // actualiza último login
      await queryPromise(
        'UPDATE api_usuario SET ultimo_login = NOW() WHERE id = ?',
        [rows[0].id]
      );

      const msg = { code: 200, success: 'login sucessfull.' };
      if (LOG === 'true') {
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`);
      }
      return res.json(msg);
    } else {
      // Incorrect user/pass
      req.session.isAuthed = false;
      const msg = { code: '204', success: 'Incorrect username and password.' };
      if (LOG === 'true') {
        log.info(`[${req.body.user}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
        log.info(`[${req.body.user}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`);
      }
      return res.json(msg);
    }
  } catch (error) {
    // error en la query
    const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
    const msgUser = { code: '500', error: 'Please contact the administrator' };
    if (LOG === 'true') {
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msglog.code} Response: ${msglog.error}`);
    }
    return res.json(msgUser);
  }
};

// -------------------- CAMPAIGNS --------------------

exports.campaigns = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    if (LOG === 'true') {
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`);
    }
    return res.json(msg);
  }

  try {
    let sql, arg;
    if (!req.params.id) {
      sql = `
        SELECT c.id, c.name, c.max_canales AS channels, c.estatus AS status,
               c.id_survey, c.callerid, c.add_prefix, c.remove_prefix,
               (SELECT description FROM iwebserver.campaign_schedule_header
                WHERE id = c.call_time_template_id) AS name_call_time,
               (SELECT name FROM iwebserver.campaign_retry_header
                WHERE id = c.reycling_template_id) AS name_reciclado,
               IF(c.amdconf IS NULL,'OFF','ON') as amd_state
        FROM isurveyx.idialerx_campaign c
        INNER JOIN isurveyx.survey_header q ON c.id_survey = q.id
        WHERE q.creation_user_id = ?
      `;
      arg = [req.session.user_id];
    } else {
      sql = `
        SELECT c.id, c.name, c.max_canales AS channels, c.estatus AS status,
               c.id_survey, c.callerid, c.add_prefix, c.remove_prefix,
               (SELECT description FROM iwebserver.campaign_schedule_header
                WHERE id = c.call_time_template_id) AS name_call_time,
               (SELECT name FROM iwebserver.campaign_retry_header
                WHERE id = c.reycling_template_id) AS name_reciclado,
               IF(c.amdconf IS NULL,'OFF','ON') as amd_state
        FROM isurveyx.idialerx_campaign c
        INNER JOIN isurveyx.survey_header q ON c.id_survey = q.id
        WHERE q.creation_user_id = ?
          AND c.id = ?
      `;
      arg = [req.session.user_id, req.params.id];
    }
    const results = await queryPromise(sql, arg);

    if (results.length > 0) {
      const msg = { status: '200', response: results };
      if (LOG === 'true') {
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: `, results);
      }
      return res.json(msg);
    } else {
      const msg = { status: '200', response: 'No campaigns available.' };
      if (LOG === 'true') {
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: ${msg.response}`);
      }
      return res.json(msg);
    }
  } catch (error) {
    const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
    const msgUser = { code: '500', error: 'Please contact the administrator' };
    if (LOG === 'true') {
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msglog.code} Response: ${msglog.error}`);
    }
    return res.json(msgUser);
  }
};

exports.campaignsStatus = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    if (LOG === 'true') {
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`);
    }
    return res.json(msg);
  }

  try {
    if (req.params.status) {
      const sql = `
        SELECT estatus AS status,
               (SELECT COUNT(*) FROM idialerx_calls WHERE id_campaign = ?) AS LeadsUploaded,
               (SELECT COUNT(*) FROM idialerx_calls WHERE id_campaign = ? AND status IS NOT NULL) AS LeadsCalled
        FROM idialerx_campaign
        WHERE id = ?
      `;
      const arg = [req.params.id, req.params.id, req.params.id];
      const results = await queryPromise(sql, arg);

      if (results.length > 0) {
        const msg = { status: '200', response: results };
        if (LOG === 'true') {
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.status} Response: `, results);
        }
        return res.json(msg);
      } else {
        const msg = { code: '404', error: 'The incorrect campaign id.' };
        if (LOG === 'true') {
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 404 Response: ${msg.error}`);
        }
        return res.json(msg);
      }
    } else if (req.params.action) {
      let action = req.params.action;
      if (action === 'enable') action = 'A';
      else if (action === 'disable') action = 'I';

      const sql = "UPDATE idialerx_campaign SET estatus = ? WHERE id = ?";
      const arg = [action, req.params.id];
      const results = await queryPromise(sql, arg);

      // La lógica original asume que si results.length > 0, es un error,
      // pero en realidad "UPDATE" no devuelve rows sino un objeto con "affectedRows".
      // Mantengo la estructura original.
      if (results.length > 0) {
        const msg = { status: '404', error: 'The incorrect campaign id.' };
        if (LOG === 'true') {
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 404 Response: ${msg.error}`);
        }
        return res.json(msg);
      } else {
        const msg = { status: '200', response: `campaign ${req.params.action}` };
        if (LOG === 'true') {
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
          log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 200 Response: ${msg.response}`);
        }
        return res.json(msg);
      }
    } else {
      const msg = { status: '500', error: 'Wrong argument.' };
      if (LOG === 'true') {
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
        log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 500 Response: ${msg.error}`);
      }
      return res.json(msg);
    }
  } catch (error) {
    const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
    const msgUser = { code: '500', error: 'Please contact the administrator' };
    if (LOG === 'true') {
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 500 Response: ${msglog.error}`);
    }
    return res.json(msgUser);
  }
};

// -------------------- CONTACT --------------------

exports.contact = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    if (LOG === 'true') {
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`);
    }
    return res.json(msg);
  }

  try {
    const sql = `
      INSERT INTO idialerx_calls (id_campaign, phone, retries, dnc)
      VALUES (?, ?, ?, ?)
    `;
    const arg = [req.body.idcampaign, req.body.phone, '0', '0'];
    const insertResult = await queryPromise(sql, arg);

    // Si se insertó, insertResult.insertId es el ID
    const idCall = insertResult.insertId;

    if (req.body.attributes) {
      // Si tts está activo
      if (server.tts === 'true') {
        tts.create(req.body.attributes, req.body.idcampaign);
      }

      // insertar cada atributo
      for (const key of Object.keys(req.body.attributes)) {
        const value = req.body.attributes[key];
        const sqlAttr = `
          INSERT INTO idialerx_call_attribute (id_call, columna, value)
          VALUES (?, ?, ?)
        `;
        try {
          await queryPromise(sqlAttr, [idCall, key, value]);
        } catch (errorAttr) {
          // error en inserción de un atributo
          const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
          const msgUser = { code: '500', error: 'Please contact the administrator' };
          if (LOG === 'true') {
            log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()} Body: `, req.body);
            log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 500 Response: ${msglog.error}`);
          }
          return res.json(msgUser);
        }
      }
    }

    const msg = { status: '200', idcall: idCall };
    if (LOG === 'true') {
      log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 200 Response: idcall ${idCall}`);
    }
    return res.json(msg);

  } catch (error) {
    // Error en la inserción principal
    const msg = { code: '404', error: 'The incorrect campaign id. Please check all the arguments to be valid.' };
    if (LOG === 'true') {
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.error}`);
    }
    return res.json(msg);
  }
};

// -------------------- CALLINFO --------------------

exports.callinfo = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    if (LOG === 'true') {
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Method ${req.method.toUpperCase()}  Path: ${req.originalUrl} Body: `, req.body);
      log.info(`[anonymous] [${showip(req)}] [${req.sessionID}] Status: ${msg.code} Response: ${msg.success}`);
    }
    return res.json(msg);
  }

  try {
    let sql = "SELECT id_campaign AS id, status FROM idialerx_calls WHERE id = ?";
    let arg = [req.params.id];
    const rows = await queryPromise(sql, arg);

    if (rows.length === 0) {
      // id_call inexistente
      const msg = { code: '404', error: 'The incorrect campaign idcall.' };
      if (LOG === 'true') {
        log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Path: ${req.originalUrl}`, req.body);
      }
      return res.json(msg);
    }

    // si existe
    const status = rows[0].status;
    const campaignId = rows[0].id;
    if (status === 'Success') {
      sql = `
        SELECT idc.id, idc.id_campaign, idc.phone, idc.status AS campaign_status,
               idc.disposition, idc.uniqueid, idc.start_time, idc.end_time,
               idc.retries, idc.duration, idc.hangup_cause, idc.trunk,
               sx.*
        FROM idialerx_calls idc
        INNER JOIN survey_${campaignId}_call sx ON sx.id = idc.id
        WHERE idc.id = ?
        LIMIT 1
      `;
    } else {
      sql = `
        SELECT id, id_campaign, phone, status AS campaign_status, disposition,
               uniqueid, start_time, end_time, retries, duration, hangup_cause, trunk
        FROM idialerx_calls
        WHERE id = ?
        LIMIT 1
      `;
    }
    const rows2 = await queryPromise(sql, [req.params.id]);
    const msg = { status: '200', response: rows2 };
    if (LOG === 'true') {
      log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Path: ${req.originalUrl}`, req.body);
      log.info(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] Status: 200 Response: `, rows2);
    }
    return res.json(msg);

  } catch (error) {
    const msg = { code: '500', error: 'Internal server error' };
    if (LOG === 'true') {
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] `, error);
    }
    return res.json(msg);
  }
};

// -------------------- CALLREPORT --------------------

exports.callreport = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    return res.json(msg);
  }

  try {
    const sql = `
      SELECT ca.*, sh.creation_user_id, sh.creation_date, sh.questions
      FROM idialerx_campaign ca
      LEFT JOIN survey_header sh ON ca.id_survey = sh.id
      WHERE ca.id = ?
    `;
    const rows = await queryPromise(sql, [req.params.id]);

    if (rows.length === 0) {
      return res.json({ status: '200', response: 'No campaigns available.' });
    }

    // filtrar por status
    let sqlStatusWhere = '';
    switch (req.params.status) {
      case 'complete':
        sqlStatusWhere = 'WHERE s.status = "1" ';
        break;
      case 'completequota':
        sqlStatusWhere = 'WHERE s.status = "2" ';
        break;
      case 'abandoned':
        sqlStatusWhere = 'WHERE s.status = "0" ';
        break;
      case 'aborted':
        sqlStatusWhere = 'WHERE s.status = "4" ';
        break;
      // 'all' => sin where
    }

    // Rango de fechas
    let sqlStartEnd = '';
    if (req.params.start_time && req.params.end_time) {
      if (Date.parse(req.params.start_time) && Date.parse(req.params.end_time)) {
        sqlStartEnd = `
          AND DATE(i.start_time) >= "${req.params.start_time}"
          AND DATE(i.end_time) <= "${req.params.end_time}"
        `;
      }
    }

    const campaignRow = rows[0];
    const questionCount = campaignRow.questions;
    let p = '';
    for (let i = 1; i <= questionCount; i++) {
      p += `s.p${i}, `;
    }
    p = p.slice(0, -2); // quita ultima coma

    const sqlCall = `
      SELECT s.id, i.phone, i.start_time, i.end_time, i.duration, i.retries,
             s.status, s.recording_file, s.agent, s.queue, ${p}
      FROM survey_${campaignRow.id_survey}_call s
      INNER JOIN idialerx_calls i ON s.id = i.id
      ${sqlStatusWhere} ${sqlStartEnd}
      ORDER BY i.start_time
    `;
    const results = await queryPromise(sqlCall);

    const msg = { status: '200', row: results.length, response: results };
    return res.json(msg);

  } catch (error) {
    const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
    const msgUser = { code: '500', error: 'Please contact the administrator' };
    if (LOG === 'true') {
      log.error(`[${req.session.username}] [${showip(req)}] [${req.sessionID}] `, error);
    }
    return res.json(msgUser);
  }
};

// -------------------- CALLREPORTALL (ZIP + CSV) --------------------

exports.callreportall = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    return res.json(msg);
  }

  try {
    const sqlCampaigns = `
      SELECT c.id,c.name, c.max_canales AS channels, c.estatus AS status,
             c.id_survey, c.callerid, c.add_prefix, c.remove_prefix,
             (select description from iwebserver.campaign_schedule_header where id = c.call_time_template_id) as name_call_time,
             (select name from iwebserver.campaign_retry_header where id = c.reycling_template_id) as name_reciclado,
             IF(c.amdconf IS NULL,'OFF','ON') as amd_state
      from isurveyx.idialerx_campaign c
      inner join isurveyx.survey_header q on c.id_survey = q.id
      where q.creation_user_id = ?
    `;
    const campaigns = await queryPromise(sqlCampaigns, [req.session.user_id]);

    if (!campaigns || campaigns.length === 0) {
      return res.json({ status: '200', response: 'No campaigns available.' });
    }

    // Librerías y setup para ZIP
    const fs = require('fs');
    const path = require('path');
    const archiver = require('archiver');

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const zipFileName = path.join(tempDir, `reports_${Date.now()}.zip`);
    const output = fs.createWriteStream(zipFileName);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);

    // Función para formatear fecha
    function formatDate(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      // Ajustar a GMT-3 si corresponde
      date.setHours(date.getHours() - 3);
      return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0') + ':' +
        String(date.getSeconds()).padStart(2, '0');
    }

    // procesar campañas en serie
    for (const campaign of campaigns) {
      // obtengo # preguntas de la encuesta
      const surveySql = `SELECT questions FROM survey_header WHERE id = ?`;
      const surveyRows = await queryPromise(surveySql, [campaign.id_survey]);
      if (!surveyRows || surveyRows.length === 0) {
        continue; // no existe la encuesta
      }
      const questionsCount = surveyRows[0].questions;

      // solo "status=1"? Ajusta a tu gusto
      const sqlStatusWhere = 'WHERE s.status = "1"';
      let sqlDateFilter = '';
      if (req.params.start_time && req.params.end_time) {
        if (Date.parse(req.params.start_time) && Date.parse(req.params.end_time)) {
          sqlDateFilter = `
            AND DATE(i.start_time) >= "${req.params.start_time}"
            AND DATE(i.end_time) <= "${req.params.end_time}"
          `;
        }
      }

      let selectP = '';
      for (let i = 1; i <= questionsCount; i++) {
        selectP += `, s.p${i}`;
      }

      const sqlCalls = `
        SELECT s.id, i.phone, i.start_time, i.end_time, i.duration, i.retries,
               s.status, s.recording_file, s.agent, s.queue
               ${selectP}
        FROM survey_${campaign.id_survey}_call s
        INNER JOIN idialerx_calls i ON s.id = i.id
        ${sqlStatusWhere} ${sqlDateFilter}
        ORDER BY i.start_time
      `;
      const results = await queryPromise(sqlCalls);

      if (!results || results.length === 0) {
        // no hay resultados => skip
        continue;
      }

      // Tomar todos los id_call
      const callIds = results.map(r => r.id);

      // Traer todos los atributos en una sola query
      const sqlAttrs = `
        SELECT id_call, columna, value
        FROM idialerx_call_attribute
        WHERE id_call IN (${callIds.join(',')})
        ORDER BY columna
      `;
      const attrRows = await queryPromise(sqlAttrs);

      // Mapeamos call -> {columna:valor} y armamos set con todas las columnas
      const attributesByCall = {};
      const allAttributeCols = new Set();

      for (const row of attrRows) {
        if (!attributesByCall[row.id_call]) {
          attributesByCall[row.id_call] = {};
        }
        attributesByCall[row.id_call][row.columna] = row.value;
        allAttributeCols.add(row.columna);
      }

      // Header fijo
      const header = [
        'Campaign id','Survey id','Call id','Phone',
        'Start-Time','End-Time','Duration','Retries',
        'Status','Agent','Queue'
      ];

      // Agregar P1..Pn
      for (let i = 1; i <= questionsCount; i++) {
        header.push(`P${i}`);
      }

      // Agregar columnas dinámicas (ordenadas)
      const sortedAttrCols = Array.from(allAttributeCols).sort();
      header.push(...sortedAttrCols);

      // Construir CSV
      let csvContent = '';
      // Primera línea: header
      csvContent += header.join(',') + '\n';

      for (const row of results) {
        const rowData = [
          campaign.id,
          campaign.id_survey,
          row.id,
          row.phone,
          formatDate(row.start_time),
          formatDate(row.end_time),
          row.duration,
          row.retries,
          row.status,
          row.agent || '',
          row.queue || ''
        ];
        // Agrega p1..pn
        for (let i = 1; i <= questionsCount; i++) {
          rowData.push(row[`p${i}`] || '');
        }
        // Agrega atributos
        const callAttrs = attributesByCall[row.id] || {};
        for (const col of sortedAttrCols) {
          rowData.push(callAttrs[col] || '');
        }

        // Escape comillas
        const escaped = rowData.map(val =>
          `"${String(val).replace(/"/g, '""')}"`
        );
        csvContent += escaped.join(',') + '\n';
      }

      // escribir csv a archivo
      const fs = require('fs');
      const csvFileName = `${campaign.id_survey}-${campaign.name}.csv`;
      const csvFilePath = path.join(tempDir, csvFileName);
      fs.writeFileSync(csvFilePath, csvContent);

      // agregar al zip
      archive.file(csvFilePath, { name: csvFileName });
    }

    // Finalizar ZIP
    await archive.finalize();

    output.on('close', () => {
      // enviar el ZIP
      res.download(zipFileName, `reports_${Date.now()}.zip`, err => {
        // limpiar
        if (err) console.error('Error sending file:', err);

        fs.unlinkSync(zipFileName);
        // borrar CSVs
        campaigns.forEach(campaign => {
          const csvFilePath = path.join(tempDir, `${campaign.id_survey}-${campaign.name}.csv`);
          if (fs.existsSync(csvFilePath)) {
            fs.unlinkSync(csvFilePath);
          }
        });
      });
    });

  } catch (error) {
    console.error('callreportall error:', error);
    const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
    const msgUser = { code: '500', error: 'Please contact the administrator' };
    return res.json(msgUser);
  }
};

// -------------------- DELETE CAMPAIGN --------------------

exports.deletecampaign = async function (req, res) {
  if (!req.session.isAuthed) {
    const msg = { code: '204', success: 'Required login.' };
    return res.json(msg);
  }

  const sql = "SELECT id_survey FROM idialerx_campaign WHERE id = ?";
  try {
    const results = await queryPromise(sql, [req.params.id]);
    if (results.length > 0) {
      const msg = {
        code: '200',
        response: `Processing the elimination of the campaign id ${req.params.id} and questionnaire id: ${results[0].id_survey}. This process may take a few minutes...`
      };
      res.json(msg);

      // Eliminaciones en serie (igual que tu código original)
      await queryPromise("DELETE FROM idialerx_call_progress_log WHERE id_campaign_outgoing = ?", [req.params.id]);
      await queryPromise(`
        DELETE hc
        FROM idialerx_hangup_counter hc
        INNER JOIN idialerx_calls idc ON hc.id_call = idc.id
        WHERE idc.id_campaign = ?`,
        [req.params.id]
      );
      await queryPromise(`
        DELETE hc
        FROM idialerx_hangup_history hc
        INNER JOIN idialerx_calls idc ON hc.id_call = idc.id
        WHERE idc.id_campaign = ?`,
        [req.params.id]
      );
      await queryPromise("DELETE FROM idialerx_calls WHERE id_campaign = ?", [req.params.id]);
      await queryPromise("DELETE FROM idialerx_campaign_schedule WHERE id_campaign = ?", [req.params.id]);
      await queryPromise("DELETE FROM idialerx_campaign WHERE id = ?", [req.params.id]);
      // Fin
    } else {
      const msg = { status: '200', response: 'No campaigns available.' };
      return res.json(msg);
    }
  } catch (error) {
    const msglog = { code: '500', error: 'Problems with the query or connectivity to the db.' };
    const msgUser = { code: '500', error: 'Please contact the administrator' };
    return res.json(msgUser);
  }
};

// -------------------- DELETE QUESTIONNAIRE --------------------
exports.deletequestionnaire = function (req, res) {
  // Tu código original vacío
};
