/* GRITTY OS model: a read-only projection of StarNet records onto departments. Runtime records stay authoritative.
   Pure (no DOM, no fetch, no clock unless passed), so it runs headless: node plugins/gritty-os/test/model.test.js */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GrittyOSModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const departments=[
  {id:'operations',name:'Command & Operations',rooms:['COMMAND','BUILD LANE','OPERATIONS INTELLIGENCE'],status:'manual',agents:['agent','chief','writer','researcher','treasurer','harvester','provisioner','portfolio-strategist','tele'],lines:['p286','p319','p340']},
  {id:'etsy',name:'Etsy',rooms:['ETSY STUDIO'],status:'artwork paused',agents:['drafter','designer','publisher','copywriter','treasurer-2','etsy-visual','etsy-qa','etsy-perf'],lines:['p343']},
  {id:'services',name:'Fiverr / Services',rooms:['FIVERR SERVICES'],status:'inactive',agents:['service-lead','service-intake','service-producer','service-qa','service-delivery','service-perf'],lines:[]},
  {id:'youtube',name:'YouTube',rooms:['YOUTUBE STUDIO'],status:'inactive',agents:['video-lead','video-research','video-writer','video-producer','video-package','video-qa','video-perf'],lines:[]},
  {id:'lab',name:'Market Lab',rooms:['MARKET LAB'],status:'dormant',agents:['analyst','strategist','analyst-2'],lines:['p313']}
 ];
 // Records that match no department land here, so nothing silently disappears from the dashboard.
 const UNMAPPED={id:'unmapped',name:'Unmapped',rooms:[],status:'not in any department',agents:[],lines:[]};
 const businesses=[{id:'etsy:68552376',departmentId:'etsy',name:'GRITTYdesigners',platform:'Etsy',externalId:'68552376',url:'https://www.etsy.com/shop/GRITTYdesigners',source:'Local shop audit, October 14, 2026; live metrics not connected'}];
 const DAY=864e5;

 function department(id){return id===UNMAPPED.id?UNMAPPED:departments.find(d=>d.id===id)||null;}
 function roomDepartment(room){return departments.find(d=>d.rooms.includes(String(room?.name||'').toUpperCase()))||null;}
 function businessOf(row){return row?.businessId||row?.storeId||row?.metadata?.businessId||null;}
 function agentIdOf(a){return a?.id||a?.agentId||'';}
 // the one timestamp a row is sorted and windowed by (runs carry ts; jobs startedAt/endedAt; outputs createdAt/updatedAt)
 function when(row){const t=Number(row?.endedAt||row?.ts||row?.updatedAt||row?.startedAt||row?.createdAt)||0;return t>0?t:0;}
 const newestFirst=(a,b)=>when(b)-when(a);

 /* Outcomes. Run rows carry `reason` (runstore REASONS), line jobs carry `status` (linejobs STATUSES), outputs carry
    `status` (pending/kept/failed). Each maps to one display state and one tone for the badge. */
 const STATES={
  done:'completed',ok:'completed',complete:'completed',completed:'completed',produced:'completed',shipped:'completed',delivered:'completed',built:'completed',kept:'kept',
  error:'failed',failed:'failed',problem:'failed',timeout:'failed',refusal:'refused',
  cancel:'cancelled',cancelled:'cancelled',canceled:'cancelled',stopped:'stopped',discarded:'discarded',
  interrupted:'interrupted',empty:'empty result',
  max_iters:'blocked',max_turns:'blocked',budget:'blocked',budget_exceeded:'blocked',blocked:'blocked',
  clarifying:'waiting-input',waiting:'waiting-input','waiting-input':'waiting-input','waiting-review':'waiting-review','waiting-approval':'waiting-approval',
  queued:'queued',ready:'ready',running:'running',pending:'pending review','needs-review':'needs owner review',
  // an output's `produced` only means files were recorded: not a completion verdict, not owner approval
  produced:'files recorded'
 };
 const TONES={completed:'ok',kept:'ok',failed:'bad',refused:'bad',interrupted:'bad',blocked:'gold','empty result':'gold','waiting-input':'gold','waiting-review':'gold','waiting-approval':'gold','pending review':'gold','needs owner review':'gold',running:'',queued:'',ready:''};
 function state(row){
  const raw=String(row?.status||row?.reason||row?.state||'').toLowerCase();
  return STATES[raw]||(when(row)&&row?.endedAt?'finished, outcome unclassified':raw?raw:'unknown');
 }
 function tone(s){return TONES[s]??'';}
 const isFailure=row=>['failed','refused','interrupted'].includes(state(row));

 /* Cost. Subscription (unmetered) runs have no dollar figure. An interrupted run whose charge was never booked
    (spendUnknown) reads usd:0 but is NOT free: it counts as unknown, never as $0. */
 function usd(rows){const unique=new Map();for(const r of rows||[]){const id=r.runId||r.id;if(id&&!unique.has(id))unique.set(id,r);}let amount=0,unknown=0,subscription=0;for(const r of unique.values()){if(r.unmetered){subscription++;continue;}if(r.spendUnknown!==true&&typeof r.usd==='number'&&Number.isFinite(r.usd)&&r.usd>=0)amount+=r.usd;else unknown++;}return{amount,unknown,subscription,count:unique.size};}
 function within(rows,ms,now){const from=now-ms;return(rows||[]).filter(r=>when(r)>=from);}
 function spend(runs,now){return{day:usd(within(runs,DAY,now)),week:usd(within(runs,7*DAY,now)),all:usd(runs)};}

 function mappedAgentIds(){return new Set(departments.flatMap(d=>d.agents));}
 function mappedLines(){return new Set(departments.flatMap(d=>d.lines));}

 function scope(snapshot,departmentId,businessId){
  const d=department(departmentId);if(!d)return null;
  const unmapped=d===UNMAPPED,known=mappedAgentIds(),lines=mappedLines();
  const ids=unmapped?null:new Set(d.agents);
  const belongs=r=>{const id=r.agentId||'';return unmapped?!!id&&!known.has(id):ids.has(id);};
  const onLine=j=>unmapped?!lines.has(j.line):d.lines.includes(j.line);
  const store=r=>!businessId||businessOf(r)===businessId;
  const runs=(snapshot.runs||[]).filter(r=>belongs(r)&&store(r)).sort(newestFirst);
  const jobs=(snapshot.jobs||[]).filter(r=>onLine(r)&&store(r)).sort(newestFirst);
  const outputs=(snapshot.outputs||[]).filter(r=>belongs(r)&&store(r)).sort(newestFirst);
  const agents=(snapshot.agents||[]).filter(a=>belongs({agentId:agentIdOf(a)}));
  const present=new Set((snapshot.agents||[]).map(agentIdOf));
  const missing=unmapped?[]:d.agents.filter(id=>!present.has(id));   // listed here, but no such agent in the save
  const unassigned=(snapshot.runs||[]).filter(r=>belongs(r)&&!businessOf(r)).length;
  const agentIds=new Set(agents.map(agentIdOf));
  const schedules=((snapshot.cron&&snapshot.cron.jobs)||[]).filter(j=>j&&(belongs(j)||(j.runsLine&&onLine({line:j.runsLine}))));
  const lineStats=((snapshot.lineStats&&snapshot.lineStats.lines)||[]).filter(l=>onLine({line:l.lineId}));
  const latest=new Map();for(const r of runs)if(!latest.has(r.agentId))latest.set(r.agentId,r);
  return{department:d,businesses:businesses.filter(b=>b.departmentId===d.id),runs,jobs,outputs,agents:agents.sort((a,b)=>isLead(agentIdOf(b))-isLead(agentIdOf(a))),agentIds,schedules,lineStats,missing,latest,cost:usd(runs),spend:spend(runs,snapshot.at||Date.now()),unassigned,metrics:{revenue:null,orders:null},failures:runs.filter(isFailure)};
 }
 // the Unmapped tab only shows up when something actually falls outside every department
 function hasUnmapped(snapshot){const s=scope(snapshot,UNMAPPED.id,'');return!!(s.agents.length||s.runs.length||s.jobs.length);}

 // carried over from the built-in GRITTY OS (source recovery package, October 27, 2026)
 const leads=['agent','chief','drafter','service-lead','video-lead'];
 function isLead(id){return leads.includes(id);}
 function agentDepartment(id){return departments.find(d=>d.agents.includes(id))||null;}
 function matches(record,query){if(!query)return true;return[record.name,record.title,record.sessionTitle,record.id,record.runId,record.agentId,record.line,...(record.files||[]).map(f=>f.path)].join(' ').toLowerCase().includes(String(query).toLowerCase());}
 function previewKind(file){const name=String(file?.path||'');if(file?.preview==='image'||/\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(name))return'image';if(file?.preview==='markdown'||/\.md$/i.test(name))return'markdown';if(file?.preview==='csv'||/\.csv$/i.test(name))return'csv';if(/\.(txt|json|log|html?|css|js)$/i.test(name))return'text';return'file';}
 function outputKind(output){const files=output?.files||[];if(files.some(f=>/\.(zip|7z|tar|gz)$/i.test(f.path||'')))return'Packages';if(files.some(f=>previewKind(f)==='image'))return'Visuals';if(files.some(f=>/\.(csv|xlsx?|json)$/i.test(f.path||'')))return'Data';return'Documents';}
 const OUTPUT_KINDS=['Visuals','Documents','Data','Packages'];
 function outputOrigin(o){if(o?.source==='local-review')return o.provenance==='starnet-workflow'?'StarNet workflow review':'Local review artifact';if(o?.source==='workflow')return'Workflow record';if(o?.source==='workshop')return'Workshop build';if(o?.source==='run')return'Agent-run record';return o?.source?String(o.source):'Origin not classified';}
 function scheduleState(j){if(!j)return'unknown';if(j.inFlight)return'running';if(j.enabled===false||j.state==='paused')return'paused';if(j.state==='error'||j.lastStatus==='error')return'failed';if(j.state==='completed')return'completed';return'scheduled';}

 function safeFile(url){if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//')||url.includes('\\'))return false;try{const u=new URL(url,'http://local');return u.origin==='http://local'&&(u.pathname==='/api/file'||u.pathname.startsWith('/workshop-run/'));}catch{return false;}}
 function safeLink(url){try{return new URL(url).protocol==='https:';}catch{return false;}}
 function money(n){return n==null||!Number.isFinite(n)?'Unknown':'$'+n.toFixed(2);}
 function ago(t,now){if(!t)return'never';const s=Math.max(0,Math.round((now-t)/1000));if(s<60)return s+'s ago';const m=Math.round(s/60);if(m<60)return m+'m ago';const h=Math.round(m/60);if(h<48)return h+'h ago';return Math.round(h/24)+'d ago';}

 return{leads,isLead,agentDepartment,matches,previewKind,outputKind,OUTPUT_KINDS,outputOrigin,scheduleState,departments,UNMAPPED,businesses,department,roomDepartment,businessOf,agentIdOf,when,state,tone,isFailure,usd,spend,scope,hasUnmapped,safeFile,safeLink,money,ago,DAY};
});
