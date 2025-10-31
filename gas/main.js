
const ALLOWED_DOMAIN = '-.br';

const REQUESTS_SPREADSHEET_ID = '-'; 
const REQUESTS_SHEET_NAME     = '-';
const RETURNS_SHEET_NAME = '-';

const OPERATOR_EMAIL = '-.br';

const LAYOUT_SPREADSHEET_ID   = '-';
const LAYOUT_SHEET_NAME       = '-';   
const POSTGRAD_RECIPIENTS = [
  '-@-.br',
  '-@-.br'    
];
const SESSION_TTL_SEC = 60 * 60; 

const ALLOWED_USERS = [
  '-'
];


const ADMIN_USERS = [
  '-',

];


const SHARED_SECRET = '-';

const REQUIRE_SECRET_ACTIONS = [
  'getrequests','getlayout','allocate','deliverkey','reclaimkey','excluderequest','deletepending'
];

const READ_CACHE_SEC = 10;
function userOnly_(s){
  if (!s) return '';
  const t = String(s).toLowerCase().trim();
  const i = t.indexOf('@');
  return i >= 0 ? t.slice(0, i) : t;
}
function isAllowedUser_(u){ return ALLOWED_USERS.includes(userOnly_(u)); }
function isAdminUser_(u){ return ADMIN_USERS.includes(userOnly_(u)); }


/************** JSONP helpers **************/
function respondJSONP_(cb, obj) {
  const js = `${cb}(${JSON.stringify(obj)});`;
  return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function formatDateBR_(d){
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
}
function datePlusWeeks_(d, weeks){
  const dt = new Date(d.getTime());
  dt.setDate(dt.getDate() + weeks*7);
  return dt;
}

function errJSONP_(cb, msg) { return respondJSONP_(cb, { ok:false, error:String(msg) }); }

/************** Auth / Sessão **************/
function verifyIdToken_(idToken, expectedClientId) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Falha ao validar token (HTTP ' + r.getResponseCode() + ')');
  const info = JSON.parse(r.getContentText());
  if (!(info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com')) throw new Error('iss inválido');
  if (!(info.email_verified === true || info.email_verified === 'true')) throw new Error('E-mail não verificado');
  const domain = String(info.email).split('@').pop().toLowerCase();
  if (domain !== ALLOWED_DOMAIN) throw new Error('Acesso restrito a @' + ALLOWED_DOMAIN);
  if (expectedClientId && info.aud !== expectedClientId) throw new Error('aud/client_id não confere');
  const now = Math.floor(Date.now()/1000);
  if (Number(info.exp) <= now) throw new Error('Token expirado');
  return info; 
}
function startSession_(email, name) {
  const key = Utilities.getUuid();
  CacheService.getScriptCache().put('SESS_' + key, JSON.stringify({email, name, ts:Date.now()}), SESSION_TTL_SEC);
  return key;
}
function requireSession_(key) {
  if (!key) throw new Error('Sessão ausente');
  const raw = CacheService.getScriptCache().get('SESS_' + key);
  if (!raw) throw new Error('Sessão expirada/ inválida');
  return JSON.parse(raw);
}
function isAllowed_(email) {
  if (!email) return false;
  const e = String(email).toLowerCase().trim();

  if (ALLOWED_EMAILS && ALLOWED_EMAILS.length) {
    return ALLOWED_EMAILS.map(x => String(x).toLowerCase().trim()).includes(e);
  }


  return false;
}


function openRequestsSheet_() {
  const ss = SpreadsheetApp.openById(REQUESTS_SPREADSHEET_ID);
  const sh = ss.getSheetByName(REQUESTS_SHEET_NAME);
  if (!sh) throw new Error('Aba de solicitações não encontrada: ' + REQUESTS_SHEET_NAME);
  return sh;
}
function openReturnsSheet_() {
  const ss = SpreadsheetApp.openById(REQUESTS_SPREADSHEET_ID);
  let sh = ss.getSheetByName(RETURNS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(RETURNS_SHEET_NAME);
  }
 
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 6).setValues([[
      'Timestamp', 'Sala', 'Andar', 'RA', 'Nome', 'Registrado por'
    ]]);
  }
  return sh;
}

function openLayoutSheet_() {
  const ss = SpreadsheetApp.openById(LAYOUT_SPREADSHEET_ID);
  const sh = ss.getSheetByName(LAYOUT_SHEET_NAME);
  if (!sh) throw new Error('Aba de layout não encontrada: ' + LAYOUT_SHEET_NAME);
  return sh;
}

function getSalaAndarFromRow_(sh, row) {
  var lastRow = Math.max(2, row);
  var vals = sh.getRange(1, 1, lastRow, 2).getValues(); 
  var sala = '', andar = '';
  for (var i = lastRow - 1; i >= 1; i--) { 
    if (!sala)  sala  = String(vals[i][0] || '').trim(); 
    if (!andar) andar = String(vals[i][1] || '').trim();
    if (sala && andar) break;
  }
  return { sala: sala, andar: andar };
}
function respond_(p, obj) {
  const wantsJSON = String(p.format || '').toLowerCase() === 'json';
  const cb = p.callback || p.cb;

  if (wantsJSON) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (!cb) {
    return ContentService.createTextOutput('/* JSONP: missing callback */')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(`${cb}(${JSON.stringify(obj)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || '').toLowerCase();

  
  const callerUser  = userOnly_(p.authUser || p.email || '');
const callerEmail = callerUser ? (callerUser + '@' + ALLOWED_DOMAIN) : ''; 


  if (REQUIRE_SECRET_ACTIONS.includes(action)) {
    if (p.secret !== SHARED_SECRET) {
      return respond_(p, { ok:false, error:'forbidden' });
    }
  }

  try {
 
    if (action === 'ping') {
      return respond_(p, { ok:true, msg:'pong', time: new Date().toISOString() });
    }
    if (action === 'version') {
      return respond_(p, { ok:true, scriptId: ScriptApp.getScriptId(), time: new Date().toISOString() });
    }

   
    if (action === 'login') {
      const info = verifyIdToken_(p.idToken, p.clientId);
      if (!isAllowed_(info.email)) {
        return respond_(p, { ok:false, error:'Não autorizado: este e-mail não tem acesso.' });
      }
      const sessionKey = startSession_(info.email, info.name || '');
    
return respond_(p, {
  ok:true, email: info.email, name: info.name || '',
  sessionKey, isAdmin: isAdminUser_(info.email)
});

    }

  
if (action === 'getrequests') {
  const user = (p.authUser || p.email || '').trim();
  if (!isAllowedUser_(userOnly_(user))) return respond_(p, { ok:false, error:'Não autorizado' });

  const cache = CacheService.getScriptCache();
  const cached = cache.get('REQ_ROWS_V2'); 
  if (cached) return respond_(p, JSON.parse(cached));

  const sh = openRequestsSheet_();
  const last = sh.getLastRow();
  const values = last > 0 ? sh.getRange(1, 1, last, 19).getValues() : [];

  
  const rows = values.map(r => [
    String(r[2]  || '').trim(), 
    String(r[3]  || '').trim(), 
    String(r[4]  || '').trim(), 
    String(r[18] || '').trim() 
  ]);
  if (rows.length) rows[0] = ['Nome','RA','Sala','Status'];


  for (let i = 1; i < values.length; i++) { 
    const nome = String(values[i][2] || '').trim(); 
    const ra   = String(values[i][3] || '').trim(); 
    if (!ra) continue;

    extraByRA[ra] = {
      nome,
      curso:        String(values[i][5]  || '').trim(), 
      nivel:        String(values[i][6]  || '').trim(), 
      anoIngresso:  String(values[i][7]  || '').trim(), 
      anoConclusao: String(values[i][8]  || '').trim(), 
      emailInst:    String(values[i][9]  || '').trim(), 
      endereco:     String(values[i][11] || '').trim(),
      tipoCasa:     String(values[i][12] || '').trim(), 
      areaEstudo:   String(values[i][13] || '').trim(), 
      tempoCasaIME: String(values[i][14] || '').trim(), 
      observacoes:  String(values[i][15] || '').trim()  
    };
  }

  const payload = { ok:true, rows, extraByRA };
  cache.put('REQ_ROWS_V2', JSON.stringify(payload), READ_CACHE_SEC);
  return respond_(p, payload);
}



    if (action === 'getlayout') {
      if (!isAllowedUser_(callerUser)) return respond_(p, { ok:false, error:'Não autorizado' });

      const cache = CacheService.getScriptCache();
      const cached = cache.get('LAYOUT_ROWS');
      if (cached) return respond_(p, JSON.parse(cached));

      const sh = openLayoutSheet_();
      const last = sh.getLastRow();
      const values = last > 0 ? sh.getRange(1, 1, last, 8).getValues() : [];
      const payload = { ok:true, rows: values };
      cache.put('LAYOUT_ROWS', JSON.stringify(payload), READ_CACHE_SEC);
      return respond_(p, payload);
    }

   
if (action === 'allocate') {
  const user = (p.authUser || p.email || '').trim();
  if (!isAllowedUser_(userOnly_(user))) return respond_(p, { ok:false, error:'Não autorizado' });

  const sala  = (p.roomId || '').trim();
  const ra    = String(p.ra   || '').trim();
  const nome  = String(p.name || '').trim();
  const reqRow = parseInt(p.reqRow, 10) || 0;

  if (!sala || !ra || !nome) return respond_(p, { ok:false, error:'Parâmetros insuficientes' });

  let curso = String(p.curso || p.program || '').trim();
  let nivel = String(p.nivel || p.level   || '').trim();

  
  let emailInst = String(p.email || '').trim();
  if (!curso || !nivel || !emailInst) {
    try {
      const rsh = openRequestsSheet_();
      const lastR = rsh.getLastRow();
      if (lastR >= 2) {
        
        const rows = rsh.getRange(2, 1, lastR - 1, 10).getValues();
        for (let k = rows.length - 1; k >= 0; k--) {
          const raCell   = String(rows[k][3] || '').trim();
          if (raCell && raCell === ra) {
            if (!curso)     curso     = String(rows[k][5] || '').trim(); 
            if (!nivel)     nivel     = String(rows[k][6] || '').trim(); 
            if (!emailInst) emailInst = String(rows[k][9] || '').trim(); 
            break;
          }
        }
      }
    } catch(_) {}
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = openLayoutSheet_();
    const last = sh.getLastRow();
    const values = last > 0 ? sh.getRange(1, 1, last, 4).getValues() : [];

    let foundRow = -1, lastId = '';
    for (let i = 1; i < values.length; i++) {
      let idSala = String(values[i][0] || '').trim(); 
      if (idSala) lastId = idSala; else idSala = lastId;
      const raCell = String(values[i][2] || '').trim(); 
      if (idSala === sala && raCell === '') { foundRow = i + 1; break; }
    }
    if (foundRow < 0) return respond_(p, { ok:false, error:'Sala cheia ou inexistente' });

   
    sh.getRange(foundRow, 3).setValue(ra);           
    sh.getRange(foundRow, 4).setValue(nome);         
    sh.getRange(foundRow, 5).setValue(curso || ''); 
    sh.getRange(foundRow, 6).setValue(nivel || '');  
    sh.getRange(foundRow, 8).setValue('Pendente');   

    
    if (reqRow >= 1) {
      const rsh = openRequestsSheet_();
      const lastReqRow = rsh.getLastRow();
      if (reqRow <= lastReqRow) {
        rsh.getRange(reqRow, 19).setValue('Alocado'); 
      } else {
        const vals = rsh.getRange(1, 1, lastReqRow, 19).getValues();
        for (let j = vals.length - 1; j >= 0; j--) {
          const rNome = String(vals[j][2] || '').trim(); 
          const rRA   = String(vals[j][3] || '').trim(); 
          if (rRA === ra && rNome === nome) { rsh.getRange(j + 1, 19).setValue('Alocado'); break; }
        }
      }
    }

  
    try {
      CacheService.getScriptCache().remove('LAYOUT_ROWS');
      CacheService.getScriptCache().remove('REQ_ROWS_V2');
    } catch(_) {}

    
    try {
      const hoje = new Date();
      const prazo = datePlusWeeks_(hoje, 2);
      const prazoStr = formatDateBR_(prazo);

      const assunto = `Alocação de sala – ${sala} – ${nome}`;
      const corpo =
`Prezados,

Atesto que ${nome} foi alocado para a sala ${sala} do prédio Anexo.

Peço ao estudante que compareça até ${prazoStr} para retirar a chave da sua sala na Seção de Apoio, sala X no prédio principal.

Atenciosamente,
Seção de Apoio e Associação de Pós Graduandos do Instituto`;

     
      const ccList = (POSTGRAD_RECIPIENTS || []).filter(Boolean).join(',');
      if (emailInst) {
        MailApp.sendEmail({
          to: emailInst,
          cc: ccList || undefined,
          subject: assunto,
          body: corpo,
          name: 'Seção de Apoio'
        });
      } else if (ccList) {
       
        MailApp.sendEmail({
          to: ccList,
          subject: assunto + ' (sem e-mail do aluno na planilha)',
          body: corpo + `\n\n(Obs.: não foi possível enviar ao aluno — campo vazio na planilha para RA ${ra})`,
          name: 'Seção de Apoio'
        });
      }
    } catch(e) {
      
    }

    return respond_(p, { ok:true, email: (userOnly_(user)+'@'+ALLOWED_DOMAIN), row:foundRow, roomId:sala });
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}



  
if (action === 'deliverkey') {
  if (!isAdminUser_(callerUser))
    return respond_(p, { ok:false, error:'Não autorizado' });

  const row = parseInt(p.row, 10);
  if (!row || row < 2)
    return respond_(p, { ok:false, error:'Row inválida' });

  const sh = openLayoutSheet_();
  const vals = sh.getRange(row, 1, 1, 8).getValues()[0];

  let sala  = String(vals[0] || '').trim(); 
  let andar = String(vals[1] || '').trim(); 
  const ra    = String(vals[2] || '').trim(); 
  const nome  = String(vals[3] || '').trim(); 
  
  if (!sala || !andar) {
    const ff = getSalaAndarFromRow_(sh, row);
    if (!sala)  sala  = ff.sala;
    if (!andar) andar = ff.andar;
  }

  sh.getRange(row, 8).setValue('');

  try { CacheService.getScriptCache().remove('LAYOUT_ROWS'); } catch(_) {}

  let emailInst = '';
  try {
    const rsh = openRequestsSheet_();
    const last = rsh.getLastRow();
    if (last >= 2) {
      const rows = rsh.getRange(2, 1, last - 1, 10).getValues(); 
      for (let i = rows.length - 1; i >= 0; i--) {
        const raCell = String(rows[i][3] || '').trim(); 
        if (raCell === ra) { emailInst = String(rows[i][9] || '').trim(); break; }
      }
    }
  } catch(e) {}

  try {
    const hoje = new Date();
    const dataStr = formatDateBR_(hoje);
    const salaTxt = sala || '—';

    const assunto = `Retirada de chave – ${salaTxt} – ${nome}`;
    const corpo =
`Prezados,

Atesto que ${nome} retirou a chave da sala ${salaTxt} no dia de hoje (${dataStr}).

Atenciosamente,
Seção de Apoio`;

    const ccList = (POSTGRAD_RECIPIENTS || []).filter(Boolean).join(',');

    if (emailInst) {
      MailApp.sendEmail({
        to: emailInst,
        cc: ccList || undefined,
        subject: assunto,
        body: corpo,
        name: 'Seção de Apoio'
      });
    } else if (ccList) {
      MailApp.sendEmail({
        to: ccList,
        subject: assunto + ' (sem e-mail do aluno na planilha)',
        body: corpo + `\n\n(Obs.: não foi possível enviar ao aluno — campo vazio na planilha para RA ${ra})`,
        name: 'Seção de Apoio'
      });
    }
  } catch(e) {
  }

  return respond_(p, { ok:true });
}

    
if (action === 'reclaimkey') {
  if (!isAdminUser_(callerUser)) return respond_(p, { ok:false, error:'Não autorizado' });
  const row = parseInt(p.row, 10);
  if (!row || row < 2) return respond_(p, { ok:false, error:'Row inválida' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = openLayoutSheet_();
    const v = sh.getRange(row, 1, 1, 8).getValues()[0];
    let sala  = String(v[0] || '').trim(); 
    let andar = String(v[1] || '').trim(); 
    const ra   = String(v[2] || '').trim();
    const nome = String(v[3] || '').trim(); 
    if (!sala || !andar) {
      const ff = getSalaAndarFromRow_(sh, row);
      if (!sala)  sala  = ff.sala;
      if (!andar) andar = ff.andar;
    }
    if (!ra && !nome) return respond_(p, { ok:false, error:'Linha já está vazia' });

    let emailInst = '';
    try {
      const rsh = openRequestsSheet_();
      const last = rsh.getLastRow();
      if (last >= 2) {
        const rows = rsh.getRange(2, 1, last - 1, 10).getValues(); 
        for (let i = rows.length - 1; i >= 0; i--) {
          const raCell = String(rows[i][3] || '').trim(); 
          if (raCell === ra) { emailInst = String(rows[i][9] || '').trim(); break; }
        }
      }
    } catch(_) {}

    try {
      const hoje = new Date();
      const dataStr = formatDateBR_(hoje);
      const assunto = `Devolução de chave – ${sala} – ${nome}`;
      const corpo =
`Bom dia a todos!

Atesto que o aluno ${nome} devolveu a chave da sala ${sala} no dia de hoje (${dataStr}).

Atenciosamente,
Seção de Apoio`;

      const ccList = (POSTGRAD_RECIPIENTS || []).filter(Boolean).join(',');

      if (emailInst) {
        MailApp.sendEmail({
          to: emailInst,
          cc: ccList || undefined,
          subject: assunto,
          body: corpo,
          name: 'Seção de Apoio'
        });
      } else if (ccList) {
        MailApp.sendEmail({
          to: ccList,
          subject: assunto + ' (sem e-mail do aluno na planilha)',
          body: corpo + `\n\n(Obs.: não foi possível enviar ao aluno — campo vazio na planilha para RA ${ra})`,
          name: 'Seção de Apoio'
        });
      }
    } catch(_) {}

    const rsh = openReturnsSheet_();
    rsh.appendRow([ new Date(), sala, andar, ra, nome, callerUser ]);
    sh.getRange(row, 3, 1, 2).clearContent();
    sh.getRange(row, 8).clearContent();       

    try { CacheService.getScriptCache().remove('LAYOUT_ROWS'); } catch(_) {}

    return respond_(p, { ok:true });
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}



if (action === 'excluderequest') {
  const user = (p.authUser || p.email || '').trim();
  if (!isAllowedUser_(userOnly_(user))) return respond_(p, { ok:false, error:'Não autorizado' });

  const reqRow = parseInt(p.reqRow, 10);
  if (!reqRow || reqRow < 1) return respond_(p, { ok:false, error:'Linha inválida' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = openRequestsSheet_();
    const last = sh.getLastRow();
    if (reqRow > last) return respond_(p, { ok:false, error:'Linha fora do intervalo' });

    sh.getRange(reqRow, 19).setValue('Excluido'); 
    
try {
  CacheService.getScriptCache().remove('REQ_ROWS_V2');
} catch(_) {}
return respond_(p, { ok:true });

  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}



if (action === 'deletepending') {
  const user = (p.authUser || p.email || '').trim();
  if (!isAdminUser_(userOnly_(user))) return respond_(p, { ok:false, error:'Não autorizado' });

  const row  = parseInt(p.row, 10);
  const ra   = String(p.ra   || '').trim();
  const nome = String(p.nome || '').trim();
  if (!row || row < 2) return respond_(p, { ok:false, error:'Linha inválida' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = openLayoutSheet_();
    const status = String(sh.getRange(row, 8).getValue() || '').trim();
    if (status.toLowerCase() !== 'pendente') return respond_(p, { ok:false, error:'Este aluno não está pendente.' });

    
    sh.getRange(row, 3, 1, 2).clearContent();
    sh.getRange(row, 8).clearContent();

    const rsh = openRequestsSheet_();
    const lastRow = rsh.getLastRow();
    if (ra) {
      const ras = rsh.getRange(2, 4, Math.max(0,lastRow-1), 1).getValues(); 
      for (let i=0; i<ras.length; i++) {
        if (String(ras[i][0]).trim() === ra) {
          rsh.getRange(i+2, 19).clearContent(); 
        }
      }
    }

try {
  CacheService.getScriptCache().remove('LAYOUT_ROWS');
  CacheService.getScriptCache().remove('REQ_ROWS_V2');
} catch(_) {}

    return respond_(p, { ok:true });
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}

    return respond_(p, { ok:false, error:'Ação inválida' });

  } catch (err) {
    return respond_(p, { ok:false, error: (err && err.message) ? err.message : String(err) });
  }
}

