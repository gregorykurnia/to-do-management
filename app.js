/* ════════════════════════════════════════════════
   FIREBASE SETUP
════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyD_7zbuiNLzkYu_Z7cl9NR8jAhiK3SP69A",
  authDomain: "to-do-management-9d1f2.firebaseapp.com",
  projectId: "to-do-management-9d1f2",
  storageBucket: "to-do-management-9d1f2.firebasestorage.app",
  messagingSenderId: "737186960110",
  appId: "1:737186960110:web:9d0fcbe2802fc8fc7959ff"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ── Sync indicator ── */
function setSyncDot(state){
  const d = document.getElementById('sync-dot');
  if(!d) return;
  d.className = 'sync-dot' + (state==='saving'?' saving':state==='error'?' error':'');
  d.title = state==='saving'?'Saving…':state==='error'?'Sync error':'Synced';
}

/* ════════════════════════════════════════════════
   CORE STATE
════════════════════════════════════════════════ */
const TODAY = new Date(); TODAY.setHours(0,0,0,0); // kept for seed data only
function getToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
let dayOff = 0, wkOff = 0, schedDayOff2 = 0;
let taskViewMode = 'table', teamViewMode = 'table';
let activeSp = null, gcalConnected = false;
let gcalToken = null, gcalTokenExpiry = 0, gcalClientId = localStorage.getItem('gcal_client_id')||'';
let gcalEventsCache = {}, calMonthOff = 0, tokenClient = null;
{ const _t=localStorage.getItem('gcal_access_token'), _e=parseInt(localStorage.getItem('gcal_token_expiry')||'0'); if(_t&&Date.now()<_e-60000){gcalToken=_t;gcalTokenExpiry=_e;gcalConnected=true;} }
let showArch = false, showTeamArch = false;
let myTasksTab = null; // null = All, or a taskType id

// Default column definitions (label editable, visibility toggleable)
let colDefs = [
  {id:'chk',    label:'',       hidden:false, fixed:true},
  {id:'title',  label:'Task',   hidden:false},
  {id:'prio',   label:'Priority',hidden:false},
  {id:'type',   label:'Type',  hidden:false},
  {id:'status', label:'Status', hidden:false},
  {id:'due',    label:'Due',    hidden:false},
  {id:'assignee',label:'Who',   hidden:false},
  {id:'tags',   label:'Tags',   hidden:false},
  {id:'notes',  label:'Notes',  hidden:false},
];

let sortState = {
  tasks: [{field:'prio', dir:'asc'}],
  team:  [{field:'prio', dir:'asc'}]
};
let thSort = { tasks: {col:null, dir:'asc'}, team: {col:null, dir:'asc'} };

const SORT_FIELDS = [
  {id:'prio',    label:'Priority'},
  {id:'due',     label:'Due date'},
  {id:'status',  label:'Status'},
  {id:'title',   label:'Name'},
  {id:'type',    label:'Type'},
  {id:'assignee',label:'Assignee'},
  {id:'created', label:'Created'},
];

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function ds(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function todayStr(){ return ds(getToday()); }
function fmtDate(s){ if(!s)return'—'; const d=new Date(s+'T00:00:00'); return d.toLocaleDateString('en-ID',{month:'short',day:'numeric'}); }
function isOvd(due){ if(!due)return false; return new Date(due+'T00:00:00')<getToday(); }
function dayForOff(off){ const t=getToday(); const d=new Date(t); d.setDate(t.getDate()+off); return d; }

/* ════════════════════════════════════════════════
   IN-MEMORY DATA  (populated from Firestore)
════════════════════════════════════════════════ */
let prioTypes = [
  {id:'p1',label:'Urgent',color:'#E24B4A'},
  {id:'p2',label:'Normal',color:'#EF9F27'},
  {id:'p3',label:'Low',color:'#85B7EB'},
];
let taskTypes = [
  {id:'personal',  label:'Personal',  style:'bpers'},
  {id:'business',  label:'Business',  style:'bbus'},
  {id:'team',      label:'Team',      style:'bteam'},
  {id:'recurring', label:'Recurring', style:'bbus'},
];
let tags = ['PMS','Discover','Potentia','Sales','Finance','Personal','GRII','Porcafe','Investing','Dev','Admin'];
let customCols = [
  {id:'c1',name:'Meeting link',type:'url'},
  {id:'c2',name:'Estimate (hrs)',type:'number'},
];

let tasks      = [];
let events     = [];
let milestones = [];

/* ── Sample data — seeded only when Firestore is empty ── */
const SAMPLE_TASKS = [
  {id:'t1',title:'Review Potentia MoU with Codero',type:'business',prio:'p1',due:'2026-06-25',dueTime:'',status:'open',carryover:false,tags:['Potentia'],assignee:'me',notes:'Check pasal 7 & 12',subtasks:[{id:'s1',text:'Review clause 7',done:false},{id:'s2',text:'Review clause 12',done:false}],custom:{c1:'',c2:'2'},gcal:false,created:Date.now()-9e5},
  {id:'t2',title:'Send invoice to PMS client',type:'business',prio:'p1',due:'2026-06-24',dueTime:'',status:'open',carryover:false,tags:['PMS','Finance'],assignee:'me',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()-8e5},
  {id:'t3',title:'QT / devotional reading',type:'personal',prio:'p2',due:todayStr(),dueTime:'',status:'todo',carryover:true,carryoverSince:ds(new Date(TODAY.getTime()-2*86400000)),tags:['Personal','GRII'],assignee:'me',notes:'Numbers chapter 4',subtasks:[],custom:{},gcal:false,created:Date.now()-7e5},
  {id:'t4',title:'Check NVDA / MU positions',type:'personal',prio:'p2',due:todayStr(),dueTime:'',status:'todo',carryover:true,carryoverSince:ds(new Date(TODAY.getTime()-86400000)),tags:['Investing'],assignee:'me',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()-6e5},
  {id:'t5',title:'Attendance PWA – cron push notifications',type:'business',prio:'p2',due:ds(new Date(TODAY.getTime()+2*86400000)),dueTime:'',status:'in-progress',carryover:false,tags:['PMS','Dev'],assignee:'me',notes:'3 cron jobs: clock-in reminder, clock-out reminder, manager notify',subtasks:[{id:'s3',text:'Clock-in cron',done:true},{id:'s4',text:'Clock-out cron',done:false},{id:'s5',text:'Manager notify cron',done:false}],custom:{c2:'4'},gcal:false,created:Date.now()-5e5},
  {id:'t6',title:'Codero radio script follow-up',type:'business',prio:'p3',due:ds(new Date(TODAY.getTime()+3*86400000)),dueTime:'',status:'todo',carryover:false,tags:['Potentia','Sales'],assignee:'me',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()-4e5},
  {id:'t7',title:'Dinner plan with Bella',type:'personal',prio:'p3',due:todayStr(),dueTime:'',status:'done',carryover:false,tags:['Personal'],assignee:'me',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()-3e5},
  {id:'t8',title:'Deus standup – PMS sprint',type:'team',prio:'p2',due:todayStr(),dueTime:'09:30',status:'in-progress',carryover:false,tags:['PMS'],assignee:'dev1',notes:'',subtasks:[],custom:{c1:'https://meet.google.com/abc-defg-hij'},gcal:true,created:Date.now()-2e5},
  {id:'t9',title:'Prepare SPH Porcafe weekly report',type:'business',prio:'p2',due:ds(new Date(TODAY.getTime()+86400000)),dueTime:'',status:'todo',carryover:false,tags:['Porcafe'],assignee:'me',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()-1e5},
  {id:'t10',title:'Update Discover sales pitch deck',type:'team',prio:'p1',due:ds(new Date(TODAY.getTime()+86400000)),dueTime:'',status:'todo',carryover:false,tags:['Discover','Sales'],assignee:'sales',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()},
];
const SAMPLE_EVENTS = [
  {id:'e1',title:'PMS Client call',date:todayStr(),start:'11:00',end:'12:00',type:'external',link:'https://zoom.us/j/12345',location:'Video call',attendees:'Client PM, Greg',notes:'Review Q3 scope',gcal:true},
  {id:'e2',title:'Deus team standup',date:todayStr(),start:'09:30',end:'10:00',type:'team',link:'https://meet.google.com/abc',location:'',attendees:'Dev1, Dev2, Sales',notes:'Sprint check-in',gcal:true},
  {id:'e3',title:'Potentia – Codero briefing',date:todayStr(),start:'16:30',end:'17:30',type:'meeting',link:'',location:'Codero HQ, Jakarta',attendees:'Yan Alvin, Greg',notes:'',gcal:false},
  {id:'e4',title:'GRII online study',date:todayStr(),start:'19:00',end:'20:30',type:'personal',link:'https://zoom.us/grii',location:'',attendees:'',notes:'',gcal:true},
];
const SAMPLE_MILESTONES = [
  {id:'m1',title:'PMS client delivery – Phase 3',startDate:'2026-08-01',endDate:'2026-08-31',date:'2026-08-31',product:'PMS',category:'Product',status:'in-progress',desc:'Full module completion for recurring client'},
  {id:'m2',title:'Potentia school pilot launch',startDate:'2026-07-10',endDate:'2026-07-15',date:'2026-07-15',product:'Potentia',category:'Launch',status:'upcoming',desc:'Codero first 3 schools onboarded'},
  {id:'m3',title:'Discover enterprise demo – Telkom',startDate:'2026-07-28',endDate:'2026-07-30',date:'2026-07-30',product:'Discover',category:'Sales',status:'upcoming',desc:'Re-engage 6 subsidiaries pilot'},
  {id:'m4',title:'Attendance PWA beta',startDate:'2026-06-25',endDate:'2026-06-30',date:'2026-06-30',product:'PMS',category:'Product',status:'in-progress',desc:'Cron + export features'},
];

/* ════════════════════════════════════════════════
   FIRESTORE HELPERS
════════════════════════════════════════════════ */

// Generic: write (set) a single doc
async function fbSet(collection, id, data){
  setSyncDot('saving');
  try {
    // Firestore doesn't accept undefined values — strip them
    const clean = JSON.parse(JSON.stringify(data));
    await db.collection(collection).doc(String(id)).set(clean);
    setSyncDot('synced');
  } catch(e){
    console.error('fbSet error', e);
    setSyncDot('error');
    throw e;
  }
}

// Generic: delete a single doc
async function fbDelete(collection, id){
  setSyncDot('saving');
  try {
    await db.collection(collection).doc(String(id)).delete();
    setSyncDot('synced');
  } catch(e){
    console.error('fbDelete error', e);
    setSyncDot('error');
    throw e;
  }
}

// Save settings doc (prioTypes, taskTypes, tags, customCols)
async function fbSaveSettings(){
  setSyncDot('saving');
  try {
    await db.collection('settings').doc('config').set({prioTypes, taskTypes, tags, customCols, colDefs, colWidths});
    setSyncDot('synced');
  } catch(e){
    console.error('fbSaveSettings error', e);
    setSyncDot('error');
  }
}

// Load settings doc once
async function fbLoadSettings(){
  try {
    const snap = await db.collection('settings').doc('config').get();
    if(snap.exists){
      const d = snap.data();
      if(d.prioTypes?.length) prioTypes = d.prioTypes;
      if(d.taskTypes?.length) taskTypes = d.taskTypes;
      if(d.tags?.length) tags = d.tags;
      if(Array.isArray(d.customCols)) customCols = d.customCols;
      if(Array.isArray(d.colDefs)&&d.colDefs.length) colDefs = d.colDefs;
      if(!colDefs.find(c=>c.id==='notes')) colDefs.splice(colDefs.findIndex(c=>c.id==='tags')+1,0,{id:'notes',label:'Notes',hidden:false});
      if(d.colWidths) colWidths=d.colWidths;
    }
  } catch(e){
    console.error('fbLoadSettings error', e);
  }
}

/* ── Seed sample data if collections are empty ── */
async function seedIfEmpty(){
  try {
    const snap = await db.collection('tasks').limit(1).get();
    if(!snap.empty) return; // already has data
    console.log('Seeding sample data…');
    const batch = db.batch();
    SAMPLE_TASKS.forEach(t=>batch.set(db.collection('tasks').doc(String(t.id)), JSON.parse(JSON.stringify(t))));
    SAMPLE_EVENTS.forEach(e=>batch.set(db.collection('events').doc(String(e.id)), JSON.parse(JSON.stringify(e))));
    SAMPLE_MILESTONES.forEach(m=>batch.set(db.collection('milestones').doc(String(m.id)), JSON.parse(JSON.stringify(m))));
    await batch.commit();
    console.log('Seed complete.');
  } catch(e){ console.error('seedIfEmpty error', e); }
}

/* ── Real-time listeners ── */
let unsubTasks, unsubEvents, unsubMilestones;

function startListeners(){
  // Tasks — live
  unsubTasks = db.collection('tasks').onSnapshot(snap=>{
    tasks = snap.docs.map(d=>({...d.data(), id: d.id}));
    renderTasksView();
    renderTeam();
    setSyncDot('synced');
  }, err=>{ console.error('tasks listener', err); setSyncDot('error'); });

  // Events — live
  unsubEvents = db.collection('events').onSnapshot(snap=>{
    events = snap.docs.map(d=>({...d.data(), id: d.id}));
    renderSchedule();
  }, err=>console.error('events listener', err));

  // Milestones — live
  unsubMilestones = db.collection('milestones').onSnapshot(snap=>{
    milestones = snap.docs.map(d=>({...d.data(), id: d.id}));
    renderMs();
  }, err=>console.error('milestones listener', err));
}

/* ════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════ */
const AMAP  = {me:['var(--p800)','#fff','G'],dev1:['var(--t600)','#fff','D1'],dev2:['var(--b600)','#fff','D2'],sales:['var(--a200)','#412402','SA'],ops:['var(--c600)','#fff','OP']};
const ANAME = {me:'Greg (me)',dev1:'Dev 1',dev2:'Dev 2',sales:'Sales',ops:'Ops'};

function prioIdx(pid){ const i=prioTypes.findIndex(p=>p.id===pid); return i<0?99:i; }
function prioBadgeHtml(pid){ const p=prioTypes.find(x=>x.id===pid)||prioTypes[1]; return `<span class="badge pdot-badge" style="color:${p.color}"><span class="pdot" style="background:${p.color}"></span>${p.label}</span>`; }

function typeBadge(typeId){
  const tt = taskTypes.find(t=>t.id===typeId);
  if(!tt) return `<span class="badge bpers">${typeId}</span>`;
  return `<span class="badge ${tt.style}">${tt.label}</span>`;
}

function statusBadge(s, clickId){
  const map = {
    'todo':        ['bstodo',   'To Do'],
    'in-progress': ['bsinprog', 'In Progress'],
    'done':        ['bsdone',   'Done'],
  };
  const [cls, label] = map[s] || map['todo'];
  const click = clickId ? `onclick="event.stopPropagation();cycleStatus('${clickId}')"` : '';
  return `<span class="badge ${cls} status-pill" ${click}>${label}</span>`;
}

function cycleStatus(id){
  const t = tasks.find(t=>String(t.id)===String(id)); if(!t) return;
  const cycle = ['todo','in-progress','done'];
  const cur = cycle.indexOf(t.status);
  t.status = cycle[(cur+1) % cycle.length];
  fbSet('tasks', id, t);
  if(String(activeSp)===String(id)) openSp(id);
}

function carryoverDays(t){
  if(!t.carryover || !t.carryoverSince) return 0;
  const since = new Date(t.carryoverSince+'T00:00:00');
  const diff = Math.floor((getToday() - since) / 86400000);
  return diff > 0 ? diff : 0;
}

function avHtml(a,sz=22){ const[bg,col,ini]=AMAP[a]||['var(--g100)','var(--g800)','?']; return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:${col};font-size:${Math.round(sz*.43)}px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ini}</div>`; }

function hlText(text, q){
  if(!q) return text;
  const re = new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return text.replace(re,'<mark class="hl">$1</mark>');
}

/* ════════════════════════════════════════════════
   MULTI-SORT ENGINE
════════════════════════════════════════════════ */
function multiSort(list, context){
  const rules = sortState[context];
  return [...list].sort((a,b)=>{
    for(const r of rules){
      let va, vb;
      if(r.field==='prio'){va=prioIdx(a.prio);vb=prioIdx(b.prio);}
      else if(r.field==='due'){va=a.due||'9999';vb=b.due||'9999';}
      else if(r.field==='status'){const sord={'todo':0,'in-progress':1,'done':2};va=sord[a.status]??0;vb=sord[b.status]??0;}
      else if(r.field==='title'){va=(a.title||'').toLowerCase();vb=(b.title||'').toLowerCase();}
      else if(r.field==='type'){va=a.type;vb=b.type;}
      else if(r.field==='assignee'){va=a.assignee;vb=b.assignee;}
      else{va=a.created;vb=b.created;}
      if(va<vb) return r.dir==='asc'?-1:1;
      if(va>vb) return r.dir==='asc'?1:-1;
    }
    return 0;
  });
}

let tableSortState = { tasks:{col:null,dir:'asc'}, team:{col:null,dir:'asc'} };

function applySort_list(list, context){
  const ts = tableSortState[context];
  if(ts && ts.col){
    return [...list].sort((a,b)=>{
      let va,vb;
      if(ts.col==='prio'){va=prioIdx(a.prio);vb=prioIdx(b.prio);}
      else if(ts.col==='due'){va=a.due||'9999';vb=b.due||'9999';}
      else if(ts.col==='status'){const sord={'todo':0,'in-progress':1,'done':2};va=sord[a.status]??0;vb=sord[b.status]??0;}
      else if(ts.col==='title'){va=(a.title||'').toLowerCase();vb=(b.title||'').toLowerCase();}
      else if(ts.col==='type'){va=a.type;vb=b.type;}
      else if(ts.col==='assignee'){va=a.assignee;vb=b.assignee;}
      else{va=a.created;vb=b.created;}
      if(va<vb) return ts.dir==='asc'?-1:1;
      if(va>vb) return ts.dir==='asc'?1:-1;
      return 0;
    });
  }
  return multiSort(list, context);
}

function onThClick(col, context){
  const ts = tableSortState[context];
  if(ts.col===col) ts.dir = ts.dir==='asc'?'desc':'asc';
  else { ts.col=col; ts.dir='asc'; }
  if(context==='tasks') renderTasksView();
  else renderTeam();
}

function thClsStr(col, context){
  const ts = tableSortState[context];
  if(ts.col!==col) return '';
  return 'th-active '+(ts.dir==='asc'?'th-asc':'th-desc');
}

/* ════════════════════════════════════════════════
   FILTER PANEL
════════════════════════════════════════════════ */
function toggleFpChip(el, panelId, badgeId){ el.classList.toggle('on'); updateFpBadge(panelId, badgeId); }
function updateFpBadge(panelId, badgeId){
  const cnt = document.querySelectorAll(`#${panelId} .fp-chip.on`).length;
  const badge = document.getElementById(badgeId);
  if(!badge) return;
  badge.textContent = cnt; badge.style.display = cnt>0?'flex':'none';
}
function clearFpPanel(panelId, badgeId){
  document.querySelectorAll(`#${panelId} .fp-chip`).forEach(c=>c.classList.remove('on'));
  updateFpBadge(panelId, badgeId);
}
function getFpFilters(panelId){
  const result = {};
  document.querySelectorAll(`#${panelId} .fp-chip.on`).forEach(el=>{
    const g = el.dataset.group, v = el.dataset.val;
    if(!result[g]) result[g]=[];
    result[g].push(v);
  });
  return result;
}
function applyFpFilter(taskList, panelId, searchId){
  const f = getFpFilters(panelId);
  const q = searchId ? (document.getElementById(searchId)||{}).value?.toLowerCase()||'' : '';
  return taskList.filter(t=>{
    if(f.type?.length && !f.type.includes(t.type)) return false;
    if(f.prio?.length && !f.prio.includes(t.prio)) return false;
    if(f.assignee?.length && !f.assignee.includes(t.assignee)) return false;
    if(f.tags?.length && !f.tags.some(tg=>(t.tags||[]).includes(tg))) return false;
    if(f.status?.length){
      const match = f.status.some(s=>{
        if(s==='todo') return t.status==='todo';
        if(s==='in-progress') return t.status==='in-progress';
        if(s==='done') return t.status==='done';
        if(s==='overdue') return isOvd(t.due)&&t.status!=='done';
        if(s==='carryover') return t.carryover;
        return false;
      });
      if(!match) return false;
    }
    if(q){
      const blob = ((t.title||'')+' '+(t.notes||'')+' '+(t.tags||[]).join(' ')).toLowerCase();
      if(!blob.includes(q)) return false;
    }
    return true;
  });
}

/* ── Panel open/close ── */
function togglePanel(id){ const el=document.getElementById(id); const isOpen=el.classList.contains('open'); closeAllPanels(); if(!isOpen)el.classList.add('open'); }
function closePanel(id){ document.getElementById(id)?.classList.remove('open'); }
function closeAllPanels(){ document.querySelectorAll('.fp-panel, .sort-panel').forEach(p=>p.classList.remove('open')); }
document.addEventListener('click', e=>{ if(!e.target.closest('.fp-wrap')&&!e.target.closest('.fp-btn')) closeAllPanels(); });

/* ── Search ── */
function onTaskSearch(){
  const q = document.getElementById('task-search-inp').value;
  document.getElementById('task-search-clear').style.display = q?'block':'none';
  renderTasksView();
}
function clearTaskSearch(){
  document.getElementById('task-search-inp').value='';
  document.getElementById('task-search-clear').style.display='none';
  renderTasksView();
}

/* ════════════════════════════════════════════════
   MULTI-SORT PANEL UI
════════════════════════════════════════════════ */
function renderSortPanel(context){
  const el = document.getElementById(`sort-${context}-rules`); if(!el) return;
  el.innerHTML = sortState[context].map((r,i)=>`
    <div class="sort-rule-row">
      <i class="fa-solid fa-grip-vertical" style="color:var(--tx3);font-size:11px;cursor:grab"></i>
      <select onchange="sortState['${context}'][${i}].field=this.value">
        ${SORT_FIELDS.map(f=>`<option value="${f.id}"${r.field===f.id?' selected':''}>${f.label}</option>`).join('')}
      </select>
      <button class="sort-dir-btn" onclick="sortState['${context}'][${i}].dir=sortState['${context}'][${i}].dir==='asc'?'desc':'asc';renderSortPanel('${context}')" title="${r.dir}">
        <i class="fa-solid fa-arrow-${r.dir==='asc'?'up':'down'}-short-wide"></i>
      </button>
      ${sortState[context].length>1?`<button class="ibtn" onclick="sortState['${context}'].splice(${i},1);renderSortPanel('${context}')"><i class="fa-solid fa-xmark" style="font-size:10px"></i></button>`:''}
    </div>`).join('');
  const badge = document.getElementById(`sort-${context}-badge`);
  if(badge) badge.textContent = sortState[context].length>1?`(${sortState[context].length})`:'';
}
function addSortRule(c){ sortState[c].push({field:'due',dir:'asc'}); renderSortPanel(c); }
function resetSort(c){ sortState[c]=[{field:'prio',dir:'asc'}]; tableSortState[c]={col:null,dir:'asc'}; renderSortPanel(c); renderSortActivePills(c); if(c==='tasks')renderTasksView(); else renderTeam(); }
function applySort(c){ tableSortState[c]={col:null,dir:'asc'}; closePanel(`sort-${c}-panel`); renderSortActivePills(c); if(c==='tasks')renderTasksView(); else renderTeam(); }
function renderSortActivePills(context){
  const el=document.getElementById(`sort-${context}-active-pills`); if(!el) return;
  const ts=tableSortState[context];
  const rules=ts.col?[{field:ts.col,dir:ts.dir,th:true}]:sortState[context];
  if(rules.length===1&&rules[0].field==='prio'&&!rules[0].th){el.innerHTML='';return;}
  el.innerHTML=rules.map((r,i)=>{const lbl=SORT_FIELDS.find(f=>f.id===r.field)?.label||r.field;return`<span class="sort-tag-pill">${i+1}. ${lbl} ${r.dir==='asc'?'↑':'↓'}</span>`;}).join('');
}

/* ── Populate dynamic filter chips ── */
function populateFpPrioChips(){
  ['fp-tasks-prio-chips','fp-team-prio-chips'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const panel=id.includes('team')?'fp-team':'fp-tasks';
    const badge=id.includes('team')?'fp-team-badge':'fp-tasks-badge';
    el.innerHTML=prioTypes.map(p=>`<span class="fp-chip" data-group="prio" data-val="${p.id}" onclick="toggleFpChip(this,'${panel}','${badge}')">${p.label}</span>`).join('');
  });
  // also populate type chips
  ['fp-tasks-type-chips','fp-team-type-chips'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const panel=id.includes('team')?'fp-team':'fp-tasks';
    const badge=id.includes('team')?'fp-team-badge':'fp-tasks-badge';
    el.innerHTML=taskTypes.map(tp=>`<span class="fp-chip" data-group="type" data-val="${tp.id}" onclick="toggleFpChip(this,'${panel}','${badge}')">${tp.label}</span>`).join('');
  });
}
function populateFpTagChips(){
  ['fp-tasks-tag-chips','fp-team-tag-chips'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const panel=id.includes('team')?'fp-team':'fp-tasks';
    const badge=id.includes('team')?'fp-team-badge':'fp-tasks-badge';
    el.innerHTML=tags.map(t=>`<span class="fp-chip" data-group="tags" data-val="${t}" onclick="toggleFpChip(this,'${panel}','${badge}')">${t}</span>`).join('');
  });
}

/* ════════════════════════════════════════════════
   TASK CARD & ROW HTML
════════════════════════════════════════════════ */
function taskHtml(t, q=''){
  const ovd = isOvd(t.due) && t.status!=='done';
  const carry = t.carryover && t.status!=='done';
  const subs = t.subtasks||[];
  const sdone = subs.filter(s=>s.done).length;
  const subHint = subs.length?`<span style="font-size:10.5px;color:var(--tx3);cursor:pointer" onclick="event.stopPropagation();toggleSubList('${t.id}')"><i class="fa-solid fa-list-check" style="font-size:9px"></i> ${sdone}/${subs.length}</span>`:'';
  const tagBadges = (t.tags||[]).slice(0,2).map(tg=>`<span class="badge btag">${tg}</span>`).join('');
  const dueLbl = t.due?`<span style="font-size:11px;color:${ovd?'var(--r600)':'var(--tx3)'};display:inline-flex;align-items:center;gap:3px"><i class="fa-solid fa-calendar-day" style="font-size:9px"></i>${fmtDate(t.due)}${ovd?' · overdue':''}</span>`:'';
  const days = carryoverDays(t);
  const carryBadge = carry?`<span class="badge bco"><i class="fa-solid fa-rotate-right" style="font-size:8px"></i> carried${days>0?' '+days+'d':''}</span>`:'';
  const titleHl = q?hlText(t.title,q):t.title;
  const subListHtml = subs.length?`
    <div class="sub-inline" id="sub-list-${t.id}">
      ${subs.map(s=>`<div class="sub-inline-row">
        <div class="sub-inline-chk ${s.done?'done':''}" onclick="event.stopPropagation();toggleSubInline('${t.id}','${s.id}')" style="${s.done?'background:var(--t600);border-color:var(--t600)':''}">
          ${s.done?'<i class="fa-solid fa-check" style="font-size:7px;color:#fff"></i>':''}
        </div>
        <span style="${s.done?'text-decoration:line-through;color:var(--tx3)':''}">${s.text}</span>
      </div>`).join('')}
      <div class="sub-inline-add" onclick="event.stopPropagation();showSubInput('${t.id}')"><i class="fa-solid fa-plus" style="font-size:10px"></i> Add subtask</div>
      <input class="sub-inline-input" id="sub-inp-${t.id}" placeholder="Subtask name…" onkeydown="submitSubInline(event,'${t.id}')" onblur="this.classList.remove('open')">
    </div>`:'';
  return `<div class="task-item ${t.status==='done'?'done':''}" onclick="openSp('${t.id}')" data-id="${t.id}">
    <div class="chk ${t.status==='done'?'done':''}" onclick="event.stopPropagation();toggleTask('${t.id}')">${t.status==='done'?'<i class="fa-solid fa-check" style="font-size:9px;color:#fff"></i>':''}</div>
    <div class="tbody">
      <div class="ttext">${titleHl}<button class="sub-qadd-btn" onclick="event.stopPropagation();quickOpenSubAdd('${t.id}')" title="Add subtask"><i class="fa-solid fa-plus" style="font-size:9px"></i></button></div>
      <div class="tmeta">${prioBadgeHtml(t.prio)}${typeBadge(t.type)}${statusBadge(t.status,t.id)}${carryBadge}${dueLbl}${tagBadges}${subHint}</div>
      ${subListHtml}
    </div>
    <div class="tact">
      ${subs.length?`<button class="ibtn" onclick="event.stopPropagation();toggleSubList('${t.id}')"><i class="fa-solid fa-chevron-down" style="font-size:10px"></i></button>`:''}
      <button class="ibtn" onclick="event.stopPropagation();openEditModal('${t.id}')"><i class="fa-solid fa-pen"></i></button>
      <button class="ibtn" onclick="event.stopPropagation();deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>
    ${avHtml(t.assignee)}
  </div>`;
}

/* ════════════════════════════════════════════════
   INLINE CELL EDITORS
════════════════════════════════════════════════ */
let _activeCellDd = null;
function closeCellDd(){ if(_activeCellDd){ _activeCellDd.classList.remove('open'); _activeCellDd=null; } }
document.addEventListener('click', e=>{ if(!e.target.closest('.cell-edit-wrap')) closeCellDd(); });

function cellPrioHtml(t){
  const opts=prioTypes.map(p=>`<div class="cell-dd-item${t.prio===p.id?' active':''}" onclick="event.stopPropagation();cellSetPrio('${t.id}','${p.id}')"><span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>${p.label}</div>`).join('');
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('cdd-p-${t.id}')">${prioBadgeHtml(t.prio)}<div class="cell-dd" id="cdd-p-${t.id}">${opts}</div></div>`;
}
function cellTypeHtml(t){
  const opts=taskTypes.map(tp=>`<div class="cell-dd-item${t.type===tp.id?' active':''}" onclick="event.stopPropagation();cellSetType('${t.id}','${tp.id}')">${typeBadge(tp.id)}</div>`).join('');
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('cdd-t-${t.id}')">${typeBadge(t.type)}<div class="cell-dd" id="cdd-t-${t.id}">${opts}</div></div>`;
}
function cellStatusHtml(t){
  const slist=[['todo','bstodo','To Do'],['in-progress','bsinprog','In Progress'],['done','bsdone','Done']];
  const opts=slist.map(([v,cls,lbl])=>`<div class="cell-dd-item${t.status===v?' active':''}" onclick="event.stopPropagation();cellSetStatus('${t.id}','${v}')"><span class="badge ${cls}" style="font-size:10px">${lbl}</span></div>`).join('');
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('cdd-s-${t.id}')">${statusBadge(t.status)}<div class="cell-dd" id="cdd-s-${t.id}">${opts}</div></div>`;
}
function cellTagsHtml(t){
  const cur=t.tags||[];
  const tagList=tags.map(tg=>`<div class="cell-dd-item${cur.includes(tg)?' active':''}" onclick="event.stopPropagation();cellToggleTag('${t.id}','${tg}')"><i class="fa-solid fa-${cur.includes(tg)?'check':'plus'}" style="font-size:9px;width:11px"></i>${tg}</div>`).join('');
  const display=cur.length?cur.slice(0,2).map(tg=>`<span class="badge btag">${tg}</span>`).join(' ')+(cur.length>2?`<span class="badge btag">+${cur.length-2}</span>`:''): `<span style="color:var(--tx3);font-size:11px">—</span>`;
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('cdd-tg-${t.id}')">${display}<div class="cell-dd" id="cdd-tg-${t.id}" style="min-width:160px">${tagList}</div></div>`;
}
function _escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function cellNotesHtml(t){
  const val=t.notes||'';
  const ddId=`cdd-n-${t.id}`;
  const preview=val?`<span style="font-size:11px;color:var(--tx2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle">${_escHtml(val)}</span>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${ddId}')">${preview}<div class="cell-dd" id="${ddId}" style="min-width:270px;padding:8px"><div style="font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">Notes</div><textarea id="${ddId}-txt" class="ftxt" style="font-size:12px;min-height:90px;resize:vertical;margin-bottom:6px" onclick="event.stopPropagation()" onkeydown="if(event.key==='Escape'){event.stopPropagation();closeCellDd();}">${_escHtml(val)}</textarea><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="event.stopPropagation();closeCellDd()">Cancel</button><button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="event.stopPropagation();cellSetNotes('${t.id}',document.getElementById('${ddId}-txt').value)">Save</button></div></div></div>`;
}
function cellSetNotes(tid,val){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  t.notes=val; fbSet('tasks',tid,t); closeCellDd();
  const spEl=document.getElementById('sp-notes');
  if(spEl&&activeSp===String(tid)) spEl.value=val;
}

function toggleCellDd(id){
  const el=document.getElementById(id); if(!el)return;
  if(_activeCellDd&&_activeCellDd!==el) closeCellDd();
  if(el.classList.contains('open')){ closeCellDd(); return; }
  // Use fixed positioning so the dropdown escapes overflow:auto clipping
  const rect=el.parentElement.getBoundingClientRect();
  el.style.position='fixed';
  el.style.top=(rect.bottom+4)+'px';
  el.style.left=rect.left+'px';
  // Clamp to viewport after browser lays it out
  requestAnimationFrame(()=>{ const w=el.offsetWidth||180; el.style.left=Math.min(rect.left, window.innerWidth-w-8)+'px'; const inp=el.querySelector('textarea,input:not([type=button]):not([type=checkbox])');if(inp){inp.focus();try{inp.select();}catch(_){}} });
  el.style.zIndex='9999';
  el.classList.add('open');
  _activeCellDd=el;
}
function closeCellDd(){
  if(_activeCellDd){
    _activeCellDd.classList.remove('open');
    _activeCellDd.style.position='';
    _activeCellDd.style.top='';
    _activeCellDd.style.left='';
    _activeCellDd.style.zIndex='';
    _activeCellDd=null;
  }
}
function cellSetPrio(tid,pid){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; t.prio=pid; fbSet('tasks',tid,t); closeCellDd(); }
function cellSetType(tid,typ){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; t.type=typ; fbSet('tasks',tid,t); closeCellDd(); }
function cellSetStatus(tid,st){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; t.status=st; fbSet('tasks',tid,t); closeCellDd(); if(String(activeSp)===String(tid))openSp(tid); }
function cellSetCustom(tid,colId,val){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; if(!t.custom)t.custom={}; t.custom[colId]=String(val); fbSet('tasks',tid,t); closeCellDd(); }
function spSaveSubCustom(tid,sid,colId,val){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; const s=findSubInTree(t.subtasks||[],sid);if(!s)return; if(!s.custom)s.custom={}; s.custom[colId]=String(val); fbSet('tasks',tid,t); closeCellDd(); renderTasksView();renderTeam(); if(activeSp===String(tid))renderSpSubtasks(tid); }

let colWidths={};
let _rzState=null;
function startColResize(e,colId,th){
  _rzState={colId,th,startX:e.clientX,startW:th.offsetWidth};
  document.addEventListener('mousemove',onColResize);
  document.addEventListener('mouseup',stopColResize);
  document.body.style.cursor='col-resize';
  document.body.style.userSelect='none';
}
function onColResize(e){
  if(!_rzState)return;
  const w=Math.max(60,_rzState.startW+(e.clientX-_rzState.startX));
  _rzState.th.style.width=w+'px';
  _rzState.th.style.minWidth=w+'px';
}
function stopColResize(){
  if(!_rzState)return;
  colWidths[_rzState.colId]=_rzState.th.offsetWidth;
  document.removeEventListener('mousemove',onColResize);
  document.removeEventListener('mouseup',stopColResize);
  document.body.style.cursor='';
  document.body.style.userSelect='';
  _rzState=null;
  fbSaveSettings();
}
function cellToggleTag(tid,tag){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; if(!t.tags)t.tags=[]; const i=t.tags.indexOf(tag); if(i>-1)t.tags.splice(i,1); else t.tags.push(tag); fbSet('tasks',tid,t); /* keep dropdown open for multi-select — re-render cell only */ const el=document.getElementById('cdd-tg-'+tid); if(el){ const cur=t.tags||[];const tagList=tags.map(tg=>`<div class="cell-dd-item${cur.includes(tg)?' active':''}" onclick="event.stopPropagation();cellToggleTag('${tid}','${tg}')"><i class="fa-solid fa-${cur.includes(tg)?'check':'plus'}" style="font-size:9px;width:11px"></i>${tg}</div>`).join('');el.innerHTML=tagList; } }

function cellDueHtml(t){
  const ovd=isOvd(t.due)&&t.status!=='done';
  const disp=t.due?`<span style="font-size:11.5px;color:${ovd?'var(--r600)':'var(--tx2)'}">${fmtDate(t.due)}${t.dueTime?` <span style="opacity:.6">${t.dueTime}</span>`:''}</span>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('cdd-due-${t.id}')">${disp}<div class="cell-dd" id="cdd-due-${t.id}" style="min-width:210px;padding:8px">
    <div style="font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">Due date</div>
    <input type="date" id="cdd-due-date-${t.id}" class="finp" style="font-size:12px;padding:5px 8px;margin-bottom:6px" value="${t.due||''}" onclick="event.stopPropagation()">
    <div style="font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px">Time (optional)</div>
    <input type="time" id="cdd-due-time-${t.id}" class="finp" style="font-size:12px;padding:5px 8px" value="${t.dueTime||''}" onclick="event.stopPropagation()">
    <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
      <button class="btn btn-xs btn-gh" onclick="event.stopPropagation();cellSetDue('${t.id}','','');closeCellDd()">Clear</button>
      <button class="btn btn-xs btn-pr" onclick="event.stopPropagation();cellSetDue('${t.id}',document.getElementById('cdd-due-date-${t.id}').value,document.getElementById('cdd-due-time-${t.id}').value)">Set</button>
    </div>
  </div></div>`;
}
function cellAssigneeHtml(t){
  const assignees=Object.keys(AMAP);
  const opts=assignees.map(a=>`<div class="cell-dd-item${t.assignee===a?' active':''}" onclick="event.stopPropagation();cellSetAssignee('${t.id}','${a}')">${avHtml(a,18)} <span style="font-size:12px">${ANAME[a]||a}</span></div>`).join('');
  return`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('cdd-av-${t.id}')"><div style="display:flex;align-items:center;gap:7px">${avHtml(t.assignee,22)}<span style="font-size:12.5px;color:var(--tx2)">${(ANAME[t.assignee]||t.assignee||'').replace(' (me)','')}</span></div><div class="cell-dd" id="cdd-av-${t.id}">${opts}</div></div>`;
}
function cellSetDue(tid,date,time){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; t.due=date; t.dueTime=time||''; fbSet('tasks',tid,t); closeCellDd(); }
function cellSetAssignee(tid,a){ const t=tasks.find(t=>String(t.id)===String(tid));if(!t)return; t.assignee=a; fbSet('tasks',tid,t); closeCellDd(); }

/* ── Subtask tree helpers ── */
let _pendingSub=null;
function findSubInTree(subs,sid){
  for(const s of (subs||[])){
    if(String(s.id)===String(sid)) return s;
    const f=findSubInTree(s.subtasks,sid); if(f) return f;
  }
  return null;
}
function removeSubFromTree(subs,sid){
  for(let i=0;i<(subs||[]).length;i++){
    if(String(subs[i].id)===String(sid)){subs.splice(i,1);return true;}
    if(removeSubFromTree(subs[i].subtasks||[],sid)) return true;
  }
  return false;
}
function subTaskRows(tid,subs,cols,context,q,depth){
  let h='';
  for(const s of (subs||[])){
    h+=subTaskRow(tid,s,cols,context,q,depth);
    h+=subTaskRows(tid,s.subtasks||[],cols,context,q,depth+1);
    if(_pendingSub?.tid===String(tid)&&_pendingSub?.parentSid===String(s.id)) h+=pendingSubRow(depth+1);
  }
  return h;
}
function pendingSubRow(depth){
  const pl=22+depth*18;
  return `<tr class="subtask-row" id="sub-new-row"><td></td><td colspan="99"><div style="display:flex;align-items:center;gap:6px;padding-left:${pl}px;padding-right:8px;padding-top:3px;padding-bottom:3px">
    <span class="subtask-tree">└</span>
    <input class="finp" id="sub-new-inp" placeholder="Subtask name…" style="flex:1;font-size:12.5px;padding:3px 8px;min-width:0"
           onkeydown="if(event.key==='Enter'){event.preventDefault();confirmNewSub();}if(event.key==='Escape')cancelNewSub()"
           onblur="setTimeout(()=>{if(_pendingSub)cancelNewSub();},150)">
    <button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="confirmNewSub()"><i class="fa-solid fa-check"></i></button>
    <button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="cancelNewSub()">✕</button>
  </div></td></tr>`;
}
function quickAddSubtaskInline(tid,parentSid=null,depth=0){
  _pendingSub={tid:String(tid),parentSid:parentSid?String(parentSid):null,depth};
  renderTasksView(); renderTeam();
  requestAnimationFrame(()=>{const i=document.getElementById('sub-new-inp');if(i)i.focus();});
}
function confirmNewSub(){
  if(!_pendingSub)return;
  const inp=document.getElementById('sub-new-inp'); if(!inp)return;
  const text=inp.value.trim(); if(!text){cancelNewSub();return;}
  const {tid,parentSid}=_pendingSub;
  const t=tasks.find(t=>String(t.id)===tid); if(!t)return;
  const newSub={id:'s'+Date.now(),text,status:'todo',prio:'',due:'',dueTime:'',assignee:'me',notes:'',subtasks:[]};
  if(!parentSid){if(!t.subtasks)t.subtasks=[];t.subtasks.push(newSub);}
  else{const p=findSubInTree(t.subtasks||[],parentSid);if(!p)return;if(!p.subtasks)p.subtasks=[];p.subtasks.push(newSub);}
  _pendingSub=null;
  fbSet('tasks',tid,t);
  renderTasksView(); renderTeam();
  if(activeSp===tid) renderSpSubtasks(tid);
}
function cancelNewSub(){ if(!_pendingSub)return; _pendingSub=null; renderTasksView(); renderTeam(); }

function taskRow(t, cols, context, q=''){
  const subs=t.subtasks||[];
  const sdone=subs.filter(s=>s.done).length;
  const titleHl=q?hlText(t.title,q):t.title;
  const vis=id=>!colDefs.find(c=>c.id===id)?.hidden;
  const customCells=(cols||customCols).filter(c=>!c.hidden).map(col=>{
    const raw=(t.custom||{})[col.id];
    const val=raw!=null?String(raw):'';
    const ddId=`cdd-c-${t.id}-${col.id}`;
    if(col.type==='checkbox'){
      const chk=val==='true'||val==='1';
      return`<td onclick="event.stopPropagation()"><input type="checkbox" ${chk?'checked':''} onchange="cellSetCustom('${t.id}','${col.id}',this.checked?'true':'')" style="accent-color:var(--p600)"></td>`;
    }
    const safeVal=val.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const preview=val.length>32?val.substring(0,32)+'…':val;
    const dispHtml=val?`<span style="font-size:12px;color:var(--tx2);white-space:pre-wrap;word-break:break-word">${preview}</span>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
    if(col.type==='url'){
      const link=val?`<a href="${safeVal}" target="_blank" onclick="event.stopPropagation()" style="color:var(--b600);font-size:11px">${val.replace(/^https?:\/\//,'').substring(0,22)}…</a>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
      return`<td onclick="event.stopPropagation()" class="cell-editable"><div class="cell-edit-wrap" onclick="toggleCellDd('${ddId}')">
        ${link}
        <div class="cell-dd" id="${ddId}" style="min-width:240px;padding:8px" onclick="event.stopPropagation()">
          <input class="finp" id="${ddId}-inp" type="url" placeholder="https://…" value="${safeVal}" style="margin-bottom:6px;font-size:12px"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();cellSetCustom('${t.id}','${col.id}',this.value);}if(event.key==='Escape')closeCellDd()">
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="event.stopPropagation();closeCellDd()">Cancel</button>
            <button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="event.stopPropagation();cellSetCustom('${t.id}','${col.id}',document.getElementById('${ddId}-inp').value)">Save</button>
          </div>
        </div>
      </div></td>`;
    }
    const isNum=col.type==='number';
    const inputEl=isNum
      ?`<input class="finp" id="${ddId}-inp" type="number" value="${safeVal}" style="margin-bottom:6px;font-size:12px" onkeydown="if(event.key==='Enter'){event.preventDefault();cellSetCustom('${t.id}','${col.id}',this.value);}if(event.key==='Escape')closeCellDd()">`
      :`<textarea class="finp" id="${ddId}-inp" rows="3" style="resize:vertical;font-size:12px;margin-bottom:6px;min-height:60px" onkeydown="if(event.key==='Escape')closeCellDd()">${safeVal}</textarea>`;
    return`<td onclick="event.stopPropagation()" class="cell-editable"><div class="cell-edit-wrap" onclick="toggleCellDd('${ddId}')">
      ${dispHtml}
      <div class="cell-dd" id="${ddId}" style="min-width:220px;padding:8px" onclick="event.stopPropagation()">
        ${inputEl}
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="event.stopPropagation();closeCellDd()">Cancel</button>
          <button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="event.stopPropagation();cellSetCustom('${t.id}','${col.id}',document.getElementById('${ddId}-inp').value)">Save</button>
        </div>
      </div>
    </div></td>`;
  }).join('');
  return `<tr class="${t.status==='done'?'done-row':''}" onclick="openSp('${t.id}')" style="cursor:pointer">
    <td onclick="event.stopPropagation();toggleTask('${t.id}')"><div class="chk ${t.status==='done'?'done':''}" style="width:15px;height:15px">${t.status==='done'?'<i class="fa-solid fa-check" style="font-size:8px;color:#fff"></i>':''}</div></td>
    ${vis('title')?`<td onclick="event.stopPropagation()"><span class="tt" id="tt-span-${t.id}" onclick="event.stopPropagation();cellEditTaskTitle('${t.id}')" style="cursor:text">${titleHl}</span><input id="tt-inp-${t.id}" class="finp" style="display:none;font-size:13px;padding:2px 5px;width:180px" value="${(t.title||'').replace(/"/g,'&quot;')}" onkeydown="if(event.key==='Enter'){event.preventDefault();cellSaveTaskTitle('${t.id}',this.value);}if(event.key==='Escape'){event.stopPropagation();cellCancelTaskTitle('${t.id}');}" onblur="cellSaveTaskTitle('${t.id}',this.value)">${subs.length?`<span style="font-size:10px;color:var(--tx3);margin-left:6px">${sdone}/${subs.length} ✓</span>`:''}<button class="ibtn sub-qadd-btn" onclick="event.stopPropagation();quickAddSubtaskInline('${t.id}',null,0)" title="Add subtask"><i class="fa-solid fa-plus" style="font-size:9px"></i></button></td>`:''}
    ${vis('prio')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellPrioHtml(t)}</td>`:''}
    ${vis('type')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellTypeHtml(t)}</td>`:''}
    ${vis('status')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellStatusHtml(t)}</td>`:''}
    ${vis('due')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellDueHtml(t)}</td>`:''}
    ${vis('assignee')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellAssigneeHtml(t)}</td>`:''}
    ${vis('tags')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellTagsHtml(t)}</td>`:''}
    ${vis('notes')?`<td onclick="event.stopPropagation()" class="cell-editable">${cellNotesHtml(t)}</td>`:''}
    ${customCells}
    <td onclick="event.stopPropagation()"><div style="display:flex;gap:4px">${context==='team'?`<button class="ibtn" onclick="claimTask('${t.id}')" title="Move to My Tasks"><i class="fa-solid fa-user-check" style="font-size:10px"></i></button>`:''}<button class="ibtn" onclick="openEditModal('${t.id}')"><i class="fa-solid fa-pen"></i></button><button class="ibtn" onclick="deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button></div></td>
  </tr>${subTaskRows(t.id,t.subtasks||[],cols,context,q,0)}${_pendingSub?.tid===String(t.id)&&!_pendingSub?.parentSid?pendingSubRow(0):''}`;
}

function subTaskRow(tid,s,cols,context,q,depth=0){
  const sid=s.id;
  const status=s.status||(s.done?'done':'todo');
  const isDone=status==='done';
  const vis=id=>!colDefs.find(c=>c.id===id)?.hidden;
  const chkStyle=isDone?'background:var(--t600);border-color:var(--t600)':status==='in-progress'?'background:var(--a200);border-color:var(--a400)':'';
  // Prio cell
  const prioDd=`cdd-sp-${sid}`;
  const hasPrio=prioTypes.find(p=>p.id===s.prio);
  const prioDisp=hasPrio?prioBadgeHtml(s.prio):`<span style="color:var(--tx3);font-size:11px">—</span>`;
  const prioCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${prioDd}')">${prioDisp}<div class="cell-dd" id="${prioDd}"><div class="cell-dd-item" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','prio','');closeCellDd()"><span style="color:var(--tx3);font-size:11px">— none —</span></div>${prioTypes.map(p=>`<div class="cell-dd-item${s.prio===p.id?' active':''}" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','prio','${p.id}');closeCellDd()"><span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>${p.label}</div>`).join('')}</div></div>`;
  // Status cell
  const statusDd=`cdd-ss-${sid}`;
  const slist=[['todo','bstodo','To Do'],['in-progress','bsinprog','In Progress'],['done','bsdone','Done']];
  const statusCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${statusDd}')">${statusBadge(status)}<div class="cell-dd" id="${statusDd}">${slist.map(([v,cls,lbl])=>`<div class="cell-dd-item${status===v?' active':''}" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','status','${v}');closeCellDd()"><span class="badge ${cls}" style="font-size:10px">${lbl}</span></div>`).join('')}</div></div>`;
  // Due cell
  const dueDd=`cdd-sd-${sid}`;
  const ovd=isOvd(s.due)&&!isDone;
  const dueDisp=s.due?`<span style="font-size:11.5px;color:${ovd?'var(--r600)':'var(--tx2)'}">${fmtDate(s.due)}</span>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
  const dueCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${dueDd}')">${dueDisp}<div class="cell-dd" id="${dueDd}" style="min-width:210px;padding:8px"><div style="font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">Due date</div><input type="date" id="${dueDd}-date" class="finp" style="font-size:12px;padding:5px 8px;margin-bottom:8px" value="${s.due||''}" onclick="event.stopPropagation()"><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-xs btn-gh" onclick="event.stopPropagation();cellSetSubDue('${tid}','${sid}','','')">Clear</button><button class="btn btn-xs btn-pr" onclick="event.stopPropagation();cellSetSubDue('${tid}','${sid}',document.getElementById('${dueDd}-date').value,'')">Set</button></div></div></div>`;
  // Assignee cell
  const avDd=`cdd-sa-${sid}`;
  const assigneeCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${avDd}')">${avHtml(s.assignee||'me',20)}<div class="cell-dd" id="${avDd}">${Object.keys(AMAP).map(a=>`<div class="cell-dd-item${(s.assignee||'me')===a?' active':''}" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','assignee','${a}');closeCellDd()">${avHtml(a,18)} <span style="font-size:12px">${ANAME[a]||a}</span></div>`).join('')}</div></div>`;
  // Type cell
  const typeDd=`cdd-sub-t-${sid}`;
  const typeCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${typeDd}')">${typeBadge(s.type)}<div class="cell-dd" id="${typeDd}"><div class="cell-dd-item" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','type','');closeCellDd()"><span style="color:var(--tx3);font-size:11px">— none —</span></div>${taskTypes.map(tp=>`<div class="cell-dd-item${s.type===tp.id?' active':''}" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','type','${tp.id}');closeCellDd()">${typeBadge(tp.id)}</div>`).join('')}</div></div>`;
  // Tags cell
  const tagsDd=`cdd-sub-tg-${sid}`;
  const curTags=s.tags||[];
  const tagsDisp=curTags.length?curTags.slice(0,2).map(tg=>`<span class="badge btag">${tg}</span>`).join(' ')+(curTags.length>2?`<span class="badge btag">+${curTags.length-2}</span>`:''): `<span style="color:var(--tx3);font-size:11px">—</span>`;
  const tagsCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${tagsDd}')">${tagsDisp}<div class="cell-dd" id="${tagsDd}" style="min-width:160px">${tags.map(tg=>`<div class="cell-dd-item${curTags.includes(tg)?' active':''}" onclick="event.stopPropagation();spSubToggleTag('${tid}','${sid}','${tg}')"><i class="fa-solid fa-${curTags.includes(tg)?'check':'plus'}" style="font-size:9px;width:11px"></i>${tg}</div>`).join('')}</div></div>`;
  // Notes cell
  const subNotesDd=`cdd-sn-${sid}`;
  const subNotesVal=s.notes||'';
  const subNotesPreview=subNotesVal?`<span style="font-size:11px;color:var(--tx2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle">${_escHtml(subNotesVal)}</span>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
  const subNotesCell=`<div class="cell-edit-wrap" onclick="event.stopPropagation();toggleCellDd('${subNotesDd}')">${subNotesPreview}<div class="cell-dd" id="${subNotesDd}" style="min-width:270px;padding:8px"><div style="font-size:10.5px;font-weight:600;color:var(--tx3);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">Notes</div><textarea id="${subNotesDd}-txt" class="ftxt" style="font-size:12px;min-height:90px;resize:vertical;margin-bottom:6px" onclick="event.stopPropagation()" onkeydown="if(event.key==='Escape'){event.stopPropagation();closeCellDd();}">${_escHtml(subNotesVal)}</textarea><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="event.stopPropagation();closeCellDd()">Cancel</button><button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="event.stopPropagation();spSaveSubField('${tid}','${sid}','notes',document.getElementById('${subNotesDd}-txt').value)">Save</button></div></div></div>`;
  const customCells=(cols||customCols).filter(c=>!c.hidden).map(col=>{
    const raw=(s.custom||{})[col.id];
    const val=raw!=null?String(raw):'';
    const ddId=`cdd-sc-${sid}-${col.id}`;
    if(col.type==='checkbox'){
      const chk=val==='true'||val==='1';
      return`<td onclick="event.stopPropagation()"><input type="checkbox" ${chk?'checked':''} onchange="spSaveSubCustom('${tid}','${sid}','${col.id}',this.checked?'true':'')" style="accent-color:var(--p600)"></td>`;
    }
    const safeVal=val.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const preview=val.length>32?val.substring(0,32)+'…':val;
    const dispHtml=val?`<span style="font-size:12px;color:var(--tx2);white-space:pre-wrap;word-break:break-word">${preview}</span>`:`<span style="color:var(--tx3);font-size:11px">—</span>`;
    if(col.type==='url'){
      const link=val?`<a href="${safeVal}" target="_blank" onclick="event.stopPropagation()" style="color:var(--b600);font-size:11px">${val.replace(/^https?:\/\//,'').substring(0,22)}…</a>`:dispHtml;
      return`<td onclick="event.stopPropagation()" class="cell-editable"><div class="cell-edit-wrap" onclick="toggleCellDd('${ddId}')">
        ${link}
        <div class="cell-dd" id="${ddId}" style="min-width:240px;padding:8px" onclick="event.stopPropagation()">
          <input class="finp" id="${ddId}-inp" type="url" placeholder="https://…" value="${safeVal}" style="margin-bottom:6px;font-size:12px"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();spSaveSubCustom('${tid}','${sid}','${col.id}',this.value);}if(event.key==='Escape')closeCellDd()">
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="event.stopPropagation();closeCellDd()">Cancel</button>
            <button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="event.stopPropagation();spSaveSubCustom('${tid}','${sid}','${col.id}',document.getElementById('${ddId}-inp').value)">Save</button>
          </div>
        </div>
      </div></td>`;
    }
    const isNum=col.type==='number';
    const inputEl=isNum
      ?`<input class="finp" id="${ddId}-inp" type="number" value="${safeVal}" style="margin-bottom:6px;font-size:12px" onkeydown="if(event.key==='Enter'){event.preventDefault();spSaveSubCustom('${tid}','${sid}','${col.id}',this.value);}if(event.key==='Escape')closeCellDd()">`
      :`<textarea class="finp" id="${ddId}-inp" rows="3" style="resize:vertical;font-size:12px;margin-bottom:6px;min-height:60px" onkeydown="if(event.key==='Escape')closeCellDd()">${safeVal}</textarea>`;
    return`<td onclick="event.stopPropagation()" class="cell-editable"><div class="cell-edit-wrap" onclick="toggleCellDd('${ddId}')">
      ${dispHtml}
      <div class="cell-dd" id="${ddId}" style="min-width:220px;padding:8px" onclick="event.stopPropagation()">
        ${inputEl}
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-xs btn-gh" onmousedown="event.preventDefault()" onclick="event.stopPropagation();closeCellDd()">Cancel</button>
          <button class="btn btn-xs btn-pr" onmousedown="event.preventDefault()" onclick="event.stopPropagation();spSaveSubCustom('${tid}','${sid}','${col.id}',document.getElementById('${ddId}-inp').value)">Save</button>
        </div>
      </div>
    </div></td>`;
  }).join('');
  return `<tr class="subtask-row${isDone?' done-row':''}" onclick="openSp('${tid}')">
    <td onclick="event.stopPropagation();spTogSubStatus('${tid}','${sid}')"><div class="chk" style="width:13px;height:13px;${chkStyle}">${isDone?'<i class="fa-solid fa-check" style="font-size:7px;color:#fff"></i>':''}</div></td>
    ${vis('title')?`<td onclick="event.stopPropagation()"><div class="subtask-indent" style="padding-left:${22+depth*18}px"><span class="subtask-tree">└</span><span id="sub-tbl-span-${sid}" style="font-size:12.5px;${isDone?'text-decoration:line-through;color:var(--tx3)':''}cursor:text" onclick="event.stopPropagation();cellEditSubTblTitle('${tid}','${sid}')">${q?hlText(s.text||'',q):s.text||''}</span><input id="sub-tbl-inp-${sid}" class="finp" style="display:none;font-size:12.5px;padding:2px 5px;width:160px" value="${(s.text||'').replace(/"/g,'&quot;')}" onkeydown="if(event.key==='Enter'){event.preventDefault();cellSaveSubTblTitle('${tid}','${sid}',this.value);}if(event.key==='Escape'){event.stopPropagation();cellCancelSubTblTitle('${sid}');}" onblur="cellSaveSubTblTitle('${tid}','${sid}',this.value)"><button class="sub-qadd-btn" onclick="event.stopPropagation();quickAddSubtaskInline('${tid}','${sid}',${depth+1})" title="Add sub-subtask"><i class="fa-solid fa-plus" style="font-size:9px"></i></button></div></td>`:''}
    ${vis('prio')?`<td onclick="event.stopPropagation()" class="cell-editable">${prioCell}</td>`:''}
    ${vis('type')?`<td onclick="event.stopPropagation()" class="cell-editable">${typeCell}</td>`:''}
    ${vis('status')?`<td onclick="event.stopPropagation()" class="cell-editable">${statusCell}</td>`:''}
    ${vis('due')?`<td onclick="event.stopPropagation()" class="cell-editable">${dueCell}</td>`:''}
    ${vis('assignee')?`<td onclick="event.stopPropagation()" class="cell-editable">${assigneeCell}</td>`:''}
    ${vis('tags')?`<td onclick="event.stopPropagation()" class="cell-editable">${tagsCell}</td>`:''}
    ${vis('notes')?`<td onclick="event.stopPropagation()" class="cell-editable">${subNotesCell}</td>`:''}
    ${customCells}
    <td onclick="event.stopPropagation()"><button class="ibtn" onclick="spDeleteSub('${tid}','${sid}')" title="Delete subtask"><i class="fa-solid fa-trash" style="font-size:10px"></i></button></td>
  </tr>`;
}

function tableHeaders(context){
  return colDefs.filter(c=>!c.fixed&&!c.hidden).map(c=>{
    const ws=colWidths[c.id]?`width:${colWidths[c.id]}px;min-width:${colWidths[c.id]}px;`:'';
    return`<th class="${thClsStr(c.id,context)}" onclick="onThClick('${c.id}','${context}')" style="${ws}cursor:pointer;user-select:none;position:relative">${c.label} <i class="fa-solid fa-sort" style="font-size:8px;opacity:.3"></i><div class="col-rz" onmousedown="event.stopPropagation();event.preventDefault();startColResize(event,'${c.id}',this.parentElement)"></div></th>`;
  }).join('');
}
function customColHeaders(context){
  return customCols.filter(c=>!c.hidden).map(c=>{
    const ws=colWidths[c.id]?`width:${colWidths[c.id]}px;min-width:${colWidths[c.id]}px;`:'';
    return`<th style="${ws}position:relative"><span>${c.name}</span><span onclick="event.stopPropagation();removeColInline(customCols.indexOf(c))" style="margin-left:6px;cursor:pointer;color:var(--tx3);font-size:9px;opacity:.5" title="Remove column">✕</span><div class="col-rz" onmousedown="event.stopPropagation();event.preventDefault();startColResize(event,'${c.id}',this.parentElement)"></div></th>`;
  }).join('')
    +`<th onclick="openColManager()" style="cursor:pointer;color:var(--p600);white-space:nowrap;font-size:10px" title="Manage columns"><i class="fa-solid fa-sliders"></i> Cols</th>`;
}
function removeColInline(i){ if(!confirm(`Remove column "${customCols[i].name}"?`)) return; customCols.splice(i,1); fbSaveSettings(); renderTasksView(); renderTeam(); }

/* ── Inline subtask helpers ── */
function toggleSubList(id){ const el=document.getElementById('sub-list-'+id); if(el)el.classList.toggle('open'); }
function showSubInput(id){ const inp=document.getElementById('sub-inp-'+id); if(inp){inp.classList.add('open');inp.focus();} }

function toggleSubInline(tid, sid){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=(t.subtasks||[]).find(s=>String(s.id)===String(sid)); if(!s)return;
  s.done=!s.done;
  fbSet('tasks',tid,t);
  if(activeSp===String(tid)) openSp(tid);
}

function submitSubInline(e,tid){
  if(e.key!=='Enter') return;
  const txt=e.target.value.trim(); if(!txt)return;
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  if(!t.subtasks) t.subtasks=[];
  t.subtasks.push({id:'s'+Date.now(),text:txt,done:false});
  fbSet('tasks',tid,t);
  e.target.value=''; e.target.classList.remove('open');
}

/* ════════════════════════════════════════════════
   RENDER: MY TASKS
════════════════════════════════════════════════ */
function renderMyTasksTabs(){
  const el=document.getElementById('my-tasks-tabs'); if(!el)return;
  const tabs=[{id:null,label:'All'},...taskTypes.map(t=>({id:t.id,label:t.label}))];
  el.innerHTML=tabs.map(tb=>`<button class="my-tab-btn${myTasksTab===tb.id?' on':''}" onclick="setMyTasksTab(${tb.id===null?'null':`'${tb.id}'`})">${tb.label}</button>`).join('');
}
function setMyTasksTab(typeId){
  myTasksTab=typeId;
  renderTasksView();
}

function renderTasksView(){
  const q=(document.getElementById('task-search-inp')||{}).value?.toLowerCase()||'';
  const curDayStr=ds(dayForOff(dayOff));
  renderMyTasksTabs();
  const allMyTasks=tasks.filter(t=>!t.assignee||t.assignee==='me');
  const myTasks=myTasksTab?allMyTasks.filter(t=>t.type===myTasksTab):allMyTasks;
  let filtered=applyFpFilter(myTasks,'fp-tasks','task-search-inp');
  filtered=filtered.filter(t=>{
    if(dayOff===0) return true; // today: show all tasks regardless of due date
    if(!t.due) return false;    // no due date: only visible on today
    if(dayOff<0) return t.due===curDayStr||(t.carryover&&t.due<=curDayStr);
    return t.due===curDayStr;   // future day: only tasks due exactly on that date
  });
  const open=filtered.filter(t=>t.status!=='done');
  const done_=filtered.filter(t=>t.status==='done');
  const allOpen=myTasks.filter(t=>t.status!=='done');
  document.getElementById('task-stats').innerHTML=`
    <div class="stat"><div class="stat-lbl">Not done</div><div class="stat-val">${allOpen.length}</div><div class="stat-sub">${myTasksTab?'in this tab':'my open tasks'}</div></div>
    <div class="stat"><div class="stat-lbl">In Progress</div><div class="stat-val">${myTasks.filter(t=>t.status==='in-progress').length}</div><div class="stat-sub">active</div></div>
    <div class="stat"><div class="stat-lbl">Carried over</div><div class="stat-val">${allOpen.filter(t=>t.carryover).length}</div><div class="stat-sub">from prev day</div></div>
    <div class="stat"><div class="stat-lbl" style="color:var(--r600)">Overdue</div><div class="stat-val" style="color:var(--r600)">${allOpen.filter(t=>isOvd(t.due)).length}</div><div class="stat-sub">need attention</div></div>`;
  document.getElementById('b-tasks').textContent=allMyTasks.filter(t=>t.status!=='done').length;
  const scEl=document.getElementById('task-search-count');
  if(scEl) scEl.textContent=q?`${filtered.length} result${filtered.length!==1?'s':''}`:'' ;
  renderSortActivePills('tasks');
  const area=document.getElementById('tasks-main-area');
  if(taskViewMode==='list'){
    const sorted=applySort_list(open,'tasks');
    const p1=sorted.filter(t=>t.prio===prioTypes[0]?.id);
    const rest=sorted.filter(t=>t.prio!==prioTypes[0]?.id&&!t.carryover);
    const carry=sorted.filter(t=>t.carryover&&t.prio!==prioTypes[0]?.id);
    let html=`<div class="card"><div class="task-list" id="tl-main">`;
    if(p1.length) html+=`<div class="sec-lbl">Urgent</div>${p1.map(t=>taskHtml(t,q)).join('')}`;
    if(rest.length) html+=`<div class="sec-lbl">Tasks</div>${rest.map(t=>taskHtml(t,q)).join('')}`;
    if(carry.length) html+=`<div class="sec-lbl">Carried over</div>${carry.map(t=>taskHtml(t,q)).join('')}`;
    if(!open.length) html+=`<div style="padding:28px;text-align:center;color:var(--tx3);font-size:13px">${q?`No results matching "${q}"`:'No tasks for this day 🎉'}</div>`;
    html+=`<div class="add-row" onclick="openTaskModal(myTasksTab)"><i class="fa-solid fa-plus"></i> Add task</div>`;
    html+=`<div class="arch-section"><div class="arch-toggle" onclick="showArch=!showArch;renderTasksView()"><i class="fa-solid fa-${showArch?'chevron-down':'chevron-right'}" style="font-size:10px"></i><span>${showArch?'Hide':'Show'} completed (${done_.length})</span></div>`;
    if(showArch&&done_.length) html+=`<div class="arch-tasks">${applySort_list(done_,'tasks').map(t=>taskHtml(t,q)).join('')}</div>`;
    html+=`</div></div>`;
    area.innerHTML=html;
  } else {
    const sorted=applySort_list([...open,...(showArch?done_:[])], 'tasks');
    area.innerHTML=`<div class="card"><div class="tbl-wrap"><table class="task-table">
      <thead><tr><th style="width:30px"></th>${tableHeaders('tasks')}${customColHeaders('tasks')}<th></th></tr></thead>
      <tbody>${sorted.map(t=>taskRow(t,customCols,'tasks',q)).join('')}</tbody></table></div>
      <div class="arch-section"><div class="arch-toggle" onclick="showArch=!showArch;renderTasksView()"><i class="fa-solid fa-${showArch?'chevron-down':'chevron-right'}" style="font-size:10px"></i><span>${showArch?'Hide':'Show'} completed (${done_.length})</span></div></div>
      <div class="add-row" onclick="openTaskModal(myTasksTab)"><i class="fa-solid fa-plus"></i> Add task</div></div>`;
  }
}

function updateDayLabel(){
  const d=dayForOff(dayOff);
  const lbl=dayOff===0?'Today':dayOff===1?'Tomorrow':dayOff===-1?'Yesterday':d.toLocaleDateString('en-ID',{weekday:'long'});
  document.getElementById('day-label').textContent=lbl;
  document.getElementById('day-sub').textContent=' · '+d.toLocaleDateString('en-ID',{month:'short',day:'numeric',year:'numeric'});
}
function chDay(dir){dayOff+=dir;updateDayLabel();renderTasksView();}
function goToday(){dayOff=0;updateDayLabel();renderTasksView();}
function setViewMode(m){ taskViewMode=m; document.getElementById('vt-list').classList.toggle('on',m==='list'); document.getElementById('vt-table').classList.toggle('on',m==='table'); renderTasksView(); }

function quickAdd(e){
  if(e.key!=='Enter') return;
  const val=document.getElementById('qinp').value.trim(); if(!val)return;
  const newTask={id:'t'+Date.now(),title:val,type:myTasksTab||taskTypes[0]?.id||'personal',prio:prioTypes[1]?.id||'p2',due:ds(dayForOff(dayOff)),dueTime:'',status:'todo',carryover:false,tags:[],assignee:'me',notes:'',subtasks:[],custom:{},gcal:false,created:Date.now()};
  tasks.unshift(newTask);
  fbSet('tasks',newTask.id,newTask);
  document.getElementById('qinp').value='';
  renderTasksView();
}

/* ── Toggle / delete tasks ── */
function toggleTask(id){
  // Clicking the checkbox: todo→in-progress→done→todo
  cycleStatus(id);
}
function deleteTask(id){
  tasks=tasks.filter(t=>String(t.id)!==String(id));
  fbDelete('tasks',id);
  closeSp();
}
function claimTask(id){
  const t=tasks.find(t=>String(t.id)===String(id)); if(!t)return;
  fbSet('tasks',id,{...t,assignee:'me'});
}

/* ════════════════════════════════════════════════
   RENDER: TEAM
════════════════════════════════════════════════ */
function renderTeam(){
  const q=(document.getElementById('team-search-inp')||{}).value?.toLowerCase()||'';
  const teamTasks=tasks.filter(t=>t.assignee&&t.assignee!=='me');
  const filtered=applyFpFilter(teamTasks,'fp-team','team-search-inp');
  document.getElementById('b-team').textContent=teamTasks.filter(t=>t.status!=='done').length;
  const area=document.getElementById('team-area');
  renderSortActivePills('team');
  if(teamViewMode==='table'){
    const open=filtered.filter(t=>t.status!=='done');
    const done_=filtered.filter(t=>t.status==='done');
    area.innerHTML=`<div class="card"><div class="tbl-wrap"><table class="task-table">
      <thead><tr><th style="width:30px"></th>${tableHeaders('team')}${customColHeaders('team')}<th></th></tr></thead>
      <tbody>${applySort_list(open,'team').map(t=>taskRow(t,customCols,'team',q)).join('')}</tbody>
    </table></div>
    <div class="arch-section"><div class="arch-toggle" onclick="showTeamArch=!showTeamArch;renderTeam()"><i class="fa-solid fa-chevron-${showTeamArch?'down':'right'}" style="font-size:10px"></i> ${showTeamArch?'Hide':'Show'} completed (${done_.length})</div>
    ${showTeamArch&&done_.length?`<div class="arch-tasks">${applySort_list(done_,'team').map(t=>taskRow(t,customCols,'team',q)).join('')}</div>`:''}</div></div>`;
  } else {
    const open=filtered.filter(t=>t.status!=='done');
    const byA={};
    applySort_list(open,'team').forEach(t=>{ if(!byA[t.assignee])byA[t.assignee]=[]; byA[t.assignee].push(t); });
    const cards=Object.keys(byA).map(a=>`<div class="card">
      <div class="card-hd"><div class="card-ttl">${avHtml(a,26)} ${ANAME[a]||a} <span style="font-size:11px;color:var(--tx3);font-weight:400">${byA[a].length} task${byA[a].length!==1?'s':''}</span></div></div>
      <div>${byA[a].map(t=>taskHtml(t,q)).join('')}</div>
      <div class="add-row" onclick="openTaskModal('team')"><i class="fa-solid fa-plus"></i> Assign task</div>
    </div>`).join('');
    area.innerHTML=`<div class="team-grid">${cards||'<div style="padding:24px;color:var(--tx3);font-size:13px">No team tasks found</div>'}</div>`;
  }
}
function setTeamViewMode(m){ teamViewMode=m; document.getElementById('tvt-group').classList.toggle('on',m==='group'); document.getElementById('tvt-table').classList.toggle('on',m==='table'); renderTeam(); }

/* ════════════════════════════════════════════════
   RENDER: WEEK
════════════════════════════════════════════════ */
function renderWeek(){
  const _today=getToday(); const base=new Date(_today); base.setDate(_today.getDate()-_today.getDay()+wkOff*7);
  const end=new Date(base); end.setDate(base.getDate()+6);
  document.getElementById('wk-label').textContent=`${base.toLocaleDateString('en-ID',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-ID',{month:'short',day:'numeric',year:'numeric'})}`;
  let html='',totalOpen=0,totalDone=0;
  for(let i=0;i<7;i++){
    const d=new Date(base); d.setDate(base.getDate()+i);
    const ds_=ds(d),isToday_=ds_===todayStr();
    const dayTasks=tasks.filter(t=>t.due===ds_);
    totalOpen+=dayTasks.filter(t=>t.status!=='done').length;
    totalDone+=dayTasks.filter(t=>t.status==='done').length;
    const chips=dayTasks.slice(0,4).map(t=>{const bg=t.prio===prioTypes[0]?.id?'var(--r50)':t.type==='team'?'var(--t50)':'var(--g50)';return`<span class="wk-chip" style="background:${bg}">${(t.title||'').substring(0,28)}</span>`;}).join('');
    const more=dayTasks.length>4?`<span style="font-size:10px;color:var(--tx3);padding:2px 6px">+${dayTasks.length-4} more</span>`:'';
    const dayOffset=Math.round((d-getToday())/86400000);
    html+=`<div class="wk-day ${isToday_?'today':''}" onclick="wkDayClick(${dayOffset})" style="cursor:pointer" title="Open in My Tasks">
      <div class="wk-day-hd" style="display:flex;align-items:center;justify-content:space-between">
        <div><div class="wk-dayname">${DAYS[d.getDay()]}</div><div class="wk-daynum">${d.getDate()}</div></div>
        <i class="fa-solid fa-arrow-right" style="font-size:10px;color:var(--tx3);opacity:.4"></i>
      </div>
      <div style="padding:6px 0">${chips}${more}${!dayTasks.length?'<span class="wk-chip" style="color:var(--tx3)">—</span>':''}</div>
    </div>`;
  }
  document.getElementById('wk-grid').innerHTML=html;
  document.getElementById('wk-stats-card').innerHTML=`<div style="display:flex;gap:24px;padding:14px 18px;font-size:13px"><strong>${totalOpen}</strong>&nbsp;open this week&nbsp;·&nbsp;<strong>${totalDone}</strong>&nbsp;done&nbsp;·&nbsp;<span style="color:var(--r600)"><strong>${tasks.filter(t=>isOvd(t.due)&&t.status!=='done').length}</strong>&nbsp;overdue</span></div>`;
}
function wkNav(d){wkOff+=d;renderWeek();}
function wkGoToday(){wkOff=0;renderWeek();}
function wkDayClick(offset){dayOff=offset;sv('tasks');}

/* ════════════════════════════════════════════════
   RENDER: SCHEDULE
════════════════════════════════════════════════ */
async function renderSchedule(){
  const d=dayForOff(schedDayOff2); const ds_=ds(d);
  const lbl=schedDayOff2===0?"Today's Schedule":schedDayOff2===-1?"Yesterday's Schedule":d.toLocaleDateString('en-ID',{weekday:'long',month:'short',day:'numeric'});
  document.getElementById('sched-label').textContent=lbl;
  const noteEl=document.getElementById('sched-gcal-note');
  if(noteEl) noteEl.innerHTML=gcalConnected
    ?'<i class="fa-brands fa-google" style="font-size:10px;color:var(--t600)"></i> Synced from Google Calendar'
    :'<i class="fa-brands fa-google" style="font-size:10px"></i> Sourced from Google Calendar · <span style="cursor:pointer;color:var(--b600);text-decoration:underline" onclick="connectGCal()">connect GCal to sync real events</span>';
  const localEvts=events.filter(e=>e.date===ds_);
  const gcalRaw=gcalConnected?await fetchGCalEvents(ds_):[];
  const localGcalIds=new Set(localEvts.filter(e=>e.gcalEventId).map(e=>e.gcalEventId));
  const gcalEvts=gcalRaw.filter(i=>!localGcalIds.has(i.id)).map(normalizeGCalItem);
  const merged=[...localEvts,...gcalEvts].sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const el=document.getElementById('sched-area');
  if(!merged.length){
    el.innerHTML=`<div style="padding:32px;text-align:center;color:var(--tx3);font-size:13px">No events. <span style="cursor:pointer;color:var(--p600)" onclick="openEventModal()">Add one</span>${!gcalConnected?' or <span style="cursor:pointer;color:var(--b600)" onclick="connectGCal()">connect GCal</span>':''}.</div>`;return;
  }
  el.innerHTML=merged.map(e=>{
    const cls=e.source==='gcal'?'gcal':e.type==='team'?'team':e.type==='personal'?'personal':'gcal';
    const extras=[];
    if(e.start&&e.end) extras.push(`<i class="fa-solid fa-clock" style="font-size:9px"></i> ${e.start} – ${e.end}`);
    if(e.location) extras.push(`<i class="fa-solid fa-location-dot" style="font-size:10px"></i> ${e.location}`);
    if(e.attendees) extras.push(`<i class="fa-solid fa-users" style="font-size:10px"></i> ${e.attendees}`);
    if(e.link) extras.push(`<a href="${e.link}" target="_blank" style="color:inherit"><i class="fa-solid fa-video" style="font-size:10px"></i> Join</a>`);
    const gcalBadge=e.source==='gcal'?'<span style="font-size:9px;opacity:.55;margin-left:6px"><i class="fa-brands fa-google"></i></span>':'';
    return`<div class="time-slot"><div class="time-lbl">${e.start||'–'}</div><div class="slot-evt ${cls}"><strong>${e.title}</strong>${gcalBadge}${extras.length?`<div class="slot-meta">${extras.join(' &nbsp;·&nbsp; ')}</div>`:''}${e.notes?`<div class="slot-meta"><i class="fa-solid fa-note-sticky" style="font-size:9px"></i> ${e.notes}</div>`:''}</div></div>`;
  }).join('');
}
function chSchedDay(d){schedDayOff2+=d;renderSchedule();}
function schedGoToday(){schedDayOff2=0;renderSchedule();}

/* ════════════════════════════════════════════════
   RENDER: MILESTONES
════════════════════════════════════════════════ */
function renderMs(){
  const stColor={'in-progress':['var(--a200)','var(--a800)'],'upcoming':['var(--b200)','var(--b800)'],'done':['var(--gr200)','var(--gr800)']};
  const el=document.getElementById('ms-list'); if(!el)return;
  if(!milestones.length){el.innerHTML='<div style="padding:32px;text-align:center;color:var(--tx3);font-size:13px">No important dates yet. <span style="cursor:pointer;color:var(--p600)" onclick="openMsModal()">Add one</span>.</div>';return;}
  el.innerHTML=milestones.map(m=>{
    const[bc,tc]=stColor[m.status]||stColor.upcoming;
    const dateRange=m.startDate&&m.endDate?`${fmtDate(m.startDate)} – ${fmtDate(m.endDate)}`:m.startDate?fmtDate(m.startDate):m.date?fmtDate(m.date):'—';
    const catBadge=m.category?`<span class="badge btag">${m.category}</span>`:'';
    return`<div class="ms-item">
      <div class="ms-bar" style="background:${bc}"></div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
          <span style="font-size:13px;font-weight:500">${m.title}</span>
          <span class="badge" style="background:${bc}22;color:${tc}">${m.status}</span>
          ${catBadge}
        </div>
        <div style="font-size:12px;color:var(--tx3)">${m.desc||''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-right:10px">
        <div style="font-size:11.5px;font-weight:600;color:var(--p600)">${m.product||''}</div>
        <div style="font-size:11px;color:var(--tx3);margin-top:2px">${dateRange}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button class="ibtn" onclick="openMsModal('${m.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="ibtn" style="color:var(--r600)" onclick="deleteMilestone('${m.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function openMsModal(id){
  const m=id?milestones.find(m=>String(m.id)===String(id)):null;
  document.getElementById('ms-edit-id').value=id||'';
  document.getElementById('mo-ms-ttl').textContent=m?'Edit Important Date':'New Important Date';
  document.getElementById('ms-title').value=m?.title||'';
  document.getElementById('ms-category').value=m?.category||'';
  document.getElementById('ms-product').value=m?.product||'';
  document.getElementById('ms-status').value=m?.status||'upcoming';
  document.getElementById('ms-start').value=m?.startDate||m?.date||'';
  document.getElementById('ms-end').value=m?.endDate||'';
  document.getElementById('ms-desc').value=m?.desc||'';
  document.getElementById('mo-ms').classList.add('on');
  setTimeout(()=>document.getElementById('ms-title').focus(),80);
}

function saveMilestone(){
  const title=document.getElementById('ms-title').value.trim(); if(!title)return;
  const editId=document.getElementById('ms-edit-id').value;
  const endVal=document.getElementById('ms-end').value;
  const startVal=document.getElementById('ms-start').value;
  const data={title,category:document.getElementById('ms-category').value.trim(),product:document.getElementById('ms-product').value.trim(),status:document.getElementById('ms-status').value,startDate:startVal,endDate:endVal,date:endVal||startVal,desc:document.getElementById('ms-desc').value.trim()};
  if(editId){
    const idx=milestones.findIndex(m=>String(m.id)===String(editId));
    if(idx>-1) milestones[idx]={...milestones[idx],...data};
    fbSet('milestones',editId,milestones.find(m=>String(m.id)===String(editId)));
  } else {
    const newMs={id:'m'+Date.now(),...data};
    milestones.push(newMs);
    fbSet('milestones',newMs.id,newMs);
  }
  closeMoDirect('mo-ms');
  renderMs();
}

function deleteMilestone(id){
  if(!confirm('Delete this important date?'))return;
  milestones=milestones.filter(m=>String(m.id)!==String(id));
  fbDelete('milestones',id);
  renderMs();
}

/* ════════════════════════════════════════════════
   RENDER: CALENDAR  
════════════════════════════════════════════════ */
async function renderCalendar(){
  const area=document.getElementById('gcal-cal-area'); if(!area)return;
  const today=getToday();
  const ref=new Date(today.getFullYear(),today.getMonth()+calMonthOff,1);
  const year=ref.getFullYear(), month=ref.getMonth();
  const monthName=ref.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const firstDow=(new Date(year,month,1).getDay()+6)%7; // 0=Mon
  const daysInMonth=new Date(year,month+1,0).getDate();
  const daysInPrev=new Date(year,month,0).getDate();
  const todayDs=ds(today);

  const gcalItems=gcalConnected?await fetchGCalMonthEvents(year,month):[];
  const gcalByDay={};
  gcalItems.forEach(item=>{
    const d_=(item.start?.dateTime||item.start?.date||'').slice(0,10);
    if(!gcalByDay[d_])gcalByDay[d_]=[];
    gcalByDay[d_].push(item.summary||'(No title)');
  });
  const taskByDay={};
  tasks.filter(t=>t.due&&t.assignee==='me'&&t.status!=='done').forEach(t=>{
    if(!taskByDay[t.due])taskByDay[t.due]=[];
    taskByDay[t.due].push(t.title);
  });

  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let cells='';
  for(let i=0;i<firstDow;i++) cells+=`<div class="cal-cell other"><div class="cal-num">${daysInPrev-firstDow+i+1}</div></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const ds_=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday=ds_===todayDs;
    const tArr=taskByDay[ds_]||[], gArr=gcalByDay[ds_]||[];
    const tChips=tArr.slice(0,2).map(t=>`<span class="cal-chip" title="${t}">${t}</span>`).join('');
    const gChips=gArr.slice(0,2).map(t=>`<span class="cal-chip b" title="${t}"><i class="fa-brands fa-google" style="font-size:8px;margin-right:2px"></i>${t}</span>`).join('');
    const extra=tArr.length+gArr.length>4?`<span style="font-size:9px;color:var(--tx3);padding:1px 5px">+${tArr.length+gArr.length-4} more</span>`:'';
    cells+=`<div class="cal-cell${isToday?' today':''}" onclick="goToSchedule('${ds_}')"><div class="cal-num">${day}</div>${tChips}${gChips}${extra}</div>`;
  }
  const total=firstDow+daysInMonth, rem=total%7===0?0:7-(total%7);
  for(let i=1;i<=rem;i++) cells+=`<div class="cal-cell other"><div class="cal-num">${i}</div></div>`;

  const connectBanner=!gcalConnected
    ?`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--b50);border-bottom:1px solid var(--b200);font-size:12.5px;color:var(--b800)"><i class="fa-brands fa-google"></i><span style="flex:1">Connect Google Calendar to see your real events on this calendar.</span><button class="btn btn-sm" style="background:var(--b600);color:#fff;border:none;flex-shrink:0" onclick="connectGCal()">Connect</button></div>`
    :'';
  area.innerHTML=`<div class="card">
    ${connectBanner}
    <div class="card-hd">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="ibtn" onclick="calChMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
        <span style="font-size:14px;font-weight:600;min-width:160px">${monthName}</span>
        <button class="ibtn" onclick="calChMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
        <button class="btn btn-gh btn-xs" onclick="calGoToday()">Today</button>
      </div>
      <div style="display:flex;gap:7px;align-items:center">
        <span class="cal-chip" style="display:inline-block">My Tasks</span>
        ${gcalConnected?'<span class="cal-chip b" style="display:inline-block"><i class="fa-brands fa-google" style="font-size:8px"></i> GCal</span>':''}
      </div>
    </div>
    <div style="padding:10px 12px">
      <div class="cal-grid" style="margin-bottom:6px">${dayNames.map(n=>`<div class="cal-dh">${n}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
  </div>`;
}
function calChMonth(d){ calMonthOff+=d; const mk=`${new Date(getToday().getFullYear(),getToday().getMonth()+calMonthOff,1)}`; gcalEventsCache={}; renderCalendar(); }
function calGoToday(){ calMonthOff=0; gcalEventsCache={}; renderCalendar(); }
function goToSchedule(dateStr){
  const today=getToday(), d=new Date(dateStr+'T12:00:00');
  schedDayOff2=Math.round((d-today)/86400000); sv('schedule');
}

/* ════════════════════════════════════════════════
   CUSTOMIZE
════════════════════════════════════════════════ */
function renderCustomize(){
  document.getElementById('col-list').innerHTML=customCols.map((c,i)=>`<div class="col-item"><i class="fa-solid fa-grip-vertical col-drag"></i><input class="finp" value="${c.name}" style="flex:1;font-size:12.5px;padding:3px 7px;border-color:transparent;background:transparent" onchange="renameCustomCol(${i},this.value)" onfocus="this.style.borderColor=''" onblur="this.style.borderColor='transparent'" title="Click to rename"><span class="badge btag">${c.type}</span><button class="ibtn" onclick="removeCol(${i})"><i class="fa-solid fa-trash" style="font-size:11px"></i></button></div>`).join('');
  document.getElementById('prio-list').innerHTML=prioTypes.map((p,i)=>`<div class="prio-item" draggable="true" id="prio-drag-${i}" ondragstart="prioDragStart(${i})" ondragover="prioDragOver(event,${i})" ondragleave="prioDragLeave(${i})" ondrop="prioDrop(event,${i})"><i class="fa-solid fa-grip-vertical" style="color:var(--tx3);cursor:grab;font-size:12px;flex-shrink:0"></i><div class="prio-color-dot" style="background:${p.color}"></div><span style="flex:1;font-size:12.5px">${p.label}</span><button class="ibtn" onclick="editPrioModal(${i})"><i class="fa-solid fa-pen" style="font-size:11px"></i></button>${prioTypes.length>1?`<button class="ibtn" onclick="removePrio(${i})"><i class="fa-solid fa-trash" style="font-size:11px"></i></button>`:''}</div>`).join('');
  document.getElementById('tag-manage').innerHTML=tags.map((t,i)=>`<span class="badge btag" style="font-size:12px;padding:4px 10px">${t} <span onclick="removeTag(${i})" style="cursor:pointer;margin-left:4px;color:var(--r600)">×</span></span>`).join('');
  const tt=document.getElementById('type-list');
  if(tt) tt.innerHTML=taskTypes.map((tp,i)=>`<div class="prio-item">
    <span class="badge ${tp.style}" style="font-size:11px">${tp.label}</span>
    <span style="flex:1;font-size:12px;color:var(--tx2);margin-left:6px">${tp.id}</span>
    <button class="ibtn" onclick="editType(${i})"><i class="fa-solid fa-pen" style="font-size:11px"></i></button>
    ${taskTypes.length>1?`<button class="ibtn" onclick="removeType(${i})"><i class="fa-solid fa-trash" style="font-size:11px"></i></button>`:''}
  </div>`).join('');
  populateFpPrioChips(); populateFpTagChips();
}

function addColModal(){ document.getElementById('col-type').onchange=function(){document.getElementById('col-opts-row').style.display=this.value==='select'?'block':'none';}; document.getElementById('mo-col').classList.add('on'); }
function saveCol(){ const name=document.getElementById('col-name').value.trim(),type=document.getElementById('col-type').value; if(!name)return; customCols.push({id:'c'+Date.now(),name,type}); closeMoDirect('mo-col'); renderCustomize(); fbSaveSettings(); }
function removeCol(i){ customCols.splice(i,1); renderCustomize(); fbSaveSettings(); }

const PRIO_COLORS=['#C0392B','#E24B4A','#E74C3C','#F08080','#E67E22','#EF9F27','#F39C12','#F1C40F','#D4AC0D','#27AE60','#5DCAA5','#1ABC9C','#16A085','#3498DB','#85B7EB','#2980B9','#1A5276','#9B59B6','#8E44AD','#AFA9EC','#EC407A','#F09595','#95A5A6','#888780','#2C3E50'];

function renderPrioColorPalette(sel){
  const el=document.getElementById('prio-color-palette'); if(!el)return;
  el.innerHTML=PRIO_COLORS.map(c=>`<div class="color-swatch${sel===c?' sel':''}" style="background:${c}" onclick="selectPrioColor('${c}')" title="${c}"></div>`).join('');
  const cur=sel||PRIO_COLORS[0];
  document.getElementById('prio-color').value=cur;
  document.getElementById('prio-color-preview').style.background=cur;
  document.getElementById('prio-color-custom').value=cur;
}
function selectPrioColor(c){
  document.getElementById('prio-color').value=c;
  document.getElementById('prio-color-preview').style.background=c;
  document.getElementById('prio-color-custom').value=c;
  document.querySelectorAll('#prio-color-palette .color-swatch').forEach(el=>el.classList.toggle('sel',el.style.background===c||el.style.backgroundColor===c));
}
function addPrioModal(){
  document.getElementById('prio-edit-idx').value='';
  document.getElementById('prio-lbl').value='';
  document.getElementById('mo-prio-ttl').textContent='Add Priority Type';
  renderPrioColorPalette(PRIO_COLORS[0]);
  document.getElementById('mo-prio').classList.add('on');
  setTimeout(()=>document.getElementById('prio-lbl').focus(),80);
}
function editPrioModal(i){
  const p=prioTypes[i]; if(!p)return;
  document.getElementById('prio-edit-idx').value=i;
  document.getElementById('prio-lbl').value=p.label;
  document.getElementById('mo-prio-ttl').textContent='Edit Priority Type';
  renderPrioColorPalette(p.color);
  document.getElementById('mo-prio').classList.add('on');
  setTimeout(()=>document.getElementById('prio-lbl').focus(),80);
}
function savePrio(){
  const lbl=document.getElementById('prio-lbl').value.trim(); if(!lbl)return;
  const color=document.getElementById('prio-color').value;
  const editIdx=document.getElementById('prio-edit-idx').value;
  if(editIdx!==''){const i=parseInt(editIdx);prioTypes[i]={...prioTypes[i],label:lbl,color};}
  else prioTypes.push({id:'p'+Date.now(),label:lbl,color});
  closeMoDirect('mo-prio'); renderCustomize(); populatePrioSelect(); fbSaveSettings();
}
function removePrio(i){ if(prioTypes.length<=1)return; prioTypes.splice(i,1); renderCustomize(); populatePrioSelect(); fbSaveSettings(); }

/* ── Prio drag-to-reorder ── */
let _prioDragIdx=null;
function prioDragStart(i){ _prioDragIdx=i; }
function prioDragOver(e,i){ e.preventDefault(); document.getElementById('prio-drag-'+i)?.classList.add('drag-over'); }
function prioDragLeave(i){ document.getElementById('prio-drag-'+i)?.classList.remove('drag-over'); }
function prioDrop(e,i){
  e.preventDefault(); prioDragLeave(i);
  if(_prioDragIdx===null||_prioDragIdx===i){_prioDragIdx=null;return;}
  const moved=prioTypes.splice(_prioDragIdx,1)[0];
  prioTypes.splice(i,0,moved);
  _prioDragIdx=null;
  fbSaveSettings(); renderCustomize(); populatePrioSelect();
}

function addTag(){ const n=prompt('New tag name:'); if(n?.trim()){tags.push(n.trim());renderCustomize();renderTagsInModal();fbSaveSettings();} }
function removeTag(i){ tags.splice(i,1); renderCustomize(); renderTagsInModal(); fbSaveSettings(); }

/* ── Task type CRUD ── */
function populateTypeSelect(){ const sel=document.getElementById('t-type'); if(!sel)return; const cur=sel.value; sel.innerHTML=taskTypes.map(tp=>`<option value="${tp.id}">${tp.label}</option>`).join(''); if(taskTypes.find(tp=>tp.id===cur))sel.value=cur; }
function openTypeModal(){ document.getElementById('type-edit-id').value=''; document.getElementById('mo-type-ttl').textContent='Add Task Type'; document.getElementById('type-name-inp').value=''; document.getElementById('type-style').value='bpers'; document.getElementById('mo-type').classList.add('on'); setTimeout(()=>document.getElementById('type-name-inp').focus(),80); }
function editType(i){ const tp=taskTypes[i]; if(!tp)return; document.getElementById('type-edit-id').value=i; document.getElementById('mo-type-ttl').textContent='Edit Task Type'; document.getElementById('type-name-inp').value=tp.label; document.getElementById('type-style').value=tp.style; document.getElementById('mo-type').classList.add('on'); }
function saveType(){ const label=document.getElementById('type-name-inp').value.trim(); if(!label)return; const style=document.getElementById('type-style').value; const editIdx=document.getElementById('type-edit-id').value; if(editIdx!==''){const i=parseInt(editIdx);taskTypes[i].label=label;taskTypes[i].style=style;}else{taskTypes.push({id:'type_'+Date.now(),label,style});} closeMoDirect('mo-type'); renderCustomize(); populateTypeSelect(); fbSaveSettings(); }
function removeType(i){ if(taskTypes.length<=1){alert('You need at least one task type.');return;} taskTypes.splice(i,1); renderCustomize(); populateTypeSelect(); fbSaveSettings(); }

/* ════════════════════════════════════════════════
   SIDE PANEL
════════════════════════════════════════════════ */
function openSp(id){
  const t=tasks.find(t=>String(t.id)===String(id)); if(!t)return;
  activeSp=String(id);
  document.getElementById('side-panel').classList.remove('hidden');
  document.getElementById('sp-title').textContent=t.title;
  const chk=document.getElementById('sp-chk');
  chk.style.background=t.status==='done'?'var(--p600)':'';
  chk.style.borderColor=t.status==='done'?'var(--p600)':'';
  chk.innerHTML=t.status==='done'?'<i class="fa-solid fa-check" style="font-size:9px;color:#fff"></i>':'';
  document.getElementById('sp-prio').innerHTML=prioBadgeHtml(t.prio);
  document.getElementById('sp-type').innerHTML=typeBadge(t.type);
  document.getElementById('sp-status').innerHTML=statusBadge(t.status,t.id);
  document.getElementById('sp-due').textContent=fmtDate(t.due)+(t.dueTime?' · '+t.dueTime:'');
  document.getElementById('sp-assignee').innerHTML=`<div style="display:flex;align-items:center;gap:7px">${avHtml(t.assignee)} ${ANAME[t.assignee]||t.assignee}</div>`;
  document.getElementById('sp-tags').textContent=(t.tags||[]).join(', ')||'—';
  document.getElementById('sp-notes').value=t.notes||'';
  renderSpSubtasks(t.id);
  document.getElementById('sp-custom-fields').innerHTML=customCols.filter(c=>(t.custom||{})[c.id]).map(c=>{const val=t.custom[c.id];return`<div class="sp-field"><div class="sp-lbl">${c.name}</div><div class="sp-val">${c.type==='url'?`<a href="${val}" target="_blank" style="color:var(--b600)">${val}</a>`:val}</div></div>`;}).join('');
}
function closeSp(){activeSp=null;document.getElementById('side-panel').classList.add('hidden');}
function toggleSpTask(){if(activeSp)toggleTask(activeSp);}
function spNotesChange(){
  const t=tasks.find(t=>String(t.id)===String(activeSp)); if(!t)return;
  t.notes=document.getElementById('sp-notes').value;
  fbSet('tasks',activeSp,t);
}
function editFromSp(){if(activeSp)openEditModal(activeSp);}
function deleteFromSp(){if(activeSp)deleteTask(activeSp);}
function renderSpSubItems(tid,subs,depth){
  return (subs||[]).map(s=>{
    const ml=depth*16;
    const status=s.status||(s.done?'done':'todo');
    const isDone=status==='done', isIP=status==='in-progress';
    const chkCls=isDone?'done':isIP?'inprog':'';
    const statusLabel={todo:'To Do','in-progress':'In Progress',done:'Done'}[status]||'To Do';
    const statusBg={todo:'var(--g50)','in-progress':'var(--a50)',done:'var(--t50)'}[status];
    const statusCol={todo:'var(--tx2)','in-progress':'var(--a600)',done:'var(--t600)'}[status];
    const pr=prioTypes.find(p=>p.id===s.prio);
    const safeText=(s.text||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const children=renderSpSubItems(tid,s.subtasks||[],depth+1);
    const cid=`sp-cadd-${s.id}`;
    return `<div class="sub-rich-row" id="sub-rich-${s.id}" style="${ml?'margin-left:'+ml+'px;padding-left:8px;border-left:2px solid var(--bd)':''}">
      <div class="sub-rich-chk ${chkCls}" onclick="spTogSub('${tid}','${s.id}')">
        ${isDone?'<i class="fa-solid fa-check" style="font-size:7px;color:#fff"></i>':isIP?'<i class="fa-solid fa-spinner" style="font-size:7px;color:var(--a600)"></i>':''}
      </div>
      <div class="sub-rich-body">
        <span class="sub-rich-title ${isDone?'done':''}" id="sub-span-${s.id}" onclick="spEditSubTitle('${tid}','${s.id}')">${s.text||''}</span>
        <input class="sub-rich-title-inp" id="sub-title-inp-${s.id}" value="${safeText}"
               onblur="spSaveSubTitle('${tid}','${s.id}',this.value)"
               onkeydown="if(event.key==='Enter'){this.blur();}if(event.key==='Escape'){spCancelSubTitle('${s.id}');}">
        <div class="sub-rich-chips">
          <span class="badge" style="background:${statusBg};color:${statusCol}">${statusLabel}</span>
          ${pr?`<span class="badge" style="background:${pr.color}22;color:${pr.color}">${pr.label}</span>`:''}
          ${s.due?`<span class="badge" style="background:var(--b50);color:var(--b600)"><i class="fa-solid fa-calendar-day" style="font-size:9px"></i> ${fmtDate(s.due)}</span>`:''}
          ${s.assignee&&s.assignee!=='me'?`<span class="badge" style="background:var(--p50);color:var(--p600)">${ANAME[s.assignee]||s.assignee}</span>`:''}
        </div>
        <div class="sub-rich-expand" id="sub-exp-${s.id}">
          <div class="sub-exp-row"><span class="sub-exp-lbl">Status</span>
            <select class="fsel" style="font-size:11.5px;padding:2px 8px" onchange="spSaveSubField('${tid}','${s.id}','status',this.value)">
              <option value="todo" ${status==='todo'?'selected':''}>To Do</option>
              <option value="in-progress" ${status==='in-progress'?'selected':''}>In Progress</option>
              <option value="done" ${status==='done'?'selected':''}>Done</option>
            </select>
          </div>
          <div class="sub-exp-row"><span class="sub-exp-lbl">Priority</span>
            <select class="fsel" style="font-size:11.5px;padding:2px 8px" onchange="spSaveSubField('${tid}','${s.id}','prio',this.value)">
              <option value="">— none —</option>
              ${prioTypes.map(p=>`<option value="${p.id}" ${s.prio===p.id?'selected':''}>${p.label}</option>`).join('')}
            </select>
          </div>
          <div class="sub-exp-row"><span class="sub-exp-lbl">Due date</span>
            <input type="date" class="finp" style="font-size:11.5px;padding:2px 8px" value="${s.due||''}" onchange="spSaveSubField('${tid}','${s.id}','due',this.value)">
          </div>
          <div class="sub-exp-row"><span class="sub-exp-lbl">Assignee</span>
            <select class="fsel" style="font-size:11.5px;padding:2px 8px" onchange="spSaveSubField('${tid}','${s.id}','assignee',this.value)">
              ${Object.entries(ANAME).map(([v,l])=>`<option value="${v}" ${(s.assignee||'me')===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="sub-exp-row"><span class="sub-exp-lbl">Notes</span>
            <input class="finp" style="font-size:11.5px;padding:2px 8px;flex:1" value="${(s.notes||'').replace(/"/g,'&quot;')}" placeholder="Add notes…" onchange="spSaveSubField('${tid}','${s.id}','notes',this.value)">
          </div>
        </div>
        ${children?`<div style="margin-top:6px">${children}</div>`:''}
        <div id="${cid}" style="display:none;margin-top:6px;padding:6px 0;border-top:1px solid var(--bd)">
          <input class="finp" id="${cid}-inp" placeholder="Child subtask name…" style="margin-bottom:5px;font-size:12px"
                 onkeydown="if(event.key==='Enter')spSubmitNewSub('${tid}','${s.id}');if(event.key==='Escape')spHideChildAdd('${s.id}')">
          <div style="display:flex;gap:5px">
            <button class="btn btn-gh btn-xs" onclick="spHideChildAdd('${s.id}')">Cancel</button>
            <button class="btn btn-pr btn-xs" onclick="spSubmitNewSub('${tid}','${s.id}')"><i class="fa-solid fa-check"></i> Add</button>
          </div>
        </div>
      </div>
      <div class="sub-rich-actions">
        <button class="ibtn" onclick="spShowChildAdd('${s.id}')" title="Add child subtask"><i class="fa-solid fa-plus" style="font-size:10px"></i></button>
        <button class="ibtn" onclick="spExpandSub('${s.id}')" title="Edit fields"><i class="fa-solid fa-sliders" style="font-size:10px"></i></button>
        <button class="ibtn" onclick="spDeleteSub('${tid}','${s.id}')" title="Delete"><i class="fa-solid fa-trash" style="font-size:10px"></i></button>
      </div>
    </div>`;
  }).join('');
}
function renderSpSubtasks(tid){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const rows=renderSpSubItems(tid,t.subtasks||[],0);
  const addForm=`<div id="sub-add-row" style="display:none;padding:8px 0 4px;border-top:1px solid var(--bd);margin-top:4px">
    <input class="finp" id="sub-add-inp" placeholder="Subtask title…" style="margin-bottom:6px"
           onkeydown="if(event.key==='Enter')spSubmitNewSub('${tid}');if(event.key==='Escape')spHideAddForm()">
    <div style="display:flex;gap:6px">
      <button class="btn btn-gh btn-xs" onclick="spHideAddForm()">Cancel</button>
      <button class="btn btn-pr btn-xs" onclick="spSubmitNewSub('${tid}')"><i class="fa-solid fa-check"></i> Add</button>
    </div>
  </div>`;
  const el=document.getElementById('sp-subtasks');
  if(el) el.innerHTML=(rows||'<div style="font-size:12px;color:var(--tx3);padding:4px 0">No subtasks yet — click + to add one</div>')+addForm;
}
function spShowChildAdd(sid){ const el=document.getElementById('sp-cadd-'+sid); if(el){el.style.display='block';setTimeout(()=>{const i=document.getElementById('sp-cadd-'+sid+'-inp');if(i)i.focus();},20);} }
function spHideChildAdd(sid){ const el=document.getElementById('sp-cadd-'+sid); if(el)el.style.display='none'; }
function spShowAddForm(){
  const f=document.getElementById('sub-add-row'); if(!f)return;
  f.style.display='block';
  setTimeout(()=>{const i=document.getElementById('sub-add-inp');if(i)i.focus();},30);
}
function spHideAddForm(){ const f=document.getElementById('sub-add-row'); if(f)f.style.display='none'; }
function spSubmitNewSub(tid,parentSid){
  const inp=document.getElementById(parentSid?`sp-cadd-${parentSid}-inp`:'sub-add-inp'); if(!inp)return;
  const txt=inp.value.trim(); if(!txt)return;
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const newSub={id:'s'+Date.now(),text:txt,status:'todo',prio:'',due:'',dueTime:'',assignee:'me',notes:'',subtasks:[]};
  if(!parentSid){if(!t.subtasks)t.subtasks=[];t.subtasks.push(newSub);}
  else{const p=findSubInTree(t.subtasks||[],parentSid);if(!p)return;if(!p.subtasks)p.subtasks=[];p.subtasks.push(newSub);}
  fbSet('tasks',tid,t);
  if(parentSid) spHideChildAdd(parentSid); else spHideAddForm();
  renderSpSubtasks(tid); renderTasksView(); renderTeam();
}
function spExpandSub(sid){
  const exp=document.getElementById('sub-exp-'+sid); if(!exp)return;
  exp.classList.toggle('open');
}
function spSaveSubField(tid,sid,field,val){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  s[field]=val; if(field==='status') s.done=val==='done';
  fbSet('tasks',tid,t); closeCellDd();
  renderTasksView(); renderTeam();
  if(activeSp===String(tid)) renderSpSubtasks(tid);
}
function spSubToggleTag(tid,sid,tag){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  if(!s.tags) s.tags=[];
  const i=s.tags.indexOf(tag); if(i>-1) s.tags.splice(i,1); else s.tags.push(tag);
  fbSet('tasks',tid,t);
  const el=document.getElementById('cdd-sub-tg-'+sid);
  if(el){ const cur=s.tags; el.innerHTML=tags.map(tg=>`<div class="cell-dd-item${cur.includes(tg)?' active':''}" onclick="event.stopPropagation();spSubToggleTag('${tid}','${sid}','${tg}')"><i class="fa-solid fa-${cur.includes(tg)?'check':'plus'}" style="font-size:9px;width:11px"></i>${tg}</div>`).join(''); }
}
function cellSetSubDue(tid,sid,dateVal,timeVal){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  s.due=dateVal; s.dueTime=timeVal||'';
  fbSet('tasks',tid,t); closeCellDd();
  renderTasksView(); renderTeam();
  if(activeSp===String(tid)) renderSpSubtasks(tid);
}
function spTogSubStatus(tid,sid){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  const cur=s.status||(s.done?'done':'todo');
  s.status=cur==='todo'?'in-progress':cur==='in-progress'?'done':'todo';
  s.done=s.status==='done';
  fbSet('tasks',tid,t); renderTasksView(); renderTeam();
  if(activeSp===String(tid)) renderSpSubtasks(tid);
}
function spEditSubTitle(tid,sid){
  const span=document.getElementById('sub-span-'+sid);
  const inp=document.getElementById('sub-title-inp-'+sid);
  if(span) span.style.display='none';
  if(inp){inp.style.display='block';inp.focus();inp.select();}
}
function spCancelSubTitle(sid){
  const span=document.getElementById('sub-span-'+sid);
  const inp=document.getElementById('sub-title-inp-'+sid);
  if(span) span.style.display='';
  if(inp) inp.style.display='none';
}
function spSaveSubTitle(tid,sid,val){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  if(val.trim()) s.text=val.trim();
  fbSet('tasks',tid,t); renderSpSubtasks(tid); renderTasksView(); renderTeam();
}
function cellEditTaskTitle(tid){
  const span=document.getElementById('tt-span-'+tid);
  const inp=document.getElementById('tt-inp-'+tid);
  if(span) span.style.display='none';
  if(inp){inp.style.display='inline-block';inp.focus();inp.select();}
}
function cellCancelTaskTitle(tid){
  const span=document.getElementById('tt-span-'+tid);
  const inp=document.getElementById('tt-inp-'+tid);
  if(span) span.style.display='';
  if(inp) inp.style.display='none';
}
function cellSaveTaskTitle(tid,val){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  if(!val.trim()) return cellCancelTaskTitle(tid);
  t.title=val.trim(); fbSet('tasks',tid,t); renderTasksView(); renderTeam();
}
function cellEditSubTblTitle(tid,sid){
  const span=document.getElementById('sub-tbl-span-'+sid);
  const inp=document.getElementById('sub-tbl-inp-'+sid);
  if(span) span.style.display='none';
  if(inp){inp.style.display='inline-block';inp.focus();inp.select();}
}
function cellCancelSubTblTitle(sid){
  const span=document.getElementById('sub-tbl-span-'+sid);
  const inp=document.getElementById('sub-tbl-inp-'+sid);
  if(span) span.style.display='';
  if(inp) inp.style.display='none';
}
function cellSaveSubTblTitle(tid,sid,val){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  if(!val.trim()) return cellCancelSubTblTitle(sid);
  s.text=val.trim(); fbSet('tasks',tid,t); renderTasksView(); renderTeam(); if(activeSp===String(tid))renderSpSubtasks(tid);
}
function spDeleteSub(tid,sid){
  if(!confirm('Delete this subtask?')) return;
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  removeSubFromTree(t.subtasks||[],sid);
  fbSet('tasks',tid,t); renderTasksView(); renderTeam();
  if(activeSp===String(tid)) renderSpSubtasks(tid);
}
function addSubtask(){ spShowAddForm(); }
function quickOpenSubAdd(id){ openSp(id); setTimeout(()=>spShowAddForm(),60); }
function spTogSub(tid,sid){
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  const s=findSubInTree(t.subtasks,sid); if(!s)return;
  const cur=s.status||(s.done?'done':'todo');
  s.status=cur==='todo'?'in-progress':cur==='in-progress'?'done':'todo';
  s.done=s.status==='done';
  fbSet('tasks',tid,t); renderSpSubtasks(tid); renderTasksView(); renderTeam();
}

/* ════════════════════════════════════════════════
   TASK MODAL
════════════════════════════════════════════════ */
function populatePrioSelect(){ const sel=document.getElementById('t-prio'); if(!sel)return; sel.innerHTML=prioTypes.map(p=>`<option value="${p.id}">${p.label}</option>`).join(''); }
function renderTagsInModal(){ const tr=document.getElementById('t-tags'); if(!tr)return; tr.innerHTML=tags.map(tg=>`<span class="ftag" onclick="this.classList.toggle('on')" data-tag="${tg}">${tg}</span>`).join(''); }

function openTaskModal(defaultType){
  document.getElementById('t-edit-id').textContent='';
  document.getElementById('t-title').value='';
  document.getElementById('t-notes').value='';
  document.getElementById('t-carry').checked=false;
  document.getElementById('t-gcal').checked=false;
  document.getElementById('t-due').value=ds(dayForOff(dayOff));
  document.getElementById('t-due-time').value='';
  document.getElementById('mo-task-title').textContent='New Task';
  populatePrioSelect(); populateTypeSelect();
  document.getElementById('t-status').value='todo';
  if(defaultType) document.getElementById('t-type').value=defaultType;
  renderTagsInModal();
  const cf=document.getElementById('t-custom-fields');
  if(cf) cf.innerHTML=customCols.map(c=>{
    if(c.type==='checkbox') return`<div class="frow"><label class="fcheck"><input type="checkbox" id="tcf-${c.id}"> ${c.name}</label></div>`;
    return`<div class="frow"><label class="flbl">${c.name}</label><input class="finp" id="tcf-${c.id}" type="${c.type==='number'?'number':'text'}" placeholder="${c.name}…"></div>`;
  }).join('');
  document.getElementById('mo-task').classList.add('on');
  setTimeout(()=>document.getElementById('t-title').focus(),80);
}

function openEditModal(id){
  const tid=id||activeSp; if(!tid)return;
  const t=tasks.find(t=>String(t.id)===String(tid)); if(!t)return;
  openTaskModal(t.type);
  document.getElementById('mo-task-title').textContent='Edit Task';
  document.getElementById('t-edit-id').textContent=tid;
  document.getElementById('t-title').value=t.title;
  document.getElementById('t-notes').value=t.notes||'';
  document.getElementById('t-type').value=t.type;
  document.getElementById('t-due').value=t.due||'';
  document.getElementById('t-due-time').value=t.dueTime||'';
  document.getElementById('t-assignee').value=t.assignee||'me';
  document.getElementById('t-carry').checked=t.carryover;
  document.getElementById('t-gcal').checked=t.gcal||false;
  document.getElementById('t-status').value=t.status||'todo';
  populatePrioSelect(); document.getElementById('t-prio').value=t.prio;
  renderTagsInModal();
  setTimeout(()=>{document.querySelectorAll('#t-tags .ftag').forEach(el=>{if(t.tags?.includes(el.dataset.tag))el.classList.add('on');});},50);
  const cf=document.getElementById('t-custom-fields');
  if(cf) customCols.forEach(c=>{const el=document.getElementById('tcf-'+c.id);if(el&&t.custom?.[c.id])el.value=t.custom[c.id];});
}

function saveTask(){
  const title=document.getElementById('t-title').value.trim(); if(!title)return;
  const editId=document.getElementById('t-edit-id').textContent;
  const selTags=[...document.querySelectorAll('#t-tags .ftag.on')].map(e=>e.dataset.tag);
  const customData={};
  customCols.forEach(c=>{ const el=document.getElementById('tcf-'+c.id); if(el)customData[c.id]=c.type==='checkbox'?el.checked:el.value; });
  const data={title,notes:document.getElementById('t-notes').value,type:document.getElementById('t-type').value,prio:document.getElementById('t-prio').value,status:document.getElementById('t-status').value,due:document.getElementById('t-due').value,dueTime:document.getElementById('t-due-time')?.value||'',assignee:document.getElementById('t-assignee').value,carryover:document.getElementById('t-carry').checked,gcal:document.getElementById('t-gcal').checked,tags:selTags,custom:customData};
  if(data.carryover){
    if(editId){ const existing=tasks.find(t=>String(t.id)===editId); if(existing&&!existing.carryover)data.carryoverSince=todayStr(); else if(existing) data.carryoverSince=existing.carryoverSince||todayStr(); }
    else data.carryoverSince=todayStr();
  } else { data.carryoverSince=null; }
  const taskId = editId||('t'+Date.now());
  if(editId){ const idx=tasks.findIndex(t=>String(t.id)===editId); if(idx>-1)tasks[idx]={...tasks[idx],...data}; }
  else { const newTask={id:taskId,status:data.status||'todo',subtasks:[],created:Date.now(),...data}; tasks.unshift(newTask); }
  fbSet('tasks',taskId, editId?tasks.find(t=>String(t.id)===editId):{id:taskId,status:'open',subtasks:[],created:Date.now(),...data});
  closeMoDirect('mo-task');
  if(activeSp&&activeSp===editId) openSp(editId);
  if(data.gcal&&!editId&&data.due&&gcalConnected){
    const endHr=data.dueTime?`${String((parseInt(data.dueTime.split(':')[0])+1)%24).padStart(2,'0')}:${data.dueTime.split(':')[1]}`:'';
    createGCalEvent({title:data.title,date:data.due,start:data.dueTime,end:endHr,notes:data.notes,location:''}).then(r=>{
      if(r&&r.id){ const idx=tasks.findIndex(t=>String(t.id)===taskId); if(idx>-1){tasks[idx].gcalEventId=r.id;fbSet('tasks',taskId,tasks[idx]);} }
    });
  }
}

/* ════════════════════════════════════════════════
   EVENT MODAL
════════════════════════════════════════════════ */
function openEventModal(){ document.getElementById('e-date').value=ds(getToday()); document.getElementById('mo-event').classList.add('on'); }
function saveEvent(){
  const title=document.getElementById('e-title').value.trim(); if(!title)return;
  const newEvent={id:'e'+Date.now(),title,date:document.getElementById('e-date').value,start:document.getElementById('e-start').value,end:document.getElementById('e-end').value,type:document.getElementById('e-type').value,link:document.getElementById('e-link').value,location:document.getElementById('e-location').value,attendees:document.getElementById('e-attendees').value,notes:document.getElementById('e-notes').value,gcal:document.getElementById('e-gcal').checked};
  events.push(newEvent);
  fbSet('events',newEvent.id,newEvent);
  closeMoDirect('mo-event');
  if(newEvent.gcal&&gcalConnected){
    createGCalEvent({title:newEvent.title,date:newEvent.date,start:newEvent.start,end:newEvent.end,notes:newEvent.notes,location:newEvent.location}).then(r=>{
      if(r&&r.id){ const idx=events.findIndex(e=>e.id===newEvent.id); if(idx>-1){events[idx].gcalEventId=r.id;fbSet('events',newEvent.id,events[idx]);} }
    });
  }
  renderSchedule();
}

/* ════════════════════════════════════════════════
   MODAL / VIEW HELPERS
════════════════════════════════════════════════ */
function closeMo(id,e){ if(e.target===document.getElementById(id)) closeMoDirect(id); }
function closeMoDirect(id){ document.getElementById(id).classList.remove('on'); }
/* ════════════════════════════════════════════════
   GOOGLE CALENDAR INTEGRATION
════════════════════════════════════════════════ */
function isGCalTokenValid(){ return gcalToken && Date.now() < gcalTokenExpiry - 60000; }

function updateGCalStatus(){
  const dot=document.getElementById('gd'), lbl=document.getElementById('gl'), btn=document.getElementById('gcal-btn');
  if(!dot||!lbl||!btn)return;
  if(gcalConnected){
    dot.classList.add('on'); lbl.textContent='GCal connected';
    btn.innerHTML='<i class="fa-brands fa-google" style="margin-right:4px"></i> Disconnect';
    btn.onclick=disconnectGCal;
  } else {
    dot.classList.remove('on'); lbl.textContent='GCal not connected';
    btn.innerHTML='<i class="fa-brands fa-google" style="margin-right:4px"></i> Connect GCal';
    btn.onclick=connectGCal;
  }
}

function connectGCal(){
  if(gcalClientId){ gcalRequestToken(); return; }
  const hint=document.getElementById('gcal-origin-hint'); if(hint)hint.textContent=location.origin;
  document.getElementById('mo-gcal-setup').classList.add('on');
  setTimeout(()=>document.getElementById('gcal-client-id-inp').focus(), 80);
}

function disconnectGCal(){
  if(!confirm('Disconnect Google Calendar? Your tasks and events will stay.'))return;
  if(tokenClient && typeof google!=='undefined') try{ google.accounts.oauth2.revoke(gcalToken,()=>{}); }catch(e){}
  gcalToken=null; gcalTokenExpiry=0; gcalConnected=false; gcalEventsCache={}; tokenClient=null;
  localStorage.removeItem('gcal_access_token'); localStorage.removeItem('gcal_token_expiry');
  updateGCalStatus();
  const av=document.querySelector('.view.on')?.id?.replace('view-','');
  if(av==='calendar')renderCalendar(); else if(av==='schedule')renderSchedule();
}

function saveGCalClientId(){
  const id=document.getElementById('gcal-client-id-inp').value.trim(); if(!id)return;
  gcalClientId=id; localStorage.setItem('gcal_client_id',id);
  closeMoDirect('mo-gcal-setup'); gcalRequestToken();
}

function gcalRequestToken(){
  if(!gcalClientId){ connectGCal(); return; }
  if(typeof google==='undefined'||!google.accounts?.oauth2){ alert('Google Identity Services not loaded yet — please wait a moment and try again.'); return; }
  if(!tokenClient){
    try{
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:gcalClientId, scope:'https://www.googleapis.com/auth/calendar',
        callback:handleGCalToken,
        error_callback:(err)=>{ console.error('GCal auth error',err); alert('Authorization failed. Make sure:\n• The Client ID is correct\n• '+location.origin+' is in Authorized JS Origins'); }
      });
    } catch(e){ alert('GCal init failed: '+e.message); return; }
  }
  tokenClient.requestAccessToken();
}

function handleGCalToken(resp){
  if(resp.error){ console.error('GCal token error',resp); return; }
  gcalToken=resp.access_token; gcalTokenExpiry=Date.now()+(resp.expires_in*1000);
  localStorage.setItem('gcal_access_token',gcalToken); localStorage.setItem('gcal_token_expiry',gcalTokenExpiry);
  gcalConnected=true; gcalEventsCache={};
  updateGCalStatus();
  const av=document.querySelector('.view.on')?.id?.replace('view-','');
  if(av==='calendar')renderCalendar(); else if(av==='schedule')renderSchedule();
}

async function fetchGCalEvents(dateStr){
  if(!isGCalTokenValid())return[];
  if(gcalEventsCache[dateStr])return gcalEventsCache[dateStr];
  try{
    const [y,m,d]=dateStr.split('-').map(Number);
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tMin=new Date(y,m-1,d,0,0,0).toISOString(), tMax=new Date(y,m-1,d,23,59,59).toISOString();
    const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}&singleEvents=true&orderBy=startTime&timeZone=${encodeURIComponent(tz)}`;
    const res=await fetch(url,{headers:{Authorization:`Bearer ${gcalToken}`}});
    if(res.status===401){ gcalToken=null; gcalConnected=false; updateGCalStatus(); return[]; }
    const data=await res.json(); gcalEventsCache[dateStr]=data.items||[]; return gcalEventsCache[dateStr];
  } catch(e){ return[]; }
}

async function fetchGCalMonthEvents(year,month){
  if(!isGCalTokenValid())return[];
  const key=`${year}-${String(month+1).padStart(2,'0')}`;
  if(gcalEventsCache[key])return gcalEventsCache[key];
  try{
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tMin=new Date(year,month,1).toISOString(), tMax=new Date(year,month+1,0,23,59,59).toISOString();
    const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}&singleEvents=true&orderBy=startTime&maxResults=250&timeZone=${encodeURIComponent(tz)}`;
    const res=await fetch(url,{headers:{Authorization:`Bearer ${gcalToken}`}});
    if(res.status===401){ gcalToken=null; gcalConnected=false; updateGCalStatus(); return[]; }
    const data=await res.json(); gcalEventsCache[key]=data.items||[]; return gcalEventsCache[key];
  } catch(e){ return[]; }
}

function normalizeGCalItem(item){
  const startDt=item.start?.dateTime||item.start?.date||'', endDt=item.end?.dateTime||item.end?.date||'';
  const startTime=startDt.includes('T')?startDt.slice(11,16):'';
  const endTime=endDt.includes('T')?endDt.slice(11,16):'';
  const dateStr=startDt.includes('T')?startDt.slice(0,10):startDt;
  return{ id:'gcal-'+item.id, gcalId:item.id, title:item.summary||'(No title)', date:dateStr,
    start:startTime, end:endTime, type:'gcal', source:'gcal',
    link:item.hangoutLink||item.htmlLink||'', location:item.location||'',
    attendees:(item.attendees||[]).map(a=>a.displayName||a.email).join(', '),
    notes:item.description||'', gcal:true };
}

async function createGCalEvent({title,date,start,end,notes,location}){
  if(!isGCalTokenValid())return null;
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body={ summary:title, description:notes||'', location:location||'',
    start:start?{dateTime:`${date}T${start}:00`,timeZone:tz}:{date},
    end:end?{dateTime:`${date}T${end}:00`,timeZone:tz}:{date} };
  try{
    const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
      method:'POST', headers:{Authorization:`Bearer ${gcalToken}`,'Content-Type':'application/json'},
      body:JSON.stringify(body)});
    const data=await res.json();
    delete gcalEventsCache[date];
    const mk=`${date.slice(0,4)}-${date.slice(5,7)}`; delete gcalEventsCache[mk];
    return data;
  } catch(e){ return null; }
}

async function deleteGCalEvent(gcalEventId){
  if(!isGCalTokenValid()||!gcalEventId)return;
  try{ await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gcalEventId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${gcalToken}`}}); }
  catch(e){}
}
function globalSearch(q){}

const TITLES={tasks:'My Tasks',team:'Team Tasks',week:'Week View',milestones:'Important Dates',calendar:'Google Calendar',schedule:'Daily Schedule',customize:'Customize'};
function sv(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  document.querySelectorAll('.nav').forEach(n=>n.classList.remove('on'));
  document.getElementById('view-'+name).classList.add('on');
  document.getElementById('tb-title').textContent=TITLES[name]||name;
  const navOrder=['tasks','team','week','milestones','calendar','schedule','customize'];
  const navs=document.querySelectorAll('.nav');
  const i=navOrder.indexOf(name); if(i>-1&&navs[i])navs[i].classList.add('on');
  closeSp(); closeAllPanels();
  const renders={tasks:()=>{updateDayLabel();renderTasksView();},team:renderTeam,week:renderWeek,milestones:renderMs,calendar:renderCalendar,schedule:renderSchedule,customize:renderCustomize};
  if(renders[name])renders[name]();
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){['mo-task','mo-event','mo-col','mo-prio','mo-type','mo-ms','mo-gcal-setup'].forEach(closeMoDirect);closeSp();closeAllPanels();}
  if(e.key==='n'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA') openTaskModal();
  if(e.key==='/'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();document.getElementById('task-search-inp')?.focus();}
});

/* ════════════════════════════════════════════════
   INIT — Firebase first, then UI
════════════════════════════════════════════════ */
async function init(){
  try {
    document.getElementById('fb-loading-txt').textContent = 'Loading settings…';
    await fbLoadSettings();

    document.getElementById('fb-loading-txt').textContent = 'Checking data…';
    await seedIfEmpty();

    document.getElementById('fb-loading-txt').textContent = 'Starting live sync…';
    startListeners();

    // UI bootstrap (listeners will re-render, but set up chrome now)
    updateDayLabel();
    populateFpPrioChips();
    populateFpTagChips();
    renderSortPanel('tasks');
    renderSortPanel('team');
    populateTypeSelect();

    // Hide loading overlay
    const overlay = document.getElementById('fb-loading');
    overlay.classList.add('hidden');
    setTimeout(()=>overlay.style.display='none', 350);
    updateGCalStatus();

  } catch(err) {
    console.error('Init error:', err);
    document.getElementById('fb-error').style.display='block';
    document.getElementById('fb-loading-txt').textContent = 'Connection failed';
  }
}

init();
function openColManager(){ renderColMgrList(); document.getElementById('mo-col-mgr').classList.add('on'); }
function renderColMgrList(){
  const el=document.getElementById('col-mgr-list'); if(!el)return;
  const defRows=colDefs.filter(c=>!c.fixed).map(c=>`
    <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--bd)">
      <input type="checkbox" ${c.hidden?'':'checked'} onchange="toggleColVis('${c.id}',this.checked)" style="accent-color:var(--p600);width:14px;height:14px;cursor:pointer;flex-shrink:0">
      <input class="finp" value="${c.label}" style="flex:1;padding:4px 7px;font-size:12.5px" onchange="renameColDef('${c.id}',this.value)">
      <span class="badge btag" style="flex-shrink:0;opacity:.6">built-in</span>
    </div>`).join('');
  const custRows=customCols.map((c,i)=>`
    <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--bd)">
      <input type="checkbox" ${c.hidden?'':'checked'} onchange="toggleCustomColVis(${i},this.checked)" style="accent-color:var(--p600);width:14px;height:14px;cursor:pointer;flex-shrink:0">
      <input class="finp" value="${c.name}" style="flex:1;padding:4px 7px;font-size:12.5px" onchange="renameCustomCol(${i},this.value)">
      <span class="badge btag" style="flex-shrink:0;opacity:.6">${c.type}</span>
      <button class="ibtn" onclick="removeColInline(${i});renderColMgrList()" title="Remove"><i class="fa-solid fa-trash" style="font-size:11px;color:var(--r600)"></i></button>
    </div>`).join('');
  el.innerHTML=defRows+custRows;
}
function toggleColVis(id,visible){ const c=colDefs.find(c=>c.id===id);if(!c)return;c.hidden=!visible;fbSaveSettings();renderTasksView();renderTeam(); }
function toggleCustomColVis(i,visible){ if(!customCols[i])return;customCols[i].hidden=!visible;fbSaveSettings();renderTasksView();renderTeam(); }
function renameColDef(id,name){ const c=colDefs.find(c=>c.id===id);if(!c||!name.trim())return;c.label=name.trim();fbSaveSettings();renderTasksView();renderTeam(); }
function renameCustomCol(i,name){ if(!customCols[i]||!name.trim())return;customCols[i].name=name.trim();fbSaveSettings();renderTasksView();renderTeam(); }
