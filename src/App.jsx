import { useState, useEffect, useCallback, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot,
         addDoc, deleteDoc, updateDoc, serverTimestamp, query, orderBy, getDocs
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// ─── Firebase Config ──────────────────────────────────────────────
// ── Google Calendar Configuración ────────────────────────────────
const GCAL_CLIENT_ID = "532891287117-do4egt1ssit9eqmfg6ugtvfkal361d1o.apps.googleusercontent.com";
const GCAL_SCOPES = "https://www.googleapis.com/auth/calendar";
const GCAL_DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";

// ── EmailJS Configuración ─────────────────────────────────────────
const EMAILJS_CONFIG = {
  serviceId: "service_4vak30q",
  templateProfesor: "template_2dwd6gs",
  templateAlumno: "template_1npsgx8",
  publicKey: "_ylIbA5NuK_OsByYY",
};

// ─── Cargar jsPDF dinámicamente ──────────────────────────────────
function cargarJsPDF(){
  if(window.jspdf) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error("jsPDF no cargó"));
    document.head.appendChild(s);
  });
}

async function generarPDFClase(clase, alumnoNombre){
  await cargarJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;

  // Paleta GCR + PGA
  const VERDE = [15, 80, 30];
  const AZUL  = [0, 48, 87];
  const DORADO= [180, 140, 60];
  const BLANCO= [255, 255, 255];
  const GRIS  = [240, 242, 244];

  // Cabecera azul marino
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 35, "F");
  doc.setFillColor(...DORADO);
  doc.rect(0, 35, W, 3, "F");
  doc.setFillColor(...VERDE);
  doc.rect(0, 38, W, 16, "F");

  // Logos (GCR: proporción ~1:1.5; PGA: cuadrado)
  try { doc.addImage(LOGO_GCR_PDF, "JPEG", 8, 2, 15, 23); } catch(e){}
  try { doc.addImage(LOGO_PGA, "JPEG", W-30, 3, 22, 22); } catch(e){}

  doc.setTextColor(...BLANCO);
  doc.setFontSize(18); doc.setFont("helvetica","bold");
  doc.text("GOLF CIUDAD REAL C.D.", W/2, 14, {align:"center"});
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text("PGA de España  ·  Academia Profesional de Golf", W/2, 22, {align:"center"});
  doc.setFontSize(8);
  doc.text("Jugador Profesional y Técnico Deportivo de Golf  ·  PGA Nº 1908P", W/2, 29, {align:"center"});
  doc.setFontSize(12); doc.setFont("helvetica","bold");
  doc.text("RESUMEN DE CLASE", W/2, 50, {align:"center"});

  y = 62;

  // Datos de la clase
  doc.setTextColor(30,30,30);
  doc.setFontSize(11);
  const fmtISO2 = (iso) => { if(!iso) return ""; const p=iso.split("-"); return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:iso; };
  const filas = [
    ["Alumno:", alumnoNombre],
    ["Fecha:", fmtISO2(clase.fecha) || "—"],
    ["Hora:", clase.horaInicio || clase.hora || "—"],
    ["Duracion:", (clase.duracion||"60")+" min"],
    ["Tipo:", clase.tipo || "—"],
    ["Zona:", clase.zona || "—"],
    ["Asistencia:", clase.asistio ? "Asistio" : "Pendiente"],
  ];
  filas.forEach(([k,v],i)=>{
    const even = i%2===0;
    doc.setFillColor(...(even ? [240,242,244] : [255,255,255]));
    doc.rect(15, y-4, W-30, 7, "F");
    doc.setFillColor(180,140,60);
    doc.rect(15, y-4, 2, 7, "F");
    doc.setFont("helvetica","bold"); doc.setTextColor(0,48,87);
    doc.text(k, 20, y+0.5);
    doc.setFont("helvetica","normal"); doc.setTextColor(30,30,30);
    doc.text(String(v), 65, y+0.5);
    y += 7;
  });

  if(clase.contenido){
    y += 3;
    doc.setFont("helvetica","bold"); doc.text("Contenido / Notas:", 15, y);
    y += 6;
    doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(clase.contenido, W-30);
    doc.text(lines, 15, y);
    y += lines.length * 5 + 4;
  }

  // Pie de página
  doc.setFillColor(...DORADO);
  doc.rect(0, H-13, W, 2, "F");
  doc.setFillColor(...AZUL);
  doc.rect(0, H-11, W, 11, "F");
  doc.setTextColor(...BLANCO);
  doc.setFontSize(7); doc.setFont("helvetica","normal");
  doc.text("Golf Ciudad Real C.D.  ·  PGA de España  ·  Documento confidencial", W/2, H-5, {align:"center"});

  doc.save("clase-" + (clase.fecha||"golf") + "-" + alumnoNombre.replace(/\s+/g,"_") + ".pdf");
}

async function generarPDFInforme(rpt, alumnoNombre){
  await cargarJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 0;

  // Paleta: verde GCR + azul marino PGA + dorado PGA
  const VERDE = [15, 80, 30];      // Verde oscuro Golf Ciudad Real
  const AZUL  = [0, 48, 87];       // Azul marino PGA España
  const DORADO= [180, 140, 60];    // Dorado PGA España
  const BLANCO= [255, 255, 255];
  const GRIS  = [240, 242, 244];

  // ── CABECERA ─────────────────────────────────────────────────────
  // Franja azul marino PGA
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 38, "F");

  // Franja dorada decorativa
  doc.setFillColor(...DORADO);
  doc.rect(0, 38, W, 3, "F");

  // Franja verde GCR
  doc.setFillColor(...VERDE);
  doc.rect(0, 41, W, 18, "F");

  // Logos en cabecera (GCR: proporción ~1:1.5; PGA: cuadrado)
  try { doc.addImage(LOGO_GCR_PDF, "JPEG", 8, 3, 15, 23); } catch(e){}
  try { doc.addImage(LOGO_PGA, "JPEG", W-30, 4, 22, 22); } catch(e){}

  // Texto cabecera
  doc.setTextColor(...BLANCO);
  doc.setFontSize(18); doc.setFont("helvetica","bold");
  doc.text("GOLF CIUDAD REAL C.D.", W/2, 16, {align:"center"});
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text("PGA de España  ·  Academia Profesional de Golf", W/2, 25, {align:"center"});
  doc.setFontSize(8);
  doc.text("Jugador Profesional y Técnico Deportivo de Golf  ·  PGA Nº 1908P", W/2, 33, {align:"center"});

  doc.setFontSize(13); doc.setFont("helvetica","bold");
  doc.text("INFORME DE SEGUIMIENTO", W/2, 53, {align:"center"});

  y = 70;

  // Caja del título del informe
  doc.setFillColor(240, 248, 240);
  doc.roundedRect(15, y-8, W-30, 26, 4, 4, "F");
  doc.setDrawColor(26, 92, 42);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, y-8, W-30, 26, 4, 4, "S");

  doc.setTextColor(26, 92, 42);
  doc.setFontSize(14); doc.setFont("helvetica","bold");
  const tituloLines = doc.splitTextToSize(rpt.titulo || "Informe de Seguimiento", W-40);
  doc.text(tituloLines, W/2, y+2, {align:"center"});
  y += 28;

  // Helper para formatear fechas ISO a dd/mm/yyyy
  const fmtISO = (iso) => {
    if(!iso) return "";
    const p = iso.split("-");
    if(p.length===3) return p[2]+"/"+p[1]+"/"+p[0];
    return iso;
  };

  // Datos del alumno en tabla compacta (sin emojis para jsPDF)
  const datosRows = [
    ["Alumno:", alumnoNombre],
    ["Fecha de emision:", fmtISO(rpt.fechaCreacion)],
  ];
  if(rpt.fechaDesde && rpt.fechaHasta){
    datosRows.push(["Periodo evaluado:", fmtISO(rpt.fechaDesde) + " a " + fmtISO(rpt.fechaHasta)]);
  }

  doc.setFontSize(10);
  datosRows.forEach(([k, v]) => {
    doc.setFillColor(245, 250, 245);
    doc.rect(15, y-4, W-30, 8, "F");
    doc.setFont("helvetica","bold"); doc.setTextColor(26, 92, 42);
    doc.text(k, 18, y+1);
    doc.setFont("helvetica","normal"); doc.setTextColor(30, 30, 30);
    doc.text(String(v), 75, y+1);
    y += 9;
  });

  y += 6;

  // ── SECCIONES ────────────────────────────────────────────────────
  const secciones = [
    { titulo: "RESUMEN DEL PERIODO", texto: rpt.resumenTexto, color: VERDE },
    { titulo: "OBJETIVOS LOGRADOS", texto: rpt.objetivosLogrados, color: [0, 100, 60] },
    { titulo: "PROXIMOS OBJETIVOS", texto: rpt.objetivosProximos, color: AZUL },
    { titulo: "PLAN DE TRABAJO", texto: rpt.planTrabajo, color: [80, 40, 120] },
  ];

  secciones.forEach(({titulo, texto, color}) => {
    if(!texto) return;
    if(y > 240){ doc.addPage(); y = 20; }

    // Cabecera de sección con franja dorada izquierda
    doc.setFillColor(...color);
    doc.roundedRect(15, y-5, W-30, 9, 2, 2, "F");
    doc.setFillColor(...DORADO);
    doc.rect(15, y-5, 3, 9, "F");
    doc.setTextColor(...BLANCO);
    doc.setFontSize(10); doc.setFont("helvetica","bold");
    doc.text(titulo, 22, y+1);
    y += 13;

    // Contenido con fondo gris suave
    doc.setFillColor(...GRIS);
    const lines = doc.splitTextToSize(texto, W-34);
    const h = lines.length * 5.5 + 6;
    doc.rect(15, y-4, W-30, h, "F");
    doc.setTextColor(30,30,30);
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    lines.forEach(line => {
      if(y > 270){ doc.addPage(); y = 20; }
      doc.text(line, 18, y);
      y += 5.5;
    });
    y += 8;
  });

  // ── FIRMA ────────────────────────────────────────────────────────
  if(y > 250) { doc.addPage(); y = 20; }
  y += 4;

  // Caja firma con borde dorado (ampliada para imagen de firma)
  doc.setFillColor(...GRIS);
  doc.rect(15, y-4, W-30, 36, "F");
  doc.setDrawColor(...DORADO);
  doc.setLineWidth(0.8);
  doc.rect(15, y-4, W-30, 36, "S");

  // Franja superior dorada
  doc.setFillColor(...DORADO);
  doc.rect(15, y-4, W-30, 3, "F");

  doc.setTextColor(...AZUL);
  doc.setFontSize(10); doc.setFont("helvetica","bold");
  const firma0 = rpt.firmaTexto?.split("\n")[0] || "José Manuel Caballero Fernández";
  doc.text(firma0, 20, y+5);
  doc.setFont("helvetica","normal"); doc.setTextColor(60,60,60); doc.setFontSize(9);
  (rpt.firmaTexto?.split("\n").slice(1)||["Jugador Profesional y Técnico Deportivo de Golf","PGA de España Nº 1908P","Golf Ciudad Real C.D."]).forEach((l,i)=>{
    doc.text(l, 20, y+11+(i*4.5));
  });

  // Imagen de firma manuscrita a la derecha
  try { doc.addImage(FIRMA_JOSE, "PNG", W-68, y-2, 50, 32); } catch(e){}
  doc.setFontSize(8); doc.setTextColor(...AZUL);
  doc.text("Firma del Técnico Deportivo", W-43, y+32, {align:"center"});

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for(let i=1; i<=totalPages; i++){
    doc.setPage(i);
    // Franja dorada
    doc.setFillColor(...DORADO);
    doc.rect(0, H-13, W, 2, "F");
    // Franja azul marino
    doc.setFillColor(...AZUL);
    doc.rect(0, H-11, W, 11, "F");
    doc.setTextColor(...BLANCO);
    doc.setFontSize(7); doc.setFont("helvetica","normal");
    doc.text("Golf Ciudad Real C.D.  ·  PGA de España  ·  Documento confidencial", W/2, H-5, {align:"center"});
    if(totalPages>1){
      doc.text("Pag. "+i+" / "+totalPages, W-12, H-5, {align:"right"});
    }
  }

  doc.save("informe-" + alumnoNombre.replace(/\s+/g,"_") + "-" + (rpt.fechaCreacion||"golf") + ".pdf");
}

// ─── Notificar clase al alumno por email (via Firestore→Make→Gmail) ──
async function notificarClaseAlumnoEmail(clase, alumno){
  if(!alumno?.email) return;
  try {
    const enlace = `https://jmcaballerofdez.github.io/golf-academia-app/`;
    await setDoc(doc(db, "academia_emails", "clase_" + clase.id), {
      tipo: "clase",
      id: clase.id,
      alumnoNombre: alumno.nombre || "",
      alumnoEmail: alumno.email || "",
      fecha: clase.fecha || "",
      horaInicio: clase.horaInicio || clase.hora || "",
      duracion: clase.duracion || "60",
      tipoClase: clase.tipo || "",
      zona: clase.zona || "",
      contenido: clase.contenido || "",
      enlace,
      enviadoAt: serverTimestamp(),
    });
  } catch(e){ console.warn("Notify clase email error:", e); }
}

// Cargar el SDK de EmailJS dinámicamente
function cargarEmailJS(){
  if(window.emailjs) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload=()=>{
      try{ window.emailjs.init({publicKey:EMAILJS_CONFIG.publicKey}); }catch(e){console.warn("EmailJS init:",e);}
      resolve();
    };
    s.onerror=reject;
    document.head.appendChild(s);
  });
}

// Enviar emails de un nuevo registro
async function enviarEmailsRegistro(datos){
  try{
    await cargarEmailJS();
    if(!window.emailjs) return;
    // Email al profesor
    await window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateProfesor, {
      nombre_alumno: datos.nombre||"",
      email_alumno: datos.email||"",
      telefono_alumno: datos.telefono||"",
      tipo_escuela: datos.tipoEscuela||"",
      dias_preferencia: (datos.diasPreferencia||[]).join(", "),
      horario_preferencia: datos.horarioPreferencia||"",
    }).catch(e=>console.warn("Email profesor:",e));
    // Email de bienvenida al alumno (solo si tiene email)
    if(datos.email){
      await window.emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateAlumno, {
        nombre_alumno: datos.nombre||"",
        email_alumno: datos.email,
      }).catch(e=>console.warn("Email alumno:",e));
    }
  }catch(e){ console.warn("Error enviando emails:", e); }
}

const firebaseConfig = {
  apiKey: "AIzaSyDQMYwKTt05hfSPW-Trl7NYPGyDFKA76dQ",
  authDomain: "golf-ciudad-real-50819.firebaseapp.com",
  projectId: "golf-ciudad-real-50819",
  storageBucket: "golf-ciudad-real-50819.firebasestorage.app",
  messagingSenderId: "447720199984",
  appId: "1:447720199984:web:312a8a1140d95554821af5"
};

const firebaseApp = initializeApp(firebaseConfig);
const db  = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ─── Firestore helpers ────────────────────────────────────────────
const DB_DOC = "academia/datos";

async function cargarDatosFirebase() {
  try {
    const snap = await getDoc(doc(db, "academia", "datos"));
    if (snap.exists()) return { ...makeDefaultData(), ...snap.data() };
  } catch(e) { console.warn("Firebase load error:", e); }
  return null;
}

async function guardarDatosFirebase(data) {
  try {
    // Remove foto fields from alumnos to save space (keep locally)
    const dataToSave = {
      ...data,
      alumnos: (data.alumnos||[]).map(a => ({...a, foto:""})),
      _ts: Date.now()
    };
    await setDoc(doc(db, "academia", "datos"), dataToSave);
  } catch(e) { console.warn("Firebase save error:", e); }
}

async function notificarNuevoRegistro(alumno) {
  try {
    await addDoc(collection(db, "notificaciones"), {
      tipo: "nuevo_registro",
      nombre: alumno.nombre,
      fechaNacimiento: alumno.fechaNacimiento||"",
      tipoEscuela: alumno.tipoEscuela||"",
      telefono: alumno.telefono||"",
      email: alumno.email||"",
      timestamp: serverTimestamp(),
      leida: false,
    });
  } catch(e) { console.warn("Notificacion error:", e); }
}

// ─── Sincronizar clase individual en subcolección (para Make/Google Calendar) ─
async function sincronizarClaseFirestore(clase, alumnos) {
  try {
    const alumno = (alumnos||[]).find(a => a.id === clase.alumnoId);
    await setDoc(doc(db, "academia_clases", clase.id), {
      id: clase.id,
      fecha: clase.fecha || "",
      horaInicio: clase.hora || clase.horaInicio || "10:00",
      duracion: clase.duracion || "60",
      tipo: clase.tipo || "",
      zona: clase.zona || "",
      contenido: clase.contenido || "",
      asistio: clase.asistio || false,
      alumnoId: clase.alumnoId || null,
      alumnoNombre: alumno?.nombre || "",
      alumnoEmail: alumno?.email || "",
      gcalEventId: clase.gcalEventId || null,
      gcalSyncAt: serverTimestamp(),
    });
  } catch(e) { console.warn("Sync clase error:", e); }
}

async function eliminarClaseFirestore(claseId) {
  try {
    await deleteDoc(doc(db, "academia_clases", claseId));
  } catch(e) { console.warn("Delete clase error:", e); }
}

// u2500u2500u2500 Sincronizar informe publicado en subcoleccion (para Make/Gmail) u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500
async function publicarInformeFirestore(informe, alumno) {
  try {
    const enlace = `https://jmcaballerofdez.github.io/golf-academia-app/?informe=${informe.id}`;
    await setDoc(doc(db, "academia_emails", "informe_" + informe.id), {
      tipo: "informe",
      id: informe.id,
      titulo: informe.titulo || "",
      alumnoId: informe.alumnoId || "",
      alumnoNombre: alumno?.nombre || "",
      alumnoEmail: alumno?.email || "",
      fechaCreacion: informe.fechaCreacion || "",
      fechaDesde: informe.fechaDesde || "",
      fechaHasta: informe.fechaHasta || "",
      enlace,
      publicadoAt: serverTimestamp(),
    });
  } catch(e) { console.warn("Publish informe error:", e); }
}

// ─── Palette ─────────────────────────────────────────────────────────────────
const G = {
  fairway:"#1a5c2a", grass:"#2e7d3c", mist:"#e8f5eb", sand:"#f5f0e8",
  ink:"#1a2e1d", soft:"#6b8f6e", white:"#ffffff", flag:"#c8a84b",
  danger:"#c0392b", sky:"#3a7abf", purple:"#7b5ea7", lavender:"#f0ebfa",
  orange:"#d4651a",
};

const STORAGE_KEY = "gcr_academy_v3";
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().slice(0,10); }
function fmtDate(d) {
  if (!d) return "—";
  const [y,m,day] = d.split("-");
  return `${day}/${m}/${y}`;
}
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["L","M","X","J","V","S","D"];

// ─── Default data ─────────────────────────────────────────────────────────────
const DEFAULT_ADMIN_PIN = "1234";

function makeDefaultData() {
  return {
    adminPin: DEFAULT_ADMIN_PIN,
    alumnos: [],
    clases: [],
    estadisticas: [],
    bonos: [],
    pagos: [],
    analisis: [],
    slots: [],
    reservas: [],
    asignaciones: [],
    resultadosTest: [],
    tareas: [],
    mensajes: [],
    programas: [],
    informes: [],
    labels: {},
    ingresos: [],
    gastos: [],
    categoriasIngreso: ["Clase individual","Bono clases","Cuota mensual","Clase grupo","Clase empresa","Torneo","Evento","Otro"],
    categoriasGasto: ["Material deportivo","Desplazamiento","Formación/Licencias","Cuota autónomo","Asesoría/Gestoría","Publicidad","Equipamiento","Ropa/Uniformes","Seguro","Otro"],
  };
}

function loadData() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      const def = makeDefaultData();
      // Merge: existing data takes priority, missing keys get defaults
      return { ...def, ...parsed };
    }
  } catch(e) {}
  return makeDefaultData();
}

function saveData(d) {
  try {
    const json = JSON.stringify(d);
    localStorage.setItem(STORAGE_KEY, json);
    // Also save timestamp
    localStorage.setItem(STORAGE_KEY + "_ts", new Date().toISOString());
  } catch(e) {
    console.warn("Error guardando datos:", e);
  }
}

// ─── Base UI ─────────────────────────────────────────────────────────────────
function Badge({color,children}){
  const m={green:[G.mist,G.fairway],gold:["#fdf6e3","#a07c10"],blue:["#e8f0fb",G.sky],red:["#fdecea",G.danger],gray:["#f0f0f0","#555"],purple:[G.lavender,G.purple]};
  const[bg,tc]=m[color]||m.gray;
  return <span style={{background:bg,color:tc,borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{children}</span>;
}
function Btn({onClick,color="primary",small,children,disabled,full}){
  const s={primary:[G.grass,G.white],secondary:[G.mist,G.fairway],danger:[G.danger,G.white],gold:[G.flag,G.white],sky:[G.sky,G.white],purple:[G.purple,G.white]};
  const[bg,tc]=s[color]||s.primary;
  return <button onClick={onClick} disabled={disabled}
    style={{background:disabled?"#ccc":bg,color:tc,border:"none",borderRadius:8,padding:small?"5px 12px":"9px 18px",fontSize:small?12:14,fontWeight:600,cursor:disabled?"not-allowed":"pointer",width:full?"100%":"auto"}}
    onMouseEnter={e=>{if(!disabled)e.currentTarget.style.opacity=".82";}}
    onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>{children}</button>;
}
function Card({children,style}){return <div style={{background:G.white,borderRadius:14,boxShadow:"0 2px 12px rgba(0,0,0,.07)",padding:20,...style}}>{children}</div>;}
function Modal({title,onClose,children,wide}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
    <div style={{background:G.white,borderRadius:16,width:"100%",maxWidth:wide?700:520,maxHeight:"93vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,.3)"}}>
      <div style={{background:G.fairway,color:G.white,padding:"14px 18px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:1}}>
        <span style={{fontWeight:700,fontSize:15}}>{title}</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:G.white,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>
      <div style={{padding:20}}>{children}</div>
    </div>
  </div>;
}
function Field({label,children}){return <div style={{marginBottom:14}}><label style={{display:"block",fontSize:12,fontWeight:600,color:G.soft,marginBottom:4}}>{label}</label>{children}</div>;}
function Input({value,onChange,type="text",placeholder,maxLength}){
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
    style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",fontSize:14,boxSizing:"border-box",fontFamily:"inherit"}}/>;
}
function Sel({value,onChange,options}){
  return <select value={value} onChange={e=>onChange(e.target.value)}
    style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",fontSize:14,background:G.white,fontFamily:"inherit"}}>
    {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}
function Textarea({value,onChange,placeholder,rows=3}){
  return <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",fontSize:14,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>;
}
function Divider({label}){
  return <div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0"}}>
    <div style={{flex:1,height:1,background:"#e5e5e5"}}/>
    {label&&<span style={{fontSize:11,color:G.soft,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>}
    <div style={{flex:1,height:1,background:"#e5e5e5"}}/>
  </div>;
}

const NIVELES=["Iniciación","Intermedio","Avanzado","Competición"];
const PALO_OPTIONS=["Driver","3-madera","5-madera","Híbrido","3-hierro","4-hierro","5-hierro","6-hierro","7-hierro","8-hierro","9-hierro","PW","SW","Putter"];
const ASPECTOS=["Agarre","Postura","Alineación","Backswing","Impacto","Follow-through","Ritmo","Peso","Cabeza","Rotación de caderas","Posición de los pies","Extensión de brazos"];
const ZONAS=["Campo de prácticas","Green de prácticas","Hoyo 1","Sala de teoría","Campo exterior"];

// ═══════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// ETIQUETAS PERSONALIZABLES DE LA APP
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_LABELS = {
  // ── Navegación instructor
  nav_calendario:"Calendario", nav_alumnos:"Alumnos", nav_clases:"Clases",
  nav_estadisticas:"Estadísticas", nav_analisis:"Vídeo Análisis",
  nav_ejercicios:"Ejercicios & Tests", nav_mensajes:"Mensajes",
  nav_tareas:"Tareas", nav_pagos:"Pagos", nav_ajustes:"Ajustes",
  // ── App general
  app_nombre:"José Caballero Golf Academy", app_subtitulo:"Golf Ciudad Real C.D.",
  app_profesor:"Profesor", app_alumno:"Alumno",
  // ── Ficha de alumno
  campo_nombre:"Nombre completo", campo_edad:"Edad", campo_nivel:"Nivel",
  campo_telefono:"Teléfono", campo_email:"Email",
  campo_fechaAlta:"Fecha de alta", campo_notas:"Notas",
  campo_pin:"PIN de acceso", campo_tutores:"Padres / Tutores",
  // ── Estadísticas de juego
  campo_golpes:"Golpes", campo_fairways:"Fairways (%)", campo_gir:"GIR (%)",
  campo_putts:"Putts", campo_bunkers:"Bunkers", campo_handicap:"Hándicap",
  campo_hoyos:"Hoyos", campo_distancia:"Distancia (m)",
  // ── Clases
  campo_tipo_clase:"Tipo de clase", campo_zona:"Zona",
  campo_duracion:"Duración", campo_contenido:"Contenido / Objetivo", campo_asistio:"Asistencia",
  // ── Pagos y bonos
  campo_importe:"Importe (€)", campo_concepto:"Concepto",
  campo_metodo:"Método de pago", campo_bonos:"Bonos de clases",
  campo_fechaCompra:"Fecha de compra", campo_plazas:"Plazas",
  // ── Vídeo análisis
  campo_tipo_golpe:"Tipo de golpe", campo_palo:"Palo", campo_videourl:"URL del vídeo",
  campo_positivos:"Aspectos positivos", campo_mejorar:"A mejorar",
  campo_tecnico:"Informe técnico", campo_tutores_msg:"Mensaje para padres/tutores",
  campo_valoracion:"Valoración",
  // ── Tareas
  campo_tarea_titulo:"Título de tarea", campo_prioridad:"Prioridad",
  campo_estado:"Estado", campo_asignado:"Asignado a", campo_zona_trabajo:"Zona de trabajo",
  campo_recurrente:"Tarea recurrente", campo_fechaFin:"Fecha de fin",
  // ── Grupos de edad
  grupo_pollitos:"Pollitos", grupo_pares:"Pares", grupo_birdies:"Birdies",
  grupo_eagles:"Eagles", grupo_albatros:"Albatros",
  // ── Portal alumno
  portal_inicio:"Inicio", portal_clases:"Clases", portal_analisis:"Análisis",
  portal_stats:"Estadísticas", portal_ejercicios:"Ejercicios",
  portal_mensajes:"Mensajes", portal_pin:"Mi PIN",
};

function useLabels(data){
  const saved=data.labels||{};
  return (key)=>saved[key]!==undefined?saved[key]:DEFAULT_LABELS[key]||key;
}


// ═══════════════════════════════════════════════════════════════════
// LOGOS EMBEBIDOS
// ═══════════════════════════════════════════════════════════════════
const LOGO_GCR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAADhCAYAAAAqJkybAAB8IklEQVR42u19d5hdVdX+u/bep9w7aQQSOilUJ4glgIiSASufYvcOhKBYg/oZMSRTEzxzhCQzk4SAUT+Jfp+iFJlr/SmKBWFAAUssaEaBkEYJNSFl7r3nnL33+v1xzp3chCSkTELLfp55UuaWc/ZeZ5V3rfUuwiCuQqEgi8WiAYDLLgsO8TxzLkBvsZZPBvhwZuTwEl5EzMxkiBAB3A9gPUBPA/SoELSKCA8B4iFro9WdnZ3rt31/EAQKADo6OgwRMV7Giwbrg3p6emRjY6OZPn36yFxu6AyAPyqEPIqIYK2Ftfbls2lE2Z8CRJT9m2GthdbaAPQkER4iwt+Z+U9K0V+klPeHYWjxClk0mELV1NT2Vsdx/9fz3DFRFMEYY5jZZC8TVD2RfbCYmaqLmXk338vZ27hWkzAzZYJUc90MZjzn9dlrBREpKSWqP8yMSqXCROI/AO4kErfG8ea7hwwZ8nQYhgzgZam51GCYv8bGRtPc3PZBx/FuBlj19/fr7ECU7/uSSMBaA2v3zR4KkZ57HMew1kZE5D2PIFkAduDtQggpJYSQECLVQMwMZoDZDvw9vSdkWkoM/J2ZYS3DWgNjDIwxJtVc4EzYHCnFq5RSr2LGJcb4a+M4fh2AJ7IHgg8I1nZ8qqam9lOVUjdZa6QxxhARua4nkyRO4jj+LTNuB+wD1vLG7CT3eCOttbSVTAnBzLxZCMnMeL2U4mJmvCHTIDSgZgCbaRjlOI5QSgmAoHUCrXW/1vpRIrMG4DXMeBSwTwF4xlq5mYjKzDp7WJRi5pwQZgiAgwExCuCjiMTRzHwMgCOVUnVKORJgaK2htUaSJDZJEu26riTCM8uXL386U4YHNNa2ZrS+vp6DIPDLZX2dENKN48gQETzPk0mS/IIZrV1dV/5zX99ES8vs1xDR56Wk9wN0SKqQwAAMM0MIIR3HlUIQoiiC1uYBrc1SAH8Ugv5urXrwtNMmPNHY2Gj21iX485+XHWqtPb5SqbyWiE9nplMBjCcixcxCSiWTJLmjWCyaIAhUGIb6gGBtHeHIMAx1S0vbp/P5uvpSqaSZWfi+L+I4WdLZecUlVa1WX19PEyZM4GKxuFcXW19fTwBEGIZxKlCz3iKlbBJCnKuUQubXWQCWiJTrulIIgSiKNmmd/AHgW5lxx/jxR/ddcsklyXbuSQAQtf+XXjcAVK+9gEIBWLZs2bb+os0E87Hspzf7TLdS0f9USp2QJAlnyvOPL3fnfU8Fi8IwNNOmTfOY6dIkSZiI2PM8EUXRPV1dcy4JgkD09fVRFX7Ye1+uR4ZhowaAtra2U4hUAIgPKiVRqVQ4jmMNgKRUynVdEUUVkyTJHUTiZin51jlzrnx4W+2ybNky6uvr456eHktEyKK254ncitjJ80HMjMbGRvG2t71NHHTQQfavf/3rUEAcmkXFMvUDqa8qjAcEa+tDEY2Njcb3h7zZdd1j4zi2RCSNMZZITM+edArDcK+FipmpsbFRFIsplOH7Q2cB/HmlHLdSqbAxWgMQSjmO4yjEcfxYHMc3KoXvXnnlFjNco41sGIZca/YGMVjl7LNMfX09X3LJJXbmzLYjlRLDjTEshBDWmk3WRo9keBaHYXhAsKqragaIxDulVEyUJK7repVK5d758+f9MQgCsbf+StWMEpEBYJqbZzcqJTpd1x1XLpdRqVQ0AEgpHcdxkCTxA0kSf405uaGzs/OZ7QiT3Z8aoq+vL9sjjFJKIY5jI4RUxtinN206Yf0gC/TLxhRmB8QTrTUEcBW3+UUWiYm9PcSqYzttWtuoIUPUIsdxpmitUSqVdBYOKs/zEcfRyiiKF3ie+E4YhqUahHu/C9N2/EEIQSOEEABghSAYQxuWLBnw7/iAYG3tX9lCoUcS/f3o1HcgYYwBs/07AJ4wYcIebxgzU0dHB4VhqJub298ppbrWdd0xlUrZZLin8P2cSJJ4Y5LEC6yNv9LV1bWhRhjNiyvSErktSD0B4FINoHtAsJ77RC7zKhWqqx62MQZE8kkA2NPoLwgCQUQWALe1zfqSECoEgHK5pAGQUkpKqZAkSZE5aZ83r3P5i1egBpS7yISqCrGazL+iAxprO2vz5s0kpU/Vp29vo5xqWmjatGnD6upGfNvzvA+WSiXLzCAiyuVyUuvk0SSJZnR2zrn5xS9QVUA3FaSaPXJe7o773gKkg7aCIFCNjY165syZx7pu/oeO476miosJISjDxn5YLutpV189d22GjfGLWaC2uAPUb61FlsMEwHVba7ADgrXPhCoMQz1jRutpruv+REp5RNX0OY4jAOgoKjd1ds69uvb1L/aNrboDQvA6ay2YWWRY1kFBEPhhGFayQOdlKWDixSBUTU1t53ie+1siOiKKIgMAnudJAI8kSfK2zs65VxcKBRkEgXippEDq6+sZAJLEPpkkiSUimQU6B5fL5UOy+6cDGmsfCVVzc9vbHcf9KTPnkiQxADiXy6k4jv/U3x8XvvKVrjUvxZxaGHYwEMJx7FpArhNCHGKtNUqpnLViDIBHqljXAY21DzSV47g/tdbmtNYWAOfzeRXHyc/iuPSWl6pQZb4VA6AUCqFVWW2WUUrBWntKLdZ1QLAGYfX09MiqT+U4zk+t5Zwx2gKw+XxeVSrR9a5L71+4cGF/oVCQL+XsfxAEMo0IcZ+UEkRp1MyMM7d28A8I1t5utGhsbDStra3jPc/9GRENNUYbgGw+n1dRVPl2Z+cVH6m+drAS2C+47iL+QyZQUmsNgN8cBIGbpb3ogGDtxariOEEQDCNy/p+U8tCqT5VqqvL18+Zd+YkgCESG8bwcMv82xbLEXZVKRRORSpLEOo4ztlzWpwKgQqEgDgjWXjy0HR0dMgxDW6noG1zXmxBFkU4d9byqVMo/6+yc89GqUL1cMJ4wDC0zU3f3FcuZ8Q/HcYiIEqUcEKEAgF+uftZ+EaxqUeDMma1X5HL586o4le/7Kooqf4qi0vnV/oeXG3DY0dEhiYiJ8BOlFJiZkiQGgMYZM+bXZaVFdECw9tBZnzlz1rm5XG52uZwi6o7jyCRJHjEm+sCiRYvKWeL55Vj4lplDurlSqSRE5Gitte/7Ryi1oQCAq07+AcHaDWd92bJlPGPGjNGOQ99Ou8GYpJTMjMQYU5g/f/5jaXXoy7PnLgxDGwSBmD//ygettb/xPI8AWK0NA3ZmtcTn5aa19rXGEmEYWiG8/3Fd77BqS1TabBF9sbt77r1BEKhisdHgZbwmTJhAmdZalJl8lSSx9f3chEoluSgMQ9vT0yMOCNZumMCmplmT8/ncB8vlsgZAuVxOlcuV4vz5nV9/OXep1K7GxkYTBIFYsGDObZVK5W7P8wQR2bRXQFwRBMGwZcuWcU0FxAHB2t6qr6+nZcuWcWtr68FSikVJklgAUEqJKIofzeXUZ7II0OAVsrL0DQNqdhanCK219Tz/qHI5mRuGoe3o6JAHBGsXTKC1dKXve4dqrS0RkZSSmM1nwzBcN2HChBd7BSUhgEChILf6CSAyf4h2xy8qFoumUCjI+fOvuD1Joh/5vi8BcKVSNq7r/ndzc/s7wzDUVeKQA4K1fYc1bmmZ/TqlnE9XKhUDAL7vy0ol+n5X19yfZfVXLy5tFUCgoUE1NDQoVMtZQlgUi2arnxA21TwDP9TQ0KBQKEjwzgWtvr6emZm0psviON6UtXHDWstKye9Mn95+ZCZcL3l/a589HdbaLs9zZaVS0VJKEcfxBsCZkdW02xeNVioUBOrrGWFogV7bm/3iqMIZOcdXR8OKQ9lyXkqR04ZjIrlMGSgoG8Vs+tfc+Pv1vb29Ovu0540QJ0yYIBcunLO6ubltRj5ft6RUKunUJHqHeR7/YNq0aWd3dHTEVa1/QLAAWGskAGptnfV2pdy3VyoVC4A8zxP9/aU58+df8Vg+jxeDw05oaJDo7dXI8pHjP/K2Y4jN2dbYiRCYCNDrYawBQzlD8j4nBlIYcGw/UrHRD4fFR5tN3rPOuCmTPicc59U20beZkv3Dmh/ftRY7KeDLHHkVhuE3W1pmvS2fzzeWSiUdRZHO5XJnAMO+T0QfzBhzXrLCRXv4Hp4xY0adlP6DSsnDtdZWKSWs5TM6O6/4Y0tL2x9c1z8zjuNYKeUkSbIySconDxs2LHrBqXsKBVkVpvpCvVtxD3k3Q14Mtm8TrqoDEdhYwPJVMOYbWvBmBdnIQDsEDoZlA8u/BOEBBo0n0HulpxyrDUjQBh2b6atv6v32mIsb/NVje2P0FShzsgZMf7UTqVQq1Qnh3eu6Tn1W4Mj5fF6Vy5WbfV9emHZDbSGze0X6WEQEY/jZ1tbLT/M8/8woiiwzS6UUAfTlRYsWlbPve2GEKoBAEAgUi+bw8ybmx1109n+XvdF/I6V+JBS9D4Q6EycRW9ZWm6YV198+Y8VNdz645oa71q644Y5rmM0XhBASlpVwnfcJz21y6rwPkSTHxEna2kU0nAifrS8U3NXX9Va28tF4i7NfDVrmz5+/ydro/caYpxzHkQCoVCpp3/fPj2Pz/5qamoZWyUNe0c67MYastU1EggEYx3FFuVz+z7HHPnVjVlZsXjAtFcIiDO34C8+5MDdi6F+Fkl8loN7EWtvEADZFv4mgGHbzczaKRR4ggGBNrBNOtNGl+BtGmzMF2TdZY0Kb6E3SUaeVnSfvHDf5rA8dUzhr3JgLGs4dN6Xhw6DM2S8UZNXf6unpkfPnz38wiuL3ANiklJIAqFwuadf13q2Uf2dzc/OrwjDUPT098qXk1A+KKTTGAEBiLX9GCFpMRHlrrc7A0E91d8/53xcMDG1oUOjt1WPObxgrHLpGKPleNhZWm0Qo6QAAa1siSXkIAhtrAXqWmKaxpds0KlJJ71wQLyDGcGZrhVLKavPHlTf2nlH7VeMnT3oXS/EjEsIjAEbrWAjhCs+BjfQtul9/es2P71pbvSZgSzVtS0vLm5Xyfg7Q8KycCK7rSmvts9bii52dX76u+vqXAofpoAhW1oXSD2CZlPJ0Y7SRUklj9CO+75zY0RGWs2Zg3u+aqlg0YyY3vF9IsUQoMcrGiWEGpKOkMeZPxJjFEA8ymyOEEHNI0DlsGUIKmMRsAgDpyKHMnPpejISUUKzNfStvuvO1YNBx/3Wu6w5dw33FvnjsBZMeEkqOZWMNBDlEgLV2mRDiEAAKxn50xU13/mJ7wjVjRutEz3N/opQ6KuOmIJmSUyBJ9A+Z4/bOzs4Hqu/BFhqBF92SeyqMZ555piuE+oIQYqgxhonIJaIjUyGD9X1fJEly9dy5V/4GCFRvb6/drw9MJlTjLzy7RTjyW8RcZxOjCSSEkoINP+T5yZuWf/f3/3n2n6s2bPjX6kfqThlzm2T+DBiSrbUkyBdSeGCGNfYZECnpKZe1ATnqsBETjq4b/rOxd6384W3RU31PpQKsxCdgWYKYSEmy2nSsOuGcyevvW7Vo5EFiBUj834hXj02e/VnvH1AoSPT1obe31wZBoObNm/Po6ae/+UdC4A2+74/RWrO1lo0x7LreBGvx8bPOahj6xjee8++5c8MNvb291TSQOvvss9Hb27vH+1UoFGRHR4coFov8otFYWmumKnUwBlhU4iThVy1cOGdl5l/Z/ShUAsWiGXthw0LlOZeZODGwTCASDNbSc5Qp6zmrvt87e+J55+XLuRU6d1COn1h/8FDlVFYLEkOYrSEhiIEnYHlqkkR35xw1wpD8EEBfZrArlBQ2MQ+B8RcAB4HoLSBOSUlBEkRkyIxfc+xdqxvuaBC9vb163PmTzpJ5904dJXNW3dg7O9NcBgAXCj2yWGw006ZN8+rqhi90HOe/jbHQOqkhQvEQx/EzRPiuMXxdV9eV/9haSffI+vqUDaivr4+rbWi1q6+vj2oKDPeJ1htswQIzmxRlr/yiu3vuu/ezUKGhoUH19vbqAaGKkiTD67J7ZSMcJU1ibll1Y+95te8de+HZ86QjW22SGDCIlCQ29r0rb+z9ee3rxl0waYbwnAUmSWIhpUtSgG0GuwsCmGESraWjJMemfcVNvZ2FQkGuOGiFWLpkaTJ28qR/OENypySbKnNWfb93di0EUrtfTU2z3+84YqHruuMrlQqstVXqJuW6HiqVsiWiuwD6CTPf5vvy33vixwZBMERrvF7r+Kiurnk3vogFKyfL5cqF8+fP+X61enS/OuqTz2p1fG9eJlTONq9iMJiUEGzsEgv+PpF0wPwRIekiNsYAKS0yW1til46sK40u9T35pMXo0eK4TZvIjNh8IinnH2wtg8EgGBLCYWvvYcZfifg4EuKdAAHMFRB/7uiH8b3e3l49bvJZp0PK34CRE450TKybVt3Yu6BWuABQldzus59tPWjECKcNwH+7rpuPogjMNmEGiMhxXRdCiIzyGw8w09+F4PuMsculxKPGyGeF0GVmtkSktBZDiPhgIehoAK8CxCkAXu046kitNSoVe8TVV89du7cKYVAFi5lZSknG2PVJoo5btChch/3VRp4dzNgLJr1XuOqnrK0GWG57jyQopdZmhnBUarVS4hFw2qmcRobElpSSnCSFlTfd9cOtNNbkSZcJ11los+hNOEraxC5eeeMdX6i+ZsyFk/5LCPF9AoaRELCJvp/TwQITQZRjy4mQQrExT0pBpy2/ofeRbfeqFhxta2s7CVAzAL7Qdf18kiQwRg/w6BORq5SClApCpEMbjDFIu4KQVJF8IYRKX5duDbOtMjsnnuepJIk/0tk554a9jeIHGxcxjuOCCLcvWhSuK6SYzb4XqgACxaI99vyzjiYpvg1rLdiKrYSK2ZKSsIZvB9tVJARsnGhOtGWTcrlbYx+1xq4hJQRIKDYWEPLa8RdOunD8B944+pgpZx0+bsqkz0GIK6w2nGk2aROrGdFCAFRfqHfrC/Xu6hvv/CWM7SYlYbSOSckThSPPIkF5oSRJV7lsLSDEUA0+8/Cp5+W3fdgzoaKenh45b968/8ybd8WnmeVr4jiaw2yXu64rc7mc6ziOCwBJkiSVSrlSLpeiSqUSa51UueadLLhS1lobx7Eul8txuVyqRFEUZc3CJIQAM94F7H3P42AjuhkAjZ8jpeveP4VrfQUCitYIWiIdOdLGiQGR3EbPcqatvglgphA0li0IJABgE1v7uX5NP/EQGVe45xKJ/2XGCAIOJqVusD6eFZakcORQmxjLYEMEAhODIAS5Q6tfFW86hiZOzTnPbOZ/gQECJBtjQEKA7Qa2/P8YOEQQ/ouUrLMJt/qbN60D8NvtWBGuFgr29U2gzs7G5QBmB0FwZRTFZwPivQCfA+DEXC7nAOQw24ExM+nwgy0yIoQQREIIISBlqlcqlQqYGUmSEDOfFQSB39jYuFekJYMpWEwkZKVSSYzBndkF2f1lAsdMbrhAeupcGycaIPWcaxNCmkg/RcQOSXGy1YYZgFRCmFh/ftVNd15fozF+PPaChkOkp5aYJNGUWEFSjIBlsGUIT6XcpnbASVdW69kALugr9sVASoo8dnLDe1JlCSZBkghlBt6x8obePwPA+Clnv9tq00NSvA6E74+b0vCZlTf0/mAbfwtVpL7q3GfJ6QqAWwHcGgSBKpfNiVGUvN5a8zoinMCMowAcAiBPBDeDJSwRVQCzyRh6KkmwghmPEuHzQghPa81KyaNLpeRkAH8JgoCy3O4L52MBYNd1RZIk93V2Xvnaqi+/HwBeOvy8ib4/dMi/SImxrC2DnmPimQSRNfwkgcuk5BjWxpIUgq1dLyk/dvkj5RLO7rXoK9DEg1aIpzcNOVYI+vfArBNmS44SVpv7wLgejAoJvE8o+VartRFKSdbmFga+QYxnmfBhEvQFtgyArVBK2kT/ceVNd56BhgZVP/op0Vfsi8deOCmQjgrYMlljH46GDD1p7ZKflwcCjZ1iTz2ivn4Z7cgXmj59es7zvLwxnuc4CZVKsMOHO2UApSpXPgA0N8/6h+s6p8RxHOdyebdS6f9CV9e8xXvjZw2mxrJSKpEk8R+JiPdLCicrffGHDvmE8NQ4EyeGtjWB2SGwZZCg0WDA6hQoTWWGXGPiHHp7N9aPrnfjTZtoaXFpNGbym18rlIeqg06OEmzMnezgnauv661kn7t47OSzr5Kumm5iraWr3k2Md6fTMAg20TozwpaZJRNGoVCQePJJABNQX4BbsXQLW+6w2sTSc472N2/8LICFtcj8jixETRMKZZRIoopfFYtFkyX+yzsSzGnTprmPP36WBv5xr5TqFCC2We3iGwAsfjH4WFzzx737DQjt7TVjLm7wEfNlbCwTE+1MBxMB5CiASLE2sNpo6ao6m5gQwGeqZmzslHNOJPBcNpbBA5zZJJg7Vl53Z+W4c8/1hh/zlF26ZKnWujKLyJ0spDjMxloDJEDMYCGF66hsZ6SJEy1cNX4snvjkqt47l1QnCIy5oOF4JQQAS2wsAzTluHPP/eryW2+Nd8PH4cxk2ec8UMxVvlN0dHTUAtg8cuRIs3hxo2ltnXUvwFORcckCdEpGvmteaMECEck4jkEkq0iw3R/aSib8LnKdcSbZobbK/D8CWzzBsb6Zgc0EXCAcdayNtSVHXTL2wobXEbgXjFHM9oMkxTDWxoJIAGA2FtD0VENDg+odOlRjya0GhYJ8pFgsj5t81loIcRiMFQCDpJRsbJ+N4q8IiA1WoCCU+iBrY4jEV8dNOXsUJfxTq+yxJKibjWUiFmyZGPilPah8GoDfb8/X2n2/d4tLsh3O0+yMxH1xHAOA0tqAmce1t7ePBvDEnuJZYpCEioUQZIxdDyQrap+OfbZGj+Z0Z+hjAHbaN8VgQ44khp238sbeL666sXe2gTmNtf0XKUmstRZKni5ct0m4zscIGMbWgqQQABsAWjgSLPl9vWnVKVcP/ZjCWeMg5AlsTKoNpCS2dnVUUpNW3XTXtStu6v3+qht6P8TaLhBKSliWwpFXssI/hVQ/AeMoa4xhwAhHQjAeYYGx9YV6F8XiPn04t5xRssIYs15KKaw1Vik1xBgaV03/vGA4VgaMAuA12cjafd2BQygWzbgL3nAowOdYbQgZbrDzm6UYDQ2q/nMNQ9bc+Pv1zHY+yXTYISfamijWNtFWOBLMvIGNfVY4SoLIsbG2JOTssVPOvnji1IlpJPqRSa+SnryRpKiDZWaCJUcSG77psZ/c9syYhgYfUyc6CCBKcl2HScyTJIlspBMAYG1ZKAnpOUpI6YLZMuE80mxL7qHjMk2zzyCb7IwoO7M16RlCO44DIehYYM/J4QZTYwGgVVkiVOxzMwgAwp8kHWcI2O4SsQYz59Hbq/v7odHQoFjSk1nURyAiEkKCqGK0/YwQyQlS2xOsNp8GuB9EYFhfSvGdZzYPWTb2wkl/IUN/J6IzbKL1wPySdPSlBYC60aMtlixN0FegJ66/rx+MR9JJm5xO7pCwJkm+aqL4M2ztnWAIgN8JJT4L1idlcMo+3cstZ0WrqhM00nHLPP4Fd97TAZMCRFidSvmyfQqMNiCd2cbA2UgzNM/fQkwEEEakFZxPAr29mi6c9F4oQvp+tkJJqSM9bfX37/y/mnd+a9zksyBc55s20cYmmoSSx4MInBhmy5COUmwtYMBsDIPow/WF+rCvWIwBCBSL5ugLzjyCBB3PxjIzWHpK2igOV910V0eWPfjm2Acbfi2kfItw1Jttxf4TwE8bnnySevfhXlbPigirKVP6Kbe+OPpFhLzTI/sjHOxNy0xA4ImwnIrM84F1zADjaBSLZjVgxk45+2JB9Gkba0spfClMrJ+qKO9mFAoS9VldUl+BEv3wjxTRAiHEcLbMrNNconCVsol5zGqzihnHSVeNtklipFInlN3RPx4zedQMo6PVwlXjJOTXSYqhrLUhImUTbYQU16NQkIeXV3hrw6Ule76ZJ6R4q020JeD1tfe6r1c6VTZ9/jK0/rAqdPECmkJQOoSbn9wvMAPAx005fRiDxmeJ4+e5D5I2rYT54LjJDT8ZN3nSPULQd9haMQCAgkCAcaJNdutUEWCUJzCAe6X2TiilWOtFlDj1K2/sfVOsVL1N9LUZEGqEEu8i4D7HcfukFf8gIRpSXGugbs2wSRXtQbmyRqEghXIeYW0ZzIIZ446bcvqwfe1n1awnsq+iVGPxwQDQ09NjXzDBYgZZy2Cm9YORwNzpyrjRNeoOJ8bBvGsDzAnMIEHDhKveR0qeUUXeSUkBMNgaIxx1mHKc9w50PGcdNh7xhdJRQ1NfLkXgjTZ3r7jhzstWFH+7AYWCfOx7tz2z8sbezxht/kyOkjY2CQk4JOVYgCSYIV1HkRSCwYlwlGuBz6FYNH09yxIUi4atfZ1wJbFlQ4SDNeoOr73nfbGqZ8VM67Nh8CLNLdKwGgf/hTOFzBZK0SZgz4c07dKqzgGEGU1KitQs7eIDwgwTJ1pIoSCEYG3uB+CTo8awNrDGsiB57fgLG3Js5S+NTIRgKpCgbquNBUgw2AhBIODnKBTkxBUrxNJiMZk4daKz9PDzDB6442ckxGmWNBETszFWOEparVdZY/9FoAnSUeNsog1J8fmxF076t2o868d68pvrhaCuFCRlJikVaTsKwP3Yh3zwNRM0NjNbMHN1NEtu6tSpzpIlSxLsQTJ6sKJCSu0yKthfy2IECQKId+eGrUhZ3x61bN9yqj50QqLjV1ltpkJQgrRoaTg58ttM+gHB4n7pONfAwmFr7ZatJTDbg1Esmg2jRgkEEBvWjBJpm74dXhvVCEdJa/T3hgrv5FU33fmeknRfbbS9nqSUsCyEUtdqRzxIQt3BwDHW2NR/FAQGH7S/tpMZldQEIhMsuHV1dXuseMTeCdQW25+SW5h972g++WR1+J+/+65HWsNiDT61+sY7by/W1/MjxXsrq27s/SaMvUa4SrDlxCbaCCGGEWGoTRIjlBTScxRJkTpIWjORvHDcBW85dPmtt0YIYZffemt0wuSGQ0iIC1hrJoBICmG0eaKyof8z913/m/76Qr37xPW/6d+0Of4cG/s0iCh15sVwMCPFtFxFRCrtYSR/q3vet6KlMxM44JcOGzZsj793UKNCY+yLnDiMiC2zgHwMDQ0KfX2MhgaB0aPZ2Md/TMbOJEACJNIuHSEgSNrE3MmEpwCcLh11tE20IaUOZ2NuGz9l0uUC9n7NdHxM9GUhxZGcaAsCSApQbP6x9udLSygUZF+xGKMA+Uzx7k1DL5z0H6nUm23qrFsiim2cfBXAswA+IwQdlZW0viSX2Ev1yTXmEDKDbvdHKgfMFfDu+pVshCMFSH8evb26Hstk/ejRIoUWOLclYANDCGLCRmtw7sqbehtW3dj7YUW5k01ir09LkbUmISaQVD8yVv5TKOcngugUm+gE1QkUaUn8kVWtU1+od4FCJuF0ZOo+EGeasmnlTXc2rbzpzjkAfyht9BHRVve8bx86VdNohSyVZfe7xhoyZAhXKpq3AKQEIvj7T/eIdWm9Ooldt4gkbaIZgi48+oIzO/q+f/dj1aI8OVl+jihFSgG2wlHKRPrKVTf1/mrixInO0iFDePkNt26sL9R/soRRk4SUx7AxmhkCRMImWgsllfRdB8ywiYE1xkhHTRg3peFTK2/o/Vb6TX0YO6VhmpBynNFaCykdEyePlqX3bTQ0qAYAvY/hr2MPT54WUpT3337CJ6IBZcFMYuPGjbTfNdbGjRu3KtMgEjCGh6ZpgsI+hIpT4JKNfiot992tiIWY2Qop66R0Fo+74M2njJnScMbYC8/+nnDkB22sLUASIMnaQAp5GwoFuXT8eIveXo2GBtVX7EsIuJeU2HLjgBWOUlbbu0wl+ZKJ9NeYeaMQUmbR5DfHXjjp/8ZPbvjsuMkN3yGir1id+g0kBcB03xPX/6YfJ26m3rPPtvWj4ROhArZP1t7zvknpVM+Kh6bZE8pKa/DC1Lxrra3jQGfOnhWCICUOAoBly/ZhSidMb3hjnV07tCyfEZJG7yKWVYVBpU0MCyU+yMAHJRFICZjYJCAQMWf18VLqRB+GYvGvx517rre8UAAOWkHoBbPlIwZyjNU+RW0Wrrqpd2b1e8ZfOOlaBv8ORAfDMkvP+TiAjxMzbGwYggSY2WrDRHTqcVNOH7Z8yZ82Akux+fyzThEkhrqbk1W197wvVs1ZHSQEDVgfZtbDhg0z+11jjRw5MiHiaKAMDgRrcej+iIwB0DP/d/cmAq8gIQDw7vkCBGJtLBhgw8zGQnrKka6jSEnBTDbNJdOs+kK9u/zWWyMUiwZLliZjL5j0XuHIN9rEWDARCSlNYtaMeQStAGji1InOceee66248c5/QvPXhSOJCdrGiTFRkrCxICkI1vaTUhLMJJQYZZD77vjJk44ff0HDqdJV3wTz6vv/392bsJ/a59Kzo1rTWO7o6Ej2p2AxgGyKBPWnvhVx1p1z5P7wBxqy6gYm/AWC0izgHjhpqZNOYGv/Y+PkahvpbjZ2mXSkw1oboeSZZWfUneMuaLho7JSz3jH2woYrSYqbYbN+RWImKUCMZb29vRqFgli6ZGlyZLlsGoIGRYLvz1AvAoOEkg4Y90Hrt2p2T+DEXgQhNlttLEn5Pib0WcF/lK6qB+HO2nvdDz7WkekZUlYcSP3Vspo9Eew90ljVkbPM/GymNikdqI0x+zylA6A3i5KI+Q4wnjcJvZNnxAoliBnfWHnjndNX3tTbIg/OTbTGFrM2/ISUfIPw1PeEdH4lHTULlt201T1tFGVrwYTjAAA9RTtx6kRn84mbqTfs1ZbxlswRZpKC2PK6OK68a8X37/rdw9//7WMrb7rjBhhztXCVsFrHIFIEMCcGBLqz9l73dUqHCGOydjGi1Eo/W3vW+0WwqpMWAHomq+FBNu94LADa54zIPWllpdR8p4n1JpDYw8ZYEjYxlqScP+6CN38YAJYvvjW2ir9gtd1MghRrbWySmPRPDeEpIV1HCddRJIS02hjpyOPHTm64HAReumRpsnTJ0mTslHMaScqP2ljbAeYZa3/2SPHeR+sLBRdTJzoTp050mPHnau8hLCxICKP1Bodxe5Zz2adY1paZiTQ2G4aelowRnt4bGdmjN1UdPmasrdbIGWPAzMe0traOzLTZvnPgKWXGW178/VME/p1QkqsaZLc/KQ2AHCjnxnGTz/oQAF59Xe/jsPwwCSIwpa2uaRHgsyZK5nGkLzRx0mGZnxBKShsbKxz55XGTJ/WOnTzpqnEXNtwiiG+GtbIWaxPARgDof/JJMeb+IXLpkqUJEU5Oa0PAILbCkQDw2wdu6n0a+7iTvHpGra2tI5n5GGMMUg4OAoDHXpCoMFOfD2f1O5RylasRWeXhM42NjQLAvtNcWZqDSXwbwPuw56UlaXeMEIoc9YOxF066RCX2x0bQ0QPRpgAY2CyY3vbQTXcuHYj8Jk+6kYnvhqCDWWsjHDUJQkxia8HaZDXzaUoi7XcU5534iTNn3f9/vZsAYPxH3nQMs/hv1obTluwUMSXQd/aHX7XljJzxStGI6hCtTGk8/IIh74BdlalPYmbjOA6YzWuA/TBIOy2AI7XOv9XEyXKSUoD3ECkmIlgGG4YQ4lrjyHsBDElbmNkKRxEs/+ihG29fety553ooFOSYhgZ/xU13PghtbhCOJAbYam1MFCepfCBhbf/B2q4WSik2hkmJcXHk3D7mwoaPjZnS8EVrnbuI6IiMKRAkpTCxfiCXPPVrZHX9+3ILq2fEbF6Tnl1KG5D5yyv3u2BVqwqFUCuTJAHRVoV2Z+wnsJjR0CCX33prJEBXkRTExHtuNggpiGOZSYrxW6WLUkxlLQIId+hQRrFo60aPzkbBiQ01V0TCUQ6Y77LCvHblTb2vq2zaXG+1+TI5UrDWhoSYqFz1beWoRYLoGNaG01CMOW3sEFf1Ffti7Kdo8LlnRjId1ClWVbXHnm3nHtpmIuK2trZRxtByKeUwa41xHFdGUbwsn3dO2U987oQAdFTfGZ5y3H8KKcdnByX2UmS31HilLDXCGv7XqhvveM1WG93QoMYdiX+QFPVsjCESgoFnKpZftbbqI2VaZ+zkSf8UjjyZE6MHdj1NR4nsO8hq8xC79OrVY3vjDBTd5/sXBAGVSsl9nudOiOPYSCmlMWa9EPbYzs7O9dWz3i8aq4pvzJs392kiWl3lWkqSBELQiaVS6Vikk0PFPtdafQV6pHhvWRCaUq2FKhSwN9pL1OJdrI2VSpw8bsrZPxx/UcPJYy5uGDH2onNeM/5o/EQoWc/apP6AI4kt37X2pt6nx1zc4G8d0dGTmV9MKWkJqfTvbJigSQpiUNPq63orWUn0PhWq7Gy4VDLHCkEnZpYHUkoQ0cq9bePb44NPBzcSA/xvKSU4Xdr3fUWkzs604b7nJS8WDQoFueKGO39sKskPnbzvUrY7YLYMTgWNB4Yr7cmTJGyiWSjxfjb4h0j432Tt30nId9tEb9GQlkGUZh8yfgc+qnBGbsyUhjOIcGqK1oMZrMFskY1Ec+pyroniH62+qfcng9D9vDtnT0TmbN/3FTPrmv7QZVvOeD9HhVsgB1oKUONAhJUSx70bwDf3tMNjJ4+ZQF8fZUOVtpiKnqIFgbSJp4qKWM+MU8E4jhw1RAgSab2CTem0wSZrF6s2udKuqmmbaAMiSUIcxpZhta7h4SJptQGAM8dNnvQTgCxSITsczEcTCQVBKbsZZSU1Wm9mSw+acrTUV24rANom4UwIAkrvucjZ5LFBWdnZMEDn8UDeM0XUiPCX2jPer4JVFRpm+2dj9MATkKpUnH3ZZZcdctVVVz29pzZ6u2tbDoFCQTY8+ST1No5mBEV+JLx3HYBPA8DxH33LkYnhCaTNRIBOA/gUAGOF48h0C1Pedk7b/NJy4LQEZidzCEmmt8y1/05NMmed0AAJV72PhEiJbgGwtrBJomFoNVv+B4H/zMRLE6X6Hvnu7x7d8uBAoK9ADQ1Pqt7Rozlt6ggH3SRWCT8uuyw4hEg3JEkyYL2SJIG19JfaM96vgtXT02NTm8z3JUmyQUo5POMkN7lcbjhA5wK4IZsaqgdBbdtjzz/rTKpzD7fl5D6xPr9mebEYbdPMScede657ZLlsetMDexTArwFg4tSJzjP9w8YbbV9DbE4FiYnMPEEIOlQopdL0TDYkwFpbFZJqtLeVrFGVxRQgJgFBgpQkIVKTaGMNwDzKoD4C/xWEv0A6943MPbty6ZKlWyV2Gxoa1KO5nFx+661xqpGKqN7TcdPO9cyTm8eIuny9jSqPrrzhzj9jEJLS2ZkYxzHn+r4/vFwuGwBCSklaJ0/ncs6/Ui+juP8L/TIOLBGG4TPNze3/UEpNiuPYZk8ErDUXAbgeg8E6UygQikWygg6mxH6XPCdvRpYfGnfhpH8S0V/B/Bdy+V8Pfeeuh5ffemu0vOatE6dOdDasGSWWHv6GBGF4P4D7AfQAwHFTzh1mqXyC0cnrYcVpBH4dgBPIkUOFqLaFMZ5TqUoEEqliY2vA2m5kbR+wsH8H6E8S4q9E3oPLb7h1Y+3bVgaBOO7cUVUKpCSF43p19cEb/5G3HQOYk2H5VLb8erOu/GqR88ZzojezwRTUcNjv5Y5m/qa5qEojSURWKUday38Nw3Dj3rImq8HQJETUK6WclNXyyCiKWEp5Tmtr63FhGC7fa673jOR15U13/mxM4bRjhVs3V7jq40KKY60272cGbGzKY6c0LCfgbwz8RZJYGkXl/yxdcu86AMCttw6IRX2h4ADL0Jce/F+ynyUAcMyUsw5XVryKtT6ViU8F4xgwjwDgpz0sqADYQMBKJvxFMv/FOPTv1dfd8fhzAMhCvQtMQF+xmABghKFdDkQAcMRH3nqwb8xJFnYikTiVwK9lkxxHSuZIEYSSYG3A2nwL/dGsVT++58nBAE2rZ9Ha2nocIM+JooiJSDCzkVKA2d5Re7YviGBVbbC19rYkSS6v+lnMrHO5nFsqlT4OYNbeXuSAHxMEYnUYPg7gE8dOafiu1jRPSHEGawMwfCHFq0mKVwP4KBsLx3GfGTel4T8AljLjLwL89ziJl/cVi+VtfbXjNm1SR76hbHrD3rUA1gL4Xa3vU99XUPGmTbR86FC9vcNtCBrUo3/MydrfV4ncjiqckXMd9zjLeB2ROBXgiTD6REhxsEznRKUmWBtOx6lImEpyN7NpW3XjXXcOBC6DM4hBpEcmPp7P+26pVNJpVxBkxpF12976V3sMkG7zfg6CIF8ux8uVcg7PqJ2hlBJam7W5nDohDMP+AeEYDFC0ag4aGtS4o+gLRJhFSo40caIBWAIEmCRJolon2iYGzLyGCMvA4s+A/bN18K/V1/Wu3vbaqiZ0+DFP2aXrx9taLoeJB60QA7/bxmdCEIhjHvrdGAk6GRCngflUZkwgwjHCyZ5jy1mUysw00LQgpOsom5hnCLhiRTzqq1UoJcPDBmfvADQ1NQ0Rwr1fSjlwXo7jiCRJVuZyzkkZP+le+XJ7nc/r6emRjY2Nprm5/fpcLndhuVw2RKSY2eRyORlF5c92ds79xqBzktbgPWPObxgrFa6ElFMAhk2M3sLul3pJGbwgSYi0zpwIYAub6AqIHgLzfUT0JwYvla79z/Jv//6pXbmM8Re9fbS1+iQicypYnAbwKQwcKx3ppXllCzacdXI9B+oAg41QSoEZbPm7zNGXVt14z+pt73GQQFEVhqFubW3/jOfl/ic7K5lamLyMovI3OzvnXDIYZ7XXfYVbsA7xE2aeUiOslE6vwoxp06Z9G0CCwSyzzfwuNDTI1Tf3rgJw0fgLJ90AEvOk77zGxgbM1hBIUm2kbSyzNTxwwER+2sYlJgA0GcbARHh23IVn/4dg/2aBVUR42hoqg8Ag+MQYRYLHA/Q6ttGJQsoRJN1MTCxgLWyitwhRyo2aCvYWfMIQCSkdR1mt/8YGbatuuuNX1VRR7bzqQUt/AXbatGmetZiRMV1XL0dYa8ha8RNgcAo1aZAumFtbWw9iFsuFkCOtTac2VLVWpVL+dFfX3G/tMyblDP9BsWjGNDT44mgxHeA2oeRQGyW2ip7v0HdjZhBsBh9IEkSQIov8duL0DcATbJnYZmyfO8fCOK3PF54jWJsNAOb50ZOL+op9MQoFmYG9g45dVfe+ubnt07lcfkmNtmKlFGlt1hpTOX7hwoX9g6EABiPlwoVCj0xzS3Sr67rMPFCHRUmiGaDLZ8yYUZf5EoNfTlNlhikU5Ore3srK62+fh0Sfytr8QDhKpA0SrHewWZQKHSnK8ndpckobEyfaxIm2W36Mzf7PxInmjAkWBEED+b8dovnMzJqUFCLli++JIz51xfV3dA0IVbFo9oVQVbXVjBkz6ojE7PRMBq7ROI4LIfCzhQsX9vf09AxKceGg5PKqrWlEdIO1lqqTwIhIaJ3YXC53jBDu9DAMbRAE+64cZIt5VCtv/v0DK66/o2C0fT8z/1v57kDSd9cOgiRVhW3Lj6wKIA38e1ceFDYgkPRcxczLrNXvXXn9Hec/UuxdjoYGhX1ce5VNYLNCuNNzudwxWie2ptRJaK1hjL1xML9TDs55FgGA3vrWcx6uVKKPKKUOslUJS8uWWUp5+pvedM4NV17Z8SwA0dvbu++y96tXWwQQGF0Qz978i397hw77jvJ8TQKnCaU8tsZkHGP7thiR2YJghetIttwPtnOTqPKxNd//wzIUChKFPsJ1q/dpwjkIAtHR0WErFRyjlLghSRKnBhayjuMIrZN/53Jue29vLxcHqcZ+sKoPOHsqKkS40XVd1OBWZK1lx3GHWhtfneUN933VQ415fOI39/WvvPH2gDSdztr8TDhKZoRr+/BQ2WRmT1qtf2q1PW3F9XeEjxTvLQ+YvRD7g/RDEBFbq69WyhlqU3a1gemqjuMAoO+GYagH05oM5gHbFCyV365UKkktmX+KxldMLpf7QHNz24ezm1DYH6vGPD70/duXrbjhjvcazeez5YeE48h9I1xshONIZn7QalNYeX3v+1fffOe/94fZ24HD/uFczvtAFFVqhyywEEJWKuUSs7q+9gwHy6kbRGgpHdzY3Nz+M9/3z6tUttwIM1ulFKy1TyeJfPWQIWl70X6dwh5AAAEQhnZ8YeJw6w75mlRqSjovh+SgCZXrSJvomyXKU5ff8KeNCAIBhNhPGmrABALA5s04xHHMP4UQh+iUNVxk56FzuZyqVMo3dnXNnVI7dPPFprFqCSa+UlPjgy2OvGbX9UYrlXwzEyiB/blCWIShRUODWlFcumHVDb0X2UT/ePA0V8rjYBP905U39F6w/IY/bURDg0IY2v0pVNWzDcPQKpV803W90dkU3Nr9Fkmiwbx3w5j2i2A1NjYaZqZczr0tiqK/ua5LqGkBIyJZqZS17+ff29TUNn2/msTalbbDSwBUYUy12jxNaeftngcUDCYhhNX2ccPm40hTT/J5JnjtUxM4c2brZb6ff2+lUtbbzBkynucJrZO7urvn3hsEgSgOsnkedI3R0dGRhba0UEpJvE3JSdXfcl13flNTW8MLJlzFomloaJBrb+p9mo39VjprZy+0FrEhJQnWLl5z4+/XNzQ07K8S4+0KVVNTW4Pned3b+FVbeUFCiG6gtrP9RSxYYRgaZqb+/o0/qFTKDzqOI5i3YoMhay0xs3Ac5+YZM2aNCcNQZ/Oj96/iSnkRiIh/zIkF7ZWfldIjsTS3AKDe/cLC91wfNwxDPWPGrDGO49zMzMJau20WwDiOI6Ko8jfPk78IgkDsC0qEfeHjcEdHh1y8eHHETF1KqeekBzJ/y0opD3Uc8dOmpqahxWLR7oeunm21lgXAUvNKa8xGbM2VuFv3TIII1m7QkXkYAO9rzoXtOevFYtE2NTUNdRzxUynloVpru41fhXRIpyAizAnD0O4LbTXoUWHt5wZBQOvWjXRyuSf+5TjOsUmSbOs8MjPbNJcY/cb35buq4e5+jBQJADcEDWrNg+gjKY7fLd74GiCUlBRszH9WHn/OBOzPSLcmAgQgKhXzC9/33l7NBW7zUuM4rojj6O8rVz54Wn19Pe+rvd5XGoIBiMWLL42Y6cvbaq2MU4sAiHK5rHM5/+1RZG/aZqD2/liMAKI37NUAHtsD3viqeHLKy45HEIYW+1HzVvcqDEMbReb7uZz/9nK5rDNgFM/VVkRECIrFotlX2goYpJTO9gOvXg6CQDiOWFYuR+9zXfewLM0jrLUlgDc5jpO31iJJEpPL5U5+4xvPPPHKK6/44R133AHs67TPwGqQWL3aHvTqseeQkq9hY+2uzD7cZqUaS/Ptz/5r9f8DILF6td0fQtXR0cHnnHMO2tpm3+j7fmOpVNIAhFJKWGv7mVkIIQQzG8/zZRRV7uruntsWBIH4/Oc/v8+ucV8+WTxhwgQKw1ALQa2U1aBYa63jOB4z/8YYvcZ1PcHMolQqac/zJ7e1zS5ecsklKgxDuz8c+oaqZDBWYg9LC7J2BBB4Ze1n7gdH3V5yySWqrW120fP8yaVSSTOz8DxPGKMftpbvVkrJ7IGGtQZCyBZgzyenvhgEC42NjaZQKMjOzjm3RlHlVs/zZEq7ASml82YAM601z7iuKwBQJlwfOvjgQ39x6aWXjigWi2Z/QREk7Mqsz2sPHVUeYGjp3feaShWLRXPppZeOOPjgQ3/hef6HMk1FrusKrfXTzBQ6jnpdNiLO+r4v4zj5fmfnFfcMNsq+3wULAOrr67Okp5iptU6EECJJYu373pHW2vOiqP9sItqklCOrwuW67tvq6obfMX1663H7GueqwgIMsTqlE9oDQhEmkb13DYB9SvhfxammT289rq5u+B2O476tKlSO40iANiaJeTuA97iue4jW2kgpRRzH/dZSKzNTdib7PCra56umLn5BPp+fUd2IfD4v+/v736a1fTqf928nooPiODYA4HmeNMY8qbX+aHf33F/VOqmDe1IQCGHHT550PBP+Xe123o29YRCILRIr3RPXXP+bldXP3FdOenNz+zuVUt+VUo6OosgAgOu6kpnXVyqbJ0npnjRkyNDi5s2bDQDO5/OqXO6f1dU1b271LF4WgsXM1NHRQQCGVCrmX1KKo7TWJnMwn/Y8OWbjxsqJuZz/U6XkmEqlogGQUkoCYGvtrM7OK+fVPrGDDTkcN+XcYZrLy4WgUWx51wWLwSSJ2NjHc5qO7yv2bsYgU2jX3nNLy6x2KeWVSHsKDAD2fV9prdeUy9F5w4b5D8exXQOgzhhjXddVSZL8u1Ta+LqRI0cm+4leav8kgYmo6shvZDZfzOAH0lpbz/NHl0rJNxYt6vpHf3/l7CRJ/pTP5xUA1jqxxhh4nj+3re3yW6oofRAEYhAhCQaA5TfcugmMxwdm1+7GYwMhAKK1gy1U1fsMw1BfemnL2La2L93i+7k5xhhondiqNkqS5E/9/VHDokVd/yyX4+86jjvUGGOrlbxCiP9evHhxlMEL+yUjsN/wlsbGRtPT0yO7u+f9qFIp/ziXy0kAqFTKxve9i5uaWt97zTVdq+K49JYoim7I5/OKSBAz23K5pB3HeZfnyT+3t8/+WBiGNitzVrsyZ3wXQqyq+XuEhNi94JCQ8aJnnJ2DMnWeKdNSNu1anvXxfN79s+Ood5XLJc3MlkhQPp9XURTdEMelt1xzTdeq5ubWi30//55KpWwAwPdzMori/50374rb95cJ3O+CBQDLli3jdIKn+/k4jtdLKQUzIy1dVv8TBMEhCxcu7J8374qLKpWoSUplU4cUqFQqhplHKeV+u739Sz+bMaPt5NQ8EGfO/R4LWMPADEReNcBgvOvqjjMdtWqrz9pD5Z7eC3Ga82s7ua3tSz93Xe//ABxSqVQMADiOI6VUtlKJmubNu+KihQsX9re0BMdI6SxKkrjaMCyjqPKolLYpCAJRKBT2azZgvwpWGIa2WCyK+fPDx6w1X8xgBk5NondEuay/DgDTpk3zOjuvWJAk8VuZ+YFcLq8AkDHGRFHFKKXOc13nT+3tX5o3bVrbqMz/4CAI1F7RgDOtxB4CDiT2nAyWmTOBAodhqKdNaxvV3v6leZ7n/Mlx1LujqGKMMQYA5XJ5xYz7kyR+a2fnFQuCIHDTz0j+13Gcg4wxTEQspSJm+9nOzs71fX19g0cl9WIUrKpJDIJAdXXN/W65XPpxLpdTAJCldgpNTe2fWrx4cRQEgT9//rze/v4Nb4ii6Juu6wnHcSQzuFKpaGabcxy3dcgQ9ffW1stnXnppMCIMQ01E3NPTI3fHB+sdwLKwErwtZ9Hzev4EtjA21Vi7U9UQBIHo6emRRKmGuvTSYERr6+UzhwxRf3cct9Vam0vvFew4jnRdT0RR9M3+/mfPmD9/Xm8QBH4YhnFzc1tzPp9/Wxb0cFoZWvnfrq65P6tiXvv7nF+QiajVQ49j92CgfB+RODSrdgARRVrb07u7r1x27bXXOpdcckkCAK2ts8+TUsx3HPekSqWCdOwIoJRSjuMijuPVRPZawH5n7ty5a2tMiwRgdwpTZM0N4yafdTpJ9UfeuuFgF1AsImIz8aEb7vrr85F3ZPcuwjAc4Eltb28/HBAfYxaXuK47JkliaK115ngr3/cRx/F/rLVNnZ1X/jz7HDcMw3jmzNY3uq53l7UG1lo4jiONMQ8ZE70un8/3d3R08P7WVi+YYNViW01Ns9/l+84tcRxrZibXdaXWyT+jqPSGRx55JK6vr+cJEyZQY2Oj+dzngiEjRnALgOmO49RVKhVkjag1AhY9A9DNRHTd3Lnhn7aBPGRfX1+1xYm3xbKOPf+so62gByCED94lyIFTjnhb0qyPf/j7dz+2HQyLCoWCqK+vp46ODlN7yO3twenMfDHA57uud3CtQBGR8n0fSZL0W4tFGzdS19e/Hm4uFHokUER9fT1HUTQccJZKKcYlSWKEEBBCUBwnkxYsmPeH/YGwv+gEqxafaWpqW1hXV3dZFTjN5fKyXC5/p7t7zserrykUemSxmEY1TU2zT3QcMZuZpziOQ1EUgZkTACSlVK7rIo5jMONuIuphpls6O8PlWyupgqyvr6e+vgkMFFEsFu2Yixs8ivlBIeVRbHahfIZhSQnBxqzKJYee2FcsJoVCQQAF1Ncvo0yItzrY1tbgOCJ+NzM3EuHM6rWalG+TicjxPA9ZmdENSWKvnD//yvur15zVrcm0+2bWT3I5/30ZIx/n83lVKm2e3d3dOWef0Rm8FASr9mmuVPTvXdd9Q4Ykcy6XV6VS6b/nz5/79ZpNop6enoGKx/b29tMB1cTMH3RdV6QCZhNmMBG5juNCSoEoiioA/khEtzLjds8T/wzDsLQ9J3r8lHP+REqcylrvQucOG1JKcmLvXXHj7Wduz+QEQZCPIvtqIpzDzOcCeIPneb4xFkkSg5njtIpIOJ7nIY5jS4QfAWb+3Llz/1Sj3W01QMkextl1dXVXbHkYc7JSqfyqq2vOudlr9o6SfC+XeoEFi7NiMzNjxqzJUpqlUsrhxhikdfHqK01Nbf8Mw/CuqunMnH/R19dH2cYXmpraTyWKP0dEH/a8/FCtEyRJYuM40gBICOE7jtMghGxIkhhRZNa0ts7+mxDij9aav2mNB0t1658gos1HX/Dm+z3hnWp27VBYCEIF8f1ExJ8LPjck33/QoUrheCHk66y1b4gi8zohxDGO48JagyRJUC6Xk+zQleM4rlIO4jjaFMfxD5jxtXnzrlhao1W5+iBtEarW8zzPuyKruyKlHBnH0WNaq49mJt++kEL1YtBY2/hbre/1/dxPq/6WUkoy8+NRZE+/6qo5D29LOblt/rClJRgrJU+xli9UStZLKZEkCbJQXWdQhKOUIqVS/g5rDeI4Thj8uE/Oqrue7jtyefnx8Q6LdIjvzjePE7J0Qu7wh950yKseq3AylkCHua7rCCHBbKG1RkYZlGQaTUkppeM4SBF00ycE3WgM3dDVFa7a3n3VmEHT1tZ2EpFzLzMPNUZDCMlSSmhdeUtXV9edL6Rf9aITrG38rY66uiFBqdSvAZDn+TKO4z/7vpwEIN5elJNqsAlU9cGmTp3qHHzwoWczo0DE75RSHSOlgjEaWuvMH2OLdHyOJCIlpEDe8bFs/Wrc9cS/4EkX/DwPPYEQmQQNh52MV404BqWkAmssmFkTUab0SBCRo5RC9RqM0WuY6VdSip6nnlrbu2TJkiQVnh5ZX7/sOeXC1YK+L37xi8NzuaH3KKVOypL1Vb/q0u7uzq+80H7Vi1KwqtBA5pT+KJfLfaBcLmkASDevXOzuntO4M/+hJpTXNf83JIr0mUT0ToAamHmC67p+VVsZk/5YttoVyj5ceoZuf+o+xyG1S4KVsMZbRp+SHOkfzAlrIUgoKSWklKhqrTiOK0S0DODelOpJ3BOG4ebah2onkAj19PSIZcuWcaVifun73jsyE1jdl//r7p7zyReTUL3YBKu2CiIfRfZux1GvrjrzaelHqbura27L1KlTnepTvrOgoFAoYNv8WGtrMJ7IvJ6Zz2DG6wE6DuDDlaOUpzysjzfhp6vvxq6moYkI7x97JkY4dYh0Ap0kGqC1RHgQ4L8R0b3M8q+dneGKbc1/sVhE8Xn4RasC09LSviSXq/t0VZOnhXvx3ePGHX32b3/7W1ss9th0BM0BwdohgBiGoZ05c+axrpu7F6BDUj4nYX3fV/39pS8sWDBv8W48oQOR5/ZeP3369Fw+nz/CGIwTgsY+G5WP//Xav37BkPUzlUU7fA4IpCDK/3XYqdcM9byHrOVVUmJlqVR6bNGiReXtCcl2cbQdrOoD1Nzcfnk+n/9ybUGftXZNkog3LFgQPr7XdOevBMHa2plva3Bd9zfWWmGMISEEZ8nVxvnzO4t7ov6DIBATJkygjDt1u+Zn7IUND4jnawXLMCxr7L9X3dhbvyOzPGHCBF62bNlut1lVhaqpqf1TuZz/zSiKNDMLKSURUcmY6Kyurq6/vVic9ZeEYNWagJkz2y7K53Pfq25shi6bJEn+a/78ebcNgm9BQRBQX18foR6yMKFgWn7y1duEoxpssjMsKyUAMYn+bff7P39ucVlRog8mg0/2qpiuKlQzZ7Z8wPP8HxpjrLWWhBAspZKVSvm9Cxd2/ezF5le9JARr6w1uax0ypG5etbVJSimIaFMUxW9duLDzz4O2wRlb8bgLG64TrvqojROdUkRuT2Gxlq6jTKT/d9VNvZ8aYDoevOj4HNd1f2mMcdJRumR931flcukz3d3zrn0xCxXwAlQ37M5asmRJEgSBWrBgXme5XL66rq5OEZHJWseHep7zixkzZpwchqHOSFn3Tq62SM1K7KLKGcyWr6qwzJjR+gbXdX5qrfWymds2l8upcrnc8VIQqhe9YGUgYVZmM2d6f3/p+lwu72Sm0BDJQ1y37tbLLms9oVqOszff1btFG614PnWeUW8PWsvXFtPf/lrf925hxtBsaoTN5+tUuVz+anf33PClIFQvCcFCWvxmgiAQuZy6OIpK/y+XyzkAOEliI6U40vPcX7e2to7f61axaiuYoDXZZPkd7w+TTKdNiNW17907TdV2suPIXwE4OEkSS0Q2n69TpVLp+q6uOdN6enpkhuHhgGANknABQEdHB2/evLGxUqnclhUIcjYge4wQ7m+/+MVUuPbYLGbzcqTlR9kYk3G283avR4CstokW5rHa9+6NUHme8xshxOhUG5PNsLufdHXN+WhNeTG/FA5MvkQECxmPg+ju7tZveMNpPwTEJN/3x2qtrTGGHccZqRS979RTz7xlxoxLnwmCQPX29u4etpPZs4Nfc6i27HxaSKob6J/f1hQKQWD71HDhz3vivhXJntjCLc2nLa/2ffc3QojDkiSpAYQrt65f/9QHly49j1+ogr2Xu8aq+ls2CAKxcOHC/s2bxbvjOLqnqrmiKDJCyLG5nPu75ubmV+2hWcxawf60CcDjEGL7rWDMDEEA0dr7rv/NHo0I2RL9tb8+l/NuI6LDqvm/XC6vKpXKbx5/XH5gyZIl1cI/fimd1UtKsGqFa/HicGOptOldcRzfW2sWhRBHK+X/7rLLWl63R8JVbQUjPExE228Fq7Z88Z61fE2dOtXJMLo3OY76LRGNqtVUUVS5LYr633fddWElCAJ6saHqL0vBqhWua6655llr43OjKLq7VriI6DDf925ramo7a3eFq6Z9a4etYLyFPWTVNu/ZDWyu9R2u69wK4KCthSr6dRT1v2fRokXlF2Oq5mUtWLXC1dXVtcGY6Nwoiu/I2sQ4m019kOM4tzY1tZ63h2bxedu5LO9ey1cQBCrN/bU1uq73c2YeUtvRXKlUbnnssTXve6kL1UtasGqFa/78+ZuiaPO7oqjyy7SDmqzW2jJz3nHcnzY3z7q4RrhoV7AsIqwCY7utYKmBZJCgXcWwKIMKdEvLrM+6rneztUYZYyyQQgqVSuWHnifff91111Ve6kL1khesWuFatGhR2fPkeyuVqCefr1MAbJZjg+e532ltnd2SCRfttKm1ikdZm2JZ22X3I8HaQpJ4+PkwrCAIBDOjsbHRtLTM6vA87+tJkthspk1VqL7T2XlloYrXvdSFCniR5wp308yIakje2nr5tb7vTS2Xy5qZBRGx7+dkkkSL58694gvV12/3ALP2reOmNBxlLD8IQduWzwy0fBnBx6254a61O4oKq5UHQQARRbO/4Xn+pyuVsmFmIiLOhoRe09k554u11/9yOA/5chGs3t5ezooExZw5X/7Z6aef4eZyuQZjDDMzGZMY38+/8Y1vPPN1J5zwhluuvnputF2sK7NrQ18/NoalTwohhsMyp7MOkdEWCQLzo3XJM91P9T1ltveABkGgvv71r5tLL710hBDv+JHv++dnFbGCiOB5nqxUKpd3dc1pLxQK8mtf+9rLRqheVhprG39GZKZnmuM4X0kHPRpLRDaXy6s4jv5aLieFq6/uXLGD3BsB4LEXTvqjVOp0u1UrGBuhlLSJvnvlTXe+KaVd21pbVSO/yy5rPcH33R84jvPqakeNlFIKIdiY5DOdnXOX1LZ2vZwOQbwMBYu38EPMWRzHUUFKWa7ynJbLJa2Uen0+7/5hxoxZZ2/Xqa/iUow1EIRtDj0DR5HSQp7dUKv1qSbye7vvu38QQg4IleM4kog2a528r7Nz7pIgCFRWOs0vt0N4OQpW1anXQRCo7u55P4ii6K3M/JjneRIAsjr6w3xf/bq5edYlqcbigbarKi6VVi7QNlKV/ZlBDQ01Pl71e1tb2z+vlHMrgEPiOMqoL33JzGuSRJ9TJet4KVQpHBCsnQjXggWd9xgTvUlrs7SKdWmtrdZa+b7/jdbW2V9taDhbbiFzy9QP08odKhPaAjVUSdIKhYLT2nr5Nzwvt9gYQ1nZC+fzeaW1/mOlsvnN8+fP/cvLXahe9oJVFa6enh7Z1dW1asOGp8+O47iYYV3MzJwyCvr//aY3Nfx2xowZY8Iw1Bg7NjWNxKtgt6Y1IoaAZZDgVQDo3FNOqQ5GGnf88a/6ne97l2TRKBNRBnxG369UNp1z1VVXPVzFs17u+054haxaeKGl5fIvu666PHPqawliH9daf6K7e+4vAeD4i855jWb7txr69yrsYEngNSuu7/0XADQ1zT7Pceh/pVSjoygacNKVUkiSpKOz88pwpxDHy3DJV4pg9fb2cgaMijlzvvy7M89803+EkO9USvnGGKu1ZiHEMCnllDe96Szx+9/fece6Ew+ujCT3CxDkDrhXRATGppXJU19C31Nxa+vsK1xXfYMZdVnOD67rKgAb41h/pLt7ztcLhYJctmwZzjnnHH6l7PcrRmNtizFldVCvyeW86x3HPTnFmFgQCeRyORFF8a+EMJ/+7kO9t7iu+2qbaAsAwlEiSuK/XTy+4X3M8n9d1317qVSymTLL4Iz4n9ZGU7q6uv75SvCnXtEaaxvtZYMgUJ2dc9a+9rWn3CClM9b3c68xxoCZOUkS6/neCSa2FzxSfiZXMvFQgXRimWFLhzhD7PH5I6cqz31Ntd2dSMhcLi+iKLrRmMoHu7u7H36lCtUrVmNtgau2NHu2tc2+lEjMJxJOksSawZR3fHn30/9G37Nr4EkXABDZGBNGjMEbDz4JpaRiCMSO4ypmmxhjm7q6rrxm289+JS7xShasYrFomJkKhYKcN+/Ka6yNG5jtf7IBBrDWGp8cxlZz/wg5cthaa4CUmIOZ/x3HcUNX15XXpBPLmF7JQvWKF6zMF+fqlLHOzs57jInOiKLoO77vSyGErFO+pW1UfF56loSQvu/LKIq+Y0zljQsWdN6zhaGY+BW/rziwtmsam5paP5L3coueSjYd/LPV97IjJAGAtobfM+aNdIgz5JlSFE+fP3/O9w6YvgMa63lNIwAqFHrk/Pmd39MsTmNjf+E7HiyztczWdzzA8C2axWnz58/5XspiDDogVAfWLkMSAIDj4I2fcvZT46aczePTn8cBOFu95sA6ADfsJiQhzj7lbPv3p1dOEVIcCiJYYx9Y/89V38CWIQAH1nbWgSduJyvs6yMUi2bshQ2PgOgUAkCgR4iIB2fK1wEf6xW5alvBiAZCnVXb/O7AOiBYe7wG2rwYtOLAdhwwhXvnZ2V/kk1bwRgAaPenfB0QrANr61UVHrJr2BKYAatN2vK1HybBHzCFL9eVURMpx3nUWo5hbQUOspF14YH9OSBYexoWptbPKR/8FBgbAFo/7hHxVO3vDqwDgrUniwFQX7EYE/AUwE/29vbqgSnQB9YBwdrjleFVTPwYQCl7X+MBDOuAYO3lGsCrmFZXewkPYFj7NyrcQsSPAgqF9D+LRaA6avbFwE1QndfT19dHhewiq9fY09Njt72+3i1P4HJmjmv/78DaiTDszQEVi0WxbNmy58w6fn7r0iPr65fRno4D2d173NFM5h2tIAjUhAkTOGt9BwAee+E5YxRZs/yG3kewm9SQ1THBexxDDE55c3Xw+v5Ylnb/kHrEDmbqDdFajTImPgSww40hX0oA4Nha3ui64hmt9dOdnZ3rd3CYg90aNTCmbpvvGRbHOMJafQgRDWO2kogiQDwjhPfY3Lmz19a+vqenRxYKBftyIux4UWms6uCk6r/b29sPZxZvYqY3A/w6Zj6OmQ/zPE+k00sJzAxrLZJEwxgdAfQsEdYCvByg+wAstVbe190dPjK4/vaWorsgCEQc2zdl85jPBLheCDnadV0QCTAzjDHV+czPCiFWE+FPzOIXWpdumz9//iYgI/o4fInZZkL9ruwvNze3v9Nx1DFJYjQAIQTLnVsDWABWCCJrbVQqbS4uXrw42osz5iAIRpTL+kNpny5Rdh3bPX9riYGd3ycREzNR7WcYAziOFNYmv3tewarVJFOnTnUOOeTQ84joI9byJKWcg33fAwBEUYQoispIw/JNABlm+EQYAWCU7/tEJKB1AiKClDI70GST46gHoij5n+7uOf+7l5WYVCWDnTFjRp3r1n2M2X5KCPHafL4OREB/fwla66eI+GkAmpmGEmGU67p16QTULRwdWus1gPhepZL8z6JFcx/dXc1avZfm5ll/Pvzww04tlcogAuI4zsiYn2tRmRmu60EIASklNm3aiFJp46irrrrq6Sqv1u5sSPV6p09vec2oUQf/nTIeuSRJsrN4LpW9lApKyZ3oHoa1PDBIlJkHFInnedi0acNn6fl8jer0+JaW2R+XkqZLqU4GACEk0uHwuIuIfmGtvVtKfshxnGfCMIwA8NSpU52RI0cOYVZHEfHrAZwH0LuVUrkkSSJmdgDQsGHDaOPGjb/u7p77zkKhR1ZH8O7JBgJAa+us84WQX5ZSnZBypFkYo++1lr8P4A7flysBbM64GnwAo6PIvJaI3g3w+5VyR0dRxUopRTpZPnraWnR5nrgq42jYVeEnADxjRutpuZz3Kq3N0QAmMvN/AXABmFp2QSJiIaRjrbmHCHcS4SFmPLxu3VO3Pc/gz124hvl1Sq1/BzOOFEKcxGzPlVIdq7VOqtJDRExEZC2vAfhfRLDbkpFT2ljiARgB8BFEYkw2ezsmInYcV0ZRdCntzOFNn7b2M5RSVzmO88Y4jgc+nBlFIejqOXPCu3fnLtva2uqZ5ZWu634giiLDzOy6nkiS+A9dXXMm7clTWT3opqamoUr5X3Mc9yNJEmda0a4EbPu8eVfevCsO98yZwWGOY78AYIYQwk2SJJJSeqmAxXfGcekTCxYseGhvegbb2i5vIKJbrLX5jEaeABjXdWUcx3O6uubM3tc+UBAEw6LI/EwpdVaSJBZp0ScLIcCM0zo7r1i6C58xpFzWpwghZysl/yuOo8TzPCeO41nbEyzKVBu3tMxuklLMlVKqKIoi13U9a80aY8znu7rm/qzWSe7r6+OaWX0DqDUzo8q0l0VaJtUqsy93XffLURQlSilHa/0f31cTMq2zy1FXVVPNmDFjjOfV/dh1vdeVSv2R7/tekiS/juPSRxYuXPhkTVRkw7BjqwH1KUwygerrlw1MYW1ubj9dKXWdlOqkSqWsiQgZv8OTURQVFi7sunNXhas6FBMAjjjiCLrkkkuS5ua2H/h+7kOVSkUDkFJKstY+7fvq6DAMK1OnTnUOP/xw7uubwHuiwXcWFa5bN1IuXnxp1Nzc/l++7/8io3USqbaymsgcv2LFiocPOuggsX79+ueY/e3MZKSWlll3KaXeRERIkngBbc9H6ejo4La22d/y/fwnyuUSW2uTXC7vap38oVTShauvnru2p6dH7glUUDsQvLm5fYHv52bEcQRm+2Sp5By/eHG4cVcFa2uhyv9OKWd8uVyOcrmcF8fxz+65564P9vb26t3RLsxMl1xyiVqyZEkybVrbqCFD5C1KuadFUcUAgFKOJEK5Uqmct3Bh1++2DWp2BcoAYMvl5PJ8Pt9RKpU0EVGmre7t6przxn1NHpJ+fge3trYdzyz7AEhOp4yStVZbG5+UaeXnuw6aOvVatWTJJcnMmW2nOI76s1LKjaL4O2JbKCEMQ9vWNvvGXC7/iVKpXzOzyeVybhxHf4ii/ndeffXctVUmuj25+TAMbUdHhwmCQK1c+WBLpVL5h+M4AGio6+qDqhpkFwUULS0tw103f0smVLHneV4cJ/9ct+7JC3p7e02hUNgt2iAi4uqcxMWL5z0VRaV3aR0vd11XAqAkiS0z53zf+0lLy+xXZ+yBYnf3AMCGLf4LZ74LPbs/oICOjg4GiI0xm5k5yvymgatRSu2qK8JLllyS9PT0yAUL5t1njL3FdT0Q8UhRc1CyWGw0TU3tX8nl6i7o7+9PAAillEySZE1/v/nAwoUL+3f3oHZ0eBMmTOC0E9nMzv7PdxxxyK5+xoQJEygMQ8ssv+N53oRKpZIIIZS1NtbafHTJkiWlnp4esacRZpW07aqrrno6ipJGa20khGQhBGmtDZEYCuAHTU1NQ6uabvcAZsTVs9wiYDYGgDR7sR9QTGs1EQzR3n3dsmXLKPONf8DMBkAqWFVhaWpqnZLP56aVSv0JEaksSoDW+mOLF897akun796vxsZGw8yUz3u3RlHUl8vlYK0ZXRWaXcHUmpraP5XP599fne7u+zmRJMk3FiyY+/cafs89XluEq+tvSZLM9TxPMrMlIhlFkc7lcicAzvwwDG1jY+NuaS0htheg7N8UpOu6zDwoVRqWiNgY/qMxWgL0OhEEgaivr+eZM4PDpFRfiePYMrNkZuv7vkyS+Hvz58+7fV8wp3R0dMgwDDUR/TiXyxEzxlSfgJ2ZwEKhYGfMCEZLKbqiKLIp2CdkFFX6HYe6M+0xKD5KldRf60PmVyql1Y7jCGa2QghZLpeM6zqXtLe3n14sFk3K2/DKW1WXaOPGp9aUy+WFRDxPVE2KlMmXfd8fmdFWCyIScRxXhHBDYPAOqnb19fVx+vSK2+M43iwEOZnG4p2ZQCJiKZPm6vUCsJ7nkTH2p3Pnzn20sbFxMJ1fBiAWLZpRBniRUg7VRrxSSmjNV1SjpVdyGmfJkiVJd/fcmZ2dc+eIxsZG09raOp5IXFypVCwRSWbWnueT1ubnnZ3hikKhuE+ilKpZdV3xh1Jp4wm+r75WNZM7itgaGxtNW1vbKCHoU1EUMaXQsbDWQkpxEwDam4TvDjSrSR336IZKpfyslFICzJlJtFKqt7e0tLyuOn7llSxcQRCoIAiUSg9MfiKX890s9FWUMr9CCHw3PahltI9VaQXA2l0xnQC0MTQ5l8sNL5dLmoiklJKiKHpWCPsHAByGHWYwa9KJiAuFgrzqqquebm5u/5XruueXy2VDBMXM1nU9VS6biwH8LcOr7CtJmLJSpAwjTN0lce211zrM/KEkSf+d4RkyiirrfN+5C9mw7/1xcbuoOUCE8601TOk0SqvS5+O+zs7O9anGGPxKhEwLEhH/fBtPW6RZEby7OuASrzAWHyLiMAx1rVUTK1c+8noiOkHrhFPfCjbFlfDXMAyfzVQ774+Lez7cioh41qxZY4hoYpIklD4IYCEkAPyzek/7KjoHwEqJeyqVKBHplzIRiYwY99iDDhp90q7icC8TsycAYNasWeOuvLJzXkvLrEnV/xfW2oZsHIjNMBUWQoAIf9/HB7W7SwCAMTjDdT0vY9SrSeCKB/exueYMPFzNzKullOAs0cfMxvM8AuzEF9me7fMzCYJAJAm/e+jQYa0Azq7+vwJw6nbMEpjpgRfjnVhrJ2alHwN5KmYL5uf30fbWWmcpDt3c3L5cSnmc1gnXaFwAeNXLSWCyP3cU0ROy1FxLS3tDf3+/Zkap+ntFhOOttciQU2SJSBDxY88X+u/P1dc3oQpNnMBsa30cstYCsBtqX7cPtaYFaFVW4cFV0DpTXse8mPZsT5cxppT5S88XhJimpvZTicS74jhSRFt6KBSA0akgZQkj5uygaEMGCbwobrZYTOvPreUjrK3m1mo1LFeyV+4HZxVra7+fCJQOTKWDAGDZsmUvZcEiIjWhuXn2cCklGWN4G6GTnke+MTgUoDcIQZ9jhp+eyZYATAGo462ruSg7qHgwLnJvCvhrkH5K5YeppWX20NT0MW05XNqvfg0Rr9t6zwaKMdyXsDRVy6UkM34FWE6x561vUikhrCUoJZEV+MFakxBtPeJYASyrBYTb+DKDkZ7gwUwDZVjJc1rWhCBIKXPpvwr7XGsxo7Kdo0GWgH3JL6UUAbS93HS10hRCCFjLyDTac16pAFQPfqAIWwhBQohhe3pQ1SrQ9vb2IwH5IWNSTvTqLBsiQTt+cqyxFiBio3X83YULF/ZXa6oBWKLnHJ4lEsIYPijFm5bt81Cft1HxW66P+jM/7yUHN9TUYxlj9PnMeBQgIUStKXTAbCUzDyUSRxLxOUKIC5ifa/kVQBuFECO01gOHJ6UUAB22pweVZfqNtfSqESNGXGOtQVryylkRvwZtbzg8GK7rQimFUqmMJKH/B6A/q0BFGIa2pWXWpizI4FqNRYQj92PQtK3WZCKAiJ/cX8K9L2XMmPgPCxYseHwXXvutlpbZvxRCfndbqFMBeIyIjqnRWEgPDsfvuaNdtADgeereTZs2npMkZjTAY4noZABnSymOri3iz76ThRBOpVK5HaBbrDV/37DhmSerGFK1Bp8Za6tCWtXV6RNjj99fO0/Ew7bV/lmUuPJlYgqHFAoFuaPSZKAw8PCEYXh9c3P75xyn7oxyuTJgTRQz+oQQZ9RogCwqxGszvGJPIhzOvnQzgDtqfzF9ejDS88x3XNd7T5LEBmlZrPE8T1Uq0fXd3XM+sr3PqyaWifh+IcR7qt9RhUcAmpD5YSYM9y13FTMdWut/EBEZY0CEvpcD3ADAZtM6eMmSJdsRrNQ1CoJAMTO1tc36jeu6b6ztMRREfE8WBdbkvjSY8foZM2bUVUn19/ThLhR6ZDXjHQSBu2hRuI7INFtrTDWSq2oeIcwNWSTp76i2iYj+kgn+VtdLRPWtra0HZ5NT94kpqhGYsSm8UDWDJOM4jrSmv78M4Ibd2o9UIdE9SZJsYBaVGoDU3pHWXQk/My+ktbau6x6eJDgNQG9PT4/Yw2rMbTtMKMuEP1YuJ+uUUqOyuclV4dgEgPv6+pLtVKpmKSd9TxQhEkJ4mRNNxhjred7wJEneAOCXxWJRABj0CK1a9draOvuEbEaTAGCz8u1/Llw4Zw3AFIb0iqhuqMrEQw898Jtjjqk/YcgQubkKE4nOzs7lRPij4zhccxhWSgWAGzHICWgi4nXr1kVEVH4u4ktmJ5iWDYJAdHV1rWHm7Hq5eoBWCAlm+37so4T5luaNjiMBHJc9CMTMLKUCM/8cAAdBxwtdRUr7SmPvxKc2CxeGT4ZhOJDSqYZm35VSUk3YKOM4AkCFIAhGFAoFO5gXe/LJJ9usdny3w7Fs774rhKCaKFembev0/iAIhqUsMYO+uQIACaHf6HlerjpWLjWDUSKEvalWs76QUd0LQWCSyQdttVm+7/SUy+XHlFIiO3Ayxhjfzx1SKiWfJiLOwMkXdGV1YVQuq2KlUn586+vVJpfzR5XLevK+0BxZEMPM/MFs/5iZje/7ZIz9eWdn5wNZU8oLJVgEgGbMmFHX2tp60H7/8lSYt0BAGdXPZiK+wnXd2tp2iuOYhRBNra2tBwN4MZTdchAEMm1qFd3bXq/WmomoKQgCPxOEQdFaQRCInp4e29bWdiiReHeqzdPO4SRJLDNfiRe4uC9LnbFS/qxhw0be39TU9n4g7Wh6Ia5HZC1O4qGHHvxmqVT6o+/7ipkNEQljtPV9b5S1tCAMQ7t27doXhdYKgkAcccSor5fLpX+7rjtwvUmSWN/3jy2V4suycHmwrlcQEWuN//Y8f6i11jCzzeVyUuvkW/Pnz/1rFWd7obRVR0eHmT59eo6ZL0qSZBSAZzL/5wW5IFHrgDGLi5Mk2SylrJoYWalUjO/nPtbU1DplyZIlydSpU50XWmv19fXRpZdeGhHJT1prrRCCs+YGEceRcRx1+fTpLa8Ow1Dv7ROb1WCZ5ubgKKXkpVEUMQB2XU9VKpWVRLa5qtH23k/ZM60XBIEkIlYq/+G6urqjN2/ufyqO3X9mGsu+YIJVpeaZP//K+5MkvkhKSRm6bQGIJEmM47jfamlpmbRkyZLk2muv3Svheuyxx/bKbBSLRdPT0yM7O6+4J0mSmb6fUwDpDHogIaTvee7NLS0twxsbG002rHJP/RaROsT6Wsdxh1lrdFqWzFGS6MldXV0b+vr6dpshh5m9qvUkqnZDcw7Y7TYy6uvr4yAIXCG4Lb1W/Oeaa9Ky8p1dV7lMqla5ZMGbMEbJQdVYQRCoBQu6flqpxBcrpURVcxljBDN8Kb2fNze3vf2SSy5JCoWC3MMGTUJaXpKviUI5y//tMtluxpmg5s+ft6hU6l+Uz+cdZtZERHEcG9d1XkXk/PRzn/vckGIxfe0e+FXVitE5vu+/q1wux1JKJy0XiS9cuLDzj3tCFJcd+LAtRYJpFSzAh+zuXgZB4BSLRVMuJ02e57/KGENEtHTb861d1dyrUpQHkOGXqZRLKYUQGLK3PqPaxn+pMrN8t6WlfYNSznVKOcOjqKKN0SSlHKqU84vW1subOjuvuLoG3xFIW394RzhSBow6YRjGGzdWxvm+e4gxhomoanZBhHz66l2rqAjD0GTt9pe1tLSbXC4/M4oqzMxITbjfMHz4wbe1trZODsNwBbaiMtpu9EZZI4Solvu0ts6+wnXd9nK5XHFdzwdQiaL4ogUL5v1oV7vDa5maMwoh3dLSfmL1wcpAaRZCHjdtWtuoMAyfqtIY7Qz1bmxstGEYxi0tsyZJKYM4jhLX9Rwi3L0zLG7dunUOM8fNze1HuK6n4ji22TkYx3FlpRKNQ9rK5hUKhaSqQXcn4qUdXIBKn9TmVynlX+u67llxHCNLHMtcLifiOP6dtTbs6ppzZ+17t8cQXMtWPHXqVOegg0b9yHXd8+I4NkhbzhLP80UUxZO7u6/8wW628w+QxLW0zPqslPIqKaWfcT5Zz/McrfXT1nLbihX3f7tWu2xzrVsJW9rE6y5QSn4gjiPt+3mVJPEDcRx/rDqxfk9rzWbPnn28tfRHa3nEtsRrWic3MetpnZ2dz+yC5nOjiM8XghczY5hN80yGSJ3U2RmueD4aopaW2dd7njulUqkYIpIAjOO4Uuvkds+T79ibWrodqrsa3ifR1jbrv4lks+O4R2mdII5j7bquymrlbyMSNwlh7rjyyitX7Mimp93Lzlus5cuEEKcnSZJkrfySiDB8+AisX7/uiq6uOV/ak0OrUkw2NbW/3nHUIqWcSdYaRFGkhRDKdV1orZcC9L/M8a86OzufM3cwpbY89BQivoAZn3BdbySzhTHGMNtrS6VNs6655ppnd1fw29raRhsjRwL2mDThj08BdIS1xjBjoL2OCKyU4xhjHgX4bmY8ANgnmEWJiBNmImbOCUEjmXG8EHiDUs6rkiRhZo4dx1FJou9fufKBU6oVJtXPDoLA3bxZH+55apS1+kSACkT0PmttUgN+E9IUlWOM+SORuNEY/U9jsFYI99m6Ojy5q1rr+ThIByR++vTpIz1vyMeI8DEhxKullEjb2iWYGVEUlQB+iJmWZ8zIG1MTKQ5mtscSiQme540iAowxUErBWosoimKA/uO6zp/iOL6hq2tOb5WgdnefkloStLa22RcRiS8KISYKIVGljiQSiOOoH8D9zHiICM8ALJnpMCI+SUp1fF1dHbTWqFQqm4no50miF86fP/cvVS23O/yjQRAMqVSS1XV1Q0YSEZRSiOMYaTUEobZGjgiw1kIpBcdxasqCtn5N9f+01kiSeIBYNp/PY/369d/r7p770arwV/dk5sz2Dw0fPvQHxli4rlM9Mzy3/AewtloXJ6G1gTEapVLJKIUxc+fOfXRXiOFodw+sUCjIE06of5Mx5t3MOAvACUQ42PM8OI4DKSUAyjaABuiu4zhCFEURQI8T0YMA/5UIfxaC/zZnzpyHBjOnV+PrUWvrrLcSiQKAs6214x3HUUo5UEpBSjFweJmQI4oqzwK0VAjxK2vpx52d4fIajWix67nIqmD5UaQXE8nhxmhdTS/STvJZWXJ9V7jlxRYHnY3n+SqKom90dc35XfUBqApBa+vlb1BKNiVJHFcFNTN/O7oKC5DNquEVMye+70wLw3DdrvDE7obnzxQEHc8hXWtrmzOKuTIesGMBPpyZRhAhn6pXKmdtWU8IoR5lFg9H0bBHU+aW5/p1O3GqsTfaKzVz1zqjRz98XJLYk4QQY63lg7PwPk47kugxgFf4vnogDMMnt/HD+AVM1bwk156ElAMjRLLcHe+JVkFGdpvxmDL2TVUCFQoFUSgUsDtlP9uQXOy1QGXQDIpFDMwYGuxV/ewd88Iy9fQUxZ5eQ7FYxO7AKnud38qohcTzUQdtw6r8QhTCURAENGHCBNoRsVtfXx9vb1DTgTU4Got6enrEsmXLqCoMfX19tL2wPGNOpu0dUBVw3cH31mqCHfUe2jAM+fnyfTUCu1uaZVdm5NTSaO8ISyoWtz81bBe0tnq++8oiO96da9oRzLOze+zr66Pn00Y7PutdoAvfi9THC76YmV6oTH71gPYFVeRLlX6y+tRUu2DNxRdf7B9xxNjzmO25zHw0wHVpxoVWEck/GaPv6e6e+6cgCNxyWV8sJVSS2E1ETEIQu64/Mo6jh7SO7lDK/ZS1VBaCS2nkJcj33YMrlej31fB9+vT2Iz1PFowxJWYuSQmknxH/3fdVX5LgoiRJNgqRdmYzwyMSeQAQAiVmrPY89S8iehzZCJFt6aW3jdQKhYIcN+6EJQBf290998/bwhs1kdREx1FnxXG0rlqtSkR5ZvLSah25QSm5XCn0hWH47LYQzY7W9OkLc6779MeIFDPrzel9CQ/gupRQWK4Tgh589NFV91133XWVKmIehqFtamo/1fe9N1evyVpBQthhgBCABTMxQP2OIzVg7pwzZ87q7UVx1ei5tfXyU63Vn+vunvuJHfGKpaD2IRdLKd041hurrfSu647QOlnf1TXv+u0J1sAclebmWZ92XSe01khmex0z/YKII0CcBOATI0aMuHDduqfXBEFwbPoePg6Q7xwyJP8aay2sNWDmWwDxgzgeIpXSJ0mJd+Vydcek4XwMZv6hEHQfBppjySXiE4XAW+vqhh6fJAkA/Brg1aVSyXXd3AQhqJDL1Q0HGOVyeSPAdwAUW8uHEVF9kvDI9vYv3WWt+R8iuqlWiLbZTBmGoRk79rizDznkkE8888xTBsCfJkyYsD3TQsx2KDNOJxKTPc8HEaFcLq0hwp8BIZj5KGPMBGvJmTXrSz+vVKKvhGF4x06EiwBwFG2UjoMxQuBdudyQVzMDpVJpPYBfMGMIYBpcNzfiyCPHPNjc3NYehuEPqlGzUnI4gDcAVMjl6qS1BpVK5U4irANIEFEdgNOHDz9o6DPPPPVJAP9XZULcxtRSirKY6SNHHjK5tfVLSzo7ce/2+hsOP/xwqlT0Ucz8jiFD6t5oLYPZwlp7C5G4Y3t7TdWI5S9/+fu3Dzpo5Ec2bdp426ZN6z+4ePHijc9Fz2f3MOM8Y4YeOn9+y6aq5FcqemU+nz+iVOr/QVfX3Mlbpw2CY4hMn+/7Xrlcnt/VNad9R0/FyJGj11nLv+runvPhrT+j/QOO4/Vk06be2dU153fV3zU1NQ0VwvuU46irHMdBqdR/k+87H+vr6zPb+ig107h+ks/n3lsqlZ4Rwp7U2dn5zM6wmdbWWZ25XH5GqVTamCTqxKuuCp+u/q69vf1wY0R7XV3d5zOsLpg/f96Xd0VztbS0DAfUQ/l83fD+/v7PdXfP+Wa2p0OiSPfkcvn/qlQiaK1Pmz9/7l+2HkTV3pbLDflyqdS/3vfVUWEYDnBtXHZZcEguR8uSJFnY3T2ne9tMQfVzmpqCI6Q0//F9P18qlW7s7p770eebtNHSMuv+fL5ufH9//8+6u+d8cIcAW7FYNEuX/r17xIiDPvLss88+sGZN//sWL168cerUa51qBUMQBC4AxHH588wsrX12DABce+21ThiGzMzrZdp98UhPT4+cNm2ax8wUBIHyfZSstRUioZj58WobWK1wT5061VmyZElirX2aiFdWv7OhoUEFQaCEkOuYrWJmRSQ2BEGgpk2b5qWlPvM3dXVduahSKX84iiJTVzd0crmcdGb02LUDEkSxWDStra3HATypXC5tyufzhwCikDm6cnu5uLR3zj5BRIrZlocORVzTzibmzp27tqvrymmbN2+aK4RAPp8PW1pmXxiGod2Jz0dBEKhNmzYZgPuzqg6RfWY+DMPNzNRSLpdj13VARBdVz2vLNeEJgBXAcsOG5OAgCNTtt9+upk2b5l11Vfh0HEffBPiYnQCrIEouFkKocrkMIcT7Z86ceVi1E2kHwQZVz5oIa7PWPn+7X9DcPOtMIvHFKKqwtXbR9dcv7J869VpnyZJLkmKxaIrFognDMA6CQCxcuPBJZu5gTtXq1KlTda1GYCZqbGw0I0eONNVqic2bN4va4DN7cmqfZD788MNNluTfDFA5i1Ds6NGjOQxDbe2WSbDWGhmGoX788cd1WpzIdO211zoLFnT9MEn077RODBF9vrW19bgq8ly7mczqMiL0WEvfdRyXjeGPZ7iV2UFkqo1JB1cSEVUqFcr4Nk21jq1QKMhczrkiiioPM8My2y9ffHHgZ6N/aQeVGTqXy3FtcV8Yhnrt2iOSVHvmH7PWbhRCGADDt70m5q2R+76+Pr7jjjtQ3XtrR86TMqUJ35ZDNqvCdQH6mDHJp5j5sXy+bqgQ7gU7esiyc6ul+EEWDW43ZyqI+POu64pyuRwJYW4FQIcf/pjZzgdbANTdPXfeVVfN+0/VL3u+6MB13V2ey8LMCTPvdC6fEHJrW07Ejz32GDMzSYkfMbN0Xc9hVu+uESgKw9BMnz49B9gPCeF8FbA9UVQhx3FOa2v70hlVZuTtqpea+/R9n7cBDk0GFleY6TaAhZTy2EMP1a/PAoVdggaIUo11+OGPOR0dHcS8YagQlCMSEsDvd/JOHj7cWZ8pAJ1OGGn/OtEzZ82bN++JLNLnWtgAAEol/T6Ana6ueTcS4Q/pPfLFhUJB7uAh260lmPHGrNBrre/7jyGlHtqRMFQ3f181DuwKi9x2MZ80B0cPZK3uDNgTa512AHCcfCOAftdFXz7vLi2XK6vSiRjmk5kPtleYIDP/BwCy0cUnAANsy88jVASANmSCkbHpOZeOHHlIXX//5l+Wyxuvr5ZIb/0kAgA75bJ5b2vrrHc0N7e/s6Vl9sccR31SSuFtz6RlNfAsBC4lws09PT3SWr45jiNSyn3t2LHHTUofsr2DbhQRRmYNxZUdqbVtn9B9itjuBerNzKWMWY+wdRFj5sTzNGb6aqZ9S62ts79lrb0SoPe3tbW1NTY2PrUngzirXw9gE/OA9t3F8m0SSZKAmT/c3DzrKCIoIjpTSvmWZ59d3+r7alFX1+J428grnclskY5HtousRUYVZQ93HF8lSbI5E5BtIQbT2tp6gjF8spT2PZmj/pPm5vZ/DR069GStk08CuH1vOcYEgJgZYMawYcOGebsCBO5pGxgzP99ToHh7ZEu7LpT5jNKI06QysG7dOhmGoW1unj1BCPEagNY0N886s7l51pnW8uPlctn6vn+wMXT+jvyLXf96GpKVvtDucLhm3BmjALyKGZfl8/l3W2ttuRz/MAzDODNf23ByUZXderMQda/t7p57THf33DFS8hFRVHlaSjGSmemgg9aLbZ12ZvlZKeXj1orjW1pmTZo5s/WNRNSXJJqFEOc1NTUdsY1/ulurp6dHCoAeSp0yHPrEE+vHZtHcDkf6hmG4W4lZ13UNEXTKH0Ujt2dGq59HhBHMWL+7N1JfX19tKz9RKcVaa7JW3LXN4U11HJeJ7NcA/mX6gy5mG2WVl58IgkDshX/BRHSSEIK11pukxF8z8/o8e8XWdV0Iwdd2d8/5uDGqvlQqPep5Xp3jyJuCIBBZKuV5TWqhUBDz5s17SmvTAYhH0tmLlyQ1Z5f5mfiwEDQKwK+Y+WdSyl8C/JZKpWx93x9O5F5YK4i7uxobG41gRg8RyHU9RcQfICLeXv9g5ltxc3Pb25ubZ11ck7faid8AANgI8LPZJr5me7mv7OcQZhxJRPdV/abtOmHWPGcq7Nq1a4mI2Fr7XsdxKEmSf2zYcNSdQRCIr3zlK/HnPhcMkZI+GUXRf/u+c7wQdmySOONyOTWeCM1ERFKq11Yq+kwi2mlqq1Kp0HZybRwEgc9sz5FSEUA/mDt37tpCoSB3xawyM6ylYUEQqIULwyeNsV82xsLzvFPL5Xhm1ouww2vq798sshyvZWZasGDe1zo7r7gnCIKRzc2zJ2QRvEqnzOc/yMyHlMv6lFzOGUNkjvF9Ndb3neOJ6PdZK93FQRCoPXjIKAgCv7V11mRVLqtvEcWf8f3c8QB9fsaMGd9auHDhk9dee63z2GMD0aHYMqlLfouZ/yczM04QBEm5nAy4GUEQqHXr1kkA1epF3dzc/ndj7AlCyLNbWlqOCcNwTYZlWaSNC3FTU/vHhaCy76u/AKBisWiDIJBBEKh0bPKAw2qr35FVK3BjY2Myc2brublc/txKJYoB+tySJZckQRDkiag0c2bbFGbh53Lq5jAMN24NfrbeFEVRkM/nD9m8uf9TAH5/2GF3qeq1BUGgymXNVTgll/M5CAK1du0RdPjhj3FHR2iIYJua2toOOuigsRs3blxtjGzPIIydJbhVqVQSqdkGiFJClAwX+la5XPmE53mnS6m+PGNG621hGC7Nejop3ZMtFI51dWmAsmTJEnrsscc4CAI3DMNSqRR9WQgxgpk/ctllVykiSpqb25uJ8ItFi+Y++lzws/27WusGx3FOrlT0pI6OjjumTZvmLl68OKqOai6Xk+rQBM6wLRUEAVatgrruurBSKkVvI5KLKdvcNxA5t9XV1dVt3ry5t79fvjebzbzNF8++xnHUFyoVPnzBgvDxmgtaXlc3ZGx//+b/6+qaO3VbpLulZdabHce5i0hA6/h3rivPD8Mt6HVLy6xJnuf3RlHpC11d8xZvW/7b2jrrXKWcn6cgbXRRd/e8729zXRe5rvM9gJ6sVEofnz+/8xdVdLlQ6JHHH79spTH6vq6uOefVVnVkKR7d3Dzra/l87pJKpbKJOXlNV1fXmtrPb25uD/P5/KxKpRIZg9fOn3/lg7Ugahzb9iFDhgSlUukf5XJ8wVVXzfvPriDvhULgjh+vH87n8weXSptburrmLay5p9cIQUuVcmSSJPcDyRs7OzvX1/x+uu/786OoEjMn9V1dXatqP3vGjFnjcjlnWRwnn+3unnNdmqW4/K1Dh+Z+u3nz5nO7u+f+qqqVGhsbB7q4m5tnPZbL+aMrlcovu7rmvGc7wvevurohJ/X39xe7uuZMfm525vI/G2NX0xZ4v/31Sslrcrncm0ul8hPW2m5mvoNIlInsSUTi8yNHHvyWp59+6tfd3XPfOW3aNC+fH3q+EPJdruuen5kJI6VcqLX+XXf33F9nG0+p89z6Rcfxuj3Pc0ql0jpm/jWzXSeEnKCU02CMuWrevC/PqE24NjfPfpXrqvcmib4kn8+Ns9aiUinHzPRdAM8IgVEAvVZKeTjAN5dKmxYsWrTo0azqM1epmE8S4VNDhw47eePGDU8ppa4G9E1z5sxZCYCuvfZa9dBDay6UUjT5vj+BGSiXy486jlosJV9XLuvxjuO+S+t4uu/7eSKBcrn8KLP9kRBUSU23mCiEcInw9aeeWvv1JUuWlJ4vVzhtWjDM95MLhaD35HK5dzEDlUr5Wcdxro7j+FcrVz7452KxaJqaZn3EceS1uVwuVy6XVlhrL8msxjnGmM/7vj8sy1/eD+AWa3lT2pyCMUSikMvl/HJ507FE5EvpfTJJki8MGTJE9ff338aM631f3pilgmjGjFnH+L662Bjd4boeSSlRqUQ/szb5PmBvsVYWpJTnuK57IcDQWkNr810iPJhRHIwG8I4RIw6qX7du3WfVli7ouX8FMKml5fL3C0FThBAzmW0rM+ss671y48YNc6XkGwCQUmMFsO40gONyuXxNFqYTkTgqo238VXWDsz+vbmmZ9VdmvoSI3szM5wshK0KIP0ZR8u7586/8Re3rU3VrjiByXs3Mv9q8eXOcbqpQAA8H6GBmPEwkf1ypbL594cKF/VUTE4ahbm1t9QDxGkD88dln1/9WCPIAmpAkPApIuULTjmx+HYB7Nm3q/60QABF5RPTqOI5GEGG8lGKc1vi/UqlkAUBK4TPTQQBtIsJ9Uopr58wJ78KWbpgdaqoqbypRnAPoDGY8WSqVr8kIc6QQdAKReLBYLN47depUZ/78Od9rbW3tK5d5MkCnWcvTmHG3lBjLjOuzkcWQUuSZ+VAiOjRzFxjAdzZt2rRuwYLOFa2ts94hBB3GzP+zYcMG6zjOcGPsRABVzc9C8CiATrSWv1ouR5wlvEcyi9dbm/xOSnk6szFRVPlKSqgIkQZbfFIqH0wA7nn22fW/tpZ+9f8BME2c9dZwx/8AAAAASUVORK5CYII=";
const LOGO_GCR_PDF = "data:image/jpeg;base64,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";
const LOGO_PGA = "data:image/jpeg;base64,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";
const LOGO_ENG = "data:image/png;base64,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";

const FIRMA_JOSE = "data:image/png;base64,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";


// ═══════════════════════════════════════════════════════════════════
// CONFIRM MODAL — Reemplaza golfConfirm() que no funciona en artifact
// ═══════════════════════════════════════════════════════════════════
function ConfirmModal({msg, onOk, onCancel}){
  return <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,
    background:"rgba(0,0,0,.55)",zIndex:9999,
    display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:360,width:"100%",
      boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
      <div style={{fontSize:22,textAlign:"center",marginBottom:12}}>⚠️</div>
      <div style={{fontSize:15,color:"#1a2e1d",textAlign:"center",
        lineHeight:1.6,marginBottom:24}}>{msg}</div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel}
          style={{flex:1,background:"#f0f0f0",color:"#555",border:"none",
            borderRadius:10,padding:"12px 0",fontSize:15,fontWeight:600,cursor:"pointer"}}>
          Cancelar
        </button>
        <button onClick={onOk}
          style={{flex:1,background:"#c0392b",color:"#fff",border:"none",
            borderRadius:10,padding:"12px 0",fontSize:15,fontWeight:700,cursor:"pointer"}}>
          Eliminar
        </button>
      </div>
    </div>
  </div>;
}


// ─── Exportar base de datos a Excel ──────────────────────────────
function exportarExcel(data){
  const alumnos = data.alumnos||[];
  const stats   = data.estadisticas||[];
  const clases  = data.clases||[];
  const pagos   = data.pagos||[];
  const mensajes= data.mensajes||[];

  // Build CSV-style content for each sheet, then combine in HTML table format
  // Use XLSX-compatible HTML that Excel can open
  function calcEdad(fn){
    if(!fn) return "";
    const hoy=new Date(), nac=new Date(fn);
    let e=hoy.getFullYear()-nac.getFullYear();
    if(hoy.getMonth()-nac.getMonth()<0||(hoy.getMonth()-nac.getMonth()===0&&hoy.getDate()<nac.getDate()))e--;
    return e;
  }

  function sheet(nombre, cabeceras, filas){
    let html=`<table border="1"><thead><tr style="background:#1a5c2a;color:white">`;
    cabeceras.forEach(c=>html+=`<th>${c}</th>`);
    html+=`</tr></thead><tbody>`;
    filas.forEach(f=>{
      html+=`<tr>`;
      f.forEach(v=>html+=`<td>${v??""}</td>`);
      html+=`</tr>`;
    });
    html+=`</tbody></table>`;
    return html;
  }

  const alumnosSheet = sheet(
    "Alumnos",
    ["Nombre","F.Nacimiento","Edad","Nivel","Teléfono","Email","Escuela","Alta","Activo","RGPD","Imagen autorizada","Alergias","Intolerancias","Lesiones","Equipo","Notas"],
    alumnos.map(a=>[
      a.nombre, a.fechaNacimiento||a.edad||"", calcEdad(a.fechaNacimiento),
      a.nivel, a.telefono, a.email,
      a.tipoEscuela==="adultos"?"Adultos":"Infantil",
      a.fechaAlta, a.activo?"Sí":"No",
      a.rgpdAceptado?"Sí":"No", a.imagenAutorizada?"Sí":"No",
      a.alergias||"", a.intolerancias||"", a.lesiones||"", a.equipo||"", a.notas
    ])
  );

  const statsSheet = sheet(
    "Estadísticas",
    ["Alumno","Fecha","Hoyos","Golpes","Fairways%","GIR%","Putts","Bunkers","Hándicap","Palo","Distancia","Notas"],
    stats.map(s=>{
      const a=alumnos.find(x=>x.id===s.alumnoId);
      return [a?.nombre||s.alumnoId, s.fecha, s.hoyos, s.golpes,
        s.fairwaysPorcentaje, s.greensRegulacion, s.putts,
        s.bunkers, s.handicap, s.palo, s.distancia, s.notas];
    })
  );

  const clasesSheet = sheet(
    "Clases",
    ["Alumno","Fecha","Hora","Tipo","Zona","Duración","Asistió","Contenido","Observaciones"],
    clases.map(c=>{
      const a=alumnos.find(x=>x.id===c.alumnoId);
      return [a?.nombre||c.alumnoId, c.fecha, c.hora,
        c.tipo, c.zona, c.duracion,
        c.asistio?"Sí":c.asistio===false?"No":"—",
        c.contenido, c.observaciones];
    })
  );

  const pagosSheet = sheet(
    "Pagos",
    ["Alumno","Fecha","Concepto","Importe (€)","Método","Notas"],
    pagos.map(p=>{
      const a=alumnos.find(x=>x.id===p.alumnoId);
      return [a?.nombre||p.alumnoId, p.fecha, p.concepto,
        p.importe, p.metodo, p.notas];
    })
  );

  // Tutores sheet (for minors)
  const tutoresRows = [];
  alumnos.forEach(a=>{
    (a.tutores||[]).forEach(t=>{
      tutoresRows.push([a.nombre, t.nombre, t.relacion, t.dni||"", t.telefono, t.email]);
    });
  });
  const tutoresSheet = sheet(
    "Tutores",
    ["Alumno","Tutor","Relación","DNI/NIE","Teléfono","Email"],
    tutoresRows
  );

  // Build full HTML workbook
  const fecha = new Date().toISOString().slice(0,10);
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; }
      th { background: #1a5c2a; color: white; padding: 6px 10px; }
      td { padding: 4px 8px; }
      h2 { color: #1a5c2a; margin-top: 20px; }
    </style>
    </head>
    <body>
    <h1 style="color:#1a5c2a">Golf Ciudad Real — Base de Datos Exportada ${fecha}</h1>
    <h2>📋 Alumnos (${alumnos.length})</h2>${alumnosSheet}
    <h2>📊 Estadísticas (${stats.length} rondas)</h2>${statsSheet}
    <h2>📅 Clases (${clases.length})</h2>${clasesSheet}
    <h2>💶 Pagos (${pagos.length})</h2>${pagosSheet}
    <h2>👨‍👩‍👦 Tutores / Padres (${tutoresRows.length})</h2>${tutoresSheet}
    </body></html>`;

  const blob = new Blob([html], {type:"application/vnd.ms-excel;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `golf-academia-bbdd-${fecha}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}


// ═══════════════════════════════════════════════════════════════════
// PANTALLA DE AUTO-REGISTRO DE ALUMNOS
// ═══════════════════════════════════════════════════════════════════
function PantallaRegistro({onVolver}){
  const [step,   setStep]  = useState(1); // 1=datos, 2=legal, 3=ok
  const [form,   setForm]  = useState({
    nombre:"", fechaNacimiento:"", telefono:"", email:"", dniAlumno:"",
    alergias:"", intolerancias:"", lesiones:"", medicacion:"",
    diasPreferencia:[], horarioPreferencia:"",
    tutorNombre:"", tutorDni:"", tutorTelefono:"", tutorEmail:"", tutorRelacion:"",
    rgpdAceptado:false, imagenAutorizada:false, aceptaCondiciones:false,
    pinElegido:"",
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  function calcularEdad(fn){
    if(!fn) return null;
    const hoy=new Date(), nac=new Date(fn);
    let e=hoy.getFullYear()-nac.getFullYear();
    if(hoy.getMonth()-nac.getMonth()<0||(hoy.getMonth()-nac.getMonth()===0&&hoy.getDate()<nac.getDate()))e--;
    return e;
  }

  const edad = calcularEdad(form.fechaNacimiento);
  const esMenor = edad!==null && edad<18;

  function autoNivelReg(fn){
    const e=calcularEdad(fn);
    if(e===null) return "";
    if(e>=5&&e<=7) return "prebenjamin";
    if(e>=8&&e<=10) return "benjamin";
    if(e>=11&&e<=12) return "alevin";
    if(e>=13&&e<=14) return "infantil";
    if(e>=15&&e<=16) return "cadete";
    if(e>=17&&e<=18) return "boys_girls";
    if(e>=19&&e<=21) return "sub21";
    return "";
  }

  async function enviarRegistro(){
    // Validaciones — todos los campos obligatorios
    if(!form.nombre.trim()){setError("El nombre es obligatorio.");return;}
    if(!form.fechaNacimiento){setError("La fecha de nacimiento es obligatoria.");return;}
    if(!form.telefono.trim()){setError("El teléfono es obligatorio.");return;}
    if(!form.email.trim()){setError("El email es obligatorio.");return;}
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)){setError("El email no es válido. Revísalo, por favor.");return;}
    if(!form.diasPreferencia||form.diasPreferencia.length===0){setError("Selecciona al menos un día de clase preferido.");return;}
    if(!form.horarioPreferencia){setError("Selecciona un horario preferido.");return;}
    if(form.pinElegido.length<6){setError("La clave debe tener al menos 6 caracteres.");return;}
    if(!form.rgpdAceptado){setError("Debes aceptar la política de protección de datos.");return;}
    if(esMenor){
      if(!form.tutorNombre||!form.tutorNombre.trim()){setError("El nombre del tutor legal es obligatorio.");return;}
      if(!form.tutorDni||!form.tutorDni.trim()){setError("El DNI del tutor legal es obligatorio.");return;}
      if(!form.tutorTelefono||!form.tutorTelefono.trim()){setError("El teléfono del tutor es obligatorio.");return;}
      if(!form.aceptaCondiciones){setError("El tutor legal debe aceptar las condiciones.");return;}
    }
    if(!esMenor&&(!form.dniAlumno||!form.dniAlumno.trim())){setError("El DNI/NIE es obligatorio.");return;}

    setLoading(true);
    setError("");

    // Validación duplicados — comprueba pendientes Y alumnos activos
    try {
      // Comprobar en registros pendientes (Firebase)
      const pendSnap = await getDocs(collection(db,"registros_pendientes"));
      const pendientes = pendSnap.docs.map(d=>d.data());
      const yaEnPendientes = pendientes.some(p=>
        (form.email&&p.email&&p.email.toLowerCase()===form.email.toLowerCase()) ||
        (form.telefono&&p.telefono&&p.telefono.replace(/\s/g,"")===form.telefono.replace(/\s/g,"")) ||
        (form.nombre.trim().toLowerCase()===( p.nombre||"").trim().toLowerCase() && form.fechaNacimiento===p.fechaNacimiento)
      );
      if(yaEnPendientes){
        setError("Ya tienes una solicitud pendiente de aprobación. El profesor te confirmará el acceso en breve. Si tienes dudas, contacta con el club.");
        setLoading(false);
        return;
      }
      // Comprobar en alumnos ya activos (datos de la app)
      const alumnosActivos = data?.alumnos||[];
      const yaActivo = alumnosActivos.some(a=>
        (form.email&&a.email&&a.email.toLowerCase()===form.email.toLowerCase()) ||
        (form.telefono&&a.telefono&&a.telefono.replace(/\s/g,"")===form.telefono.replace(/\s/g,"")) ||
        (form.nombre.trim().toLowerCase()===(a.nombre||"").trim().toLowerCase() && form.fechaNacimiento===a.fechaNacimiento)
      );
      if(yaActivo){
        setError("Ya estás registrado como alumno. Introduce tu PIN para acceder. Si no lo recuerdas, contacta con el profesor.");
        setLoading(false);
        return;
      }
    } catch(e){ console.warn("Duplicate check error:", e); }
    try {
      const nuevoAlumno = {
        id: uid(),
        nombre: form.nombre.trim(),
        fechaNacimiento: form.fechaNacimiento,
        nivel: autoNivelReg(form.fechaNacimiento),
        telefono: form.telefono,
        email: form.email,
        pin: form.pinElegido,
        alergias: form.alergias,
        intolerancias: form.intolerancias,
        lesiones: form.lesiones,
        tipoEscuela: esMenor ? "infantil" : "adultos",
        activo: false, // pendiente de activación por el profesor
        rgpdAceptado: form.rgpdAceptado,
        rgpdFirmante: esMenor ? form.tutorNombre : form.nombre,
        rgpdFecha: today(),
        imagenAutorizada: form.imagenAutorizada,
        imagenFirmante: esMenor ? form.tutorNombre : form.nombre,
        aceptaCondiciones: form.aceptaCondiciones,
        firmaLegal: esMenor ? form.tutorNombre : "",
        firmaDni: esMenor ? form.tutorDni : "",
        firmaFecha: today(),
        firmaRelacion: esMenor ? form.tutorRelacion : "",
        tutores: esMenor ? [{
          nombre: form.tutorNombre,
          relacion: form.tutorRelacion,
          dni: form.tutorDni,
          telefono: form.tutorTelefono,
          email: form.tutorEmail,
        }] : [],
        foto: "",
        fechaAlta: today(),
        notas: "Registro online — pendiente de activación por el profesor",
        pendienteActivacion: true,
      };

      // Save to Firebase pending collection
      await addDoc(collection(db,"registros_pendientes"), {
        ...nuevoAlumno,
        timestamp: serverTimestamp(),
      });

      // Send notification to professor
      await notificarNuevoRegistro({
        ...nuevoAlumno,
        tipo: esMenor ? "nuevo_registro" : "nuevo_alumno_adulto",
      });

      // Enviar emails automáticos (aviso al profesor + bienvenida al alumno)
      enviarEmailsRegistro(nuevoAlumno);

      setStep(3);
    } catch(e){
      console.error(e);
      setError("Error al enviar el registro. Comprueba tu conexión e inténtalo de nuevo.");
    }
    setLoading(false);
  }

  const PinDots = ({val}) => <div style={{display:"flex",gap:8,margin:"8px 0"}}>
    {[0,1,2,3,4,5].map(i=><div key={i} style={{width:14,height:14,borderRadius:"50%",
      background:i<val.length?"#c0392b":"#ddd"}}/>)}
  </div>;

  if(step===3) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a5c2a,#0f3518)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"white",borderRadius:20,padding:32,maxWidth:380,width:"100%",textAlign:"center"}}>
        <img src={LOGO_GCR} alt="Golf Ciudad Real" style={{height:80,marginBottom:16,objectFit:"contain"}}/>
        <div style={{fontSize:56,marginBottom:12}}>✅</div>
        <h2 style={{color:G.fairway,marginBottom:12}}>¡Registro enviado!</h2>
        <p style={{color:"#555",fontSize:14,lineHeight:1.6,marginBottom:20}}>
          Tu solicitud ha sido enviada al profesor. <b>En breve recibirás confirmación</b> y podrás acceder a la app con tu PIN.
        </p>
        <div style={{background:G.mist,borderRadius:10,padding:14,marginBottom:20}}>
          <div style={{fontSize:12,color:G.soft,marginBottom:4}}>Tu PIN de acceso</div>
          <div style={{fontSize:28,fontWeight:800,color:"#c0392b",letterSpacing:6}}>{form.pinElegido}</div>
          <div style={{fontSize:11,color:G.soft,marginTop:4}}>Guárdalo bien — lo necesitarás para entrar</div>
        </div>
        <div style={{fontSize:13,color:G.soft,marginBottom:20}}>
          URL de la app: <b style={{color:G.sky}}>golf-ciudad-real.netlify.app</b>
        </div>
        <button onClick={onVolver} style={{background:G.fairway,color:"white",border:"none",
          borderRadius:10,padding:"12px 24px",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%"}}>
          Volver al inicio
        </button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:G.sand,padding:"0 0 40px"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${G.fairway},#0f3518)`,
        padding:"20px 20px 16px",color:"white",textAlign:"center"}}>
        <div style={{fontSize:24,marginBottom:4}}>⛳</div>
        <div style={{fontWeight:800,fontSize:18}}>Golf Ciudad Real Academy</div>
        <div style={{fontSize:13,opacity:.8}}>Formulario de inscripción</div>
      </div>

      {/* Indicador de pasos */}
      <div style={{display:"flex",background:"white",padding:"12px 20px",
        borderBottom:"1px solid #eee",gap:8,alignItems:"center"}}>
        {[["1","Datos personales"],["2","Consentimientos"]].map(([n,l],i)=>(
          <div key={n} style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
            <div style={{width:26,height:26,borderRadius:"50%",
              background:step>=Number(n)?G.fairway:"#ddd",
              color:"white",fontWeight:700,fontSize:13,
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {n}
            </div>
            <span style={{fontSize:12,color:step>=Number(n)?G.fairway:"#aaa",fontWeight:step===Number(n)?700:400}}>
              {l}
            </span>
            {i<1&&<div style={{flex:1,height:2,background:step>1?G.fairway:"#eee",borderRadius:2}}/>}
          </div>
        ))}
      </div>

      <div style={{maxWidth:520,margin:"0 auto",padding:"16px 16px 0"}}>

        {/* ── PASO 1 ── */}
        {step===1&&<div>
          <Card style={{marginBottom:12}}>
            <h3 style={{margin:"0 0 14px",color:G.fairway}}>👤 Datos del alumno</h3>
            <Field label="Nombre completo *">
              <Input value={form.nombre} onChange={v=>setForm(f=>({...f,nombre:v}))} placeholder="Nombre y apellidos"/>
            </Field>
            <Field label="Fecha de nacimiento *">
              <Input type="date" value={form.fechaNacimiento}
                onChange={v=>setForm(f=>({...f,fechaNacimiento:v}))}/>
            </Field>
            {edad!==null&&<div style={{background:esMenor?"#e8f0fb":G.mist,borderRadius:8,
              padding:"6px 12px",marginBottom:10,fontSize:13,fontWeight:600,
              color:esMenor?"#2e5fa3":G.fairway}}>
              {esMenor?"🧒 Escuela Infantil (menor de 18 años)":"🏌️ Escuela de Adultos"} · {edad} años
            </div>}
            {!esMenor&&<Field label="DNI / NIE">
              <Input value={form.dniAlumno} onChange={v=>setForm(f=>({...f,dniAlumno:v}))} placeholder="DNI o NIE del alumno"/>
            </Field>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="Teléfono">
                <Input value={form.telefono} onChange={v=>setForm(f=>({...f,telefono:v}))} placeholder="Teléfono"/>
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} placeholder="Email"/>
              </Field>
            </div>

            {/* Días y horario preferencia */}
            <Field label="📅 Días de clase preferidos">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
                {["Miércoles","Jueves","Sábado","Domingo"].map(dia=>(
                  <label key={dia} style={{display:"flex",alignItems:"center",gap:8,
                    background:form.diasPreferencia.includes(dia)?"#e8f5eb":"#f8f8f8",
                    borderRadius:8,padding:"8px 10px",cursor:"pointer",
                    border:form.diasPreferencia.includes(dia)?"2px solid #1a5c2a":"2px solid #eee",
                    fontWeight:form.diasPreferencia.includes(dia)?700:400,
                    fontSize:14,color:form.diasPreferencia.includes(dia)?"#1a5c2a":"#555"}}>
                    <input type="checkbox"
                      checked={form.diasPreferencia.includes(dia)}
                      onChange={e=>setForm(f=>({...f,
                        diasPreferencia:e.target.checked
                          ?[...f.diasPreferencia,dia]
                          :f.diasPreferencia.filter(d=>d!==dia)
                      }))}
                      style={{width:16,height:16}}/>
                    {dia}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="⏰ Horario preferido">
              <select value={form.horarioPreferencia}
                onChange={e=>setForm(f=>({...f,horarioPreferencia:e.target.value}))}
                style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,
                  padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:"inherit"}}>
                <option value="">Seleccionar horario...</option>
                <option value="Mañana (9:00-12:00)">Mañana (9:00-12:00)</option>
                <option value="Mediodía (12:00-15:00)">Mediodía (12:00-15:00)</option>
                <option value="Tarde (15:00-18:00)">Tarde (15:00-18:00)</option>
                <option value="Tarde-noche (18:00-21:00)">Tarde-noche (18:00-21:00)</option>
                <option value="Sin preferencia">Sin preferencia</option>
              </select>
            </Field>
          </Card>

          <Card style={{marginBottom:12}}>
            <h3 style={{margin:"0 0 14px",color:"#880E4F"}}>🏥 Información médica</h3>
            <Field label="🤧 Alergias">
              <Textarea value={form.alergias} onChange={v=>setForm(f=>({...f,alergias:v}))}
                rows={2} placeholder="Alergia al polen, látex, medicamentos... (déjalo en blanco si no aplica)"/>
            </Field>
            <Field label="🥛 Intolerancias alimentarias">
              <Textarea value={form.intolerancias} onChange={v=>setForm(f=>({...f,intolerancias:v}))}
                rows={2} placeholder="Lactosa, gluten... (déjalo en blanco si no aplica)"/>
            </Field>
            <Field label="🩹 Lesiones / Condiciones físicas">
              <Textarea value={form.lesiones} onChange={v=>setForm(f=>({...f,lesiones:v}))}
                rows={2} placeholder="Lesiones, asma, epilepsia... (déjalo en blanco si no aplica)"/>
            </Field>
            <Field label="💊 Medicación habitual o de emergencia">
              <Textarea value={form.medicacion||""} onChange={v=>setForm(f=>({...f,medicacion:v}))}
                rows={2} placeholder="Inhalador, adrenalina (EpiPen), insulina... (déjalo en blanco si no aplica)"/>
            </Field>
          </Card>

          {esMenor&&<Card style={{marginBottom:12}}>
            <h3 style={{margin:"0 0 14px",color:"#2e5fa3"}}>👨‍👩‍👦 Padre / Madre / Tutor legal</h3>
            <Field label="Nombre completo del tutor *">
              <Input value={form.tutorNombre} onChange={v=>setForm(f=>({...f,tutorNombre:v}))} placeholder="Nombre y apellidos"/>
            </Field>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="Relación">
                <select value={form.tutorRelacion} onChange={e=>setForm(f=>({...f,tutorRelacion:e.target.value}))}
                  style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
                    fontSize:14,background:"#fff",fontFamily:"inherit"}}>
                  <option value="">Seleccionar...</option>
                  <option value="Padre">Padre</option>
                  <option value="Madre">Madre</option>
                  <option value="Tutor legal">Tutor legal</option>
                  <option value="Otro">Otro</option>
                </select>
              </Field>
              <Field label="DNI / NIE">
                <Input value={form.tutorDni} onChange={v=>setForm(f=>({...f,tutorDni:v}))} placeholder="DNI del tutor"/>
              </Field>
            </div>
            <Field label="Teléfono del tutor">
              <Input value={form.tutorTelefono} onChange={v=>setForm(f=>({...f,tutorTelefono:v}))} placeholder="Teléfono"/>
            </Field>
            <Field label="Email del tutor">
              <Input value={form.tutorEmail} onChange={v=>setForm(f=>({...f,tutorEmail:v}))} placeholder="Email"/>
            </Field>
          </Card>}

          <Card style={{marginBottom:16}}>
            <h3 style={{margin:"0 0 8px",color:"#c0392b"}}>🔐 Elige tu clave de acceso</h3>
            <p style={{fontSize:13,color:G.soft,margin:"0 0 10px"}}>
              Esta clave la usarás para entrar a la app. Mínimo 6 caracteres. Puede contener letras, números y símbolos para mayor seguridad. Puedes cambiarla después.
            </p>
            <Field label="Clave de acceso (mínimo 6 caracteres)">
              <Input type="password" value={form.pinElegido}
                onChange={v=>setForm(f=>({...f,pinElegido:v.slice(0,20)}))}
                placeholder="Ej: Golf2026!" maxLength={20}/>
            </Field>
            <div style={{fontSize:12,marginTop:6}}>
              {form.pinElegido.length>0&&form.pinElegido.length<6&&<span style={{color:"#c0392b"}}>⚠ Mínimo 6 caracteres</span>}
              {form.pinElegido.length>=6&&<span style={{color:"#1a5c2a"}}>✓ Clave válida</span>}
            </div>
          </Card>

          {error&&<div style={{background:"#fdecea",color:"#c0392b",borderRadius:8,
            padding:"10px 14px",fontSize:13,marginBottom:12}}>{error}</div>}

          <button onClick={()=>{
            if(!form.nombre.trim()||!form.fechaNacimiento||form.pinElegido.length<4){
              setError("Rellena nombre, fecha de nacimiento y PIN antes de continuar.");
            } else { setError(""); setStep(2); }
          }} style={{width:"100%",background:G.fairway,color:"white",border:"none",
            borderRadius:12,padding:"14px 0",fontSize:16,fontWeight:700,cursor:"pointer"}}>
            Siguiente →
          </button>
        </div>}

        {/* ── PASO 2 ── */}
        {step===2&&<div>
          <Card style={{marginBottom:12}}>
            <h3 style={{margin:"0 0 10px",color:G.fairway}}>🔒 Protección de datos (RGPD)</h3>
            <div style={{background:"#f0f8f0",borderRadius:8,padding:10,fontSize:12,
              color:"#444",lineHeight:1.6,marginBottom:12}}>
              <b>Responsable:</b> Golf Ciudad Real C.D. · <b>Finalidad:</b> Gestión de la Escuela de Golf. 
              <b> Base legal:</b> Consentimiento (Art. 6.1.a RGPD). 
              <b> Derechos:</b> Acceso y supresión → golf@golfciudadreal.es
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",
              background:G.mist,borderRadius:8,padding:10}}>
              <input type="checkbox" checked={form.rgpdAceptado}
                onChange={e=>setForm(f=>({...f,rgpdAceptado:e.target.checked}))}
                style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
              <label style={{fontSize:13,lineHeight:1.5,cursor:"pointer"}}>
                {esMenor
                  ?"Acepto el tratamiento de los datos del menor conforme al RGPD y LO 3/2018, como padre/madre/tutor legal."
                  :"Acepto el tratamiento de mis datos conforme al RGPD (UE 2016/679) y la LO 3/2018."}
              </label>
            </div>
          </Card>

          <Card style={{marginBottom:12}}>
            <h3 style={{margin:"0 0 10px",color:"#c8a84b"}}>📸 Autorización de imagen {esMenor&&"(LO 1/1996)"}</h3>
            {esMenor&&<div style={{background:"#fff8e1",borderRadius:8,padding:8,fontSize:12,
              color:"#6B4E0A",marginBottom:10}}>
              La publicación de imágenes de menores requiere autorización expresa (LO 1/1996).
            </div>}
            <div style={{display:"flex",gap:10,alignItems:"flex-start",
              background:"#fff8e1",borderRadius:8,padding:10}}>
              <input type="checkbox" checked={form.imagenAutorizada}
                onChange={e=>setForm(f=>({...f,imagenAutorizada:e.target.checked}))}
                style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
              <label style={{fontSize:13,lineHeight:1.5,cursor:"pointer"}}>
                {esMenor
                  ?"Autorizo la captación y publicación de imágenes del menor en actividades de la Escuela de Golf (web, redes sociales, materiales formativos)."
                  :"Autorizo la captación y publicación de mis imágenes en actividades de la Escuela de Golf."}
              </label>
            </div>
          </Card>

          {esMenor&&<Card style={{marginBottom:12}}>
            <h3 style={{margin:"0 0 10px",color:"#c0392b"}}>✍️ Confirmación legal del tutor (Art. 162 CC)</h3>
            <div style={{background:"#fdecea",borderRadius:8,padding:10,fontSize:12,
              color:"#555",marginBottom:10,lineHeight:1.5}}>
              El padre/madre/tutor declara ser el representante legal del menor y acepta el Reglamento Interno de la Escuela de Golf Ciudad Real C.D.
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",
              background:"#fdecea",borderRadius:8,padding:10}}>
              <input type="checkbox" checked={form.aceptaCondiciones}
                onChange={e=>setForm(f=>({...f,aceptaCondiciones:e.target.checked}))}
                style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
              <label style={{fontSize:13,lineHeight:1.5,cursor:"pointer",fontWeight:600}}>
                Declaro ser el representante legal del menor y acepto todas las condiciones.
              </label>
            </div>
          </Card>}

          {!esMenor&&<Card style={{marginBottom:12}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",
              background:"#fdecea",borderRadius:8,padding:10}}>
              <input type="checkbox" checked={form.aceptaCondiciones}
                onChange={e=>setForm(f=>({...f,aceptaCondiciones:e.target.checked}))}
                style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
              <label style={{fontSize:13,lineHeight:1.5,cursor:"pointer",fontWeight:600}}>
                Acepto el Reglamento Interno de la Escuela de Golf Ciudad Real C.D. y las condiciones de participación.
              </label>
            </div>
          </Card>}

          {error&&<div style={{background:"#fdecea",color:"#c0392b",borderRadius:8,
            padding:"10px 14px",fontSize:13,marginBottom:12}}>{error}</div>}

          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <button onClick={()=>setStep(1)}
              style={{flex:1,background:"#f0f0f0",color:"#555",border:"none",
                borderRadius:12,padding:"14px 0",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              ← Atrás
            </button>
            <button onClick={enviarRegistro} disabled={loading}
              style={{flex:2,background:loading?"#aaa":G.fairway,color:"white",border:"none",
                borderRadius:12,padding:"14px 0",fontSize:15,fontWeight:700,cursor:"pointer"}}>
              {loading?"Enviando...":"✅ Enviar inscripción"}
            </button>
          </div>

          <div style={{fontSize:11,color:G.soft,textAlign:"center",lineHeight:1.5}}>
            Tu solicitud será revisada por el profesor. Recibirás confirmación cuando tu acceso esté activado.
          </div>
        </div>}
      </div>
    </div>
  );
}

function LoginScreen({data,onLogin}){
  const [pin,setPin]=useState("");
  const [mostrarRegistro,setMostrarRegistro]=useState(false);
  const [recordar,setRecordar]=useState(()=>localStorage.getItem("gcr_recordar")==="1");

  // Auto-login si hay PIN guardado (se re-ejecuta cuando cargan los datos)
  const [autoLoginHecho,setAutoLoginHecho]=useState(false);
  useEffect(()=>{
    if(autoLoginHecho) return;
    const recordar = localStorage.getItem("gcr_recordar")==="1";
    const pinGuardado = localStorage.getItem("gcr_pin_saved");
    if(recordar && pinGuardado && data){
      // Comprobar admin
      if(pinGuardado===(data.adminPin||DEFAULT_ADMIN_PIN)){
        setAutoLoginHecho(true);
        onLogin({role:"admin"});
        return;
      }
      // Comprobar alumnos activos
      const alumno=(data.alumnos||[]).find(a=>a.activo&&a.pin===pinGuardado);
      if(alumno){ setAutoLoginHecho(true); onLogin({role:"alumno",alumnoId:alumno.id}); return; }
      // Comprobar tutores con PIN propio
      for(const al of (data.alumnos||[])){
        if(!al.activo) continue;
        const tutor=(al.tutores||[]).find(t=>t.pin&&t.pin===pinGuardado);
        if(tutor){ setAutoLoginHecho(true); onLogin({role:"tutor",alumnoId:al.id,tutorNombre:tutor.nombre}); return; }
      }
    }
  },[data,autoLoginHecho]);
  const [error,setError]=useState("");
  const [intentando,setIntentando]=useState(false);

  const PinDot=({filled})=><div style={{width:16,height:16,borderRadius:"50%",
    background:filled?G.fairway:"#d0e0d0",transition:"background .15s"}}/>;

  function intentarAcceso(p){
    if(!p||p.length===0) return;
    setError("");
    // Comprobar clave de administrador
    if(p===(data.adminPin||DEFAULT_ADMIN_PIN)){
      setIntentando(true);
      // Guardar para recordar acceso
      const recordar=localStorage.getItem("gcr_recordar")==="1";
      if(recordar) localStorage.setItem("gcr_pin_saved",p);
      setTimeout(()=>{ onLogin({role:"admin"}); setIntentando(false); },300);
      return;
    }
    // Comprobar alumnos activos
    const alumno = (data.alumnos||[]).find(a=>a.activo&&a.pin===p);
    if(alumno){
      setIntentando(true);
      const recordar=localStorage.getItem("gcr_recordar")==="1";
      if(recordar) localStorage.setItem("gcr_pin_saved",p);
      setTimeout(()=>{ onLogin({role:"alumno",alumnoId:alumno.id}); setIntentando(false); },300);
      return;
    }
    // Comprobar tutores con PIN propio
    for(const al of (data.alumnos||[])){
      if(!al.activo) continue;
      const tutor=(al.tutores||[]).find(t=>t.pin&&t.pin===p);
      if(tutor){
        setIntentando(true);
        const recordar=localStorage.getItem("gcr_recordar")==="1";
        if(recordar) localStorage.setItem("gcr_pin_saved",p);
        setTimeout(()=>{ onLogin({role:"tutor",alumnoId:al.id,tutorNombre:tutor.nombre}); setIntentando(false); },300);
        return;
      }
    }
    // Clave incorrecta
    setError("Clave incorrecta. Inténtalo de nuevo.");
    setPin("");
  }

  if(mostrarRegistro) return <PantallaRegistro onVolver={()=>setMostrarRegistro(false)}/>;

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${G.fairway} 0%,#0f3518 100%)`,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{background:G.white,borderRadius:24,padding:"32px 28px",width:"100%",
        maxWidth:340,textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,.4)",
        margin:"auto"}}>

        {/* Logos */}
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:14,marginBottom:16}}>
          <img src={LOGO_GCR} alt="Golf Ciudad Real" style={{height:64,objectFit:"contain"}}/>
          <img src={LOGO_PGA} alt="PGA España" style={{height:60,objectFit:"contain"}}/>
          <img src={LOGO_ENG} alt="Escuela Nacional" style={{height:56,objectFit:"contain"}}/>
        </div>

        <div style={{fontWeight:800,fontSize:19,color:G.fairway,marginBottom:2}}>
          José Caballero Golf Academy
        </div>
        <div style={{fontSize:12,color:G.soft,marginBottom:6}}>Golf Ciudad Real C.D.</div>
        <div style={{fontSize:11,color:"#aaa",marginBottom:24}}>🏫 Escuela de Golf · Curso 2026/2027</div>

        {/* Campo de clave */}
        <div style={{fontSize:13,color:G.soft,marginBottom:12,fontWeight:600}}>
          {intentando?"✔ Identificado…":"Introduce tu clave de acceso"}
        </div>

        {error&&<div style={{background:"#fdecea",color:G.danger,borderRadius:8,
          padding:"8px 12px",fontSize:13,marginBottom:12}}>{error}</div>}

        <div style={{marginBottom:14}}>
          <input type="password" value={pin}
            onChange={e=>setPin(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&pin.length>0)intentarAcceso(pin);}}
            placeholder="Tu clave de acceso"
            autoComplete="current-password"
            style={{width:"100%",boxSizing:"border-box",border:"2px solid #d0e0d0",
              borderRadius:12,padding:"14px 16px",fontSize:18,textAlign:"center",
              fontFamily:"inherit",letterSpacing:2}}/>
        </div>
        <button onClick={()=>intentarAcceso(pin)} disabled={pin.length===0}
          style={{width:"100%",background:G.fairway,color:"white",border:"none",
            borderRadius:12,padding:"14px 0",fontSize:16,fontWeight:700,
            cursor:pin.length===0?"default":"pointer",opacity:pin.length===0?0.5:1,
            boxShadow:"0 4px 12px rgba(26,92,42,.3)"}}>
          🔓 Entrar
        </button>

        <div style={{fontSize:11,color:"#ccc",marginTop:14}}>
          Tu clave te identifica automáticamente como profesor o alumno
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,justifyContent:"center"}}>
          <input type="checkbox" id="recordar" checked={recordar}
            onChange={e=>{setRecordar(e.target.checked);
              if(e.target.checked){localStorage.setItem("gcr_recordar","1");if(pin)localStorage.setItem("gcr_pin_saved",pin);}
              else{localStorage.removeItem("gcr_pin_saved");localStorage.setItem("gcr_recordar","0");}
            }}
            style={{width:16,height:16,cursor:"pointer"}}/>
          <label htmlFor="recordar" style={{fontSize:12,color:"#ccc",cursor:"pointer"}}>
            Recordar mi acceso en este dispositivo
          </label>
        </div>
        <div style={{borderTop:"1px solid #e0e0e0",marginTop:16,paddingTop:16}}>
          <button onClick={()=>setMostrarRegistro(true)}
            style={{width:"100%",background:G.fairway,color:"white",
              border:"none",borderRadius:10,
              padding:"12px 0",fontSize:14,fontWeight:700,cursor:"pointer",
              boxShadow:"0 4px 12px rgba(26,92,42,.3)"}}>
            📝 Inscribirme en la Escuela de Golf
          </button>
          <div style={{fontSize:11,color:G.soft,marginTop:8}}>
            ¿Primera vez? Regístrate aquí
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// SHARED: MINI CALENDAR
// ═══════════════════════════════════════════════════════
function MiniCalendar({selected,onChange,markedDates=[]}){
  const [view,setView]=useState(()=>{
    const d=selected?new Date(selected+"T12:00:00"):new Date();
    return {y:d.getFullYear(),m:d.getMonth()};
  });
  const {y,m}=view;
  const firstDay=new Date(y,m,1).getDay(); // 0=Sun
  const offset=(firstDay+6)%7; // Mon=0
  const daysInMonth=new Date(y,m+1,0).getDate();
  const cells=[];
  for(let i=0;i<offset;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);

  function fmt(d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  function prevMonth(){ setView(v=>v.m===0?{y:v.y-1,m:11}:{y:v.y,m:v.m-1}); }
  function nextMonth(){ setView(v=>v.m===11?{y:v.y+1,m:0}:{y:v.y,m:v.m+1}); }

  return (
    <div style={{userSelect:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <button onClick={prevMonth} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:G.fairway,padding:"0 6px"}}>‹</button>
        <span style={{fontWeight:700,color:G.fairway,fontSize:14}}>{MESES[m]} {y}</span>
        <button onClick={nextMonth} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:G.fairway,padding:"0 6px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center"}}>
        {DIAS.map(d=><div key={d} style={{fontSize:11,fontWeight:700,color:G.soft,padding:"4px 0"}}>{d}</div>)}
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const iso=fmt(d);
          const isSel=iso===selected;
          const isToday=iso===today();
          const isMarked=markedDates.includes(iso);
          return <div key={i} onClick={()=>onChange(iso)}
            style={{padding:"6px 2px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:isSel||isToday?700:400,
              background:isSel?G.fairway:isToday?"#e8f5eb":"transparent",
              color:isSel?G.white:isToday?G.fairway:G.ink,
              position:"relative",transition:"background .12s"}}
            onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="#e8f5eb";}}
            onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isSel?G.fairway:"transparent";}}>
            {d}
            {isMarked&&!isSel&&<div style={{width:4,height:4,borderRadius:"50%",background:G.grass,margin:"1px auto 0"}}/>}
          </div>;
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN: CALENDARIO DE SLOTS
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// PANEL PDF CALENDARIO (Profesor sube, Alumnos descargan)
// ═══════════════════════════════════════════════════════════════════
function PanelPdfCalendario({esProfesor}){
  const [pdfInfo,setPdfInfo]   = useState(null);  // {nombre, url, subidoEl}
  const [cargando,setCargando] = useState(true);
  const [subiendo,setSubiendo] = useState(false);
  const [msg,setMsg]           = useState("");

  // Cargar info del PDF desde Firestore al montar
  useEffect(()=>{
    getDoc(doc(db,"academia","calendario_pdf"))
      .then(snap=>{
        if(snap.exists()) setPdfInfo(snap.data());
      })
      .catch(()=>{})
      .finally(()=>setCargando(false));
  },[]);

  async function subirPDF(e){
    const file = e.target.files[0];
    if(!file) return;
    if(file.type!=="application/pdf"){
      setMsg("⚠️ Solo se permiten archivos PDF."); return;
    }
    if(file.size > 5*1024*1024){
      setMsg("⚠️ El PDF no puede superar 5 MB."); return;
    }
    setSubiendo(true);
    setMsg("Subiendo PDF...");
    try{
      const reader = new FileReader();
      reader.onload = async (ev)=>{
        const base64 = ev.target.result; // data:application/pdf;base64,...
        const info = {
          nombre: file.name,
          url: base64,
          subidoEl: new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"}),
        };
        await setDoc(doc(db,"academia","calendario_pdf"), info);
        setPdfInfo(info);
        setMsg("✅ Calendario subido correctamente.");
        setSubiendo(false);
      };
      reader.readAsDataURL(file);
    }catch(err){
      setMsg("❌ Error al subir: "+err.message);
      setSubiendo(false);
    }
  }

  async function eliminarPDF(){
    if(!confirm("¿Eliminar el PDF del calendario?")) return;
    await setDoc(doc(db,"academia","calendario_pdf"),{});
    setPdfInfo(null);
    setMsg("PDF eliminado.");
  }

  function descargarPDF(){
    if(!pdfInfo?.url) return;
    const a = document.createElement("a");
    a.href = pdfInfo.url;
    a.download = pdfInfo.nombre || "calendario.pdf";
    a.click();
  }

  return <div style={{background:"#f0f7f0",border:"2px solid #1a5c2a22",borderRadius:14,
    padding:"18px 20px",marginBottom:20}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      <div style={{fontSize:28}}>📄</div>
      <div>
        <div style={{fontWeight:800,fontSize:15,color:G.fairway}}>
          Calendario de la Academia
        </div>
        <div style={{fontSize:12,color:G.soft}}>
          {esProfesor
            ? "Sube el PDF del calendario de clases para que los alumnos puedan descargarlo"
            : "Descarga el calendario de clases de la academia"}
        </div>
      </div>
    </div>

    {cargando && <div style={{color:G.soft,fontSize:13}}>Cargando...</div>}

    {!cargando && pdfInfo?.url && (
      <div style={{background:"#fff",borderRadius:10,padding:"14px 16px",
        display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{fontSize:32}}>📋</div>
        <div style={{flex:1,minWidth:160}}>
          <div style={{fontWeight:700,color:G.ink,fontSize:14}}>{pdfInfo.nombre}</div>
          {pdfInfo.subidoEl&&<div style={{fontSize:12,color:G.soft,marginTop:2}}>
            Subido el {pdfInfo.subidoEl}
          </div>}
        </div>
        <button onClick={descargarPDF}
          style={{background:G.fairway,color:"#fff",border:"none",borderRadius:8,
            padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",
            display:"flex",alignItems:"center",gap:6}}>
          ⬇️ Descargar PDF
        </button>
        {esProfesor&&<button onClick={eliminarPDF}
          style={{background:"#c0392b",color:"#fff",border:"none",borderRadius:8,
            padding:"10px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          🗑️ Eliminar
        </button>}
      </div>
    )}

    {!cargando && !pdfInfo?.url && (
      <div style={{background:"#fff",borderRadius:10,padding:"18px",textAlign:"center",
        color:G.soft,fontSize:13}}>
        {esProfesor
          ? "No hay ningún PDF subido todavía."
          : "El profesor todavía no ha subido el calendario. Vuelve más tarde."}
      </div>
    )}

    {esProfesor && (
      <div style={{marginTop:12}}>
        <label style={{display:"inline-flex",alignItems:"center",gap:8,
          background:"#1a5c2a",color:"#fff",borderRadius:8,
          padding:"10px 16px",fontSize:13,fontWeight:700,
          cursor:subiendo?"not-allowed":"pointer",opacity:subiendo?0.6:1}}>
          {subiendo?"⏳ Subiendo...":"📤 Subir nuevo PDF"}
          <input type="file" accept="application/pdf"
            onChange={subirPDF} disabled={subiendo}
            style={{display:"none"}}/>
        </label>
        <div style={{fontSize:11,color:G.soft,marginTop:6}}>
          Máximo 5 MB · Solo archivos PDF
        </div>
      </div>
    )}

    {msg&&<div style={{marginTop:10,fontSize:13,color:msg.startsWith("✅")?"#1a5c2a":msg.startsWith("⚠️")||msg.startsWith("❌")?"#c0392b":G.soft,
      fontWeight:600}}>{msg}</div>}
  </div>;
}

function ModCalendario({data,setData}){
  const [diaVer,setDiaVer]=useState(today());
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [verReservas,setVerReservas]=useState(null);

  function exportarICS(){
    const clases=(data.clases||[]).filter(c=>c.fecha);
    if(clases.length===0){ alert("No hay clases para exportar."); return; }
    const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Golf Ciudad Real//Academia//ES","CALSCALE:GREGORIAN"];
    clases.forEach(c=>{
      const alumno=(data.alumnos||[]).find(a=>a.id===c.alumnoId);
      const titulo="Clase golf"+(alumno?" - "+alumno.nombre:"");
      const [y,m,d]=c.fecha.split("-");
      const hi=(c.horaInicio||"10:00").replace(":","");
      const hEnd=c.horaFin?c.horaFin.replace(":",""): String(Number(hi.slice(0,2))+1).padStart(2,"0")+hi.slice(2);
      const dt=y+m.padStart(2,"0")+d.padStart(2,"0");
      lines.push("BEGIN:VEVENT");
      lines.push("UID:"+c.id+"@golfciudadreal");
      lines.push("DTSTART;TZID=Europe/Madrid:"+dt+"T"+hi+"00");
      lines.push("DTEND;TZID=Europe/Madrid:"+dt+"T"+hEnd+"00");
      lines.push("SUMMARY:"+titulo);
      lines.push("DESCRIPTION:Academia Golf Ciudad Real"+(c.notas?" - "+c.notas:""));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob=new Blob([lines.join("\r\n")],{type:"text/calendar"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="clases-golf.ics"; a.click();
    URL.revokeObjectURL(url);
  }


  function exportarClasesExcel(){
    const clases = (data.clases||[]).sort((a,b)=>a.fecha.localeCompare(b.fecha));
    const rows = [["Fecha","Hora","Duración (min)","Alumno","Tipo","Zona","Contenido","Asistencia"]];
    clases.forEach(c=>{
      const alumno = (data.alumnos||[]).find(a=>a.id===c.alumnoId);
      rows.push([
        c.fecha||"",
        c.horaInicio||c.hora||"",
        c.duracion||"60",
        alumno?.nombre||"—",
        c.tipo||"",
        c.zona||"",
        c.contenido||"",
        c.asistio?"Asistió":"Pendiente",
      ]);
    });
    const sep=";";
    const csv=rows.map(r=>r.map(v=>{ const s=String(v).replace(/"/g,'""'); return s.includes(sep)||s.includes('"')||s.includes('\n')?`"${s}"`:s; }).join(sep)).join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="clases-golf.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportarClasesPDF(){
    await cargarJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Cabecera
    doc.setFillColor(26, 92, 42);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(14); doc.setFont("helvetica","bold");
    doc.text("Golf Ciudad Real C.D. — Listado de Clases", W/2, 10, {align:"center"});
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text("José Manuel Caballero Fernández · PGA España Nº 1908P", W/2, 17, {align:"center"});

    // Tabla
    const cols = ["Fecha","Hora","Duración","Alumno","Tipo","Zona","Asistencia"];
    const widths = [25, 18, 22, 50, 30, 45, 22];
    const clases = (data.clases||[]).sort((a,b)=>a.fecha.localeCompare(b.fecha));
    let y = 28;

    // Cabecera tabla
    doc.setFillColor(46, 125, 60);
    doc.rect(10, y-5, W-20, 8, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(8); doc.setFont("helvetica","bold");
    let x = 10;
    cols.forEach((col,i)=>{ doc.text(col, x+2, y); x+=widths[i]; });
    y += 5;

    // Filas
    clases.forEach((c,idx)=>{
      if(y > H-15){ doc.addPage(); y=20; }
      const alumno = (data.alumnos||[]).find(a=>a.id===c.alumnoId);
      const fila = [
        c.fecha||"",
        c.horaInicio||c.hora||"",
        (c.duracion||"60")+"min",
        alumno?.nombre||"—",
        c.tipo||"",
        c.zona||"",
        c.asistio?"✓ Asistió":"Pendiente",
      ];
      doc.setFillColor(idx%2===0?245:255, idx%2===0?248:255, idx%2===0?245:255);
      doc.rect(10, y-4, W-20, 7, "F");
      doc.setTextColor(30,30,30);
      doc.setFont("helvetica","normal"); doc.setFontSize(8);
      x = 10;
      fila.forEach((val,i)=>{
        const txt = doc.splitTextToSize(String(val), widths[i]-2);
        doc.text(txt[0]||"", x+2, y);
        x+=widths[i];
      });
      y+=7;
    });

    // Pie
    doc.setFillColor(26, 92, 42);
    doc.rect(0, H-10, W, 10, "F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(7);
    doc.text("Golf Ciudad Real C.D. · José Caballero Golf Academy · "+new Date().toLocaleDateString("es-ES"), W/2, H-4, {align:"center"});

    doc.save("clases-golf-"+new Date().toISOString().slice(0,10)+".pdf");
  }

  function cargarGapi(){
    if(window.gapi) return Promise.resolve();
    return new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://apis.google.com/js/api.js";
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  function cargarGis(){
    if(window.google?.accounts) return Promise.resolve();
    return new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://accounts.google.com/gsi/client";
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  async function getTokenClient(callback){
    await cargarGapi();
    await new Promise(res=>window.gapi.load("client",res));
    await window.gapi.client.init({discoveryDocs:[GCAL_DISCOVERY_DOC]});
    await cargarGis();
    return window.google.accounts.oauth2.initTokenClient({
      client_id:GCAL_CLIENT_ID, scope:GCAL_SCOPES, callback
    });
  }

  async function exportarClases(){
    setGcalSyncing(true);
    setGcalMsg("Conectando con Google Calendar...");
    try{
      const tc=await getTokenClient(async resp=>{
        if(resp.error){setGcalMsg("Error: "+resp.error);setGcalSyncing(false);return;}
        setGcalReady(true);
        const clases=(data.clases||[]).filter(c=>c.fecha);
        let ok=0;
        const clasesExportadas=new Set((data.clases||[]).filter(c=>c.gcalExportado).map(c=>c.id));
        const clasesPendientes=clases.filter(c=>!clasesExportadas.has(c.id));
        for(const c of clasesPendientes){
          const alumno=(data.alumnos||[]).find(a=>a.id===c.alumnoId);
          const titulo="🏌️ Clase golf"+(alumno?" — "+alumno.nombre:"");
          const [y,m,d]=c.fecha.split("-");
          const hi=c.horaInicio||"10:00";
          const [hh,mm]=hi.split(":").map(Number);
          const ini=new Date(Number(y),Number(m)-1,Number(d),hh,mm);
          const fin=new Date(ini.getTime()+60*60*1000);
          try{
            await window.gapi.client.calendar.events.insert({
              calendarId:"primary",
              resource:{
                summary:titulo,
                description:"Academia Golf Ciudad Real — "+(c.notas||""),
                start:{dateTime:ini.toISOString(),timeZone:"Europe/Madrid"},
                end:{dateTime:fin.toISOString(),timeZone:"Europe/Madrid"},
                colorId:"2",
              }
            });
            // Marcar como exportada en la app para no duplicar
            setData(d=>({...d,clases:(d.clases||[]).map(x=>x.id===c.id?{...x,gcalExportado:true}:x)}));
            ok++;
          }catch(e){}
        }
        setGcalMsg(ok>0?"✅ "+ok+" clases exportadas a Google Calendar":"✅ Todo ya estaba exportado");
        setGcalSyncing(false);
      });
      tc.requestAccessToken({prompt:gcalReady?"":"consent"});
    }catch(e){setGcalMsg("Error: "+e.message);setGcalSyncing(false);}
  }

  async function importarEventos(){
    setGcalSyncing(true);
    setGcalMsg("Importando eventos de Google Calendar...");
    try{
      const tc=await getTokenClient(async resp=>{
        if(resp.error){setGcalMsg("Error: "+resp.error);setGcalSyncing(false);return;}
        const ahora=new Date();
        const en30d=new Date(ahora.getTime()+30*24*60*60*1000);
        const r=await window.gapi.client.calendar.events.list({
          calendarId:"primary",timeMin:ahora.toISOString(),timeMax:en30d.toISOString(),
          maxResults:50,singleEvents:true,orderBy:"startTime"
        });
        const evts=(r.result.items||[]);
        const existentes=new Set((data.clases||[]).map(c=>c.id));
        const nuevas=evts.map(e=>({
          id:"gcal_"+e.id, gcalId:e.id, alumnoId:null,
          fecha:e.start?.dateTime?e.start.dateTime.split("T")[0]:e.start?.date||"",
          horaInicio:e.start?.dateTime?e.start.dateTime.split("T")[1].slice(0,5):"",
          tipo:"importada", notas:e.summary+(e.description?" — "+e.description:""), activa:true,
        })).filter(c=>!existentes.has(c.id));
        if(nuevas.length>0){
          setData({...data,clases:[...(data.clases||[]),...nuevas]});
          setGcalMsg("✅ "+nuevas.length+" eventos importados desde Google Calendar");
        }else{
          setGcalMsg("✅ Ya estás sincronizado — sin eventos nuevos");
        }
        setGcalSyncing(false);
      });
      tc.requestAccessToken({prompt:gcalReady?"":"consent"});
    }catch(e){setGcalMsg("Error: "+e.message);setGcalSyncing(false);}
  }

  const slots=data.slots||[];
  const reservas=data.reservas||[];
  const alumnos=data.alumnos||[];

  const markedDates=[...new Set(slots.map(s=>s.fecha))];
  const slotsDelDia=slots.filter(s=>s.fecha===diaVer).sort((a,b)=>a.hora.localeCompare(b.hora));

  function openNew(){
    setForm({fecha:diaVer,hora:"10:00",duracion:"60",zona:"Campo de prácticas",tipo:"Individual",plazas:"1",notas:""});
    setModal("new");
  }
  function openEdit(s){setForm({...s});setModal(s.id);}

  function save(){
    if(!form.fecha||!form.hora) return;
    const updated=modal==="new"
      ?[...slots,{...form,id:uid(),alumnosIds:[]}]
      :slots.map(s=>s.id===modal?{...form}:s);
    setData({...data,slots:updated});setModal(null);
  }

  function eliminarSlot(id){
    if(!confirm("¿Eliminar este hueco? Se cancelarán las reservas asociadas.")) return;
    const updSlots=slots.filter(s=>s.id!==id);
    const updReservas=reservas.filter(r=>r.slotId!==id);
    setData({...data,slots:updSlots,reservas:updReservas});
  }

  function alumnoNombre(id){return alumnos.find(a=>a.id===id)?.nombre||"—";}

  function reservasDeSlot(slotId){return reservas.filter(r=>r.slotId===slotId&&r.estado!=="cancelada");}

  function cancelarReserva(rid){
    setData({...data,reservas:reservas.map(r=>r.id===rid?{...r,estado:"cancelada"}:r)});
  }

  const SlotCard=({s})=>{
    const res=reservasDeSlot(s.id);
    const plazas=Number(s.plazas||1);
    const libre=plazas-res.length;
    return <Card style={{marginBottom:10}}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{background:libre>0?G.mist:"#fdecea",borderRadius:10,padding:"6px 10px",textAlign:"center",minWidth:52,flexShrink:0}}>
          <div style={{fontSize:15,fontWeight:800,color:libre>0?G.fairway:G.danger}}>{s.hora}</div>
          <div style={{fontSize:10,color:G.soft}}>{s.duracion}min</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,color:G.ink}}>{s.tipo} · {s.zona}</div>
          <div style={{fontSize:12,color:G.soft,marginTop:2}}>
            {res.length}/{plazas} plaza{plazas>1?"s":""} ocupada{res.length!==1?"s":""}
            {libre===0&&<span style={{color:G.danger,fontWeight:600}}> · COMPLETO</span>}
          </div>
          {res.length>0&&<div style={{fontSize:12,color:G.fairway,marginTop:4}}>
            👤 {res.map(r=>alumnoNombre(r.alumnoId)).join(", ")}
          </div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {res.length>0&&<Btn small color="sky" onClick={()=>setVerReservas(s.id)}>Reservas</Btn>}
          <Btn small color="secondary" onClick={()=>openEdit(s)}>✎</Btn>
          <Btn small color="danger" onClick={()=>eliminarSlot(s.id)}>✕</Btn>
        </div>
      </div>
    </Card>;
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12,marginBottom:20}}>
      {[[slots.length,"Huecos totales",G.fairway],[slots.filter(s=>s.fecha>=today()).length,"Próximos",G.grass],[reservas.filter(r=>r.estado!=="cancelada").length,"Reservas activas",G.sky]].map(([v,l,c])=>(
        <Card key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div>
          <div style={{fontSize:12,color:G.soft,marginTop:2}}>{l}</div>
        </Card>
      ))}
    </div>

    {/* ── Google Calendar panel ── */}
    <div style={{background:"#f8f8f8",borderRadius:12,padding:"12px 16px",
      marginBottom:16,display:"flex",flexWrap:"wrap",alignItems:"center",gap:10}}>
      <div style={{fontSize:20}}>📅</div>
      <div style={{flex:1,minWidth:160}}>
        <div style={{fontWeight:700,fontSize:13,color:G.fairway}}>Google Calendar</div>
        <div style={{fontSize:12,color:G.soft,marginTop:2}}>
          Exporta tus clases en Excel o PDF
        </div>
      </div>
      <button onClick={exportarClasesExcel}
        style={{background:"#217346",color:"#fff",border:"none",borderRadius:8,
          padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        📊 Exportar CSV
      </button>
      <button onClick={exportarClasesPDF}
        style={{background:"#c0392b",color:"#fff",border:"none",borderRadius:8,
          padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        📄 Exportar PDF
      </button>
      <a href="https://calendar.google.com" target="_blank" rel="noreferrer"
        style={{background:"#4285f4",color:"#fff",border:"none",borderRadius:8,
          padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",
          textDecoration:"none"}}>
        📅 Abrir Google Calendar
      </a>
    </div>

    {/* ── PDF Calendario para alumnos ── */}
    <PanelPdfCalendario esProfesor={true}/>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      {/* Calendario */}
      <Card>
        <MiniCalendar selected={diaVer} onChange={setDiaVer} markedDates={markedDates}/>
      </Card>
      {/* Huecos del día */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h3 style={{margin:0,color:G.ink,fontSize:15}}>📅 {fmtDate(diaVer)}</h3>
          <Btn small onClick={openNew}>+ Añadir hueco</Btn>
        </div>
        {slotsDelDia.length===0
          ?<div style={{color:G.soft,fontSize:13,padding:16,textAlign:"center",background:G.mist,borderRadius:10}}>Sin huecos este día.</div>
          :slotsDelDia.map(s=><SlotCard key={s.id} s={s}/>)
        }
      </div>
    </div>

    {/* Modal nuevo/editar slot */}
    {modal&&<Modal title={modal==="new"?"Nuevo hueco de clase":"Editar hueco"} onClose={()=>setModal(null)}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Fecha *"><Input type="date" value={form.fecha||""} onChange={v=>setForm({...form,fecha:v})}/></Field>
        <Field label="Hora *"><Input type="time" value={form.hora||"10:00"} onChange={v=>setForm({...form,hora:v})}/></Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Field label="Duración (min)"><Sel value={form.duracion||"60"} onChange={v=>setForm({...form,duracion:v})} options={["30","45","60","90","120"].map(v=>({value:v,label:v+"min"}))}/></Field>
        <Field label="Tipo"><Sel value={form.tipo||"Individual"} onChange={v=>setForm({...form,tipo:v})} options={TIPOS_CLASE.map(t=>({value:t.id,label:t.label}))}/></Field>
        <Field label="Plazas"><Sel value={form.plazas||"1"} onChange={v=>setForm({...form,plazas:v})} options={["1","2","3","4","6","8"].map(v=>({value:v,label:v}))}/></Field>
      </div>
      <Field label="Zona"><Sel value={form.zona||"Campo de prácticas"} onChange={v=>setForm({...form,zona:v})} options={ZONAS.map(v=>({value:v,label:v}))}/></Field>
      <Field label="Notas (visible al alumno)"><Textarea value={form.notas||""} onChange={v=>setForm({...form,notas:v})} placeholder="Info adicional para el alumno…"/></Field>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn onClick={save}>Guardar</Btn>
      </div>
    </Modal>}

    {/* Modal ver reservas del slot */}
    {verReservas&&<Modal title="Reservas de este hueco" onClose={()=>setVerReservas(null)}>
      {reservasDeSlot(verReservas).length===0
        ?<div style={{color:G.soft,textAlign:"center",padding:20}}>Sin reservas activas.</div>
        :reservasDeSlot(verReservas).map(r=>(
          <Card key={r.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{fontSize:20}}>👤</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:G.ink}}>{alumnoNombre(r.alumnoId)}</div>
              <div style={{fontSize:12,color:G.soft}}>Reservado {fmtDate(r.fechaReserva)}</div>
            </div>
            <Badge color={r.estado==="confirmada"?"green":"gray"}>{r.estado}</Badge>
            <Btn small color="danger" onClick={()=>cancelarReserva(r.id)}>Cancelar</Btn>
          </Card>
        ))
      }
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN: ALUMNOS
// ═══════════════════════════════════════════════════════════════════

// ─── Componente foto de alumno ───────────────────────────────────
function FotoAlumno({foto, nombre, size=48}){
  if(foto) return <img src={foto} alt={nombre}
    style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",
      border:"2px solid #d0e0d0",flexShrink:0}}/>;
  const initials = (nombre||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",
    background:"linear-gradient(135deg,#1a5c2a,#2e7d3c)",
    display:"flex",alignItems:"center",justifyContent:"center",
    color:"#fff",fontWeight:800,fontSize:size*0.35,flexShrink:0,
    border:"2px solid #d0e0d0"}}>
    {initials}
  </div>;
}

function GrupoBadge({a}){
  const g=GRUPOS_EDAD.find(g=>g.id===a.nivel);
  return g?<span style={{background:g.color,color:"#fff",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:700}}>{g.emoji} {g.nombre}</span>:null;
}

function EstructuraInfantil({data, setData, alumnos}){
  const [vista, setVista] = useState("categorias");
  const [modalGrupo, setModalGrupo] = useState(null);
  const [formGrupo, setFormGrupo] = useState({});

  // Grupos guardados en data.gruposCurso, o 6 predefinidos si no hay ninguno
  const GRUPOS_PREDEFINIDOS = [
    {id:"grupo_a", nombre:"Grupo A", dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""},
    {id:"grupo_b", nombre:"Grupo B", dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""},
    {id:"grupo_c", nombre:"Grupo C", dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""},
    {id:"grupo_d", nombre:"Grupo D", dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""},
    {id:"grupo_e", nombre:"Grupo E", dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""},
    {id:"grupo_f", nombre:"Grupo F", dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""},
  ];
  const gruposCurso = (data.gruposCurso && data.gruposCurso.length>0) ? data.gruposCurso : GRUPOS_PREDEFINIDOS;

  const CATS_INF = GRUPOS_EDAD.filter(g=>["prebenjamin","benjamin","alevin","infantil","cadete","boys_girls","sub21"].includes(g.id));

  function editarGrupo(g){ setFormGrupo({...g}); setModalGrupo(g.id); }

  function guardarGrupo(){
    const actualizado = {...formGrupo};
    const lista = gruposCurso.some(g=>g.id===actualizado.id)
      ? gruposCurso.map(g=>g.id===actualizado.id ? actualizado : g)
      : [...gruposCurso, actualizado];
    setData({...data, gruposCurso: lista});
    setModalGrupo(null);
  }

  function toggleAlumno(aid){
    setFormGrupo(f=>({...f,
      alumnoIds: (f.alumnoIds||[]).includes(aid)
        ? (f.alumnoIds||[]).filter(x=>x!==aid)
        : [...(f.alumnoIds||[]), aid]
    }));
  }

  function nuevoGrupo(){
    setFormGrupo({id:uid(), nombre:"Grupo "+String.fromCharCode(65+gruposCurso.length), dia:"", horaIni:"", horaFin:"", categoria:"", alumnoIds:[], maxAlumnos:""});
    setModalGrupo("new");
  }

  function borrarGrupo(id){
    setData({...data, gruposCurso: gruposCurso.filter(g=>g.id!==id)});
  }

  // Agrupar alumnos por categoría
  const porCat = {};
  CATS_INF.forEach(c=>{ porCat[c.id]=[]; });
  porCat["sin"]=[];
  alumnos.forEach(a=>{
    if(porCat[a.nivel]!==undefined) porCat[a.nivel].push(a);
    else porCat["sin"].push(a);
  });

  return <div>
    {/* Pestañas */}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      {[["categorias","📋 Por categoría"],["grupos","🗓️ Grupos del curso"]].map(([id,label])=>(
        <button key={id} onClick={()=>setVista(id)}
          style={{flex:1,background:vista===id?G.fairway:"#f0f0f0",color:vista===id?"#fff":"#555",
            border:"none",borderRadius:10,padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {label}
        </button>
      ))}
    </div>

    {/* ── VISTA CATEGORÍAS ── */}
    {vista==="categorias"&&<div>
      <div style={{background:"#e8f0fb",borderRadius:10,padding:"10px 14px",
        marginBottom:14,fontSize:12,color:"#3a7abf",fontWeight:600}}>
        Alumnos agrupados automáticamente según su edad · Total: {alumnos.length}
      </div>
      {CATS_INF.map(cat=>{
        const lista = porCat[cat.id]||[];
        return <div key={cat.id} style={{background:"#fff",borderRadius:12,padding:14,
          marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.06)",borderLeft:`4px solid ${cat.color}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:lista.length?8:0}}>
            <span style={{fontSize:20}}>{cat.emoji}</span>
            <span style={{fontWeight:800,fontSize:15,color:cat.color}}>{cat.nombre}</span>
            <span style={{fontSize:12,color:G.soft}}>({cat.rango})</span>
            <span style={{marginLeft:"auto",background:cat.color,color:"#fff",
              borderRadius:12,padding:"2px 10px",fontSize:12,fontWeight:700}}>{lista.length}</span>
          </div>
          {lista.length>0
            ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {lista.map(a=>(
                  <span key={a.id} style={{display:"flex",alignItems:"center",gap:6,
                    background:"#f5f5f5",borderRadius:16,padding:"4px 10px 4px 5px",fontSize:12}}>
                    <FotoAlumno foto={a.foto} nombre={a.nombre} size={24}/>
                    <span style={{fontWeight:600}}>{a.nombre}</span>
                    {a.fechaNacimiento&&<span style={{color:G.soft}}>{calcularEdad(a.fechaNacimiento)}a</span>}
                  </span>
                ))}
              </div>
            : <span style={{fontSize:12,color:"#bbb",fontStyle:"italic"}}>Sin alumnos en esta categoría</span>
          }
        </div>;
      })}
      {porCat["sin"].length>0&&<div style={{background:"#fff",borderRadius:12,padding:14,
        marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.06)",borderLeft:"4px solid #ccc"}}>
        <div style={{fontWeight:700,color:"#888"}}>❓ Sin categoría ({porCat["sin"].length})</div>
      </div>}
    </div>}

    {/* ── VISTA GRUPOS ── */}
    {vista==="grupos"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:12,color:G.soft,fontWeight:600}}>
          Curso 2026-2027 · {gruposCurso.length} grupos
        </div>
        <Btn onClick={nuevoGrupo}>+ Nuevo grupo</Btn>
      </div>
      {gruposCurso.map(g=>{
        const alumnosG=(g.alumnoIds||[]).map(id=>alumnos.find(a=>a.id===id)).filter(Boolean);
        const cat=GRUPOS_EDAD.find(c=>c.id===g.categoria);
        return <div key={g.id} style={{background:"#fff",borderRadius:12,padding:14,
          marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.06)",
          borderLeft:`4px solid ${cat?.color||G.fairway}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                <span style={{fontWeight:800,fontSize:16,color:G.fairway}}>{g.nombre}</span>
                {cat&&<span style={{background:cat.color,color:"#fff",borderRadius:10,
                  padding:"2px 8px",fontSize:11,fontWeight:700}}>{cat.emoji} {cat.nombre}</span>}
              </div>
              {(g.dia||g.horaIni)&&<div style={{fontSize:13,color:G.ink,marginBottom:8,fontWeight:600}}>
                {g.dia&&`📅 ${g.dia}`}{g.horaIni&&g.horaFin&&` · ⏰ ${g.horaIni} - ${g.horaFin}`}
                {g.maxAlumnos&&<span style={{color:G.soft}}> · 👥 máx {g.maxAlumnos}</span>}
              </div>}
              {alumnosG.length>0
                ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {alumnosG.map(a=>(
                      <span key={a.id} style={{display:"flex",alignItems:"center",gap:5,
                        background:"#f0f0f0",borderRadius:16,padding:"3px 10px 3px 5px",fontSize:12}}>
                        <FotoAlumno foto={a.foto} nombre={a.nombre} size={22}/>
                        {a.nombre}
                      </span>
                    ))}
                  </div>
                : <span style={{fontSize:12,color:"#bbb",fontStyle:"italic"}}>
                    Pulsa "Editar" para configurar el horario y añadir alumnos
                  </span>
              }
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginLeft:10,flexShrink:0}}>
              <Btn small color="secondary" onClick={()=>editarGrupo(g)}>Editar</Btn>
              <Btn small color="danger" onClick={()=>borrarGrupo(g.id)}>🗑</Btn>
            </div>
          </div>
        </div>;
      })}
    </div>}

    {/* ── MODAL EDITAR GRUPO ── */}
    {modalGrupo&&<Modal title={`✏️ ${formGrupo.nombre}`} onClose={()=>setModalGrupo(null)} wide>
      <Field label="Nombre del grupo">
        <Input value={formGrupo.nombre||""} onChange={v=>setFormGrupo(f=>({...f,nombre:v}))}
          placeholder="Ej: Grupo A"/>
      </Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Field label="Día">
          <select value={formGrupo.dia||""} onChange={e=>setFormGrupo(f=>({...f,dia:e.target.value}))}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,
              padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            <option value="">Día...</option>
            {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map(d=>(
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Hora inicio">
          <Input type="time" value={formGrupo.horaIni||""} onChange={v=>setFormGrupo(f=>({...f,horaIni:v}))}/>
        </Field>
        <Field label="Hora fin">
          <Input type="time" value={formGrupo.horaFin||""} onChange={v=>setFormGrupo(f=>({...f,horaFin:v}))}/>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Categoría del grupo">
          <select value={formGrupo.categoria||""} onChange={e=>setFormGrupo(f=>({...f,categoria:e.target.value}))}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,
              padding:"8px 10px",fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            <option value="">Mixto / Sin categoría</option>
            {CATS_INF.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Máximo alumnos">
          <Input type="number" value={formGrupo.maxAlumnos||""} onChange={v=>setFormGrupo(f=>({...f,maxAlumnos:v}))}
            placeholder="Ej: 8"/>
        </Field>
      </div>

      <div style={{fontWeight:700,color:G.fairway,fontSize:13,margin:"14px 0 8px",
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>
        👥 Alumnos del grupo ({(formGrupo.alumnoIds||[]).length})
      </div>
      <div style={{maxHeight:220,overflowY:"auto",border:"1px solid #eee",borderRadius:10,padding:8}}>
        {alumnos.length===0
          ? <div style={{textAlign:"center",color:G.soft,padding:20,fontSize:13}}>
              No hay alumnos infantiles todavía
            </div>
          : alumnos.map(a=>{
              const sel=(formGrupo.alumnoIds||[]).includes(a.id);
              const catA=GRUPOS_EDAD.find(c=>c.id===a.nivel);
              return <label key={a.id} style={{display:"flex",alignItems:"center",gap:10,
                background:sel?"#e8f5eb":"#fff",borderRadius:8,padding:"8px 10px",
                marginBottom:4,cursor:"pointer",
                border:sel?"2px solid #1a5c2a":"2px solid #f0f0f0"}}>
                <input type="checkbox" checked={sel} onChange={()=>toggleAlumno(a.id)}
                  style={{width:16,height:16}}/>
                <FotoAlumno foto={a.foto} nombre={a.nombre} size={26}/>
                <span style={{fontWeight:600,fontSize:13,flex:1}}>{a.nombre}</span>
                {a.fechaNacimiento&&<span style={{fontSize:11,color:G.soft}}>{calcularEdad(a.fechaNacimiento)}a</span>}
                {catA&&<span style={{fontSize:10,background:catA.color,color:"#fff",
                  borderRadius:6,padding:"1px 6px"}}>{catA.emoji} {catA.nombre}</span>}
              </label>;
            })
        }
      </div>

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:16}}>
        <Btn color="secondary" onClick={()=>setModalGrupo(null)}>Cancelar</Btn>
        <Btn onClick={guardarGrupo}>💾 Guardar</Btn>
      </div>
    </Modal>}
  </div>;
}


function ModAlumnos({data,setData}){
  const [modal,         setModal]         = useState(null);
  const [form,          setForm]          = useState({});
  const [tabTipo,       setTabTipo]       = useState("infantil");
  const [buscar,        setBuscar]        = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // alumno a eliminar
  const [vistaEstructura, setVistaEstructura] = useState(false); // ver estructura/grupos

  const alumnos = data.alumnos||[];

  // Calcular edad desde fecha de nacimiento
  function calcularEdad(fechaNac){
    if(!fechaNac) return null;
    const hoy = new Date();
    const nac = new Date(fechaNac);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if(m<0||(m===0&&hoy.getDate()<nac.getDate())) edad--;
    return edad;
  }

  function esMenor(fechaNac){ return (calcularEdad(fechaNac)||0) < 18; }

  function autoNivel(fechaNac){
    const edad = calcularEdad(fechaNac);
    if(edad===null) return "";
    if(edad>=5  && edad<=7)  return "prebenjamin";
    if(edad>=8  && edad<=10) return "benjamin";
    if(edad>=11 && edad<=12) return "alevin";
    if(edad>=13 && edad<=14) return "infantil";
    if(edad>=15 && edad<=16) return "cadete";
    if(edad>=17 && edad<=18) return "boys_girls";
    if(edad>=19 && edad<=21) return "sub21";
    return "";
  }

  // Separar por tipo de escuela
  const alumnosInfantil = alumnos.filter(a=>{
    const edad = calcularEdad(a.fechaNacimiento);
    return edad!==null ? edad<18 : (a.tipoEscuela==="infantil"||!a.tipoEscuela);
  });
  const alumnosAdultos = alumnos.filter(a=>{
    const edad = calcularEdad(a.fechaNacimiento);
    return edad!==null ? edad>=18 : a.tipoEscuela==="adultos";
  });

  const alumnosMostrar = (tabTipo==="infantil" ? alumnosInfantil : alumnosAdultos)
    .filter(a=>!buscar||a.nombre.toLowerCase().includes(buscar.toLowerCase()));

  function openNew(){
    setForm({
      nombre:"", fechaNacimiento:"", nivel:"",
      pin:"", telefono:"", email:"",
      fechaAlta:today(), notas:"",
      tutores:[],
      activo:true,
      foto:"",
      tipoEscuela:tabTipo,
      // Salud
      alergias:"",
      intolerancias:"",
      lesiones:"",
      // Equipo
      equipo:"",
      // RGPD
      rgpdAceptado:false,
      rgpdFecha:"",
      rgpdFirmante:"",
      imagenAutorizada:false,
      imagenFirmante:"",
      // Firma legal
      firmaLegal:"",
      firmaFecha:"",
    });
    setModal("new");
  }

  function openEdit(a){ setForm({...a}); setModal(a.id); }

  function save(){
    if(!form.nombre?.trim()) return;
    const edad = calcularEdad(form.fechaNacimiento);
    const tipoAuto = edad!==null ? (edad<18?"infantil":"adultos") : form.tipoEscuela;
    const reg = {...form, tipoEscuela:tipoAuto, id:form.id||uid()};
    const updated = alumnos.some(a=>a.id===reg.id)
      ? alumnos.map(a=>a.id===reg.id?reg:a)
      : [...alumnos, reg];
    setData({...data, alumnos:updated});
    setModal(null);
  }

  function addTutor(){ setForm(f=>({...f,tutores:[...(f.tutores||[]),{nombre:"",relacion:"",telefono:"",email:""}]}));}
  function delTutor(i){ setForm(f=>({...f,tutores:(f.tutores||[]).filter((_,j)=>j!==i)}));}
  function updTutor(i,k,v){ setForm(f=>({...f,tutores:(f.tutores||[]).map((t,j)=>j===i?{...t,[k]:v}:t)}));}

  const edadForm = calcularEdad(form.fechaNacimiento);
  const menorForm = edadForm!==null && edadForm<18;

  return <div>
    {/* Header con tipo de escuela */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{display:"flex",gap:6}}>
        {[["infantil","🧒 Escuela Infantil","#3a7abf"],["adultos","🏌️ Escuela Adultos","#1a5c2a"]].map(([id,label,color])=>(
          <button key={id} onClick={()=>setTabTipo(id)}
            style={{background:tabTipo===id?color:"#f0f0f0",color:tabTipo===id?"#fff":"#555",
              border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {label}
            <span style={{marginLeft:6,background:tabTipo===id?"rgba(255,255,255,.3)":"#ddd",
              borderRadius:10,padding:"1px 7px",fontSize:11}}>
              {id==="infantil"?alumnosInfantil.length:alumnosAdultos.length}
            </span>
          </button>
        ))}
      </div>
      <input value={buscar} onChange={e=>setBuscar(e.target.value)}
        placeholder="🔍 Buscar alumno..."
        style={{flex:1,minWidth:150,border:"1.5px solid #d0e0d0",borderRadius:8,
          padding:"8px 12px",fontSize:14,fontFamily:"inherit"}}/>
      {tabTipo==="infantil"&&<Btn color="secondary" onClick={()=>setVistaEstructura(v=>!v)}>
        {vistaEstructura?"👥 Ver alumnos":"📊 Estructura"}
      </Btn>}
      <Btn onClick={openNew}>+ Nuevo alumno</Btn>
    </div>

    {/* Vista de estructura de grupos */}
    {tabTipo==="infantil"&&vistaEstructura&&<EstructuraInfantil
      data={data} setData={setData} alumnos={alumnosInfantil}/>}

    {/* Info de la escuela seleccionada */}
    {!(tabTipo==="infantil"&&vistaEstructura)&&<div style={{background:tabTipo==="infantil"?"#e8f0fb":"#e8f5eb",borderRadius:10,
      padding:"8px 14px",marginBottom:14,fontSize:12,
      color:tabTipo==="infantil"?"#3a7abf":G.fairway,fontWeight:600}}>
      {tabTipo==="infantil"
        ? "🧒 Escuela Infantil — menores de 18 años · Requiere autorización de padres/tutores y RGPD"
        : "🏌️ Escuela Adultos — mayores de 18 años · RGPD obligatorio"}
    </div>}

    {/* Lista de alumnos */}
    {!(tabTipo==="infantil"&&vistaEstructura)&&(alumnosMostrar.length===0
      ? <div style={{textAlign:"center",padding:40,background:G.mist,borderRadius:12,color:G.soft}}>
          <div style={{fontSize:28,marginBottom:8}}>{tabTipo==="infantil"?"🧒":"🏌️"}</div>
          <div style={{fontWeight:700}}>Sin alumnos en {tabTipo==="infantil"?"la Escuela Infantil":"la Escuela de Adultos"}</div>
          <div style={{fontSize:13,marginTop:4}}>Pulsa "+ Nuevo alumno" para añadir el primero.</div>
        </div>
      : <div style={{display:"grid",gap:10}}>
          {alumnosMostrar.map(a=>{
            const edad = calcularEdad(a.fechaNacimiento);
            const menor = edad!==null && edad<18;
            const rgpdOk = a.rgpdAceptado;
            const imgOk  = a.imagenAutorizada;
            const firmaOk= !!a.firmaLegal;
            return <Card key={a.id} style={{borderLeft:`4px solid ${a.activo?G.grass:"#ccc"}`}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <FotoAlumno foto={a.foto} nombre={a.nombre} size={40}/>
                    <span style={{fontWeight:800,fontSize:15,color:G.ink}}>{a.nombre}</span>
                    {edad!==null&&<span style={{fontSize:12,color:G.soft}}>{edad} años</span>}
                    <GrupoBadge a={a}/>
                    {!a.activo&&<Badge color="gray">Inactivo</Badge>}
                  </div>
                  {/* Datos de contacto */}
                  <div style={{fontSize:12,color:G.soft,display:"flex",gap:12,flexWrap:"wrap"}}>
                    {a.telefono&&<span>📞 {a.telefono}</span>}
                    {a.email&&<span>✉️ {a.email}</span>}
                    {a.fechaNacimiento&&<span>🎂 {a.fechaNacimiento}</span>}
                  </div>
                  {/* Tutores */}
                  {(a.tutores||[]).length>0&&<div style={{fontSize:12,color:"#555",marginTop:4}}>
                    {(a.tutores||[]).map((t,i)=>(
                      <span key={i} style={{marginRight:10}}>👨‍👩‍👦 {t.nombre} ({t.relacion}) {t.telefono}</span>
                    ))}
                  </div>}
                  {/* Estado legal */}
                  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,background:rgpdOk?"#e8f5eb":"#fdecea",
                      color:rgpdOk?G.grass:G.danger,borderRadius:8,padding:"2px 8px",fontWeight:600}}>
                      {rgpdOk?"✓ RGPD":"⚠ RGPD pendiente"}
                    </span>
                    {menor&&<span style={{fontSize:11,background:firmaOk?"#e8f5eb":"#fdecea",
                      color:firmaOk?G.grass:G.danger,borderRadius:8,padding:"2px 8px",fontWeight:600}}>
                      {firmaOk?"✓ Autorización legal":"⚠ Autorización pendiente"}
                    </span>}
                    {a.alergias&&<span style={{fontSize:11,background:"#FFF3E0",color:"#E65100",borderRadius:8,padding:"2px 8px",fontWeight:600}}>🤧 {a.alergias.length>20?a.alergias.slice(0,20)+"…":a.alergias}</span>}
                    {a.intolerancias&&<span style={{fontSize:11,background:"#F3E5F5",color:"#6A1B9A",borderRadius:8,padding:"2px 8px",fontWeight:600}}>🥛 {a.intolerancias.length>20?a.intolerancias.slice(0,20)+"…":a.intolerancias}</span>}
                    {a.lesiones&&<span style={{fontSize:11,background:"#FCE4EC",color:"#880E4F",borderRadius:8,padding:"2px 8px",fontWeight:600}}>🩹 {a.lesiones.length>20?a.lesiones.slice(0,20)+"…":a.lesiones}</span>}
                    {a.equipo&&<span style={{fontSize:11,background:G.mist,color:G.fairway,borderRadius:8,padding:"2px 8px",fontWeight:700}}>🏌️ {a.equipo}</span>}
                    <span style={{fontSize:11,background:imgOk?"#e8f5eb":"#fff8e1",
                      color:imgOk?G.grass:"#8B6914",borderRadius:8,padding:"2px 8px",fontWeight:600}}>
                      {imgOk?"✓ Imagen autorizada":"⚠ Imagen no autorizada"}
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0,flexDirection:"column"}}>
                  <Btn small color="secondary" onClick={()=>openEdit(a)}>Editar</Btn>
                  <Btn small color={a.activo?"gold":"secondary"}
                    onClick={()=>setData({...data,alumnos:alumnos.map(x=>x.id===a.id?{...x,activo:!x.activo}:x)})}>
                    {a.activo?"Inactivar":"Activar"}
                  </Btn>
                  <Btn small color="danger" onClick={()=>setConfirmDelete(a)}>
                    🗑 Borrar
                  </Btn>
                </div>
              </div>
            </Card>;
          })}
        </div>
    )}

    {/* ══ CONFIRMAR BORRADO ══ */}
    {confirmDelete&&<ConfirmModal
      msg={"¿Eliminar a "+confirmDelete.nombre+"? Se borrarán TODOS sus datos (clases, estadísticas, análisis, pagos, mensajes). Esta acción no se puede deshacer."}
      onCancel={()=>setConfirmDelete(null)}
      onOk={()=>{
        const id=confirmDelete.id;
        setData({...data,
          alumnos:alumnos.filter(x=>x.id!==id),
          clases:(data.clases||[]).filter(c=>c.alumnoId!==id),
          estadisticas:(data.estadisticas||[]).filter(s=>s.alumnoId!==id),
          analisis:(data.analisis||[]).filter(x=>x.alumnoId!==id),
          bonos:(data.bonos||[]).filter(x=>x.alumnoId!==id),
          pagos:(data.pagos||[]).filter(x=>x.alumnoId!==id),
          asignaciones:(data.asignaciones||[]).filter(x=>x.alumnoId!==id),
          reservas:(data.reservas||[]).filter(x=>x.alumnoId!==id),
          mensajes:(data.mensajes||[]).filter(x=>x.alumnoId!==id&&x.de!==id),
          resultadosTest:(data.resultadosTest||[]).filter(x=>x.alumnoId!==id),
        });
        setConfirmDelete(null);
      }}
    />}

    {/* ══ MODAL ALTA / EDICIÓN ══ */}
    {modal&&<Modal title={modal==="new"?"🎓 Nuevo alumno":"✏️ Editar alumno"} onClose={()=>setModal(null)} wide>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,
        paddingBottom:12,borderBottom:"1px solid #e0eee0"}}>
        <img src={LOGO_GCR} alt="Golf Ciudad Real" style={{height:36,objectFit:"contain"}}/>
        <div style={{fontSize:12,color:G.soft}}>🏫 Escuela de Golf · Golf Ciudad Real C.D. · Curso 2026/2027</div>
      </div>

      {/* Tipo de escuela auto-detectado */}
      {edadForm!==null&&<div style={{background:menorForm?"#e8f0fb":"#e8f5eb",borderRadius:8,
        padding:"6px 12px",marginBottom:12,fontSize:13,fontWeight:600,
        color:menorForm?"#3a7abf":G.fairway}}>
        {menorForm?"🧒 Escuela Infantil (menor de 18 años)":"🏌️ Escuela de Adultos (mayor de 18 años)"}
        {edadForm!==null&&` · ${edadForm} años`}
      </div>}

      {/* ── DATOS PERSONALES ── */}
      <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:8,
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>👤 Datos personales</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Field label="Nombre completo *">
          <Input value={form.nombre||""} onChange={v=>setForm(f=>({...f,nombre:v}))} placeholder="Nombre y apellidos"/>
        </Field>
        <Field label="Fecha de nacimiento">
          <Input type="date" value={form.fechaNacimiento||""} onChange={v=>{
            const nivel=autoNivel(v);
            setForm(f=>({...f,fechaNacimiento:v,...(nivel?{nivel}:{})}));
          }}/>
        </Field>
        <Field label="Nivel / Grupo">
          <select value={form.nivel||""} onChange={e=>setForm(f=>({...f,nivel:e.target.value}))}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
              fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            <option value="">Sin asignar</option>
            {GRUPOS_EDAD.map(g=><option key={g.id} value={g.id}>{g.emoji} {g.nombre} ({g.rango})</option>)}
          </select>
          {form.nivel&&form.fechaNacimiento&&(()=>{
            const g=GRUPOS_EDAD.find(x=>x.id===form.nivel);
            return g?<div style={{marginTop:4,background:g.color,color:"#fff",borderRadius:8,
              padding:"4px 10px",fontSize:12,fontWeight:700,display:"inline-block"}}>
              {g.emoji} Asignado automáticamente: {g.nombre}
            </div>:null;
          })()}
        </Field>
        <Field label="PIN de acceso (4-6 dígitos)">
          <Input value={form.pin||""} onChange={v=>setForm(f=>({...f,pin:v.replace(/\D/g,"").slice(0,6)}))}
            placeholder="PIN numérico" maxLength={6}/>
        </Field>
        <Field label="Teléfono">
          <Input value={form.telefono||""} onChange={v=>setForm(f=>({...f,telefono:v}))} placeholder="Teléfono de contacto"/>
        </Field>
        <Field label="Email">
          <Input value={form.email||""} onChange={v=>setForm(f=>({...f,email:v}))} placeholder="Email"/>
        </Field>
        <Field label="Fecha de alta">
          <Input type="date" value={form.fechaAlta||today()} onChange={v=>setForm(f=>({...f,fechaAlta:v}))}/>
        </Field>
      </div>
      <Field label="Notas">
        <Textarea value={form.notas||""} onChange={v=>setForm(f=>({...f,notas:v}))} rows={2} placeholder="Observaciones generales..."/>
      </Field>

      {/* Salud */}
      <div style={{fontWeight:700,color:G.fairway,fontSize:13,margin:"14px 0 8px",
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>🏥 Información médica</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
        <Field label="🤧 Alergias">
          <Textarea value={form.alergias||""} onChange={v=>setForm(f=>({...f,alergias:v}))}
            rows={2} placeholder="Alergia al polen, al látex, picaduras..."/>
        </Field>
        <Field label="🥛 Intolerancias alimentarias">
          <Textarea value={form.intolerancias||""} onChange={v=>setForm(f=>({...f,intolerancias:v}))}
            rows={2} placeholder="Intolerancia a la lactosa, al gluten..."/>
        </Field>
      </div>
      <Field label="🩹 Lesiones / Condiciones físicas">
        <Textarea value={form.lesiones||""} onChange={v=>setForm(f=>({...f,lesiones:v}))}
          rows={2} placeholder="Lesión de rodilla, asma, escoliosis... Indicar restricciones de actividad."/>
      </Field>

      {/* Equipo */}
      <div style={{fontWeight:700,color:G.fairway,fontSize:13,margin:"14px 0 8px",
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>🏌️ Equipo</div>
      <Field label="Equipo al que pertenece">
        <Input value={form.equipo||""} onChange={v=>setForm(f=>({...f,equipo:v}))}
          placeholder="Nombre del equipo (se asignará más adelante)"/>
      </Field>

      {/* Foto del alumno */}
      <div style={{marginBottom:14}}>
        <label style={{fontSize:12,fontWeight:600,color:G.soft,display:"block",marginBottom:8}}>
          FOTO DEL ALUMNO
        </label>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <FotoAlumno foto={form.foto} nombre={form.nombre} size={72}/>
          <div>
            <label style={{background:G.mist,color:G.fairway,borderRadius:8,
              padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer",display:"inline-block"}}>
              📷 {form.foto?"Cambiar foto":"Subir foto"}
              <input type="file" accept="image/*" onChange={e=>{
                const file=e.target.files[0]; if(!file) return;
                if(file.size>1.5*1024*1024){alert("La foto no puede superar 1.5MB.");return;}
                const reader=new FileReader();
                reader.onload=ev=>setForm(f=>({...f,foto:ev.target.result}));
                reader.readAsDataURL(file);
              }} style={{display:"none"}}/>
            </label>
            {form.foto&&<button onClick={()=>setForm(f=>({...f,foto:""}))}
              style={{marginLeft:8,background:"none",border:"none",color:G.danger,
                cursor:"pointer",fontSize:13,fontWeight:600}}>
              ✕ Quitar foto
            </button>}
            <div style={{fontSize:11,color:G.soft,marginTop:4}}>
              JPG, PNG · Máx. 1.5MB · Se guardará en el perfil del alumno
            </div>
          </div>
        </div>
      </div>

      <Field label="Notas">
        <Textarea value={form.notas||""} onChange={v=>setForm(f=>({...f,notas:v}))} rows={2} placeholder="Observaciones..."/>
      </Field>

      {/* ── PADRES / TUTORES (siempre visible, obligatorio para menores) ── */}
      <div style={{fontWeight:700,color:G.fairway,fontSize:13,margin:"16px 0 8px",
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>
        👨‍👩‍👦 Padres / Tutores legales {menorForm&&<span style={{color:G.danger,fontSize:11}}>(obligatorio para menores)</span>}
      </div>
      {(form.tutores||[]).map((t,i)=>(
        <div key={i} style={{background:"#f9f9f9",borderRadius:10,padding:12,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontWeight:600,color:G.ink,fontSize:13}}>Tutor {i+1}</span>
            <Btn small color="danger" onClick={()=>delTutor(i)}>✕ Eliminar</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Nombre completo *">
              <Input value={t.nombre||""} onChange={v=>updTutor(i,"nombre",v)} placeholder="Nombre y apellidos"/>
            </Field>
            <Field label="Relación con el alumno">
              <select value={t.relacion||""} onChange={e=>updTutor(i,"relacion",e.target.value)}
                style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
                  fontSize:14,background:"#fff",fontFamily:"inherit"}}>
                <option value="">Seleccionar...</option>
                <option value="Padre">Padre</option>
                <option value="Madre">Madre</option>
                <option value="Tutor legal">Tutor legal</option>
                <option value="Abuelo/a">Abuelo/a</option>
                <option value="Otro">Otro</option>
              </select>
            </Field>
            <Field label="DNI/NIE">
              <Input value={t.dni||""} onChange={v=>updTutor(i,"dni",v)} placeholder="DNI o NIE del tutor"/>
            </Field>
            <Field label="Teléfono">
              <Input value={t.telefono||""} onChange={v=>updTutor(i,"telefono",v)} placeholder="Teléfono directo"/>
            </Field>
            <Field label="Email">
              <Input value={t.email||""} onChange={v=>updTutor(i,"email",v)} placeholder="Email del tutor"/>
            </Field>
            <Field label="PIN acceso plataforma (4 dígitos)">
              <Input value={t.pin||""} onChange={v=>updTutor(i,"pin",v.replace(/\D/g,"").slice(0,4))} placeholder="PIN propio del tutor"/>
            </Field>
          </div>
          {t.pin&&<div style={{fontSize:11,color:"#1a5c2a",marginTop:4,background:"#e8f4e8",borderRadius:6,padding:"4px 8px"}}>
            ✅ Este tutor puede acceder a la plataforma con su PIN propio
          </div>}
        </div>
      ))}
      <button onClick={addTutor}
        style={{background:G.mist,color:G.fairway,border:"none",borderRadius:8,
          padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:16}}>
        + Añadir padre/tutor
      </button>

      {/* ── RGPD — PROTECCIÓN DE DATOS ── */}
      <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:8,
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>🔒 Protección de datos (RGPD)</div>
      <div style={{background:"#f0f8f0",borderRadius:10,padding:12,marginBottom:12,fontSize:12,
        color:"#444",lineHeight:1.6}}>
        <b>Información básica sobre protección de datos:</b><br/>
        <b>Responsable:</b> Golf Ciudad Real C.D. · <b>Finalidad:</b> Gestión de la Escuela de Golf, seguimiento formativo y comunicación con las familias. <b>Base legal:</b> Consentimiento del interesado (Art. 6.1.a RGPD). <b>Conservación:</b> Durante la relación y 5 años posteriores. <b>Derechos:</b> Acceso, rectificación, supresión, portabilidad y oposición dirigiéndose a golf@golfciudadreal.es. <b>Más información:</b> Puede consultar la política de privacidad completa en recepción o en nuestra web.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:6}}>
        <Field label="Nombre del firmante RGPD">
          <Input value={form.rgpdFirmante||""} onChange={v=>setForm(f=>({...f,rgpdFirmante:v}))}
            placeholder={menorForm?"Nombre del padre/madre/tutor":"Nombre del alumno"}/>
        </Field>
        <Field label="Fecha de aceptación RGPD">
          <Input type="date" value={form.rgpdFecha||today()} onChange={v=>setForm(f=>({...f,rgpdFecha:v}))}/>
        </Field>
      </div>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:14,
        background:"#e8f5eb",borderRadius:8,padding:10}}>
        <input type="checkbox" id="rgpd" checked={!!form.rgpdAceptado}
          onChange={e=>setForm(f=>({...f,rgpdAceptado:e.target.checked}))}
          style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
        <label htmlFor="rgpd" style={{fontSize:12,color:G.ink,cursor:"pointer",lineHeight:1.5}}>
          <b>He leído y acepto el tratamiento de mis datos personales</b> (o los del menor a mi cargo) 
          conforme al Reglamento General de Protección de Datos (RGPD UE 2016/679) y la LO 3/2018 (LOPDGDD) 
          para las finalidades descritas. {menorForm&&<b>Como padre/madre/tutor legal del menor, 
          presto mi consentimiento en su nombre.</b>}
        </label>
      </div>

      {/* ── AUTORIZACIÓN DE IMAGEN (especialmente importante para menores) ── */}
      <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:8,
        paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>
        📸 Autorización de imagen {menorForm&&<span style={{color:G.danger,fontSize:11}}>(LOPJM - menores)</span>}
      </div>
      {menorForm&&<div style={{background:"#fff8e1",borderRadius:8,padding:10,marginBottom:10,
        fontSize:12,color:"#5a4000",lineHeight:1.5}}>
        <b>⚠️ Aviso para menores de edad:</b> La captación y uso de imágenes de menores está regulada 
        por la <b>Ley Orgánica 1/1996 de Protección Jurídica del Menor</b> y la <b>LO 3/2018</b>. 
        Es necesaria la autorización expresa del padre, madre o tutor legal para publicar fotografías 
        o vídeos del menor en redes sociales, web o materiales del club.
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:6}}>
        <Field label={menorForm?"Nombre del tutor que autoriza":"Nombre del firmante"}>
          <Input value={form.imagenFirmante||""} onChange={v=>setForm(f=>({...f,imagenFirmante:v}))}
            placeholder={menorForm?"Padre/madre/tutor legal":"Nombre del alumno"}/>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={form.imagenFecha||today()} onChange={v=>setForm(f=>({...f,imagenFecha:v}))}/>
        </Field>
      </div>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:14,
        background:"#e8f5eb",borderRadius:8,padding:10}}>
        <input type="checkbox" id="imagen" checked={!!form.imagenAutorizada}
          onChange={e=>setForm(f=>({...f,imagenAutorizada:e.target.checked}))}
          style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
        <label htmlFor="imagen" style={{fontSize:12,color:G.ink,cursor:"pointer",lineHeight:1.5}}>
          {menorForm
            ? <><b>Autorizo, como padre/madre/tutor legal</b>, la captación y publicación de imágenes y vídeos 
              del menor en actividades de la Escuela de Golf de Golf Ciudad Real C.D. 
              (web, redes sociales, materiales formativos), siempre con fines divulgativos y sin ánimo comercial.</>
            : <><b>Autorizo</b> la captación y publicación de mis imágenes y vídeos en actividades 
              de la Escuela de Golf de Golf Ciudad Real C.D. (web, redes sociales, materiales formativos).</>
          }
        </label>
      </div>

      {/* ── FIRMA LEGAL (para menores) ── */}
      {menorForm&&<div>
        <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:8,
          paddingBottom:4,borderBottom:"2px solid #e0eee0"}}>
          ✍️ Confirmación legal del responsable
        </div>
        <div style={{background:"#fff0f0",borderRadius:8,padding:10,marginBottom:10,
          fontSize:12,color:"#555",lineHeight:1.5}}>
          Al completar este formulario, el padre/madre/tutor legal declara ser el representante legal 
          del menor y acepta en su nombre las condiciones de participación en la Escuela de Golf, 
          incluyendo el Reglamento Interno del Club, las normas de seguridad y las condiciones de 
          cancelación de clases. Esta aceptación tiene validez legal conforme al Art. 162 del Código Civil.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Nombre del tutor legal (firma digital)">
            <Input value={form.firmaLegal||""} onChange={v=>setForm(f=>({...f,firmaLegal:v}))}
              placeholder="Nombre completo del tutor legal"/>
          </Field>
          <Field label="DNI/NIE del tutor">
            <Input value={form.firmaDni||""} onChange={v=>setForm(f=>({...f,firmaDni:v}))}
              placeholder="DNI o NIE"/>
          </Field>
          <Field label="Fecha de la firma">
            <Input type="date" value={form.firmaFecha||today()} onChange={v=>setForm(f=>({...f,firmaFecha:v}))}/>
          </Field>
          <Field label="Relación con el menor">
            <select value={form.firmaRelacion||""} onChange={e=>setForm(f=>({...f,firmaRelacion:e.target.value}))}
              style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
                fontSize:14,background:"#fff",fontFamily:"inherit"}}>
              <option value="">Seleccionar...</option>
              <option value="Padre">Padre</option>
              <option value="Madre">Madre</option>
              <option value="Tutor legal">Tutor legal designado</option>
            </select>
          </Field>
        </div>
        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginTop:10,
          background:"#fdecea",borderRadius:8,padding:10}}>
          <input type="checkbox" id="legal" checked={!!form.aceptaCondiciones}
            onChange={e=>setForm(f=>({...f,aceptaCondiciones:e.target.checked}))}
            style={{width:18,height:18,marginTop:2,flexShrink:0}}/>
          <label htmlFor="legal" style={{fontSize:12,color:G.ink,cursor:"pointer",lineHeight:1.5}}>
            <b>Declaro ser el padre/madre/tutor legal</b> del menor indicado y acepto en su nombre 
            el Reglamento Interno de la Escuela de Golf Ciudad Real C.D., las condiciones de participación 
            y me responsabilizo del cumplimiento de las normas del club por parte del menor.
          </label>
        </div>
      </div>}

      {/* Advertencia si faltan datos legales */}
      {(!form.rgpdAceptado||(menorForm&&!form.aceptaCondiciones))&&<div style={{
        background:"#fff8e1",borderRadius:8,padding:10,marginTop:12,
        fontSize:12,color:"#8B6914",fontWeight:600}}>
        ⚠️ {!form.rgpdAceptado?"El consentimiento RGPD es obligatorio.":""}
        {menorForm&&!form.aceptaCondiciones?" La confirmación legal del tutor es obligatoria para menores.":""}
      </div>}

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:14}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn onClick={save} disabled={!form.nombre?.trim()||!form.rgpdAceptado||(menorForm&&!form.aceptaCondiciones)}>
          💾 Guardar alumno
        </Btn>
      </div>
    </Modal>}
  </div>;
}


function ModClases({data,setData}){
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const clases=data.clases||[];
  const alumnos=data.alumnos||[];
  const hoy=today();
  const sorted=[...clases].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const proximas=sorted.filter(c=>c.fecha>=hoy);
  const pasadas=sorted.filter(c=>c.fecha<hoy).reverse();

  function openNew(){setForm({alumnoId:alumnos[0]?.id||"",fecha:hoy,hora:"10:00",duracion:"60",tipo:"Individual",contenidoEspecifico:"swing_completo",zona:"Campo de prácticas",contenido:"",precio:"",ivaPct:21,retencionPct:0,asistio:false,registradoContablemente:false});setModal("new");}
  function save(){
    if(!form.alumnoId||!form.fecha) return;
    const claseId = modal==="new" ? uid() : modal;
    const claseGuardada = {...form, id:claseId};
    const updated=modal==="new"?[...clases,claseGuardada]:clases.map(c=>c.id===modal?claseGuardada:c);

    // ── Gestión contable automática ──────────────────────────────────
    let nuevosIngresos = data.ingresos||[];
    const precio = Number(form.precio||0);

    if(form.asistio && precio > 0) {
      // Buscar si ya existe ingreso para esta clase
      const yaRegistrado = (data.ingresos||[]).find(i=>i.claseId===claseId);
      if(!yaRegistrado){
        const alumno = alumnos.find(a=>a.id===form.alumnoId);
        const contenidoLabel = CONTENIDOS_CLASE.find(c=>c.id===form.contenidoEspecifico)?.label || form.contenidoEspecifico || form.tipo;
        const ivaP = Number(form.ivaPct||21);
        const retP = Number(form.retencionPct||0);
        const ivaImp = +(precio * ivaP/100).toFixed(2);
        const retImp = +(precio * retP/100).toFixed(2);
        const total  = +(precio + ivaImp - retImp).toFixed(2);
        const nuevoIngreso = {
          id: uid(),
          claseId,
          fecha: form.fecha,
          categoria: "Clase individual",
          concepto: contenidoLabel + (alumno ? " — " + alumno.nombre : ""),
          alumnoId: form.alumnoId,
          importeBase: precio,
          ivaPct: ivaP,
          ivaImporte: ivaImp,
          retencionPct: retP,
          retencionImporte: retImp,
          importeTotal: total,
          metodo: form.metodoPago||"Efectivo",
          generadoAutomatico: true,
        };
        nuevosIngresos = [...nuevosIngresos, nuevoIngreso];
      }
    }
    // Si se desmarca asistencia, eliminar el ingreso automático vinculado
    if(!form.asistio){
      nuevosIngresos = nuevosIngresos.filter(i=>i.claseId!==claseId||!i.generadoAutomatico);
    }

    setData({...data, clases:updated, ingresos:nuevosIngresos});
    sincronizarClaseFirestore(claseGuardada, alumnos);
    if(modal==="new"){
      const alumno = alumnos.find(a=>a.id===form.alumnoId);
      notificarClaseAlumnoEmail(claseGuardada, alumno);
    }
    setModal(null);
  }
  function alumnoNombre(id){return alumnos.find(a=>a.id===id)?.nombre||"—";}
  const CC=({c})=>{
    const cLabel=CONTENIDOS_CLASE.find(x=>x.id===c.contenidoEspecifico)?.label||"";
    return <Card style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:8}}>
    <div style={{background:c.asistio?G.mist:"#fff3cd",borderRadius:10,padding:"6px 10px",textAlign:"center",minWidth:50,flexShrink:0}}>
      <div style={{fontSize:11,color:G.soft}}>{c.fecha.slice(5)}</div>
      <div style={{fontSize:15,fontWeight:800,color:G.fairway}}>{c.hora}</div>
    </div>
    <div style={{flex:1}}>
      <div style={{fontWeight:700,color:G.ink}}>{alumnoNombre(c.alumnoId)}</div>
      <div style={{fontSize:12,color:G.soft}}>{c.tipo} · {c.zona} · {c.duracion}min</div>
      {cLabel&&<div style={{fontSize:12,color:G.fairway,marginTop:2,fontWeight:600}}>{cLabel}</div>}
      {c.contenido&&<div style={{fontSize:12,color:"#555",marginTop:2}}>{c.contenido}</div>}
      {Number(c.precio||0)>0&&<div style={{fontSize:11,marginTop:3}}>
        <span style={{background:c.asistio?"#e8f4e8":"#fff3cd",color:c.asistio?G.grass:"#856404",borderRadius:4,padding:"1px 6px",fontWeight:600}}>
          {c.asistio?"✅ Registrado contablemente":"⏳ "+Number(c.precio).toFixed(2)+"€ pendiente"}
        </span>
      </div>}
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
      <Badge color={c.asistio?"green":"gold"}>{c.asistio?"Asistió":"Pendiente"}</Badge>
      <Btn small color="secondary" onClick={()=>{setForm({...c});setModal(c.id);}}>✎</Btn>
      <Btn small color="sky" onClick={()=>generarPDFClase(c, alumnoNombre(c.alumnoId))}>PDF</Btn>
      <Btn small color={c.asistio?"secondary":"sky"} onClick={()=>{
        const updated={...c,asistio:!c.asistio};
        const clasesMod=clases.map(x=>x.id===c.id?updated:x);
        let ingMod=data.ingresos||[];
        const precio=Number(c.precio||0);
        if(updated.asistio && precio>0){
          const yaReg=ingMod.find(i=>i.claseId===c.id&&i.generadoAutomatico);
          if(!yaReg){
            const al=alumnos.find(a=>a.id===c.alumnoId);
            const cLabel=CONTENIDOS_CLASE.find(x=>x.id===c.contenidoEspecifico)?.label||c.tipo||"Clase";
            const ivaP=Number(c.ivaPct||21),retP=Number(c.retencionPct||0);
            const ivaImp=+(precio*ivaP/100).toFixed(2),retImp=+(precio*retP/100).toFixed(2);
            ingMod=[...ingMod,{id:uid(),claseId:c.id,fecha:c.fecha,categoria:"Clase individual",
              concepto:cLabel+(al?" — "+al.nombre:""),alumnoId:c.alumnoId,
              importeBase:precio,ivaPct:ivaP,ivaImporte:ivaImp,retencionPct:retP,
              retencionImporte:retImp,importeTotal:+(precio+ivaImp-retImp).toFixed(2),
              metodo:c.metodoPago||"Efectivo",generadoAutomatico:true}];
          }
        }
        if(!updated.asistio) ingMod=ingMod.filter(i=>!(i.claseId===c.id&&i.generadoAutomatico));
        setData({...data,clases:clasesMod,ingresos:ingMod});
        sincronizarClaseFirestore(updated,alumnos);
      }}>{c.asistio?"↩":"✔"}</Btn>
      <Btn small color="danger" onClick={()=>{if(confirm("¿Eliminar?")){setData({...data,clases:clases.filter(x=>x.id!==c.id)});eliminarClaseFirestore(c.id);}}}> ✕</Btn>
    </div>
  </Card>;
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
      {[[proximas.length,"Próximas",G.sky],[clases.filter(c=>c.asistio).length,"Realizadas",G.grass],[clases.length,"Total",G.fairway]].map(([v,l,c])=>(
        <Card key={l} style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:12,color:G.soft,marginTop:2}}>{l}</div></Card>
      ))}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <h3 style={{margin:0,color:G.ink}}>Próximas</h3><Btn onClick={openNew}>+ Nueva clase</Btn>
    </div>
    {proximas.length===0&&<div style={{color:G.soft,textAlign:"center",padding:20}}>Sin clases programadas.</div>}
    {proximas.map(c=><CC key={c.id} c={c}/>)}
    {pasadas.length>0&&<><h3 style={{color:G.soft,margin:"16px 0 10px"}}>Pasadas</h3>{pasadas.slice(0,8).map(c=><CC key={c.id} c={c}/>)}</>}

    {modal&&<Modal title={modal==="new"?"Nueva clase":"Editar clase"} onClose={()=>setModal(null)}>
      <Field label="Alumno *"><Sel value={form.alumnoId||""} onChange={v=>setForm({...form,alumnoId:v})} options={alumnos.map(a=>({value:a.id,label:a.nombre}))}/></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Fecha *"><Input type="date" value={form.fecha||""} onChange={v=>setForm({...form,fecha:v})}/></Field>
        <Field label="Hora"><Input type="time" value={form.hora||"10:00"} onChange={v=>setForm({...form,hora:v})}/></Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Duración"><Sel value={form.duracion||"60"} onChange={v=>setForm({...form,duracion:v})} options={["30","45","60","90","120"].map(v=>({value:v,label:v+"min"}))}/></Field>
        <Field label="Modalidad"><Sel value={form.tipo||"Individual"} onChange={v=>setForm({...form,tipo:v})} options={TIPOS_CLASE.map(t=>({value:t.id,label:t.label}))}/></Field>
      </div>

      {/* ── Contenido específico ── */}
      <Field label="Contenido de la clase">
        <Sel value={form.contenidoEspecifico||"swing_completo"} onChange={v=>setForm({...form,contenidoEspecifico:v})}
          options={CONTENIDOS_CLASE.map(c=>({value:c.id,label:c.label+" ("+c.categoria+")"}))}/>
      </Field>
      <Field label="Notas / Objetivo"><Textarea value={form.contenido||""} onChange={v=>setForm({...form,contenido:v})} placeholder="Detalles, ejercicios, observaciones…"/></Field>
      <Field label="Zona"><Sel value={form.zona||"Campo de prácticas"} onChange={v=>setForm({...form,zona:v})} options={ZONAS.map(v=>({value:v,label:v}))}/></Field>

      {/* ── Precio y contabilidad ── */}
      <div style={{background:"#f0f7f0",borderRadius:10,padding:"12px 14px",marginTop:4}}>
        <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:10}}>💶 Precio y facturación</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <Field label="Precio base (€)">
            <Input type="number" value={form.precio||""} onChange={v=>setForm({...form,precio:v})} placeholder="0.00"/>
          </Field>
          <Field label="IVA (%)">
            <Sel value={String(form.ivaPct??21)} onChange={v=>setForm({...form,ivaPct:Number(v)})}
              options={["0","4","10","21"].map(v=>({value:v,label:v+"%"}))}/>
          </Field>
          <Field label="Retención IRPF (%)">
            <Sel value={String(form.retencionPct??0)} onChange={v=>setForm({...form,retencionPct:Number(v)})}
              options={["0","7","15","19"].map(v=>({value:v,label:v+"%"}))}/>
          </Field>
        </div>
        <Field label="Método de cobro">
          <Sel value={form.metodoPago||"Efectivo"} onChange={v=>setForm({...form,metodoPago:v})}
            options={["Efectivo","Tarjeta","Transferencia","Bizum","Bono"].map(v=>({value:v,label:v}))}/>
        </Field>
        {Number(form.precio||0)>0&&<div style={{fontSize:12,color:G.soft,marginTop:6,background:"#fff",borderRadius:6,padding:"6px 10px"}}>
          Base: <b>{Number(form.precio||0).toFixed(2)}€</b> + IVA {form.ivaPct??21}%: <b style={{color:G.grass}}>{(Number(form.precio||0)*(Number(form.ivaPct??21)/100)).toFixed(2)}€</b>
          {Number(form.retencionPct||0)>0&&<> − Ret. {form.retencionPct}%: <b style={{color:G.flag}}>{(Number(form.precio||0)*(Number(form.retencionPct||0)/100)).toFixed(2)}€</b></>}
          {" "} = <b style={{color:G.fairway}}>{(Number(form.precio||0)+Number(form.precio||0)*(Number(form.ivaPct??21)/100)-Number(form.precio||0)*(Number(form.retencionPct||0)/100)).toFixed(2)}€</b>
          <span style={{marginLeft:8,fontSize:11,color:G.soft}}>Se registrará en contabilidad al marcar asistencia ✔</span>
        </div>}
        {Number(form.precio||0)===0&&<div style={{fontSize:11,color:G.soft,marginTop:4}}>Sin precio → no se genera ingreso contable.</div>}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
        <input type="checkbox" id="asistioChk" checked={!!form.asistio} onChange={e=>setForm({...form,asistio:e.target.checked})} style={{width:16,height:16}}/>
        <label htmlFor="asistioChk" style={{fontSize:13,color:G.ink,cursor:"pointer"}}>Marcar como impartida (asistió)</label>
      </div>

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:12}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={save}>Guardar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN: ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════════
function ModEstadisticas({data,setData}){
  const alumnos = (data.alumnos||[]).filter(a=>a.activo);
  const stats   = data.estadisticas||[];

  const [alumnoSel, setAlumnoSel] = useState("");
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState({});

  // Auto-select first alumno
  useEffect(()=>{
    if(alumnos.length>0 && !alumnoSel){
      setAlumnoSel(alumnos[0].id);
    }
  },[alumnos.length]);

  const alumnoActual = alumnos.find(a=>a.id===alumnoSel);
  const alumnoStats  = stats
    .filter(s=>s.alumnoId===alumnoSel)
    .sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));

  function abrirNueva(){
    setForm({
      alumnoId: alumnoSel,
      fecha:    today(),
      hoyos:    "18",
      golpes:   "",
      fairwaysPorcentaje: "",
      greensRegulacion:   "",
      putts:    "",
      bunkers:  "",
      handicap: "",
      palo:     "7-hierro",
      distancia:"",
      notas:    "",
    });
    setModal(true);
  }

  function guardar(){
    if(!form.fecha) return;
    const reg = {...form, alumnoId: alumnoSel, id: form.id||uid()};
    const updated = stats.some(s=>s.id===reg.id)
      ? stats.map(s=>s.id===reg.id ? reg : s)
      : [...stats, reg];
    setData({...data, estadisticas: updated});
    setModal(false);
  }

  function editar(s){ setForm({...s}); setModal(true); }

  function eliminar(id){
    if(golfConfirm("¿Eliminar esta ronda?"))
      setData({...data, estadisticas: stats.filter(s=>s.id!==id)});
  }

  // Mini sparkline chart
  function Spark({values, color}){
    if(!values||values.length<2) return null;
    const nums = values.map(Number).filter(v=>!isNaN(v));
    if(nums.length<2) return null;
    const mx=Math.max(...nums), mn=Math.min(...nums), rng=mx-mn||1;
    const w=100, h=28, p=3;
    const pts=nums.map((v,i)=>`${p+(i/(nums.length-1))*(w-p*2)},${p+(1-(v-mn)/rng)*(h-p*2)}`).join(" ");
    const [lx,ly]=pts.split(" ").at(-1).split(",");
    return <svg width={w} height={h} style={{display:"block"}}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts}/>
      <circle cx={lx} cy={ly} r="3" fill={color}/>
    </svg>;
  }

  // Stats summary for selected alumno
  const últimas10 = alumnoStats.slice(0,10).reverse();

  if(alumnos.length===0) return (
    <div style={{textAlign:"center",padding:40,color:G.soft}}>
      <div style={{fontSize:32,marginBottom:12}}>📊</div>
      <div style={{fontWeight:700,marginBottom:8}}>Sin alumnos registrados</div>
      <div style={{fontSize:13}}>Añade alumnos en la pestaña <b>Alumnos</b> para poder registrar estadísticas.</div>
    </div>
  );

  return <div>
    {/* Selector alumno + botón */}
    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:180}}>
        <select value={alumnoSel} onChange={e=>setAlumnoSel(e.target.value)}
          style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,
            padding:"9px 12px",fontSize:15,background:"#fff",fontFamily:"inherit",fontWeight:600,color:G.fairway}}>
          {alumnos.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
      <Btn onClick={abrirNueva} color="primary">+ Registrar ronda</Btn>
    </div>

    {/* Gráficas resumen */}
    {alumnoStats.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
      {[
        ["Golpes",     últimas10.map(s=>s.golpes),     G.fairway],
        ["Hándicap",   últimas10.map(s=>s.handicap),   G.flag],
        ["Putts",      últimas10.map(s=>s.putts),       G.sky],
        ["GIR %",      últimas10.map(s=>s.greensRegulacion), G.grass],
      ].map(([label,vals,color])=>(
        <Card key={label} style={{padding:10}}>
          <div style={{fontSize:11,color:G.soft,marginBottom:4}}>{label}</div>
          <Spark values={vals} color={color}/>
          <div style={{fontSize:14,fontWeight:700,color,marginTop:2}}>
            {vals.filter(Boolean).length>0
              ? vals.filter(Boolean).at(-1)
              : "—"}
          </div>
        </Card>
      ))}
    </div>}

    {/* Lista de rondas */}
    {alumnoStats.length===0
      ? <div style={{textAlign:"center",padding:36,background:G.mist,borderRadius:12,color:G.soft}}>
          <div style={{fontSize:28,marginBottom:8}}>⛳</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Sin rondas registradas</div>
          <div style={{fontSize:13}}>Pulsa <b>"+ Registrar ronda"</b> para añadir la primera ronda de <b>{alumnoActual?.nombre}</b>.</div>
        </div>
      : <div style={{display:"grid",gap:10}}>
          {alumnoStats.map(s=>(
            <Card key={s.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontWeight:700,color:G.ink,fontSize:15,marginBottom:6}}>
                    📅 {s.fecha} · {s.hoyos} hoyos
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:14}}>
                    {[
                      ["Golpes",    s.golpes,                          G.fairway],
                      ["Fairways",  s.fairwaysPorcentaje ? s.fairwaysPorcentaje+"%" : "—", G.grass],
                      ["GIR",       s.greensRegulacion   ? s.greensRegulacion+"%"   : "—", G.sky],
                      ["Putts",     s.putts,                           G.flag],
                      ["Bunkers",   s.bunkers,                         G.purple],
                      ["Hcp",       s.handicap,                        G.danger],
                    ].map(([k,v,c])=>(
                      <div key={k} style={{textAlign:"center",minWidth:44}}>
                        <div style={{fontSize:18,fontWeight:800,color:c}}>{v||"—"}</div>
                        <div style={{fontSize:10,color:G.soft}}>{k}</div>
                      </div>
                    ))}
                  </div>
                  {s.notas&&<div style={{fontSize:12,color:"#555",marginTop:8,fontStyle:"italic"}}>"{s.notas}"</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <Btn small color="secondary" onClick={()=>editar(s)}>✎</Btn>
                  <Btn small color="danger"    onClick={()=>eliminar(s.id)}>✕</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
    }

    {/* Modal registrar / editar ronda */}
    {modal&&<Modal title={form.id?"Editar ronda":"Registrar nueva ronda"} onClose={()=>setModal(false)} wide>
      {/* Alumno y fecha */}
      <div style={{background:G.mist,borderRadius:10,padding:"10px 14px",marginBottom:14,
        fontSize:14,fontWeight:600,color:G.fairway}}>
        👤 {alumnoActual?.nombre||"Alumno"}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
        <Field label="Fecha *">
          <Input type="date" value={form.fecha||today()} onChange={v=>setForm(f=>({...f,fecha:v}))}/>
        </Field>
        <Field label="Hoyos jugados">
          <select value={form.hoyos||"18"} onChange={e=>setForm(f=>({...f,hoyos:e.target.value}))}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
              fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            <option value="9">9 hoyos</option>
            <option value="18">18 hoyos</option>
          </select>
        </Field>
      </div>

      {/* Stats principales */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:4}}>
        {[
          ["golpes",              "Golpes totales",   "number"],
          ["fairwaysPorcentaje",  "Fairways %",       "number"],
          ["greensRegulacion",    "GIR %",            "number"],
          ["putts",               "Putts",            "number"],
          ["bunkers",             "Bunkers",          "number"],
          ["handicap",            "Hándicap",         "number"],
        ].map(([key,label,type])=>(
          <Field key={key} label={label}>
            <Input type={type} value={form[key]||""}
              onChange={v=>setForm(f=>({...f,[key]:v}))}
              placeholder="—"/>
          </Field>
        ))}
      </div>

      {/* Palo referencia y distancia */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
        
        <Field label="Distancia media (m)">
          <Input type="number" value={form.distancia||""} onChange={v=>setForm(f=>({...f,distancia:v}))} placeholder="—"/>
        </Field>
      </div>

      <Field label="Notas de la ronda">
        <Textarea value={form.notas||""} onChange={v=>setForm(f=>({...f,notas:v}))}
          rows={2} placeholder="Observaciones, condiciones del campo, sensaciones..."/>
      </Field>

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:12}}>
        <Btn color="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.fecha}>💾 Guardar ronda</Btn>
      </div>
    </Modal>}
  </div>;
}


// ═══════════════════════════════════════════════════════════════════
// ADMIN: VÍDEO ANÁLISIS
// ═══════════════════════════════════════════════════════════════════
function ModAnalisis({data,setData}){
  const [modal,setModal]=useState(null);
  const [verModal,setVerModal]=useState(null);
  const [form,setForm]=useState({});
  const [alumnoSel,setAlumnoSel]=useState("todos");
  const [aiLoading,setAiLoading]=useState(false);
  const alumnos=data.alumnos||[];
  const analisis=data.analisis||[];

  function alumnoNombre(id){return alumnos.find(a=>a.id===id)?.nombre||"—";}
  function alumnoTutores(id){return alumnos.find(a=>a.id===id)?.tutores||[];}

  function blank(){return {alumnoId:alumnos[0]?.id||"",fecha:today(),tipo:"Swing completo",palo:"7-hierro",videoUrl:"",aspectosBuenos:[],aspectosMejorar:[],comentarioTecnico:"",comentarioTutor:"",enviado:false,valoracion:"3"};}

  function save(){
    if(!form.alumnoId||!form.fecha) return;
    const updated=modal==="new"?[...analisis,{...form,id:uid()}]:analisis.map(a=>a.id===modal?{...form}:a);
    setData({...data,analisis:updated});setModal(null);
  }

  function toggleAsp(list,asp){const cur=form[list]||[];setForm({...form,[list]:cur.includes(asp)?cur.filter(x=>x!==asp):[...cur,asp]});}

  async function generar(paraTutor){
    if(!form.alumnoId) return;
    setAiLoading(true);
    const a=alumnos.find(x=>x.id===form.alumnoId);
    const prompt=paraTutor
      ?`Eres el profesor de golf José Caballero de la José Caballero Golf Academy (Golf Ciudad Real C.D.). Escribe un comentario amable y motivador en español para los padres/tutores del alumno "${a?.nombre}" (${a?.nivel||""}, ${a?.edad||"—"} años). Tipo de golpe: ${form.tipo||"Swing"} con ${form.palo}. Positivos: ${(form.aspectosBuenos||[]).join(", ")||"varios"}. A mejorar: ${(form.aspectosMejorar||[]).join(", ")||"algunos aspectos"}. Breve, cálido, 3 párrafos, nota motivadora final.`
      :`Eres el profesor de golf José Caballero de la José Caballero Golf Academy. Redacta un informe técnico profesional en español para el alumno "${a?.nombre}" (${a?.nivel||""}). Tipo: ${form.tipo} con ${form.palo}. Positivos: ${(form.aspectosBuenos||[]).join(", ")||"ninguno"}. A mejorar: ${(form.aspectosMejorar||[]).join(", ")||"ninguno"}. 3-4 párrafos, con drills recomendados.`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const json=await res.json();
      const texto=json.content?.find(b=>b.type==="text")?.text||"";
      if(paraTutor)setForm(f=>({...f,comentarioTutor:texto}));
      else setForm(f=>({...f,comentarioTecnico:texto}));
    }catch(e){}
    setAiLoading(false);
  }

  const filtrados=(alumnoSel==="todos"?analisis:analisis.filter(a=>a.alumnoId===alumnoSel)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const stars=n=>"★".repeat(Number(n||0))+"☆".repeat(5-Number(n||0));
  const verItem=analisis.find(a=>a.id===verModal);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12,marginBottom:20}}>
      {[[analisis.length,"Análisis",G.purple],[analisis.filter(a=>a.enviado).length,"Enviados",G.grass],[analisis.filter(a=>!a.enviado).length,"Pendientes",G.flag]].map(([v,l,c])=>(
        <Card key={l} style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:12,color:G.soft,marginTop:2}}>{l}</div></Card>
      ))}
    </div>
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <Sel value={alumnoSel} onChange={setAlumnoSel} options={[{value:"todos",label:"Todos"},...alumnos.map(a=>({value:a.id,label:a.nombre}))]}/>
      <Btn color="purple" onClick={()=>{setForm(blank());setModal("new");}}>+ Nuevo análisis</Btn>
    </div>
    <div style={{display:"grid",gap:10}}>
      {filtrados.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30}}>Sin análisis.</div>}
      {filtrados.map(a=>(
        <Card key={a.id}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:56,height:42,borderRadius:10,background:a.videoUrl?"#1a1a2e":G.mist,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
              {a.videoUrl?<a href={a.videoUrl} target="_blank" rel="noreferrer" style={{color:G.white,textDecoration:"none"}}>▶</a>:"🎬"}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontWeight:700,color:G.ink}}>{alumnoNombre(a.alumnoId)}</span>
                <Badge color="purple">{a.tipo}</Badge>
                {a.enviado&&<Badge color="green">✓ Enviado</Badge>}
              </div>
              <div style={{fontSize:12,color:G.soft,marginTop:2}}>📅 {a.fecha} · <span style={{color:G.flag}}>{stars(a.valoracion)}</span></div>
              {(a.aspectosBuenos||[]).length>0&&<div style={{fontSize:12,marginTop:3}}><span style={{color:G.grass}}>✔ </span>{(a.aspectosBuenos||[]).join(" · ")}</div>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>
              <Btn small color="purple" onClick={()=>setVerModal(a.id)}>Ver</Btn>
              <Btn small color="secondary" onClick={()=>{setForm({...a});setModal(a.id);}}>✎</Btn>
              <Btn small color={a.enviado?"secondary":"sky"} onClick={()=>setData({...data,analisis:analisis.map(x=>x.id===a.id?{...x,enviado:!x.enviado}:x)})}>{a.enviado?"↩":"✉"}</Btn>
              <Btn small color="danger" onClick={()=>{if(confirm("¿Eliminar?"))setData({...data,analisis:analisis.filter(x=>x.id!==a.id)});}}>✕</Btn>
            </div>
          </div>
        </Card>
      ))}
    </div>

    {/* Ver informe */}
    {verModal&&verItem&&<Modal title={`Informe — ${alumnoNombre(verItem.alumnoId)}`} onClose={()=>setVerModal(null)} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
        {[["Fecha",verItem.fecha],["Tipo",verItem.tipo],["Palo",verItem.palo]].map(([k,v])=>(
          <div key={k}><span style={{fontSize:11,color:G.soft}}>{k}</span><div style={{fontWeight:700}}>{v}</div></div>
        ))}
      </div>
      {verItem.videoUrl&&<div style={{marginBottom:14}}><a href={verItem.videoUrl} target="_blank" rel="noreferrer" style={{background:G.purple,color:G.white,borderRadius:8,padding:"8px 16px",textDecoration:"none",fontSize:14,fontWeight:600,display:"inline-block"}}>▶ Abrir vídeo</a></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div style={{background:G.mist,borderRadius:10,padding:12}}>
          <div style={{fontSize:12,fontWeight:700,color:G.grass,marginBottom:6}}>✔ Positivos</div>
          {(verItem.aspectosBuenos||[]).map(a=><div key={a} style={{fontSize:13,marginBottom:2}}>· {a}</div>)}
        </div>
        <div style={{background:"#fffbf0",borderRadius:10,padding:12}}>
          <div style={{fontSize:12,fontWeight:700,color:G.flag,marginBottom:6}}>▲ A mejorar</div>
          {(verItem.aspectosMejorar||[]).map(a=><div key={a} style={{fontSize:13,marginBottom:2}}>· {a}</div>)}
        </div>
      </div>
      {verItem.comentarioTecnico&&<div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:G.fairway,marginBottom:6}}>📋 INFORME TÉCNICO</div>
        <div style={{background:"#f5f9f5",borderRadius:10,padding:14,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{verItem.comentarioTecnico}</div>
      </div>}
      {verItem.comentarioTutor&&<div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:G.purple,marginBottom:6}}>👨‍👩‍👧 COMENTARIO PARA PADRES/TUTORES</div>
        <div style={{background:G.lavender,borderRadius:10,padding:14,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{verItem.comentarioTutor}</div>
        {alumnoTutores(verItem.alumnoId).length>0&&<div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
          {alumnoTutores(verItem.alumnoId).map(t=><div key={t.id} style={{background:G.white,border:"1px solid #ddd",borderRadius:8,padding:"5px 10px",fontSize:12}}><b>{t.nombre}</b> · {t.email||t.telefono||t.relacion}</div>)}
        </div>}
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:16,color:G.flag}}>{stars(verItem.valoracion)}</div>
        <Btn color="secondary" onClick={()=>setVerModal(null)}>Cerrar</Btn>
      </div>
    </Modal>}

    {/* Editar / Nuevo */}
    {modal&&<Modal title={modal==="new"?"Nuevo análisis":"Editar análisis"} onClose={()=>setModal(null)} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Alumno *"><Sel value={form.alumnoId||""} onChange={v=>setForm({...form,alumnoId:v})} options={alumnos.map(a=>({value:a.id,label:a.nombre}))}/></Field>
        <Field label="Fecha *"><Input type="date" value={form.fecha||""} onChange={v=>setForm({...form,fecha:v})}/></Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Field label="Tipo"><Sel value={form.tipo||"Swing completo"} onChange={v=>setForm({...form,tipo:v})} options={["Swing completo","Drive","Approach","Chip","Pitch","Bunker","Putt","Salida"].map(v=>({value:v,label:v}))}/></Field>
        <Field label="Palo"><Sel value={form.palo||"7-hierro"} onChange={v=>setForm({...form,palo:v})} options={PALO_OPTIONS.map(p=>({value:p,label:p}))}/></Field>
        <Field label="Valoración"><Sel value={form.valoracion||"3"} onChange={v=>setForm({...form,valoracion:v})} options={["1","2","3","4","5"].map(v=>({value:v,label:"★".repeat(Number(v))+" ("+v+")"}))}/></Field>
      </div>
      <Field label="URL vídeo"><Input value={form.videoUrl||""} onChange={v=>setForm({...form,videoUrl:v})} placeholder="https://…"/></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div><div style={{fontSize:12,fontWeight:600,color:G.soft,marginBottom:6}}>✔ POSITIVOS</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{ASPECTOS.map(a=>{const s=(form.aspectosBuenos||[]).includes(a);return <button key={a} onClick={()=>toggleAsp("aspectosBuenos",a)} style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:s?G.grass:"#e8e8e8",color:s?G.white:G.soft}}>{a}</button>;})}</div>
        </div>
        <div><div style={{fontSize:12,fontWeight:600,color:G.soft,marginBottom:6}}>▲ A MEJORAR</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{ASPECTOS.map(a=>{const s=(form.aspectosMejorar||[]).includes(a);return <button key={a} onClick={()=>toggleAsp("aspectosMejorar",a)} style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:s?G.flag:"#e8e8e8",color:s?G.white:G.soft}}>{a}</button>;})}</div>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <label style={{fontSize:12,fontWeight:600,color:G.soft}}>📋 INFORME TÉCNICO</label>
          <Btn small onClick={()=>generar(false)} disabled={aiLoading}>{aiLoading?"…":"✨ IA"}</Btn>
        </div>
        <Textarea value={form.comentarioTecnico||""} onChange={v=>setForm({...form,comentarioTecnico:v})} rows={4} placeholder="Descripción técnica, drills…"/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <label style={{fontSize:12,fontWeight:600,color:G.purple}}>👨‍👩‍👧 COMENTARIO PADRES/TUTORES</label>
          <Btn small color="purple" onClick={()=>generar(true)} disabled={aiLoading}>{aiLoading?"…":"✨ IA"}</Btn>
        </div>
        {alumnoTutores(form.alumnoId||"").length>0&&<div style={{fontSize:11,color:G.purple,marginBottom:5}}>Para: {alumnoTutores(form.alumnoId||"").map(t=>t.nombre).join(", ")}</div>}
        <Textarea value={form.comentarioTutor||""} onChange={v=>setForm({...form,comentarioTutor:v})} rows={4} placeholder="Texto amable para padres/tutores…"/>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn color="purple" onClick={save}>Guardar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN: PAGOS
// ═══════════════════════════════════════════════════════════════════
function ModPagos({data,setData}){
  // ── Estados ──────────────────────────────────────────────────────
  const [tab,setTab]         = useState("resumen");
  const [modalI,setModalI]   = useState(null);   // ingreso
  const [modalG,setModalG]   = useState(null);   // gasto
  const [modalCat,setModalCat] = useState(null); // categorías
  const [fI,setFI]           = useState({});
  const [fG,setFG]           = useState({});
  const [filtroDesde,setFiltroDesde] = useState("");
  const [filtroHasta,setFiltroHasta] = useState("");
  const [filtroCat,setFiltroCat]     = useState("todas");
  const [nuevaCat,setNuevaCat]       = useState("");
  const [tipoCat,setTipoCat]         = useState("ingreso");

  const alumnos = data.alumnos||[];
  const ingresos = data.ingresos||[];
  const gastos   = data.gastos||[];
  const catI     = data.categoriasIngreso||[];
  const catG     = data.categoriasGasto||[];

  // IVA y retención por defecto (autónomo actividad deportiva)
  const IVA_DEFAULT = 21;
  const RET_DEFAULT = 15;

  // ── Helpers ───────────────────────────────────────────────────────
  function filtrarPorFecha(arr){
    return arr.filter(r=>{
      if(filtroDesde && r.fecha < filtroDesde) return false;
      if(filtroHasta && r.fecha > filtroHasta) return false;
      return true;
    });
  }
  function fmt(n){ return Number(n||0).toFixed(2)+"€"; }
  function fmtN(n){ return Number(n||0).toFixed(2); }

  const ingFiltrados = filtrarPorFecha(ingresos).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const gasFiltrados = filtrarPorFecha(gastos).sort((a,b)=>b.fecha.localeCompare(a.fecha));

  // Totales
  const totalIngBruto = ingFiltrados.reduce((s,r)=>s+Number(r.importeBase||0),0);
  const totalIVAing   = ingFiltrados.reduce((s,r)=>s+Number(r.ivaImporte||0),0);
  const totalRet      = ingFiltrados.reduce((s,r)=>s+Number(r.retencionImporte||0),0);
  const totalIngNeto  = totalIngBruto + totalIVAing - totalRet;
  const totalGas      = gasFiltrados.reduce((s,r)=>s+Number(r.importeTotal||0),0);
  const totalIVAgas   = gasFiltrados.reduce((s,r)=>s+Number(r.ivaImporte||0),0);
  const beneficio     = totalIngBruto - gasFiltrados.reduce((s,r)=>s+Number(r.importeBase||0),0);
  const ivaLiquidar   = totalIVAing - totalIVAgas;

  // Agrupar por mes para gráfico
  function porMes(arr, campo){
    const map={};
    arr.forEach(r=>{
      const mes=r.fecha?.slice(0,7)||"";
      if(!map[mes]) map[mes]=0;
      map[mes]+=Number(r[campo]||0);
    });
    return map;
  }

  // ── Guardar ingreso ───────────────────────────────────────────────
  function saveIngreso(){
    if(!fI.fecha||!fI.importeBase) return;
    const ivaP  = Number(fI.ivaPct||IVA_DEFAULT);
    const retP  = Number(fI.retencionPct||0);
    const base  = Number(fI.importeBase||0);
    const ivaImp= +(base * ivaP/100).toFixed(2);
    const retImp= +(base * retP/100).toFixed(2);
    const total = +(base + ivaImp - retImp).toFixed(2);
    const reg = {...fI, ivaPct:ivaP, retencionPct:retP,
      ivaImporte:ivaImp, retencionImporte:retImp, importeTotal:total };
    const u = modalI==="new"
      ? [...ingresos,{...reg,id:uid()}]
      : ingresos.map(r=>r.id===modalI?{...reg,id:modalI}:r);
    setData({...data,ingresos:u}); setModalI(null);
  }

  // ── Guardar gasto ────────────────────────────────────────────────
  function saveGasto(){
    if(!fG.fecha||!fG.importeBase) return;
    const ivaP  = Number(fG.ivaPct||0);
    const base  = Number(fG.importeBase||0);
    const ivaImp= +(base * ivaP/100).toFixed(2);
    const total = +(base + ivaImp).toFixed(2);
    const reg = {...fG, ivaPct:ivaP, ivaImporte:ivaImp, importeTotal:total };
    const u = modalG==="new"
      ? [...gastos,{...reg,id:uid()}]
      : gastos.map(r=>r.id===modalG?{...reg,id:modalG}:r);
    setData({...data,gastos:u}); setModalG(null);
  }

  // ── Añadir categoría ─────────────────────────────────────────────
  function addCat(){
    if(!nuevaCat.trim()) return;
    if(tipoCat==="ingreso"){
      if(catI.includes(nuevaCat.trim())) return;
      setData({...data,categoriasIngreso:[...catI,nuevaCat.trim()]});
    } else {
      if(catG.includes(nuevaCat.trim())) return;
      setData({...data,categoriasGasto:[...catG,nuevaCat.trim()]});
    }
    setNuevaCat("");
  }
  function delCat(tipo,cat){
    if(!confirm("¿Eliminar categoría «"+cat+"»?")) return;
    if(tipo==="ingreso") setData({...data,categoriasIngreso:catI.filter(c=>c!==cat)});
    else setData({...data,categoriasGasto:catG.filter(c=>c!==cat)});
  }

  // ── Exportar CSV ─────────────────────────────────────────────────
  function exportarCSV(){
    const rows=[["Tipo","Fecha","Categoría","Concepto","Alumno","Base (€)","IVA%","IVA(€)","Ret%","Ret(€)","Total(€)","Método","Factura"]];
    ingFiltrados.forEach(r=>{
      const al=alumnos.find(a=>a.id===r.alumnoId)?.nombre||"—";
      rows.push(["INGRESO",r.fecha,r.categoria||"",r.concepto||"",al,
        fmtN(r.importeBase),r.ivaPct||"",fmtN(r.ivaImporte),
        r.retencionPct||"",fmtN(r.retencionImporte),fmtN(r.importeTotal),
        r.metodo||"",r.factura||""]);
    });
    gasFiltrados.forEach(r=>{
      rows.push(["GASTO",r.fecha,r.categoria||"",r.concepto||"","—",
        fmtN(r.importeBase),r.ivaPct||"",fmtN(r.ivaImporte),
        "","",fmtN(r.importeTotal),r.metodo||"",r.factura||""]);
    });
    const sep=";";
    const csv=rows.map(r=>r.map(v=>{const s=String(v).replace(/"/g,'""');return s.includes(sep)?`"${s}"`:s;}).join(sep)).join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="contabilidad-academia.csv";a.click();URL.revokeObjectURL(url);
  }

  // ── Colores tabs ─────────────────────────────────────────────────
  const TABS=[
    {id:"resumen",label:"📊 Resumen"},
    {id:"ingresos",label:"💶 Ingresos"},
    {id:"gastos",label:"🧾 Gastos"},
    {id:"iva",label:"🏛️ IVA / Retención"},
    {id:"categorias",label:"🏷️ Categorías"},
  ];

  const estiloTabBtn=(id)=>({
    background:tab===id?G.fairway:"transparent",
    color:tab===id?"#fff":G.fairway,
    border:"1px solid "+G.fairway,
    borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"
  });

  // ── Filtros comunes ───────────────────────────────────────────────
  const FiltroBarra=()=><div style={{background:"#f5f5f5",borderRadius:10,padding:"10px 14px",
    display:"flex",flexWrap:"wrap",gap:10,alignItems:"center",marginBottom:16}}>
    <div style={{fontSize:13,fontWeight:600,color:G.fairway}}>🔍 Filtrar:</div>
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <label style={{fontSize:12,color:G.soft}}>Desde</label>
      <input type="date" value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)}
        style={{border:"1px solid #ddd",borderRadius:6,padding:"4px 8px",fontSize:12}}/>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <label style={{fontSize:12,color:G.soft}}>Hasta</label>
      <input type="date" value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)}
        style={{border:"1px solid #ddd",borderRadius:6,padding:"4px 8px",fontSize:12}}/>
    </div>
    {(filtroDesde||filtroHasta)&&<button onClick={()=>{setFiltroDesde("");setFiltroHasta("");}}
      style={{background:"#eee",border:"none",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>✕ Limpiar</button>}
    <button onClick={exportarCSV}
      style={{background:"#217346",color:"#fff",border:"none",borderRadius:6,
        padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>
      📊 Exportar CSV
    </button>
  </div>;

  // ── RENDER ───────────────────────────────────────────────────────
  return <div>
    {/* Tabs */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18,overflowX:"auto"}}>
      {TABS.map(t=><button key={t.id} style={estiloTabBtn(t.id)} onClick={()=>setTab(t.id)}>{t.label}</button>)}
    </div>

    {/* ══ RESUMEN ════════════════════════════════════════════════════ */}
    {tab==="resumen"&&<div>
      <FiltroBarra/>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
        {[
          [fmt(totalIngBruto),"Base ingresos",G.fairway,"💶"],
          [fmt(totalIVAing),"IVA cobrado",G.grass,"🏛️"],
          [fmt(totalRet),"Retención IRPF",G.flag,"📉"],
          [fmt(totalIngNeto),"Cobrado neto",G.sky,"✅"],
          [fmt(totalGas),"Total gastos",G.danger,"🧾"],
          [fmt(beneficio),"Beneficio bruto",beneficio>=0?G.grass:G.danger,"📈"],
        ].map(([v,l,c,ico])=>(
          <Card key={l} style={{textAlign:"center",borderTop:`3px solid ${c}`}}>
            <div style={{fontSize:20,marginBottom:4}}>{ico}</div>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:11,color:G.soft,marginTop:2}}>{l}</div>
          </Card>
        ))}
      </div>

      {/* Desglose trimestral */}
      <Card style={{marginBottom:16}}>
        <div style={{fontWeight:700,color:G.fairway,marginBottom:12}}>📅 Resumen por trimestre</div>
        {(()=>{
          const trimestres={"T1 (Ene-Mar)":["01","02","03"],"T2 (Abr-Jun)":["04","05","06"],
            "T3 (Jul-Sep)":["07","08","09"],"T4 (Oct-Dic)":["10","11","12"]};
          const year=(filtroDesde||filtroHasta||today()).slice(0,4);
          return Object.entries(trimestres).map(([t,meses])=>{
            const tIng=ingresos.filter(r=>r.fecha?.slice(0,4)===year&&meses.includes(r.fecha?.slice(5,7)));
            const tGas=gastos.filter(r=>r.fecha?.slice(0,4)===year&&meses.includes(r.fecha?.slice(5,7)));
            const bIng=tIng.reduce((s,r)=>s+Number(r.importeBase||0),0);
            const bGas=tGas.reduce((s,r)=>s+Number(r.importeBase||0),0);
            const ivaIng=tIng.reduce((s,r)=>s+Number(r.ivaImporte||0),0);
            const retT=tIng.reduce((s,r)=>s+Number(r.retencionImporte||0),0);
            const ivaGas=tGas.reduce((s,r)=>s+Number(r.ivaImporte||0),0);
            return <div key={t} style={{display:"grid",gridTemplateColumns:"120px 1fr 1fr 1fr 1fr 1fr",
              gap:8,padding:"8px 0",borderBottom:"1px solid #f0f0f0",fontSize:13,alignItems:"center"}}>
              <div style={{fontWeight:700,color:G.ink}}>{t}</div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:G.soft}}>Base ing.</div><b style={{color:G.fairway}}>{fmt(bIng)}</b></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:G.soft}}>IVA cobrado</div><b style={{color:G.grass}}>{fmt(ivaIng)}</b></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:G.flag}}>Ret. IRPF</div><b style={{color:G.flag}}>{fmt(retT)}</b></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:G.soft}}>Gastos</div><b style={{color:G.danger}}>{fmt(bGas)}</b></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:G.soft}}>IVA soportado</div><b style={{color:G.soft}}>{fmt(ivaGas)}</b></div>
            </div>;
          });
        })()}
      </Card>

      {/* Desglose por categoría ingresos */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontWeight:700,color:G.fairway,marginBottom:10}}>💶 Ingresos por categoría</div>
          {catI.map(cat=>{
            const tot=ingFiltrados.filter(r=>r.categoria===cat).reduce((s,r)=>s+Number(r.importeBase||0),0);
            if(tot===0) return null;
            return <div key={cat} style={{display:"flex",justifyContent:"space-between",
              padding:"5px 0",borderBottom:"1px solid #f5f5f5",fontSize:13}}>
              <span style={{color:G.ink}}>{cat}</span>
              <b style={{color:G.fairway}}>{fmt(tot)}</b>
            </div>;
          })}
        </Card>
        <Card>
          <div style={{fontWeight:700,color:G.danger,marginBottom:10}}>🧾 Gastos por categoría</div>
          {catG.map(cat=>{
            const tot=gasFiltrados.filter(r=>r.categoria===cat).reduce((s,r)=>s+Number(r.importeBase||0),0);
            if(tot===0) return null;
            return <div key={cat} style={{display:"flex",justifyContent:"space-between",
              padding:"5px 0",borderBottom:"1px solid #f5f5f5",fontSize:13}}>
              <span style={{color:G.ink}}>{cat}</span>
              <b style={{color:G.danger}}>{fmt(tot)}</b>
            </div>;
          })}
        </Card>
      </div>
    </div>}

    {/* ══ INGRESOS ═══════════════════════════════════════════════════ */}
    {tab==="ingresos"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <span style={{fontWeight:700,color:G.fairway,fontSize:15}}>💶 Registro de Ingresos</span>
          <span style={{marginLeft:10,fontSize:13,color:G.soft}}>{ingFiltrados.length} registros · {fmt(totalIngBruto)} base</span>
        </div>
        <Btn onClick={()=>{setFI({fecha:today(),ivaPct:IVA_DEFAULT,retencionPct:RET_DEFAULT,metodo:"Transferencia",categoria:catI[0]||""});setModalI("new");}}>
          + Nuevo ingreso
        </Btn>
      </div>
      <FiltroBarra/>
      <div style={{display:"grid",gap:8}}>
        {ingFiltrados.length===0&&<div style={{color:G.soft,textAlign:"center",padding:20,background:G.mist,borderRadius:10}}>Sin ingresos en el período seleccionado.</div>}
        {ingFiltrados.map(r=>{
          const al=alumnos.find(a=>a.id===r.alumnoId)?.nombre||"—";
          return <Card key={r.id} style={{borderLeft:`4px solid ${G.fairway}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:160}}>
                <div style={{fontWeight:700,color:G.ink,fontSize:14}}>{r.concepto||r.categoria}</div>
                <div style={{fontSize:12,color:G.soft,marginTop:2}}>
                  {r.fecha} · {r.categoria} · {al} · {r.metodo||"—"}
                  {r.factura&&<span style={{marginLeft:6,background:"#e8f4e8",color:G.fairway,borderRadius:4,padding:"1px 5px",fontSize:11}}>Nº {r.factura}</span>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,auto)",gap:12,textAlign:"right",fontSize:12}}>
                <div><div style={{color:G.soft,fontSize:10}}>Base</div><b style={{color:G.ink}}>{fmt(r.importeBase)}</b></div>
                <div><div style={{color:G.soft,fontSize:10}}>IVA {r.ivaPct}%</div><b style={{color:G.grass}}>{fmt(r.ivaImporte)}</b></div>
                <div><div style={{color:G.soft,fontSize:10}}>Ret. {r.retencionPct}%</div><b style={{color:G.flag}}>-{fmt(r.retencionImporte)}</b></div>
                <div><div style={{color:G.soft,fontSize:10}}>Total</div><b style={{color:G.fairway,fontSize:14}}>{fmt(r.importeTotal)}</b></div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Btn small color="secondary" onClick={()=>{setFI({...r});setModalI(r.id);}}>✎</Btn>
                <Btn small color="danger" onClick={()=>{if(confirm("¿Eliminar?"))setData({...data,ingresos:ingresos.filter(x=>x.id!==r.id)});}}>✕</Btn>
              </div>
            </div>
          </Card>;
        })}
      </div>
    </div>}

    {/* ══ GASTOS ═════════════════════════════════════════════════════ */}
    {tab==="gastos"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <span style={{fontWeight:700,color:G.danger,fontSize:15}}>🧾 Registro de Gastos</span>
          <span style={{marginLeft:10,fontSize:13,color:G.soft}}>{gasFiltrados.length} registros · {fmt(totalGas)} total</span>
        </div>
        <Btn color="danger" onClick={()=>{setFG({fecha:today(),ivaPct:21,metodo:"Tarjeta",categoria:catG[0]||"",deducible:"si"});setModalG("new");}}>
          + Nuevo gasto
        </Btn>
      </div>
      <FiltroBarra/>
      <div style={{display:"grid",gap:8}}>
        {gasFiltrados.length===0&&<div style={{color:G.soft,textAlign:"center",padding:20,background:G.mist,borderRadius:10}}>Sin gastos en el período seleccionado.</div>}
        {gasFiltrados.map(r=>(
          <Card key={r.id} style={{borderLeft:`4px solid ${G.danger}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:160}}>
                <div style={{fontWeight:700,color:G.ink,fontSize:14}}>{r.concepto||r.categoria}</div>
                <div style={{fontSize:12,color:G.soft,marginTop:2}}>
                  {r.fecha} · {r.categoria} · {r.metodo||"—"}
                  {r.factura&&<span style={{marginLeft:6,background:"#fdecea",color:G.danger,borderRadius:4,padding:"1px 5px",fontSize:11}}>Nº {r.factura}</span>}
                  {r.deducible==="si"&&<span style={{marginLeft:6,background:"#e8f4e8",color:G.grass,borderRadius:4,padding:"1px 5px",fontSize:11}}>Deducible</span>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,auto)",gap:12,textAlign:"right",fontSize:12}}>
                <div><div style={{color:G.soft,fontSize:10}}>Base</div><b style={{color:G.ink}}>{fmt(r.importeBase)}</b></div>
                <div><div style={{color:G.soft,fontSize:10}}>IVA {r.ivaPct}%</div><b style={{color:G.grass}}>{fmt(r.ivaImporte)}</b></div>
                <div><div style={{color:G.soft,fontSize:10}}>Total</div><b style={{color:G.danger,fontSize:14}}>{fmt(r.importeTotal)}</b></div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Btn small color="secondary" onClick={()=>{setFG({...r});setModalG(r.id);}}>✎</Btn>
                <Btn small color="danger" onClick={()=>{if(confirm("¿Eliminar?"))setData({...data,gastos:gastos.filter(x=>x.id!==r.id)});}}>✕</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>}

    {/* ══ IVA / RETENCIÓN ════════════════════════════════════════════ */}
    {tab==="iva"&&<div>
      <FiltroBarra/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
        {[
          ["IVA repercutido (cobrado)","💶",fmt(totalIVAing),G.fairway,"IVA de tus ingresos. Lo cobras al cliente."],
          ["IVA soportado (pagado)","🧾",fmt(totalIVAgas),G.danger,"IVA de tus gastos. Lo pagas a proveedores."],
          ["IVA a liquidar (Mod. 303)","🏛️",fmt(ivaLiquidar),ivaLiquidar>=0?G.grass:G.flag,"Diferencia a ingresar a Hacienda cada trimestre."],
          ["Retención IRPF (Mod. 111)","📉",fmt(totalRet),G.purple,"Ya retenido por quien te paga. Descuenta en tu declaración."],
        ].map(([l,ico,v,c,desc])=>(
          <Card key={l} style={{borderTop:`3px solid ${c}`}}>
            <div style={{fontSize:22,marginBottom:6}}>{ico}</div>
            <div style={{fontSize:11,color:G.soft,marginBottom:4}}>{l}</div>
            <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:11,color:G.soft,marginTop:6,lineHeight:1.4}}>{desc}</div>
          </Card>
        ))}
      </div>

      {/* Tabla trimestral IVA */}
      <Card style={{marginBottom:16}}>
        <div style={{fontWeight:700,color:G.fairway,marginBottom:12}}>📋 Liquidación trimestral estimada (Modelo 303)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:G.fairway,color:"#fff"}}>
                {["Trimestre","Base ing.","IVA repercutido","Base gas.","IVA soportado","A liquidar"].map(h=>
                  <th key={h} style={{padding:"8px 10px",textAlign:"right",fontWeight:600,":firstChild":{textAlign:"left"}}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[["T1",["01","02","03"]],["T2",["04","05","06"]],["T3",["07","08","09"]],["T4",["10","11","12"]]].map(([t,meses],i)=>{
                const year=(filtroDesde||filtroHasta||today()).slice(0,4);
                const tI=ingresos.filter(r=>r.fecha?.slice(0,4)===year&&meses.includes(r.fecha?.slice(5,7)));
                const tG=gastos.filter(r=>r.fecha?.slice(0,4)===year&&meses.includes(r.fecha?.slice(5,7)));
                const bI=tI.reduce((s,r)=>s+Number(r.importeBase||0),0);
                const ivaR=tI.reduce((s,r)=>s+Number(r.ivaImporte||0),0);
                const bG=tG.reduce((s,r)=>s+Number(r.importeBase||0),0);
                const ivaS=tG.reduce((s,r)=>s+Number(r.ivaImporte||0),0);
                const liq=ivaR-ivaS;
                return <tr key={t} style={{background:i%2===0?"#f9f9f9":"#fff"}}>
                  <td style={{padding:"7px 10px",fontWeight:700,color:G.ink}}>{t} {year}</td>
                  <td style={{padding:"7px 10px",textAlign:"right"}}>{fmt(bI)}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:G.fairway}}><b>{fmt(ivaR)}</b></td>
                  <td style={{padding:"7px 10px",textAlign:"right"}}>{fmt(bG)}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:G.danger}}><b>{fmt(ivaS)}</b></td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:liq>=0?G.grass:G.flag}}><b>{fmt(liq)}</b></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Retenciones por pagador */}
      <Card>
        <div style={{fontWeight:700,color:G.purple,marginBottom:12}}>📉 Retenciones IRPF por pagador (Mod. 111 / 190)</div>
        {(()=>{
          const porPagador={};
          ingFiltrados.filter(r=>Number(r.retencionImporte||0)>0).forEach(r=>{
            const k=r.pagador||r.concepto||"Sin especificar";
            if(!porPagador[k]) porPagador[k]={base:0,ret:0};
            porPagador[k].base+=Number(r.importeBase||0);
            porPagador[k].ret+=Number(r.retencionImporte||0);
          });
          const ents=Object.entries(porPagador);
          if(ents.length===0) return <div style={{color:G.soft,fontSize:13}}>No hay ingresos con retención en el período.</div>;
          return ents.map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",
              borderBottom:"1px solid #f0f0f0",fontSize:13}}>
              <span style={{color:G.ink}}>{k}</span>
              <span>Base: <b>{fmt(v.base)}</b> · Retención: <b style={{color:G.purple}}>{fmt(v.ret)}</b></span>
            </div>
          ));
        })()}
      </Card>
    </div>}

    {/* ══ CATEGORÍAS ═════════════════════════════════════════════════ */}
    {tab==="categorias"&&<div>
      <Card style={{marginBottom:16}}>
        <div style={{fontWeight:700,color:G.fairway,marginBottom:12}}>➕ Nueva categoría</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <Field label="Tipo" style={{margin:0}}>
            <Sel value={tipoCat} onChange={setTipoCat} options={[{value:"ingreso",label:"Ingreso"},{value:"gasto",label:"Gasto"}]}/>
          </Field>
          <Field label="Nombre" style={{margin:0,flex:1,minWidth:180}}>
            <Input value={nuevaCat} onChange={setNuevaCat} placeholder="Ej: Clínica empresa..."/>
          </Field>
          <Btn onClick={addCat} style={{marginBottom:0}}>Añadir</Btn>
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <div style={{fontWeight:700,color:G.fairway,marginBottom:10}}>💶 Categorías de Ingreso</div>
          {catI.map(cat=>(
            <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"6px 0",borderBottom:"1px solid #f5f5f5",fontSize:13}}>
              <span style={{color:G.ink}}>{cat}</span>
              <Btn small color="danger" onClick={()=>delCat("ingreso",cat)}>✕</Btn>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontWeight:700,color:G.danger,marginBottom:10}}>🧾 Categorías de Gasto</div>
          {catG.map(cat=>(
            <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"6px 0",borderBottom:"1px solid #f5f5f5",fontSize:13}}>
              <span style={{color:G.ink}}>{cat}</span>
              <Btn small color="danger" onClick={()=>delCat("gasto",cat)}>✕</Btn>
            </div>
          ))}
        </Card>
      </div>
    </div>}

    {/* ══ MODAL INGRESO ══════════════════════════════════════════════ */}
    {modalI&&<Modal title={modalI==="new"?"Nuevo ingreso":"Editar ingreso"} onClose={()=>setModalI(null)}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Fecha *"><Input type="date" value={fI.fecha||""} onChange={v=>setFI({...fI,fecha:v})}/></Field>
        <Field label="Categoría *">
          <Sel value={fI.categoria||""} onChange={v=>setFI({...fI,categoria:v})}
            options={catI.map(c=>({value:c,label:c}))}/>
        </Field>
      </div>
      <Field label="Concepto / Descripción">
        <Input value={fI.concepto||""} onChange={v=>setFI({...fI,concepto:v})} placeholder="Ej: Bono 10 clases enero..."/>
      </Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Alumno (opcional)">
          <Sel value={fI.alumnoId||""} onChange={v=>setFI({...fI,alumnoId:v})}
            options={[{value:"",label:"— Sin alumno —"},...alumnos.map(a=>({value:a.id,label:a.nombre}))]}/>
        </Field>
        <Field label="Pagador (empresa/club)">
          <Input value={fI.pagador||""} onChange={v=>setFI({...fI,pagador:v})} placeholder="Ej: Golf Ciudad Real C.D."/>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Field label="Base imponible (€) *">
          <Input type="number" value={fI.importeBase||""} onChange={v=>setFI({...fI,importeBase:v})} placeholder="0.00"/>
        </Field>
        <Field label="IVA (%)">
          <Sel value={String(fI.ivaPct??IVA_DEFAULT)} onChange={v=>setFI({...fI,ivaPct:Number(v)})}
            options={["0","4","10","21"].map(v=>({value:v,label:v+"%"}))}/>
        </Field>
        <Field label="Retención IRPF (%)">
          <Sel value={String(fI.retencionPct??0)} onChange={v=>setFI({...fI,retencionPct:Number(v)})}
            options={["0","7","15","19"].map(v=>({value:v,label:v+"%"}))}/>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Método de cobro">
          <Sel value={fI.metodo||"Transferencia"} onChange={v=>setFI({...fI,metodo:v})}
            options={["Efectivo","Tarjeta","Transferencia","Bizum","Domiciliación"].map(v=>({value:v,label:v}))}/>
        </Field>
        <Field label="Nº Factura (opcional)">
          <Input value={fI.factura||""} onChange={v=>setFI({...fI,factura:v})} placeholder="Ej: 2025-001"/>
        </Field>
      </div>
      {/* Preview cálculo */}
      {fI.importeBase&&<div style={{background:"#f0f7f0",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:4}}>
        <b>Vista previa:</b> Base {fmt(fI.importeBase)} + IVA {fmt(Number(fI.importeBase||0)*Number(fI.ivaPct??IVA_DEFAULT)/100)} − Ret. {fmt(Number(fI.importeBase||0)*Number(fI.retencionPct??0)/100)} = <b style={{color:G.fairway}}>{fmt(Number(fI.importeBase||0)+Number(fI.importeBase||0)*Number(fI.ivaPct??IVA_DEFAULT)/100-Number(fI.importeBase||0)*Number(fI.retencionPct??0)/100)}</b>
      </div>}
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:12}}>
        <Btn color="secondary" onClick={()=>setModalI(null)}>Cancelar</Btn>
        <Btn onClick={saveIngreso}>Guardar</Btn>
      </div>
    </Modal>}

    {/* ══ MODAL GASTO ════════════════════════════════════════════════ */}
    {modalG&&<Modal title={modalG==="new"?"Nuevo gasto":"Editar gasto"} onClose={()=>setModalG(null)}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Fecha *"><Input type="date" value={fG.fecha||""} onChange={v=>setFG({...fG,fecha:v})}/></Field>
        <Field label="Categoría *">
          <Sel value={fG.categoria||""} onChange={v=>setFG({...fG,categoria:v})}
            options={catG.map(c=>({value:c,label:c}))}/>
        </Field>
      </div>
      <Field label="Concepto / Descripción">
        <Input value={fG.concepto||""} onChange={v=>setFG({...fG,concepto:v})} placeholder="Ej: Pelotas práctica enero..."/>
      </Field>
      <Field label="Proveedor">
        <Input value={fG.proveedor||""} onChange={v=>setFG({...fG,proveedor:v})} placeholder="Ej: ProGolf S.L."/>
      </Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Base imponible (€) *">
          <Input type="number" value={fG.importeBase||""} onChange={v=>setFG({...fG,importeBase:v})} placeholder="0.00"/>
        </Field>
        <Field label="IVA (%)">
          <Sel value={String(fG.ivaPct??21)} onChange={v=>setFG({...fG,ivaPct:Number(v)})}
            options={["0","4","10","21"].map(v=>({value:v,label:v+"%"}))}/>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Método de pago">
          <Sel value={fG.metodo||"Tarjeta"} onChange={v=>setFG({...fG,metodo:v})}
            options={["Efectivo","Tarjeta","Transferencia","Domiciliación"].map(v=>({value:v,label:v}))}/>
        </Field>
        <Field label="¿Deducible?">
          <Sel value={fG.deducible||"si"} onChange={v=>setFG({...fG,deducible:v})}
            options={[{value:"si",label:"Sí, deducible"},{value:"no",label:"No deducible"}]}/>
        </Field>
      </div>
      <Field label="Nº Factura / Ticket">
        <Input value={fG.factura||""} onChange={v=>setFG({...fG,factura:v})} placeholder="Ej: FAC-2025-001"/>
      </Field>
      {fG.importeBase&&<div style={{background:"#fdf0f0",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:4}}>
        <b>Total con IVA:</b> <b style={{color:G.danger}}>{fmt(Number(fG.importeBase||0)+Number(fG.importeBase||0)*Number(fG.ivaPct??21)/100)}</b>
      </div>}
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:12}}>
        <Btn color="secondary" onClick={()=>setModalG(null)}>Cancelar</Btn>
        <Btn color="danger" onClick={saveGasto}>Guardar</Btn>
      </div>
    </Modal>}
  </div>;
}


function PinAlumnoRow({alumno, data, setData}){
  const [np,setNp]=useState(alumno.pin||"");
  const [ok,setOk]=useState(false);
  function guardar(){
    if(np.length<6) return;
    setData({...data,alumnos:(data.alumnos||[]).map(x=>x.id===alumno.id?{...x,pin:np}:x)});
    setOk(true); setTimeout(()=>setOk(false),2000);
  }
  return <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
    <div style={{minWidth:150,fontWeight:600,color:G.ink,fontSize:14}}>{alumno.nombre}</div>
    <div style={{flex:1,minWidth:120}}>
      <Input type="password" value={np} onChange={v=>setNp(v.slice(0,20))} placeholder="Nueva clave" maxLength={20}/>
    </div>
    <Btn small onClick={guardar} disabled={np.length<6}>Guardar</Btn>
    {ok&&<span style={{color:G.grass,fontSize:12}}>✔</span>}
  </div>;
}
function ModAjustes({data,setData,onLogout}){
  const [pin,setPin]=useState(data.adminPin||DEFAULT_ADMIN_PIN);
  const [saved,setSaved]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const [tabAj,setTabAj]=useState("pin");
  const [labelSearch,setLabelSearch]=useState("");
  const [labelsSaved,setLabelsSaved]=useState(false);
  const lbl=useLabels(data);

  // Labels editor state — local edits before saving
  const [labelsEdit,setLabelsEdit]=useState(data.labels||{});

  function savePin(){setData({...data,adminPin:pin});setSaved(true);setTimeout(()=>setSaved(false),2000);}

  function exportarDatos(){
    const json=JSON.stringify(data,null,2);
    const blob=new Blob([json],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const fecha=new Date().toISOString().slice(0,10);
    a.href=url; a.download=`golf-academia-backup-${fecha}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function importarDatos(e){
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const parsed=JSON.parse(ev.target.result);
        if(!parsed.alumnos) throw new Error("no válido");
        setData(parsed); setLabelsEdit(parsed.labels||{});
        setImportMsg("ok");
      }catch(err){
        setImportMsg("error");
      }
      setTimeout(()=>setImportMsg(""),4000);
    };
    reader.readAsText(file);
    e.target.value="";
  }

  function saveLabels(){
    setData({...data,labels:labelsEdit});
    setLabelsSaved(true);
    setTimeout(()=>setLabelsSaved(false),2500);
  }

  function resetLabels(){
    if(!confirm("¿Restaurar todos los nombres a los valores originales?")) return;
    setLabelsEdit({});
    setData({...data,labels:{}});
  }

  function updateLabel(key,val){
    setLabelsEdit(prev=>({...prev,[key]:val}));
  }

  // Group labels by category for display
  const LABEL_GROUPS = [
    { titulo:"🏠 App general", keys:["app_nombre","app_subtitulo","app_profesor","app_alumno"] },
    { titulo:"🗓️ Navegación", keys:["nav_calendario","nav_alumnos","nav_clases","nav_estadisticas","nav_analisis","nav_ejercicios","nav_mensajes","nav_tareas","nav_pagos","nav_ajustes"] },
    { titulo:"👤 Ficha de alumno", keys:["campo_nombre","campo_edad","campo_nivel","campo_telefono","campo_email","campo_fechaAlta","campo_notas","campo_pin","campo_tutores"] },
    { titulo:"📊 Estadísticas de juego", keys:["campo_golpes","campo_fairways","campo_gir","campo_putts","campo_bunkers","campo_handicap","campo_hoyos","campo_palo_ref","campo_distancia"] },
    { titulo:"📅 Clases", keys:["campo_tipo_clase","campo_zona","campo_duracion","campo_contenido","campo_asistio"] },
    { titulo:"💶 Pagos y bonos", keys:["campo_importe","campo_concepto","campo_metodo","campo_bonos","campo_fechaCompra","campo_plazas"] },
    { titulo:"🎬 Vídeo análisis", keys:["campo_tipo_golpe","campo_palo","campo_videourl","campo_positivos","campo_mejorar","campo_tecnico","campo_tutores_msg","campo_valoracion"] },
    { titulo:"📋 Tareas", keys:["campo_tarea_titulo","campo_prioridad","campo_estado","campo_asignado","campo_zona_trabajo","campo_recurrente","campo_fechaFin"] },
    { titulo:"🐣 Grupos de edad", keys:["grupo_pollitos","grupo_pares","grupo_birdies","grupo_eagles","grupo_albatros"] },
    { titulo:"📱 Portal del alumno", keys:["portal_inicio","portal_clases","portal_analisis","portal_stats","portal_ejercicios","portal_mensajes","portal_pin"] },
  ];

  const filteredGroups = labelSearch
    ? LABEL_GROUPS.map(g=>({...g, keys:g.keys.filter(k=>{
        const def=DEFAULT_LABELS[k]||""; const cur=labelsEdit[k]||"";
        return def.toLowerCase().includes(labelSearch.toLowerCase()) || cur.toLowerCase().includes(labelSearch.toLowerCase()) || k.includes(labelSearch.toLowerCase());
      })})).filter(g=>g.keys.length>0)
    : LABEL_GROUPS;

  const stats=[[(data.alumnos||[]).length,"Alumnos","👤"],[(data.clases||[]).length,"Clases","📅"],[(data.analisis||[]).length,"Análisis","🎬"],[(data.pagos||[]).length,"Pagos","💶"]];
  const totalModified=Object.keys(labelsEdit).filter(k=>labelsEdit[k]!==DEFAULT_LABELS[k]&&labelsEdit[k]!=="").length;

  const AJ_TABS=[{id:"pin",label:"🔐 Acceso"},{id:"campos",label:"✏️ Nombres de campos"},{id:"datos",label:"🗑 Datos"},{id:"backup",label:"💾 Copia de seguridad"}];

  return <div style={{maxWidth:680}}>
    {/* Sub-tabs de ajustes */}
    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
      {AJ_TABS.map(t=><button key={t.id} onClick={()=>setTabAj(t.id)}
        style={{background:tabAj===t.id?G.fairway:G.mist,color:tabAj===t.id?G.white:G.fairway,border:"none",borderRadius:8,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
        {t.label}
      </button>)}
    </div>

    {/* ── ACCESO / PINs ── */}
    {tabAj==="pin"&&<div>
      <Card style={{marginBottom:16}}>
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>🔐 Clave del Profesor</h3>
        <Field label="Clave nueva (mínimo 6 caracteres, letras/números/símbolos)">
          <Input type="password" value={pin} onChange={v=>setPin(v.slice(0,20))} placeholder="Ej: Golf2026!" maxLength={20}/>
        </Field>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <Btn onClick={savePin} disabled={pin.length<6}>Guardar clave</Btn>
          {saved&&<span style={{color:G.grass,fontSize:13}}>✔ Guardado</span>}
        </div>
      </Card>

      <Card>
        <h3 style={{margin:"0 0 12px",color:G.fairway}}>👤 PIN de Alumnos</h3>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 12px"}}>Cambia el PIN de acceso de cualquier alumno.</p>
        {(data.alumnos||[]).filter(a=>a.activo).map(a=>(
          <PinAlumnoRow key={a.id} alumno={a} data={data} setData={setData}/>
        ))}
      </Card>
    </div>}

    {/* ── EDITOR DE NOMBRES DE CAMPOS ── */}
    {tabAj==="campos"&&<div>
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:12}}>
          <div>
            <h3 style={{margin:"0 0 4px",color:G.fairway}}>✏️ Nombres de campos</h3>
            <div style={{fontSize:13,color:G.soft}}>
              Personaliza cualquier etiqueta de la app. {totalModified>0&&<span style={{color:G.orange,fontWeight:600}}>{totalModified} campo{totalModified!==1?"s":""} modificado{totalModified!==1?"s":""}.</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn small color="secondary" onClick={resetLabels}>↩ Restaurar todo</Btn>
            <Btn small color="primary" onClick={saveLabels}>💾 Guardar cambios</Btn>
          </div>
        </div>
        {labelsSaved&&<div style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:10}}>✅ Nombres guardados correctamente.</div>}
        <input value={labelSearch} onChange={e=>setLabelSearch(e.target.value)}
          placeholder="🔍 Buscar campo…"
          style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 12px",fontSize:14,fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
      </Card>

      {filteredGroups.map(group=>(
        <Card key={group.titulo} style={{marginBottom:12}}>
          <h4 style={{margin:"0 0 12px",color:G.fairway,fontSize:14}}>{group.titulo}</h4>
          <div style={{display:"grid",gap:8}}>
            {group.keys.map(key=>{
              const defVal=DEFAULT_LABELS[key]||key;
              const curVal=labelsEdit[key]!==undefined?labelsEdit[key]:defVal;
              const isModified=labelsEdit[key]!==undefined&&labelsEdit[key]!==defVal;
              return <div key={key} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,alignItems:"center"}}>
                <div style={{fontSize:12,color:G.soft,fontWeight:isModified?700:"normal"}}>{defVal}</div>
                <input value={curVal} onChange={e=>updateLabel(key,e.target.value)}
                  style={{border:`1.5px solid ${isModified?G.orange:"#d0e0d0"}`,borderRadius:8,padding:"6px 10px",fontSize:13,fontFamily:"inherit",
                    background:isModified?"#fff8f0":"white",outline:"none"}}/>
                {isModified
                  ?<button onClick={()=>updateLabel(key,defVal)} title="Restaurar original"
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:G.orange}}>↩</button>
                  :<div style={{width:24}}/>
                }
              </div>;
            })}
          </div>
        </Card>
      ))}

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
        <Btn color="secondary" onClick={resetLabels}>↩ Restaurar todo</Btn>
        <Btn onClick={saveLabels}>💾 Guardar cambios</Btn>
      </div>
    </div>}

    {/* ── GESTIÓN DE DATOS ── */}
    {tabAj==="datos"&&<div>
      <Card style={{marginBottom:14,borderLeft:"4px solid #c0392b"}}>
        <h3 style={{margin:"0 0 8px",color:"#c0392b"}}>🗑 Borrar datos por categoría</h3>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 14px"}}>Borra todos los registros de una categoría. <b>Esta acción no se puede deshacer.</b> Los alumnos no se borran.</p>
        <div style={{display:"grid",gap:10}}>
          {[
            ["📅 Clases","clases","Eliminar todas las clases programadas"],
            ["📊 Estadísticas","estadisticas","Eliminar todos los registros de rondas"],
            ["🎬 Vídeo Análisis","analisis","Eliminar todos los análisis de vídeo"],
            ["🎫 Bonos","bonos","Eliminar todos los bonos de clases"],
            ["💶 Pagos","pagos","Eliminar todos los registros de pagos"],
            ["✉️ Mensajes","mensajes","Eliminar todos los mensajes"],
            ["📋 Tareas","tareas","Eliminar todas las tareas programadas"],
            ["📅 Reservas","reservas","Eliminar todas las reservas del calendario"],
            ["📌 Asignaciones","asignaciones","Eliminar todos los ejercicios asignados"],
            ["🧩 Test Results","resultadosTest","Eliminar todos los resultados de tests"],
          ].map(([label,key,desc])=>(
            <div key={key} style={{display:"flex",alignItems:"center",gap:12,background:"#fdecea",borderRadius:10,padding:"10px 14px"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:G.ink,fontSize:14}}>{label}</div>
                <div style={{fontSize:12,color:G.soft}}>{desc} · {(data[key]||[]).length} registros</div>
              </div>
              <Btn small color="danger" onClick={()=>{if(golfConfirm("¿Borrar todos los registros de "+label+"?\n\nNo se puede deshacer."))setData({...data,[key]:[]});}}>Borrar todo</Btn>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{borderLeft:"4px solid #c0392b"}}>
        <h3 style={{margin:"0 0 8px",color:"#c0392b"}}>⚠️ Borrar TODOS los datos</h3>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 14px"}}>Borra absolutamente todo: alumnos, clases, estadísticas, análisis, pagos, mensajes, tareas y reservas. La app vuelve al estado inicial.</p>
        <Btn color="danger" onClick={()=>{if(golfConfirm("¿BORRAR TODOS LOS DATOS DE LA APLICACIÓN?\n\nEsta acción eliminará alumnos, clases, estadísticas, análisis, pagos, mensajes, tareas y reservas.\n\nEsta acción NO se puede deshacer.\n\nEscribe OK para confirmar:"))if(window.prompt("Escribe OK para confirmar el borrado total:")?.trim().toUpperCase()==="OK"){setData({...data,alumnos:[],clases:[],estadisticas:[],analisis:[],bonos:[],pagos:[],mensajes:[],tareas:[],reservas:[],asignaciones:[],resultadosTest:[],slots:[]});alert("✅ Todos los datos han sido eliminados.");}}}>🗑 BORRAR TODOS LOS DATOS</Btn>
      </Card>
    </div>}

    {/* ── COPIA DE SEGURIDAD ── */}
    {tabAj==="backup"&&<div>
      <Card style={{marginBottom:16}}>
        <h3 style={{margin:"0 0 12px",color:G.fairway}}>📊 Resumen de datos</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {stats.map(([v,l,i])=>(
            <div key={l} style={{background:G.mist,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>{i}</span>
              <div><div style={{fontWeight:800,color:G.fairway,fontSize:18}}>{v}</div><div style={{fontSize:12,color:G.soft}}>{l}</div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{marginBottom:16}}>
        <h3 style={{margin:"0 0 6px",color:G.fairway}}>💾 Copia de seguridad</h3>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 14px"}}>
          Los datos se guardan en este navegador. Exporta regularmente para no perder nada si cambias de dispositivo o limpias el caché.
        </p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>
          <Btn color="sky" onClick={exportarDatos}>⬇ Exportar datos (JSON)</Btn>
          <Btn color="primary" onClick={()=>exportarExcel(data)}>📊 Exportar a Excel</Btn>
          <label style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"9px 18px",fontSize:14,fontWeight:600,cursor:"pointer",display:"inline-block"}}>
            ⬆ Importar datos
            <input type="file" accept=".json" onChange={importarDatos} style={{display:"none"}}/>
          </label>
        </div>
        {importMsg==="ok"&&<div style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"8px 12px",fontSize:13}}>✅ Datos importados correctamente.</div>}
        {importMsg==="error"&&<div style={{background:"#fdecea",color:G.danger,borderRadius:8,padding:"8px 12px",fontSize:13}}>❌ Error: el archivo no es válido.</div>}
        <div style={{fontSize:12,color:G.soft,marginTop:8}}>💡 Guarda el JSON en Google Drive o en tu móvil. Para restaurar, usa "Importar datos".</div>
      </Card>

      <Btn color="danger" onClick={onLogout}>Salir de la app</Btn>
    </div>}
  </div>;
}

function CambiarPinAlumno({data,setData,alumnoId}){
  const [pinActual,setPinActual]=useState("");
  const [pinNuevo,setPinNuevo]=useState("");
  const [pinConfirm,setPinConfirm]=useState("");
  const [msg,setMsg]=useState("");
  const alumno=(data.alumnos||[]).find(a=>a.id===alumnoId);

  function guardar(){
    if(!alumno) return;
    if(pinActual!==alumno.pin){setMsg("error_actual");return;}
    if(pinNuevo.length<4){setMsg("error_corto");return;}
    if(pinNuevo!==pinConfirm){setMsg("error_confirm");return;}
    setData({...data,alumnos:(data.alumnos||[]).map(a=>a.id===alumnoId?{...a,pin:pinNuevo}:a)});
    setMsg("ok");
    setPinActual(""); setPinNuevo(""); setPinConfirm("");
    setTimeout(()=>setMsg(""),3000);
  }

  const PinDots=({val})=><div style={{display:"flex",gap:8,margin:"6px 0"}}>
    {[0,1,2,3,4,5].map(i=><div key={i} style={{width:12,height:12,borderRadius:"50%",background:i<val.length?G.fairway:"#d0e0d0"}}/>)}
  </div>;

  return <div>
    <Field label="PIN actual">
      <Input type="password" value={pinActual} onChange={v=>setPinActual(v.replace(/\D/g,"").slice(0,6))} placeholder="Tu PIN actual"/>
    </Field>
    <Field label="PIN nuevo (mínimo 4 dígitos)">
      <Input type="password" value={pinNuevo} onChange={v=>setPinNuevo(v.replace(/\D/g,"").slice(0,6))} placeholder="Nuevo PIN"/>
      <PinDots val={pinNuevo}/>
    </Field>
    <Field label="Confirmar PIN nuevo">
      <Input type="password" value={pinConfirm} onChange={v=>setPinConfirm(v.replace(/\D/g,"").slice(0,6))} placeholder="Repite el nuevo PIN"/>
    </Field>
    {msg==="error_actual"&&<div style={{background:"#fdecea",color:G.danger,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:10}}>❌ El PIN actual no es correcto.</div>}
    {msg==="error_corto"&&<div style={{background:"#fdecea",color:G.danger,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:10}}>❌ El PIN nuevo debe tener al menos 4 dígitos.</div>}
    {msg==="error_confirm"&&<div style={{background:"#fdecea",color:G.danger,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:10}}>❌ Los PINs nuevos no coinciden.</div>}
    {msg==="ok"&&<div style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:10}}>✅ PIN cambiado correctamente.</div>}
    <Btn onClick={guardar} disabled={pinActual.length<4||pinNuevo.length<4||pinConfirm.length<4}>Cambiar PIN</Btn>
  </div>;
}

// ── Vista simplificada del informe para el alumno ────────────────
function InformePreviewAlumno({rpt, data}){
  const [abierto, setAbierto] = useState(false);

  function descargarPDF(){
    const alumno = (data.alumnos||[]).find(a=>a.id===rpt.alumnoId);
    generarPDFInforme(rpt, alumno?.nombre||"alumno");
  }

  return <div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <Btn small color="sky" onClick={()=>setAbierto(!abierto)}>{abierto?"▲ Cerrar":"👁 Ver informe"}</Btn>
      <Btn small color="secondary" onClick={descargarPDF}>⬇️ Descargar PDF</Btn>
    </div>
    {abierto&&<div id={"informe-alumno-"+rpt.id} style={{marginTop:12,padding:16,background:G.mist,borderRadius:10,fontSize:13}}>
      <div style={{fontWeight:800,fontSize:16,color:G.fairway,marginBottom:8}}>{rpt.titulo}</div>
      {rpt.resumenTexto&&<div style={{marginBottom:10}}>
        <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>📝 Resumen</div>
        <p style={{margin:0,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.resumenTexto}</p>
      </div>}
      {rpt.objetivosLogrados&&<div style={{marginBottom:8}}>
        <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>✅ Objetivos logrados</div>
        <p style={{margin:0,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.objetivosLogrados}</p>
      </div>}
      {rpt.objetivosProximos&&<div style={{marginBottom:8}}>
        <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>🎯 Próximos objetivos</div>
        <p style={{margin:0,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.objetivosProximos}</p>
      </div>}
      {rpt.planTrabajo&&<div style={{marginBottom:8}}>
        <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>📋 Plan de trabajo</div>
        <p style={{margin:0,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.planTrabajo}</p>
      </div>}
      <div style={{marginTop:12,borderTop:"1px solid #ccc",paddingTop:8,fontSize:12,color:G.soft}}>
        {rpt.firmaTexto?.split("\n").map((l,i)=><div key={i}>{l}</div>)}
      </div>
    </div>}
  </div>;
}

function PortalAlumno({data,setData,alumnoId,onLogout,tutorNombre=null}){
  const [tab,setTab]=useState("inicio");
  const [modalSolicitud,setModalSolicitud]=useState(false);
  const [formSolicitud,setFormSolicitud]=useState({fecha:"",hora:"10:00",tipo:"Individual",zona:"Campo de prácticas",notas:""});
  const [solicitudEnviada,setSolicitudEnviada]=useState(false);
  const alumno=data.alumnos.find(a=>a.id===alumnoId);
  const analisis=(data.analisis||[]).filter(a=>a.alumnoId===alumnoId).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const estadisticas=(data.estadisticas||[]).filter(s=>s.alumnoId===alumnoId).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const bonos=(data.bonos||[]).filter(b=>b.alumnoId===alumnoId);
  const slots=data.slots||[];
  const reservas=data.reservas||[];

  const misReservas=reservas.filter(r=>r.alumnoId===alumnoId&&r.estado!=="cancelada");
  const slotsDisponibles=slots.filter(s=>{
    if(s.fecha<today()) return false;
    const res=reservas.filter(r=>r.slotId===s.id&&r.estado!=="cancelada");
    const yaReservado=res.some(r=>r.alumnoId===alumnoId);
    if(yaReservado) return false;
    return res.length<Number(s.plazas||1);
  }).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora.localeCompare(b.hora));

  function enviarSolicitudClase(){
    if(!formSolicitud.fecha) return;
    const solicitud = {
      id: uid(),
      alumnoId,
      alumnoNombre: alumno?.nombre || "",
      fecha: formSolicitud.fecha,
      hora: formSolicitud.hora,
      tipo: formSolicitud.tipo,
      zona: formSolicitud.zona,
      notas: formSolicitud.notas,
      estado: "pendiente",
      fechaSolicitud: today(),
    };
    const solicitudes = data.solicitudesClase || [];
    setData({...data, solicitudesClase: [...solicitudes, solicitud]});
    setSolicitudEnviada(true);
    setModalSolicitud(false);
    setTimeout(()=>setSolicitudEnviada(false), 4000);
  }

  function reservar(slotId){
    const slot=slots.find(s=>s.id===slotId);
    if(!slot) return;
    if(!confirm(`¿Reservar clase el ${fmtDate(slot.fecha)} a las ${slot.hora}?`)) return;
    const nueva={id:uid(),slotId,alumnoId,fechaReserva:today(),estado:"confirmada"};
    setData({...data,reservas:[...reservas,nueva]});
  }

  function cancelarReserva(id){
    if(!confirm("¿Cancelar esta reserva?")) return;
    setData({...data,reservas:reservas.map(r=>r.id===id?{...r,estado:"cancelada"}:r)});
  }

  const bonoActivo=bonos.find(b=>b.usadas<Number(b.clases));
  const stars=n=>"★".repeat(Number(n||0))+"☆".repeat(5-Number(n||0));

  const misInformes = (data.informes||[]).filter(r=>r.alumnoId===alumnoId&&r.publicado).sort((a,b)=>(b.fechaCreacion||"").localeCompare(a.fechaCreacion||""));

  const ATABS=[
    {id:"inicio",label:"Inicio",icon:"🏠"},
    {id:"calendario",label:"Calendario",icon:"🗓️"},
    {id:"reservas",label:"Clases",icon:"📅"},
    {id:"analisis",label:"Análisis",icon:"🎬"},
    {id:"stats",label:"Estadísticas",icon:"📊"},
    {id:"informes",label:"Informes",icon:"📋"},
    {id:"ejercicios",label:"Ejercicios",icon:"🏋️"},
    {id:"mensajes",label:"Mensajes",icon:"✉️"},
    {id:"miperfil",label:"Mi PIN",icon:"🔐"},
  ];
  const ATABS_DUMMY=[{id:"ejercicios",label:"Ejercicios",icon:"🏋️"},
  ];

  return <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",minHeight:"100vh",background:G.sand}}>
    {/* Header */}
    <div style={{background:`linear-gradient(135deg,${G.fairway},#0f3518)`,color:G.white,padding:"0 16px"}}>
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <div style={{padding:"14px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={LOGO_GCR} alt="Golf Ciudad Real" style={{height:32,objectFit:"contain",filter:"brightness(0) invert(1)",opacity:0.95}}/>
            <img src={LOGO_PGA} alt="PGA España" style={{height:30,objectFit:"contain",marginLeft:4}}/>
            <div style={{marginLeft:4}}>
              <div style={{fontWeight:800,fontSize:15}}>{tutorNombre?"Portal Familiar":"Mi Portal de Golf"}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.65)"}}>
                {tutorNombre?<span>👨‍👩‍👦 {tutorNombre} · {alumno?.nombre}</span>:alumno?.nombre}
              </div>
            </div>
          </div>
          <button onClick={onLogout} style={{background:"rgba(255,255,255,.15)",border:"none",color:G.white,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Salir</button>
        </div>
        <div style={{display:"flex",gap:2,marginTop:12,overflowX:"auto"}}>
          {ATABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:tab===t.id?G.white:"transparent",color:tab===t.id?G.fairway:"rgba(255,255,255,.8)",border:"none",borderRadius:"8px 8px 0 0",padding:"8px 12px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            {t.icon} {t.label}
          </button>)}
        </div>
      </div>
    </div>

    <div style={{maxWidth:680,margin:"0 auto",padding:"20px 14px 60px"}}>

      {/* INICIO */}
      {tab==="inicio"&&<div>
        <div style={{marginBottom:16}}>
          <h2 style={{margin:"0 0 4px",color:G.fairway}}>Hola, {tutorNombre||alumno?.nombre?.split(" ")[0]} 👋</h2>
          <div style={{color:G.soft,fontSize:14}}>Nivel: {alumno?.nivel}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
          {[
            [misReservas.length,"Clases reservadas",G.sky,"📅"],
            [analisis.length,"Análisis de vídeo",G.purple,"🎬"],
            [estadisticas.length,"Rondas registradas",G.fairway,"📊"],
          ].map(([v,l,c,i])=>(
            <Card key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:4}}>{i}</div>
              <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:11,color:G.soft,marginTop:1}}>{l}</div>
            </Card>
          ))}
        </div>

        {/* Bono activo */}
        {bonoActivo&&<Card style={{marginBottom:14,borderLeft:`4px solid ${G.flag}`}}>
          <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>🎫 Tu bono activo</div>
          <div style={{fontSize:13,color:G.soft,marginBottom:8}}>Bono {bonoActivo.tipo} · {bonoActivo.clases} clases</div>
          <div style={{background:"#e8e8e8",borderRadius:6,height:10,overflow:"hidden"}}>
            <div style={{width:`${(bonoActivo.usadas/Number(bonoActivo.clases))*100}%`,height:"100%",background:G.grass}}/>
          </div>
          <div style={{fontSize:12,color:G.soft,marginTop:4}}>{Number(bonoActivo.clases)-bonoActivo.usadas} clases restantes de {bonoActivo.clases}</div>
        </Card>}

        {/* Banner huecos disponibles */}
        {slotsDisponibles.length>0&&<div
          onClick={()=>setTab("reservas")}
          style={{background:"linear-gradient(135deg,#1a5c2a,#2e7d3c)",color:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:14,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}>
          <div style={{fontSize:26}}>🔔</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:14}}>¡{slotsDisponibles.length} clase{slotsDisponibles.length!==1?"s":""} disponible{slotsDisponibles.length!==1?"s":""}!</div>
            <div style={{fontSize:12,opacity:.85,marginTop:2}}>Tu profesor ha abierto nuevos huecos. Pulsa para reservar.</div>
          </div>
          <div style={{fontSize:20}}>→</div>
        </div>}

        {/* Próxima clase */}
        {misReservas.length>0&&(()=>{
          const r=misReservas.map(r=>({...r,slot:slots.find(s=>s.id===r.slotId)})).filter(r=>r.slot&&r.slot.fecha>=today()).sort((a,b)=>a.slot.fecha.localeCompare(b.slot.fecha))[0];
          if(!r) return null;
          return <Card style={{borderLeft:`4px solid ${G.grass}`}}>
            <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>📅 Tu próxima clase</div>
            <div style={{fontSize:16,fontWeight:800,color:G.fairway}}>{fmtDate(r.slot.fecha)} — {r.slot.hora}</div>
            <div style={{fontSize:13,color:G.soft,marginTop:4}}>{r.slot.tipo} · {r.slot.zona} · {r.slot.duracion}min</div>
          </Card>;
        })()}
      </div>}

      {/* RESERVAS */}
      {/* CALENDARIO CON PDF */}
      {tab==="calendario"&&<div>
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>🗓️ Calendario de la Academia</h3>
        <PanelPdfCalendario esProfesor={false}/>
      </div>}

      {/* MENSAJERÍA ALUMNO */}
      {tab==="mensajes"&&<ModMensajeriaAlumno data={data} setData={setData} alumnoId={alumnoId}/>}

      {/* INFORMES DEL ALUMNO */}
      {tab==="informes"&&<div>
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>📋 Mis informes</h3>
        {misInformes.length===0
          ?<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:12}}>
            <div style={{fontSize:28,marginBottom:8}}>📋</div>
            <div>Todavía no tienes informes disponibles.</div>
          </div>
          :<div style={{display:"grid",gap:12}}>
            {misInformes.map(r=>(
              <Card key={r.id} style={{borderLeft:`4px solid ${G.purple}`}}>
                <div style={{fontWeight:800,fontSize:15,color:G.ink,marginBottom:4}}>{r.titulo}</div>
                <div style={{fontSize:13,color:G.soft,marginBottom:10}}>
                  Generado: {r.fechaCreacion}
                  {r.fechaDesde&&r.fechaHasta&&` · Período: ${r.fechaDesde} → ${r.fechaHasta}`}
                </div>
                <InformePreviewAlumno rpt={r} data={data}/>
              </Card>
            ))}
          </div>
        }
      </div>}

      {/* CAMBIAR PIN ALUMNO */}
      {tab==="miperfil"&&<div>
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>🔐 Cambiar mi PIN</h3>
        <Card style={{maxWidth:400}}>
          <CambiarPinAlumno data={data} setData={setData} alumnoId={alumnoId}/>
        </Card>
      </div>}

      {tab==="reservas"&&<div>
        {slotsDisponibles.length>0&&<div style={{background:"linear-gradient(135deg,#1a5c2a,#2e7d3c)",color:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",gap:12,alignItems:"center"}}>
          <div style={{fontSize:24}}>🔔</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:14}}>¡Tienes {slotsDisponibles.length} clase{slotsDisponibles.length!==1?"s":""} disponible{slotsDisponibles.length!==1?"s":""}!</div>
            <div style={{fontSize:12,opacity:.85,marginTop:2}}>Tu profesor ha abierto nuevos huecos. Reserva tu plaza.</div>
          </div>
          <div style={{background:"rgba(255,255,255,.2)",borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:700}}>↓ Ver abajo</div>
        </div>}
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>📅 Mis clases reservadas</h3>
        {misReservas.length===0&&<div style={{color:G.soft,textAlign:"center",padding:20,background:G.mist,borderRadius:10,marginBottom:20}}>Sin clases reservadas.</div>}
        {misReservas.map(r=>{
          const slot=slots.find(s=>s.id===r.slotId);
          if(!slot) return null;
          const pasada=slot.fecha<today();
          return <Card key={r.id} style={{marginBottom:10,opacity:pasada?.7:1}}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <div style={{background:pasada?"#f0f0f0":G.mist,borderRadius:10,padding:"6px 10px",textAlign:"center",minWidth:50,flexShrink:0}}>
                <div style={{fontSize:11,color:G.soft}}>{slot.fecha.slice(5)}</div>
                <div style={{fontSize:15,fontWeight:800,color:pasada?G.soft:G.fairway}}>{slot.hora}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:G.ink}}>{slot.tipo}</div>
                <div style={{fontSize:12,color:G.soft}}>{slot.zona} · {slot.duracion}min</div>
                {slot.notas&&<div style={{fontSize:12,color:"#555",marginTop:3}}>{slot.notas}</div>}
              </div>
              {!pasada&&<Btn small color="danger" onClick={()=>cancelarReserva(r.id)}>Cancelar</Btn>}
              {pasada&&<Badge color="gray">Pasada</Badge>}
            </div>
          </Card>;
        })}

        <Divider label="HUECOS DISPONIBLES"/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h3 style={{margin:0,color:G.fairway}}>Reservar nueva clase</h3>
          <Btn small color="primary" onClick={()=>setModalSolicitud(true)}>+ Solicitar clase</Btn>
        </div>
        {solicitudEnviada&&<div style={{background:"#e8f5eb",border:"1px solid "+G.grass,borderRadius:10,padding:"10px 14px",marginBottom:12,color:G.fairway,fontWeight:600,fontSize:13}}>
          ✅ Solicitud enviada. Tu profesor la revisará pronto.
        </div>}
        {slotsDisponibles.length===0&&<div style={{color:G.soft,textAlign:"center",padding:20,background:G.mist,borderRadius:10}}>No hay huecos disponibles ahora mismo.<br/><span style={{fontSize:12}}>Usa el botón "Solicitar clase" para pedir una cita.</span></div>}
        {slotsDisponibles.slice(0,12).map(s=>{
          const res=reservas.filter(r=>r.slotId===s.id&&r.estado!=="cancelada");
          const libre=Number(s.plazas||1)-res.length;
          return <Card key={s.id} style={{marginBottom:10,borderLeft:`3px solid ${G.grass}`}}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <div style={{background:G.mist,borderRadius:10,padding:"6px 10px",textAlign:"center",minWidth:50,flexShrink:0}}>
                <div style={{fontSize:11,color:G.soft}}>{fmtDate(s.fecha)}</div>
                <div style={{fontSize:15,fontWeight:800,color:G.fairway}}>{s.hora}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:G.ink}}>{s.tipo} · {s.zona}</div>
                <div style={{fontSize:12,color:G.soft}}>{s.duracion}min · {libre} plaza{libre!==1?"s":""} libre{libre!==1?"s":""}</div>
                {s.notas&&<div style={{fontSize:12,color:G.fairway,marginTop:3}}>ℹ️ {s.notas}</div>}
              </div>
              <Btn small color="primary" onClick={()=>reservar(s.id)}>Reservar</Btn>
            </div>
          </Card>;
        })}
      </div>}

      {/* MODAL SOLICITAR CLASE */}
      {modalSolicitud&&<Modal title="Solicitar clase" onClose={()=>setModalSolicitud(false)}>
        <div style={{fontSize:13,color:G.soft,marginBottom:12}}>Tu profesor recibirá tu solicitud y te confirmará la clase.</div>
        <Field label="Fecha preferida *"><Input type="date" value={formSolicitud.fecha} onChange={v=>setFormSolicitud({...formSolicitud,fecha:v})}/></Field>
        <Field label="Hora preferida"><Input type="time" value={formSolicitud.hora} onChange={v=>setFormSolicitud({...formSolicitud,hora:v})}/></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Tipo"><Sel value={formSolicitud.tipo} onChange={v=>setFormSolicitud({...formSolicitud,tipo:v})} options={TIPOS_CLASE.map(t=>({value:t.id,label:t.label}))}/></Field>
          <Field label="Zona"><Sel value={formSolicitud.zona} onChange={v=>setFormSolicitud({...formSolicitud,zona:v})} options={ZONAS.map(z=>({value:z,label:z}))}/></Field>
        </div>
        <Field label="Notas (opcional)"><Textarea value={formSolicitud.notas} onChange={v=>setFormSolicitud({...formSolicitud,notas:v})} placeholder="¿Qué quieres trabajar?"/></Field>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
          <Btn color="secondary" onClick={()=>setModalSolicitud(false)}>Cancelar</Btn>
          <Btn onClick={enviarSolicitudClase} disabled={!formSolicitud.fecha}>Enviar solicitud</Btn>
        </div>
      </Modal>}

      {/* ANÁLISIS */}
      {tab==="analisis"&&<div>
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>🎬 Mis análisis de vídeo</h3>
        {analisis.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>Tu profesor aún no ha subido análisis de vídeo.</div>}
        {analisis.map(a=>(
          <Card key={a.id} style={{marginBottom:12}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
              <div style={{width:52,height:40,borderRadius:8,background:a.videoUrl?"#1a1a2e":G.mist,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                {a.videoUrl?<a href={a.videoUrl} target="_blank" rel="noreferrer" style={{color:G.white,textDecoration:"none"}}>▶</a>:"🎬"}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <Badge color="purple">{a.tipo}</Badge>
                  <Badge color="gray">{a.palo}</Badge>
                </div>
                <div style={{fontSize:12,color:G.soft,marginTop:3}}>📅 {a.fecha} · <span style={{color:G.flag}}>{stars(a.valoracion)}</span></div>
              </div>
            </div>
            {(a.aspectosBuenos||[]).length>0&&<div style={{background:G.mist,borderRadius:8,padding:"8px 12px",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:G.grass,marginBottom:4}}>✔ Puntos positivos</div>
              <div style={{fontSize:13}}>{(a.aspectosBuenos||[]).join(" · ")}</div>
            </div>}
            {(a.aspectosMejorar||[]).length>0&&<div style={{background:"#fffbf0",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:G.flag,marginBottom:4}}>▲ A trabajar</div>
              <div style={{fontSize:13}}>{(a.aspectosMejorar||[]).join(" · ")}</div>
            </div>}
            {a.comentarioTecnico&&<div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:G.fairway,marginBottom:4}}>📋 Informe del profesor</div>
              <div style={{fontSize:13,lineHeight:1.6,color:G.ink,whiteSpace:"pre-wrap",background:"#f5f9f5",borderRadius:8,padding:"10px 12px"}}>{a.comentarioTecnico}</div>
            </div>}
            {a.comentarioTutor&&<div>
              <div style={{fontSize:11,fontWeight:700,color:G.purple,marginBottom:4}}>👨‍👩‍👧 Mensaje para padres/tutores</div>
              <div style={{fontSize:13,lineHeight:1.6,color:G.ink,whiteSpace:"pre-wrap",background:G.lavender,borderRadius:8,padding:"10px 12px"}}>{a.comentarioTutor}</div>
            </div>}
            {a.videoUrl&&<div style={{marginTop:10}}>
              <a href={a.videoUrl} target="_blank" rel="noreferrer" style={{background:G.purple,color:G.white,borderRadius:8,padding:"7px 14px",textDecoration:"none",fontSize:13,fontWeight:600,display:"inline-block"}}>▶ Ver vídeo</a>
            </div>}
          </Card>
        ))}
      </div>}

      {/* EJERCICIOS ALUMNO */}
      {tab==="ejercicios"&&<ModEjerciciosAlumno data={data} setData={setData} alumnoId={alumnoId}/>}

      {/* STATS */}
      {tab==="stats"&&<div>
        <h3 style={{margin:"0 0 14px",color:G.fairway}}>📊 Mis estadísticas</h3>
        {estadisticas.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>Sin rondas registradas todavía.</div>}
        {estadisticas.map(s=>(
          <Card key={s.id} style={{marginBottom:10}}>
            <div style={{fontWeight:700,color:G.ink,marginBottom:8}}>📅 {s.fecha} · {s.hoyos} hoyos</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:14}}>
              {[["Golpes",s.golpes,G.fairway],["Fairways",s.fairwaysPorcentaje?s.fairwaysPorcentaje+"%":"—",G.grass],["GIR",s.greensRegulacion?s.greensRegulacion+"%":"—",G.sky],["Putts",s.putts,G.flag],["Hcp",s.handicap,G.danger]].map(([k,v,c])=>(
                <div key={k} style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:c}}>{v||"—"}</div><div style={{fontSize:11,color:G.soft}}>{k}</div></div>
              ))}
            </div>
            {s.palo&&s.distancia&&<div style={{fontSize:12,color:G.soft,marginTop:6}}>🏌️ {s.palo}: {s.distancia}m</div>}
            {s.notas&&<div style={{fontSize:12,color:"#555",marginTop:4}}>{s.notas}</div>}
          </Card>
        ))}
      </div>}
    </div>
  </div>;
}


// ═══════════════════════════════════════════════════════════════════
// BIBLIOTECA DE EJERCICIOS
// ═══════════════════════════════════════════════════════════════════

const EJERCICIOS_BIBLIOTECA = [
  // ── PUTT ──────────────────────────────────────────────────────────
  { id:"ej001", categoria:"Putt", nivel:"Iniciación", nombre:"El Cuadrado de 1 Metro",
    objetivo:"Desarrollar confianza y repetición en putts cortos.", duracion:"15 min",
    material:"Putter, bola, 4 tees",
    descripcion:"Coloca 4 tees formando un cuadrado de 1 metro alrededor del hoyo. Practica putts desde cada tee hasta embocar 3 bolas consecutivas desde cada posición antes de avanzar.",
    variantes:["Ampliar a 1,5 m una vez dominado el metro","Hacerlo con los ojos cerrados para trabajar el tacto","Con guía de alineación en el suelo"],
    kpis:["Nº de emboques consecutivos","Tiempo en completar el circuito"],
    erroresComunes:["Mirar el hoyo antes de impactar","Acelerar en el golpe","Agarrar con tensión"],
    tags:["precisión","confianza","rutina"] },

  { id:"ej002", categoria:"Putt", nivel:"Iniciación", nombre:"El Reloj",
    objetivo:"Mejorar la dirección en putts desde distintos ángulos.",
    duracion:"20 min", material:"Putter, 12 bolas, tees",
    descripcion:"Coloca 12 bolas en círculo alrededor del hoyo a 1 metro de distancia, como las horas de un reloj. El objetivo es completar las 12 horas sin fallar. Si fallas, empiezas desde la 12 de nuevo.",
    variantes:["Reloj de 1,5 m","Reloj de 2 m para niveles avanzados","Solo las 4 posiciones cardinales"],
    kpis:["Horas completadas en cada intento","Récord personal"],
    erroresComunes:["No leer la línea de cada putt","Ritmo irregular","Postura diferente en cada bola"],
    tags:["dirección","concentración","presión"] },

  { id:"ej003", categoria:"Putt", nivel:"Intermedio", nombre:"Putt de Velocidad — Tabla de Mareas",
    objetivo:"Controlar la velocidad para dejar la bola a 30 cm del hoyo en putts largos.",
    duracion:"20 min", material:"Putter, 6 bolas",
    descripcion:"Marca una línea a 3 m, 6 m y 9 m del hoyo. Practica 10 putts desde cada distancia. El objetivo no es embocar, sino dejar la bola dentro de un círculo de 30 cm alrededor del hoyo (zona de gimme).",
    variantes:["Añadir romper (rampas de hierba)","En verde en pendiente real","Medir la zona objetivo con un aro"],
    kpis:["% bolas en zona objetivo","Distancia media de error"],
    erroresComunes:["Acelerar la cabeza del putter","Muñecas activas en el golpe","No leer la pendiente"],
    tags:["velocidad","distancia","control"] },

  { id:"ej004", categoria:"Putt", nivel:"Avanzado", nombre:"El Tour — 18 Hoyos Imaginarios",
    objetivo:"Simular presión de competición en el putting green.", duracion:"30 min", material:"Putter, 1 bola",
    descripcion:"Diseña un recorrido de 18 putts con distintas distancias y pendientes en el putting green. Asigna un par a cada 'hoyo' (par 1 si <1m, par 2 hasta 5m, par 3 largas). Juega el recorrido completo y anota tu score.",
    variantes:["Con compañero a modo competición","Simular los últimos 3 hoyos de un torneo con presión"],
    kpis:["Score total vs par","Nº de birdie puts embocados","Nº de 3-putts"],
    erroresComunes:["Falta de rutina previa a cada putt","No comprometerse con la línea elegida"],
    tags:["competición","presión","simulación","estrategia"] },

  // ── JUEGO CORTO ───────────────────────────────────────────────────
  { id:"ej005", categoria:"Juego Corto", nivel:"Iniciación", nombre:"Chip de Referencia — La Moneda",
    objetivo:"Establecer el punto de caída ideal en chips básicos.", duracion:"20 min", material:"Wedge/9-hierro, bolas, moneda",
    descripcion:"Elige un objetivo a 10 m. Coloca una moneda como punto de caída a 1/3 de la distancia. Practica chips intentando que la bola bote justo sobre la moneda. Rodará el resto hasta el objetivo.",
    variantes:["Cambiar la distancia (5m, 15m, 20m)","Usar distintos palos (PW, 9, 8) para ver cómo varía el rodar","Punto de caída más cerca del objetivo con SW"],
    kpis:["% impactos dentro de 50 cm de la moneda","% bolas dentro de 1 m del objetivo"],
    erroresComunes:["Intentar levantar la bola con las muñecas","Peso atrás en el golpe","Demasiado backswing"],
    tags:["chip","punto de caída","fundamentos"] },

  { id:"ej006", categoria:"Juego Corto", nivel:"Iniciación", nombre:"La Escalera de Chips",
    objetivo:"Controlar la distancia en el chip variando el swing.", duracion:"25 min", material:"Wedge, 10 bolas, tees",
    descripcion:"Coloca tees a 5m, 10m, 15m y 20m de ti. Practica chipear a cada distancia con el mismo palo y la misma posición de bola. Aprende a controlar la distancia solo con el tamaño del swing.",
    variantes:["Con dos palos distintos y comparar","En terreno con algo de pendiente","Con el cajón de arena cerca para practicar las distintas salidas"],
    kpis:["Bolas dentro de 1m de cada tee objetivo","Consistencia de contacto"],
    erroresComunes:["Cambiar la velocidad en vez del tamaño del swing","Posición de manos variable"],
    tags:["distancia","chip","control"] },

  { id:"ej007", categoria:"Juego Corto", nivel:"Intermedio", nombre:"Bunker — Arena Fina",
    objetivo:"Dominar la salida de bunker de greenside.", duracion:"25 min", material:"Sand wedge, bolas, bunker",
    descripcion:"Dibuja una línea en la arena a 5 cm detrás de la bola. Practica el golpe intentando que el palo entre en la arena exactamente en la línea. La bola debe salir sin que el palo la toque directamente. Realiza 20 repeticiones.",
    variantes:["Bola enterrada (huevo frito)","Pendiente cuesta abajo desde el bunker","Bunker a máxima distancia del hoyo"],
    kpis:["% salidas fuera del bunker","Distancia de control en la salida","% dentro de 3m del hoyo"],
    erroresComunes:["Cerrar la cara del palo","Intentar golpear la bola directamente","Desaceleración en el impacto"],
    tags:["bunker","arena","golpe especial"] },

  { id:"ej008", categoria:"Juego Corto", nivel:"Intermedio", nombre:"El Lob por encima del Obstáculo",
    objetivo:"Practicar el golpe globo con cara abierta para salvar obstáculos.", duracion:"20 min", material:"SW/LW, bolas, palo horizontal como obstáculo",
    descripcion:"Coloca un palo de golf horizontal a 1m de altura a 2m de ti. Practica lobs que pasen por encima del palo y aterricen suavemente en el green imaginario al otro lado. Cara bien abierta, swing en U.",
    variantes:["Con bunker real debajo","Distancias variables al green","Objetivo pequeño al otro lado"],
    kpis:["% bolas que superan el obstáculo","Distancia de rodado tras aterrizaje"],
    erroresComunes:["Cerrar la cara en el impacto","Miedo que provoca deceleración","Peso atrás"],
    tags:["lob","globo","cara abierta","obstáculo"] },

  { id:"ej009", categoria:"Juego Corto", nivel:"Avanzado", nombre:"Up & Down Challenge",
    objetivo:"Simular situaciones reales de up & down alrededor del green.", duracion:"30 min", material:"Wedges, putter, bolas",
    descripcion:"Deja caer 9 bolas en posiciones aleatorias alrededor del green (rough, pendiente, bunker, posición limpia). Desde cada posición juegas chip/lob/bunker + putt. Objetivo: 5 up & downs de 9 intentos.",
    variantes:["Con puntuación Stableford simplificada","Solo posiciones difíciles","Con compañero, alternando posiciones"],
    kpis:["Up & downs conseguidos de 9","% de un solo putt tras el chip","Peor puesto al que llegas"],
    erroresComunes:["Elegir el palo equivocado según la situación","No leer el green antes del chip"],
    tags:["up&down","competición","versatilidad","presión"] },

  // ── JUEGO LARGO ───────────────────────────────────────────────────
  { id:"ej010", categoria:"Juego Largo", nivel:"Iniciación", nombre:"El Péndulo de Hierros",
    objetivo:"Establecer contacto sólido y consistente con hierros medios.", duracion:"20 min", material:"7-hierro, bolas, campo de prácticas",
    descripcion:"Con el 7-hierro, realiza series de 10 golpes con swing al 50% de velocidad. El objetivo es solo el contacto: que el palo baje el césped justo delante de la bola. Sin preocuparse de la distancia ni dirección.",
    variantes:["Subir al 70% una vez conseguido el contacto","Con tee bajo para facilitar","Alternar con 8 y 6 hierro"],
    kpis:["% de divots delante de la bola","Consistencia de sonido en el impacto","Dirección del divot"],
    erroresComunes:["Intentar levantar la bola","Caída del peso hacia atrás","Cabeza que se levanta antes del impacto"],
    tags:["contacto","hierros","fundamentos","swing"] },

  { id:"ej011", categoria:"Juego Largo", nivel:"Iniciación", nombre:"Zona de Aterrizaje — Fairway",
    objetivo:"Aprender a apuntar y aterrizar en zonas definidas.", duracion:"25 min", material:"Hierros medios, bolas, campo",
    descripcion:"Elige una zona de fairway de 20x20 m como objetivo. Practica golpes con 7-hierro intentando aterrizar dentro de la zona. Lleva el recuento de aciertos. 30 golpes por sesión.",
    variantes:["Reducir la zona a 10x10m","Cambiar el palo según la distancia","Mover la zona a la derecha e izquierda para simular situaciones reales"],
    kpis:["% bolas en zona objetivo","Media de desviación lateral","Dispersión total"],
    erroresComunes:["No alinear los pies correctamente","Intentar darle demasiado fuerte","Cambiar el objetivo entre golpes"],
    tags:["dirección","precisión","hierros","alineación"] },

  { id:"ej012", categoria:"Juego Largo", nivel:"Intermedio", nombre:"Driver — Control de Curva",
    objetivo:"Dominar la curva intencional (draw y fade) con el driver.", duracion:"30 min", material:"Driver, bolas, campo",
    descripcion:"Alterna golpes con curva intencional: 5 draws (la bola curva de derecha a izquierda para diestros) y 5 fades (izquierda a derecha). Ajusta la alineación del cuerpo y el camino del swing, no la cara. 30 golpes totales.",
    variantes:["Con hierros antes de pasar al driver","Solo draw durante 15 golpes hasta asentarlo","Jugar con viento de cara para acentuar la curva"],
    kpis:["Distancia de curva lograda","% golpes con curva en dirección deseada","Dirección de salida"],
    erroresComunes:["Girar la cara en vez de cambiar el camino","Cambiar la postura de la bola","Sobrecorregir"],
    tags:["driver","draw","fade","curva","control"] },

  { id:"ej013", categoria:"Juego Largo", nivel:"Intermedio", nombre:"Palos Alternos — Control de Distancia",
    objetivo:"Dominar las distancias de todos los palos de la bolsa.", duracion:"30 min", material:"Todos los hierros, bolas",
    descripcion:"Practica 5 golpes con cada palo de la bolsa de forma secuencial (PW, 9, 8, 7, 6, 5, híbrido, 3-madera, driver). Anota la distancia media conseguida con cada palo. Construye tu tabla personal de distancias.",
    variantes:["Golpes al 75% de velocidad para control","Solo los palos que más usas en tu campo","En distintas condiciones de viento"],
    kpis:["Tabla de distancias por palo","Consistencia (diferencia entre máximo y mínimo)","% palos con target conseguido"],
    erroresComunes:["Cambiar el swing al cambiar de palo","No anotar los datos","Intentar máxima distancia"],
    tags:["distancia","todos los palos","tabla","consistencia"] },

  { id:"ej014", categoria:"Juego Largo", nivel:"Avanzado", nombre:"Golpes con Intención Táctica",
    objetivo:"Practicar golpes simulando situaciones reales de campo.", duracion:"30 min", material:"Palos varios, bolas, campo",
    descripcion:"Simula 9 situaciones tácticas distintas: salida a fairway estrecho, approach a green con agua delante, segundo golpe con árbol en la línea, golpe bajo el viento, golpe de rough, etc. Decide el palo y la estrategia antes de cada golpe.",
    variantes:["Con compañero que propone el escenario","Anotar el % de éxito en cada situación","Usar tees para simular rough o rough de verdad"],
    kpis:["% situaciones resueltas correctamente","Calidad de decisión táctica","Distancia de error al objetivo"],
    erroresComunes:["Elegir siempre el palo más largo","No considerar el margen de seguridad","Olvidar el viento y la pendiente"],
    tags:["táctica","toma de decisiones","campo","avanzado"] },

  // ── ESTRATEGIA DE JUEGO ───────────────────────────────────────────
  { id:"ej015", categoria:"Estrategia", nivel:"Iniciación", nombre:"La Zona de Seguridad",
    objetivo:"Aprender a gestionar el riesgo eligiendo objetivos seguros.", duracion:"Teórico + campo 45 min", material:"Tarjeta de score, bolígrafo",
    descripcion:"En cada hoyo, antes de golpear, identifica: (A) la zona de mayor riesgo, (B) la zona segura aunque no ideal. Practica siempre apuntar a la zona segura. Anota cuántas veces eres capaz de evitar agua, OB y bunkers en 9 hoyos.",
    variantes:["Jugar solo con un objetivo: nunca agua ni OB","Calcular el score si hubieras ido a la zona de riesgo vs la segura","Con compañero que valora cada decisión"],
    kpis:["Nº de hoyos sin pérdida de bola","Score vs tu hándicap","Nº de decisiones seguras aplicadas"],
    erroresComunes:["Ir siempre a la bandera aunque haya agua","No considerar el hándicap al decidir","Cambiar el plan al llegar a la bola"],
    tags:["gestión","riesgo","decisión","campo"] },

  { id:"ej016", categoria:"Estrategia", nivel:"Intermedio", nombre:"Construcción del Hoyo — Game Plan",
    objetivo:"Diseñar el plan de juego de cada hoyo antes de salir al tee.", duracion:"30 min teórico", material:"Scorecard, bolígrafo, mapa del campo",
    descripcion:"Para cada hoyo del campo que vas a jugar, diseña un plan en 3 pasos: (1) ¿Qué salida necesito? ¿Qué zona de fairway? (2) ¿Desde dónde quiero el approach? (3) ¿Cuál es el peor sitio del green y cómo lo evito? Escríbelo antes de salir.",
    variantes:["Solo para los hoyos más difíciles","Revisar el plan tras la ronda y evaluar cuánto lo seguiste","Con el pro comentando cada decisión"],
    kpis:["% del plan ejecutado","Score en hoyos con plan vs sin plan","Nº de bogeys dobles evitados"],
    erroresComunes:["No actualizar el plan según el viento del día","Improvisar bajo presión"],
    tags:["planificación","game plan","green","estrategia"] },

  { id:"ej017", categoria:"Estrategia", nivel:"Avanzado", nombre:"Gestión del Score — El Par Propio",
    objetivo:"Establecer objetivos realistas hoyo a hoyo según tu nivel.", duracion:"18 hoyos", material:"Scorecard personalizado",
    descripcion:"Antes de la ronda, define tu 'par propio' para cada hoyo según tu hándicap (ej: si eres +20, tu par propio en un par 4 de dificultad 1 es un 7). Juega con el objetivo de hacer tu par propio en cada hoyo, no el par oficial. Calcula tu score vs tu par propio.",
    variantes:["Solo 9 hoyos para empezar","Con seguimiento de fairways y greens en regulación propios"],
    kpis:["Score vs par propio","Nº de hoyos bajo el par propio","Nº de bogeys dobles respecto al par propio"],
    erroresComunes:["Ser demasiado optimista con el par propio","No ajustarlo según el día"],
    tags:["par propio","gestión de score","realismo","avanzado"] },

  // ── REGLAS DE GOLF ────────────────────────────────────────────────
  { id:"ej018", categoria:"Reglas", nivel:"Iniciación", nombre:"Test Básico de Reglas — Obstáculos y OB",
    objetivo:"Conocer las reglas más frecuentes en campo.", duracion:"20 min", material:"Reglamento RFEG, cuestionario",
    descripcion:"Cuestionario de 10 situaciones frecuentes: bola en agua, fuera de límites, bola no localizable, obstáculo inmovible, alivio de obstáculo. El alumno responde cómo actuar en cada caso y el profesor corrige.",
    preguntas:[
      {p:"Tu bola cae en zona de penalización roja. ¿Cuáles son tus opciones?", r:"1. Jugar desde donde está si es posible. 2. Volver al punto anterior con 1 penalización. 3. Soltar dentro de 2 palos laterales donde cruzó la línea con 1 penalización."},
      {p:"Tu bola no se puede localizar después de 3 minutos de búsqueda. ¿Qué haces?", r:"Bola perdida: debes volver al punto de golpe anterior y jugar con penalización de golpe y distancia (1 golpe de penalización)."},
      {p:"Tu bola está junto a un aspersor (obstáculo inmovible). ¿Tienes derecho a alivio?", r:"Sí. Puedes tomar alivio sin penalización soltando dentro de 1 palo del punto de alivio más cercano que elimine la interferencia, no más cerca del hoyo."},
      {p:"¿Cuántos golpes de penalización conlleva una bola OB?", r:"Golpe y distancia: 1 golpe de penalización y debes volver a golpear desde el punto anterior. Total: 2 golpes perdidos (el jugado + la penalización)."},
      {p:"Tu bola queda en huellas de animal en un bunker. ¿Hay alivio sin penalización?", r:"No. En el bunker, las huellas de animal no dan derecho a alivio sin penalización. Puedes aliviar fuera del bunker con 1 golpe de penalización."},
    ],
    tags:["reglas","OB","agua","obstáculo","básico"] },

  { id:"ej019", categoria:"Reglas", nivel:"Intermedio", nombre:"Test de Reglas en el Green",
    objetivo:"Dominar las reglas específicas del putting green.", duracion:"20 min", material:"Cuestionario, reglamento",
    descripcion:"Situaciones específicas del green: marcar la bola, limpiar la bola, reparar el green, bola que golpea el palo de la bandera, bola que pasa sobre la bola de otro jugador, casual water en el green.",
    preguntas:[
      {p:"Estás en el green. Tu putt golpea la bola de otro jugador que no fue marcada. ¿Qué pasa?", r:"En stroke play: 2 golpes de penalización para ti. La bola del compañero vuelve a su posición original. En match play: sin penalización."},
      {p:"Hay agua casual (lluvia) en la línea de tu putt en el green. ¿Qué puedes hacer?", r:"Puedes tomar alivio sin penalización colocando la bola en el punto más cercano que evite la interferencia del agua casual, no más cerca del hoyo."},
      {p:"Tu bola en el green roza el asta de la bandera que está dentro del hoyo. ¿Hay penalización?", r:"No. Desde 2019 no hay penalización si la bola golpea el asta dentro del hoyo. La bola es válida si cae y permanece en el hoyo."},
      {p:"¿Puedes reparar un pitchmark en el green en tu línea de putt?", r:"Sí, siempre. En el green puedes reparar cualquier daño: pitchmarks, huellas de zapatos, daños de animales, etc."},
      {p:"¿Puedes marcar y limpiar tu bola en el green en cualquier momento?", r:"Sí. En el putting green siempre puedes marcar, levantar y limpiar tu bola, incluso si no está en la línea de putt de nadie."},
    ],
    tags:["reglas","green","putt","bandera","intermedio"] },

  { id:"ej020", categoria:"Reglas", nivel:"Avanzado", nombre:"Test de Reglas Avanzadas — Situaciones de Campo",
    objetivo:"Resolver situaciones complejas de reglas en competición.", duracion:"30 min", material:"Reglamento RFEG 2023, cuestionario",
    descripcion:"Casos avanzados: bola incrustada, regla de distancia local, mal score en la tarjeta, pie incorrecto del jugador, búsqueda provisional, regla del caddie.",
    preguntas:[
      {p:"Tu bola queda incrustada en su propio pitchmark en el rough. ¿Hay alivio?", r:"Sí. Desde 2019, la regla del terreno general permite alivio sin penalización en cualquier zona del terreno general (incluyendo el rough) si la bola está incrustada en su propio pitchmark."},
      {p:"Firmas la tarjeta con un score menor al real en un hoyo. ¿Qué ocurre?", r:"Descalificación. Si firmas con un score menor al real en cualquier hoyo, el resultado es la descalificación del recorrido (en stroke play)."},
      {p:"Juegas tu bola y luego descubres que era la bola de otro jugador. ¿Qué penalización?", r:"2 golpes de penalización por jugar una bola equivocada. Debes volver a jugar con tu bola original. Si no puedes encontrarla, es bola perdida con golpe y distancia."},
      {p:"Tu caddie te aconseja la línea de putt después de que hayas empezado tu rutina previa. ¿Hay penalización?", r:"Sí desde 2023: 1 golpe de penalización si el caddie te asiste con la alineación situándose detrás de ti durante el golpe o cuando tomas la postura."},
      {p:"Juegas una bola provisional y luego encuentras la original en zona de penalización. ¿Cuál juegas?", r:"Tienes opción: puedes jugar la original desde la zona de penalización con las opciones de alivio disponibles, o desistir de la original y continuar con la provisional (que se convierte en la bola en juego)."},
    ],
    tags:["reglas","avanzado","competición","penalización"] },

  // ── MENTAL Y CONCENTRACIÓN ────────────────────────────────────────
  { id:"ej021", categoria:"Mental", nivel:"Todos", nombre:"Rutina Pre-Golpe — Los 5 Pasos",
    objetivo:"Establecer una rutina consistente antes de cada golpe.", duracion:"15 min teórico + práctica en campo",
    material:"Ninguno específico",
    descripcion:"Aprende y automatiza la rutina de 5 pasos: (1) Lectura de la situación desde atrás, (2) Elección de palo y objetivo, (3) Dos prácticas de swing, (4) Alineación de cara y pies, (5) Un 'gatillo' de inicio (waggle, presión de manos). Practica la rutina con el mismo tiempo en cada golpe.",
    variantes:["Medir el tiempo de rutina con cronómetro (objetivo: 20-25 seg)","Rutina específica para putts","Rutina bajo presión (con espectador)"],
    kpis:["Tiempo de rutina (consistencia entre golpes)","Nº de golpes en los que completa los 5 pasos","% mejora en dirección vs sin rutina"],
    erroresComunes:["Saltarse pasos bajo presión","Rutina demasiado larga (más de 40 seg)","Cambiar el objetivo en el último momento"],
    tags:["mental","rutina","concentración","presión"] },

  { id:"ej022", categoria:"Mental", nivel:"Intermedio", nombre:"Reset Mental — El Semáforo",
    objetivo:"Gestionar las emociones negativas tras un mal golpe.", duracion:"Teórico 20 min",
    material:"Bolígrafo, diario de golf",
    descripcion:"Sistema de 3 colores para gestionar emociones: ROJO (0-10 seg): permite la reacción emocional natural (sí, pero sin tirar palos). ÁMBAR (10-30 seg): respira, camina, suelta. VERDE (>30 seg): llega a la bola con la mente en el siguiente golpe, no en el anterior. Practica identificar en qué fase estás.",
    variantes:["Con diario post-ronda anotando situaciones ROJO que ocurrieron","Role-playing de situaciones difíciles en el campo"],
    kpis:["Nº de dobles bogeys tras un mal golpe (indicador de cascada mental)","Autoevaluación del control emocional del 1 al 10"],
    erroresComunes:["Pasar directo a VERDE sin procesar la emoción","Quedarse en ROJO más de 30 seg"],
    tags:["mental","emociones","resiliencia","concentración"] },

  { id:"ej023", categoria:"Mental", nivel:"Avanzado", nombre:"Visualización de Golpes — El Cine Interior",
    objetivo:"Usar la visualización para mejorar la ejecución técnica.", duracion:"10 min diarios",
    material:"Lugar tranquilo, optional: grabación de tu propio swing",
    descripcion:"Antes de dormir o antes de entrenar: (1) Cierra los ojos. (2) Visualiza el hoyo o golpe con el máximo detalle (hierba, viento, sonido). (3) Ejecuta el golpe perfecto mentalmente a velocidad real. (4) Siente la sensación de contacto ideal. (5) Visualiza la bola volando al objetivo. Repite 3-5 veces.",
    variantes:["Visualizar el hoyo más difícil de tu campo","Visualizar una ronda completa abreviada","Solo el putting green"],
    kpis:["Consistencia de práctica (días por semana)","Comparar score antes/después de 4 semanas de práctica"],
    erroresComunes:["Visualizar golpes malos accidentalmente (reiniciar siempre)","Hacerlo con prisas"],
    tags:["mental","visualización","rendimiento","avanzado"] },

  // ── FITNESS GOLF ─────────────────────────────────────────────────
  { id:"ej024", categoria:"Fitness Golf", nivel:"Todos", nombre:"Rotación de Cadera — 5 Ejercicios Clave",
    objetivo:"Mejorar la movilidad de cadera para mayor velocidad de cabeza.", duracion:"15 min",
    material:"Palo de golf, esterilla opcional",
    descripcion:"Circuito de 5 ejercicios: (1) Hip 90/90 en suelo (2x30 seg cada lado). (2) Sentadilla goblet con pausa (3x10). (3) Rotación de cadera con palo en hombros (3x15). (4) Paso cruzado hacia atrás (2x10 cada lado). (5) Hip hinge con palo en espalda (3x12).",
    variantes:["Solo los 3 más limitantes para ti","Con bandas elásticas para añadir resistencia","Como calentamiento antes de la ronda"],
    kpis:["Ángulo de rotación antes vs después (fotograma de vídeo)","Velocidad de cabeza de palo (si disponible radar)"],
    erroresComunes:["Compensar con la columna lumbar","No llegar al rango completo de movimiento","Hacerlo con rapidez excesiva"],
    tags:["fitness","cadera","movilidad","velocidad","calentamiento"] },

  { id:"ej025", categoria:"Fitness Golf", nivel:"Todos", nombre:"Core Estable — El Triángulo del Swing",
    objetivo:"Fortalecer el core para mantener la postura durante el swing.", duracion:"15 min",
    material:"Esterilla, palo de golf",
    descripcion:"Circuito de core: (1) Plank frontal con toque de hombros (3x20 toques). (2) Pallof press con banda (3x12 cada lado). (3) Dead bug (3x10 repeticiones). (4) Plank lateral con elevación de brazo (2x30 seg). (5) Rotación con palo en posición de swing (3x15).",
    variantes:["Versión básica sin banda","Con fitball para aumentar inestabilidad","Como rutina post-ronda"],
    kpis:["Tiempo de plank (progresión semanal)","Mejora en consistencia de postura en vídeo del swing"],
    erroresComunes:["Retener el aliento","Compensar con los hombros","Pelvis que sube en el plank"],
    tags:["fitness","core","postura","fuerza","estabilidad"] },
  // ── DRIVE / SALIDA ────────────────────────────────────────────────
  { id:"ej026", categoria:"Drive", nivel:"Iniciación", nombre:"El Tee Alto",
    objetivo:"Aprender el golpeo ascendente con el driver.", duracion:"20 min",
    material:"Driver, tees largos, bolas",
    descripcion:"Coloca la bola en un tee alto de forma que la mitad superior de la bola quede por encima de la cabeza del driver. Practica golpear la bola en el momento ascendente del swing.",
    progresion:["10 bolas centradas","Buscar trayectoria alta","Añadir distancia progresiva"],
    kpis:["% de bolas en calle","Distancia media"],
    erroresComunes:["Golpear de arriba a abajo","Caída de hombro derecho excesiva"],
    tags:["drive","salida","potencia"] },
  { id:"ej027", categoria:"Drive", nivel:"Intermedio", nombre:"Calle Imaginaria",
    objetivo:"Mejorar la precisión y dirección con el driver.", duracion:"25 min",
    material:"Driver, conos o marcas",
    descripcion:"Define una calle imaginaria de 30 metros de ancho con conos. Realiza 10 drives intentando que caigan dentro de la calle. Anota el porcentaje de acierto.",
    progresion:["Calle de 30m","Reducir a 20m","Reducir a 15m"],
    kpis:["% bolas en calle","Consistencia de dirección"],
    erroresComunes:["Buscar máxima potencia","Alineación incorrecta"],
    tags:["drive","precisión","dirección"] },
  // ── HIERROS ───────────────────────────────────────────────────────
  { id:"ej028", categoria:"Hierros", nivel:"Iniciación", nombre:"Contacto Limpio",
    objetivo:"Conseguir un contacto sólido bola-césped con hierros.", duracion:"20 min",
    material:"Hierro 7, bolas, spray o tiza",
    descripcion:"Aplica spray en la cara del palo. Golpea 10 bolas buscando la marca en el centro de la cara. Revisa el divot: debe empezar justo después de la bola.",
    progresion:["Contacto centrado","Divot tras la bola","Consistencia 8 de 10"],
    kpis:["% golpes centrados","Posición del divot"],
    erroresComunes:["Querer levantar la bola","Peso atrás en el impacto"],
    tags:["hierros","contacto","divot"] },
  { id:"ej029", categoria:"Hierros", nivel:"Intermedio", nombre:"Escalera de Distancias",
    objetivo:"Controlar la distancia con diferentes hierros.", duracion:"30 min",
    material:"Set de hierros, banderas o dianas",
    descripcion:"Coloca dianas a 100, 120, 140 y 160 metros. Golpea 5 bolas a cada distancia eligiendo el hierro adecuado. Anota la dispersión de cada grupo.",
    progresion:["4 distancias","Reducir dispersión","Añadir distancias intermedias"],
    kpis:["Dispersión por distancia","Precisión de distancia"],
    erroresComunes:["No ajustar el swing a la distancia","Forzar el palo"],
    tags:["hierros","distancia","control"] },
  // ── APPROACH ──────────────────────────────────────────────────────
  { id:"ej030", categoria:"Approach", nivel:"Iniciación", nombre:"El Reloj",
    objetivo:"Controlar la longitud del backswing para distancias cortas.", duracion:"25 min",
    material:"Wedge, bolas, banderas a distintas distancias",
    descripcion:"Imagina un reloj. Practica swings llevando las manos a las 7, 8 y 9 en punto. Aprende qué distancia logras con cada posición.",
    progresion:["3 posiciones de reloj","Asociar distancia a cada una","Consistencia"],
    kpis:["Distancia media por posición","Consistencia"],
    erroresComunes:["Acelerar o desacelerar","Backswing inconsistente"],
    tags:["approach","wedge","distancia"] },
  { id:"ej031", categoria:"Approach", nivel:"Avanzado", nombre:"Up and Down",
    objetivo:"Mejorar el juego corto bajo presión.", duracion:"30 min",
    material:"Wedges, putter, bolas",
    descripcion:"Desde 30-50 metros, intenta hacer el hoyo en 2 golpes (approach + putt). Lleva la cuenta de cuántos 'up and down' consigues de 10 intentos.",
    progresion:["5 de 10","7 de 10","Desde distintas posiciones"],
    kpis:["% up and down","Proximidad al hoyo"],
    erroresComunes:["No leer el green antes","Approach demasiado largo o corto"],
    tags:["approach","juego corto","presión"] },
  // ── BUNKER ────────────────────────────────────────────────────────
  { id:"ej032", categoria:"Bunker", nivel:"Iniciación", nombre:"La Línea en la Arena",
    objetivo:"Aprender a golpear la arena antes que la bola.", duracion:"20 min",
    material:"Sand wedge, bunker de prácticas",
    descripcion:"Dibuja una línea en la arena sin bola. Practica golpear justo en la línea, sacando arena. Cuando lo domines, coloca la bola justo delante de la línea.",
    progresion:["Sin bola, golpear la línea","Con bola sobre la línea","Salir consistentemente"],
    kpis:["% bolas fuera del bunker","Cantidad de arena desplazada"],
    erroresComunes:["Golpear la bola directamente","Miedo a entrar en la arena"],
    tags:["bunker","arena","salida"] },
  // ── CHIP ──────────────────────────────────────────────────────────
  { id:"ej033", categoria:"Chip", nivel:"Iniciación", nombre:"Aterrizaje en la Toalla",
    objetivo:"Controlar el punto de aterrizaje del chip.", duracion:"20 min",
    material:"Wedge, toalla, bolas",
    descripcion:"Coloca una toalla a 2 metros como zona de aterrizaje. Practica chips que aterricen sobre la toalla y dejen rodar la bola hacia el hoyo.",
    progresion:["Aterrizar en la toalla","Calcular el rodado","Variar distancias"],
    kpis:["% aterrizajes en zona","Proximidad final al hoyo"],
    erroresComunes:["Golpe de muñecas","No calcular el rodado"],
    tags:["chip","juego corto","control"] },
  { id:"ej034", categoria:"Chip", nivel:"Intermedio", nombre:"Tres Palos, Un Chip",
    objetivo:"Aprender a usar distintos palos para el chip según la situación.", duracion:"25 min",
    material:"PW, 9 y 7 hierro, bolas",
    descripcion:"Desde la misma posición, haz chips con pitching wedge, hierro 9 y hierro 7. Observa cómo cambia la proporción vuelo/rodado con cada palo.",
    progresion:["Probar 3 palos","Elegir palo según situación","Aplicar en juego"],
    kpis:["Proximidad al hoyo","Decisión de palo correcta"],
    erroresComunes:["Usar siempre el mismo palo","No leer la situación"],
    tags:["chip","palos","versatilidad"] },
  // ── SWING / TÉCNICA ───────────────────────────────────────────────
  { id:"ej035", categoria:"Swing", nivel:"Iniciación", nombre:"El Espejo del Grip",
    objetivo:"Aprender el agarre correcto del palo.", duracion:"15 min",
    material:"Cualquier palo, espejo",
    descripcion:"Frente a un espejo, practica colocar las manos en el grip. La V que forman pulgar e índice debe apuntar al hombro derecho. Repite hasta automatizarlo.",
    progresion:["Grip correcto estático","Sin mirar","Mantener en el swing"],
    kpis:["Consistencia del grip","Posición de las manos"],
    erroresComunes:["Agarre demasiado fuerte","Manos descoordinadas"],
    tags:["swing","grip","fundamentos"] },
  { id:"ej036", categoria:"Swing", nivel:"Intermedio", nombre:"Pies Juntos",
    objetivo:"Mejorar el equilibrio y el contacto central.", duracion:"20 min",
    material:"Hierro 7, bolas",
    descripcion:"Golpea bolas con los pies juntos. Esto obliga a mantener el equilibrio y a no balancearse, mejorando el contacto central con la bola.",
    progresion:["Medio swing pies juntos","Swing completo","Volver a stance normal"],
    kpis:["Equilibrio mantenido","% contacto central"],
    erroresComunes:["Balanceo lateral","Perder el equilibrio"],
    tags:["swing","equilibrio","contacto"] },
  // ── PUTT (más) ────────────────────────────────────────────────────
  { id:"ej037", categoria:"Putt", nivel:"Intermedio", nombre:"Reloj de Putts",
    objetivo:"Dominar putts cortos desde todos los ángulos.", duracion:"20 min", emoji:"🕐",
    material:"Putter, bola, 12 tees",
    descripcion:"Coloca 12 bolas en círculo alrededor del hoyo a 1 metro, como las horas de un reloj. Embócalas todas seguidas. Si fallas una, vuelves a empezar.",
    progresion:["Completar el círculo a 1m","Ampliar a 1,5m","Ampliar a 2m"],
    kpis:["Putts consecutivos embocados","% acierto por distancia"],
    erroresComunes:["No leer la caída","Golpe inconsistente"],
    tags:["putt","cortos","precisión"] },
  { id:"ej038", categoria:"Putt", nivel:"Avanzado", nombre:"La Puerta",
    objetivo:"Mejorar la línea de salida del putt.", duracion:"15 min", emoji:"🚪",
    material:"Putter, bola, 2 tees",
    descripcion:"Coloca dos tees ligeramente más anchos que la bola, a 30 cm del putter. La bola debe pasar entre ellos sin tocarlos. Asegura una salida recta.",
    progresion:["Puerta ancha","Puerta estrecha","Aumentar distancia al hoyo"],
    kpis:["% bolas que pasan limpias","Línea de salida"],
    erroresComunes:["Cara abierta o cerrada","Trayectoria del putter"],
    tags:["putt","línea","técnica"] },
  { id:"ej039", categoria:"Putt", nivel:"Intermedio", nombre:"Lag Putting",
    objetivo:"Controlar la distancia en putts largos.", duracion:"20 min", emoji:"🎯",
    material:"Putter, bolas",
    descripcion:"Desde 10-15 metros, intenta dejar la bola en un círculo de 1 metro alrededor del hoyo. El objetivo es no dejar nunca un segundo putt largo.",
    progresion:["Círculo de 1m a 10m","A 15m","A 20m"],
    kpis:["% bolas en zona","Distancia del segundo putt"],
    erroresComunes:["Golpe corto por miedo","No calibrar la velocidad del green"],
    tags:["putt","largos","distancia"] },
  // ── DRIVE (más) ───────────────────────────────────────────────────
  { id:"ej040", categoria:"Drive", nivel:"Avanzado", nombre:"Draw y Fade a Voluntad",
    objetivo:"Aprender a curvar la bola de forma controlada.", duracion:"30 min", emoji:"🌀",
    material:"Driver, bolas, conos",
    descripcion:"Practica 5 drives buscando draw (curva a la izquierda) y 5 buscando fade (curva a la derecha). Aprende a ajustar el stance y la cara del palo.",
    progresion:["Identificar la curva natural","Provocar draw","Provocar fade"],
    kpis:["% curvas conseguidas","Control de la forma"],
    erroresComunes:["Manipular demasiado las manos","Stance incorrecto"],
    tags:["drive","draw","fade","control"] },
  { id:"ej041", categoria:"Drive", nivel:"Iniciación", nombre:"Tempo 1-2-3",
    objetivo:"Mejorar el ritmo del swing con el driver.", duracion:"20 min", emoji:"🎵",
    material:"Driver, bolas",
    descripcion:"Cuenta '1-2' en la subida y '3' en la bajada. Mantén un tempo suave y constante. Evita acelerar bruscamente en la bajada.",
    progresion:["Swing lento","Añadir bola","Mantener tempo con potencia"],
    kpis:["Consistencia de tempo","Contacto centrado"],
    erroresComunes:["Bajada brusca","Pérdida de equilibrio"],
    tags:["drive","tempo","ritmo"] },
  // ── HIERROS (más) ─────────────────────────────────────────────────
  { id:"ej042", categoria:"Hierros", nivel:"Avanzado", nombre:"Banderas a Distintas Alturas",
    objetivo:"Controlar la trayectoria alta y baja con hierros.", duracion:"25 min", emoji:"📐",
    material:"Hierros, bolas",
    descripcion:"Practica golpear bolas altas (bola adelantada) y bajas (bola atrasada) con el mismo hierro. Útil para jugar con viento.",
    progresion:["Trayectoria normal","Bola baja","Bola alta"],
    kpis:["Control de altura","Distancia mantenida"],
    erroresComunes:["No ajustar la posición de la bola","Cambiar el swing"],
    tags:["hierros","trayectoria","viento"] },
  { id:"ej043", categoria:"Hierros", nivel:"Intermedio", nombre:"El Punto Exacto",
    objetivo:"Mejorar la precisión direccional con hierros medios.", duracion:"25 min", emoji:"🎯",
    material:"Hierro 7, dianas o banderas",
    descripcion:"Elige una diana pequeña a 130m. Golpea 10 bolas intentando acercarte lo máximo posible. Mide la distancia media al objetivo.",
    progresion:["Diana grande","Diana mediana","Diana pequeña"],
    kpis:["Distancia media a bandera","Dispersión"],
    erroresComunes:["No comprometerse con el objetivo","Alineación pobre"],
    tags:["hierros","precisión","dirección"] },
  // ── APPROACH (más) ────────────────────────────────────────────────
  { id:"ej044", categoria:"Approach", nivel:"Intermedio", nombre:"Los Tres Aros",
    objetivo:"Controlar distancias de approach a tres profundidades.", duracion:"30 min", emoji:"⭕",
    material:"Wedge, 3 aros o marcas, bolas",
    descripcion:"Coloca 3 aros a 20, 30 y 40 metros. Lanza 5 bolas a cada uno. Aprende qué swing necesitas para cada distancia.",
    progresion:["3 distancias","Reducir tamaño del aro","Distancias aleatorias"],
    kpis:["% bolas en aro","Control de distancia"],
    erroresComunes:["Mismo swing para todas","Desaceleración"],
    tags:["approach","distancia","wedge"] },
  // ── BUNKER (más) ──────────────────────────────────────────────────
  { id:"ej045", categoria:"Bunker", nivel:"Intermedio", nombre:"Salida Larga de Bunker",
    objetivo:"Aprender a sacar la bola lejos desde el bunker.", duracion:"25 min", emoji:"🏖️",
    material:"Sand wedge, bunker, bolas",
    descripcion:"Practica salidas de bunker de más de 20 metros. Abre menos la cara del palo y toma más arena. Busca que la bola vuele y ruede hacia el green.",
    progresion:["Salida corta","Salida media","Salida larga +20m"],
    kpis:["Distancia conseguida","% bolas en green"],
    erroresComunes:["Demasiada arena","Cara muy abierta para distancia larga"],
    tags:["bunker","distancia","arena"] },
  { id:"ej046", categoria:"Bunker", nivel:"Avanzado", nombre:"Bunker con Bola Enterrada",
    objetivo:"Resolver la difícil situación de bola semienterrada.", duracion:"20 min", emoji:"🥚",
    material:"Sand wedge, bunker, bolas",
    descripcion:"Entierra ligeramente la bola en la arena (huevo frito). Cierra la cara del palo y golpea con fuerza justo detrás de la bola para sacarla.",
    progresion:["Bola apoyada","Bola semienterrada","Bola enterrada"],
    kpis:["% bolas fuera","Control del resultado"],
    erroresComunes:["Cara abierta (no sale)","Falta de fuerza"],
    tags:["bunker","enterrada","avanzado"] },
  // ── CHIP (más) ────────────────────────────────────────────────────
  { id:"ej047", categoria:"Chip", nivel:"Avanzado", nombre:"Chip con Efecto",
    objetivo:"Aprender a dar efecto de retroceso al chip.", duracion:"25 min", emoji:"🔄",
    material:"Wedge de 56-60°, bolas nuevas",
    descripcion:"Con un wedge de alto loft y golpe descendente y limpio, practica chips que boten y frenen rápido. Requiere contacto perfecto bola-cara.",
    progresion:["Contacto limpio","Conseguir freno","Controlar el retroceso"],
    kpis:["Cantidad de freno","Consistencia"],
    erroresComunes:["Golpe gordo","Bola vieja sin spin"],
    tags:["chip","efecto","spin","avanzado"] },
  { id:"ej048", categoria:"Chip", nivel:"Iniciación", nombre:"El Putt-Chip",
    objetivo:"Aprender el chip básico con posición de putt.", duracion:"15 min", emoji:"🏑",
    material:"Hierro 8 o 9, bolas",
    descripcion:"Adopta una posición similar a la del putt pero con un hierro. Haz un movimiento de péndulo para sacar la bola del borde del green y dejarla rodar.",
    progresion:["Movimiento de péndulo","Controlar fuerza","Variar distancia"],
    kpis:["Proximidad al hoyo","Consistencia de contacto"],
    erroresComunes:["Usar muñecas","Intentar levantar la bola"],
    tags:["chip","iniciación","básico"] },
  // ── SWING / TÉCNICA (más) ─────────────────────────────────────────
  { id:"ej049", categoria:"Swing", nivel:"Intermedio", nombre:"Pausa en el Top",
    objetivo:"Mejorar la transición y secuencia del swing.", duracion:"20 min", emoji:"⏸️",
    material:"Hierro 7, bolas",
    descripcion:"Sube el palo y haz una pausa de 1 segundo en lo alto del backswing antes de bajar. Mejora la coordinación y evita la precipitación.",
    progresion:["Pausa exagerada","Pausa breve","Transición fluida"],
    kpis:["Secuencia correcta","Contacto mejorado"],
    erroresComunes:["Bajar desde arriba con los brazos","Perder el ángulo"],
    tags:["swing","transición","tempo"] },
  { id:"ej050", categoria:"Swing", nivel:"Iniciación", nombre:"Swing de Medio Cuerpo",
    objetivo:"Aprender el movimiento básico del swing.", duracion:"20 min", emoji:"🔆",
    material:"Hierro 7, bolas",
    descripcion:"Practica swings llevando el palo solo hasta la altura de la cintura, tanto en la subida como en la bajada. Construye el swing desde lo simple.",
    progresion:["Medio swing","Tres cuartos","Swing completo"],
    kpis:["Contacto centrado","Equilibrio"],
    erroresComunes:["Querer pegar fuerte","Perder postura"],
    tags:["swing","iniciación","fundamentos"] },
  // ── ESTRATEGIA (más) ──────────────────────────────────────────────
  { id:"ej051", categoria:"Estrategia", nivel:"Avanzado", nombre:"Juega el Campo en la Mente",
    objetivo:"Aprender a planificar cada hoyo antes de jugarlo.", duracion:"30 min", emoji:"🧠",
    material:"Tarjeta del campo, lápiz",
    descripcion:"Antes de una vuelta, dibuja la estrategia de cada hoyo: dónde dejar el drive, qué zonas evitar, dónde fallar si fallas. Juega según el plan.",
    progresion:["Planificar 9 hoyos","18 hoyos","Ajustar según resultados"],
    kpis:["% hoyos jugados según plan","Reducción de errores graves"],
    erroresComunes:["Jugar sin pensar","Atacar banderas peligrosas"],
    tags:["estrategia","planificación","mental"] },
  { id:"ej052", categoria:"Mental", nivel:"Intermedio", nombre:"Rutina Pre-Golpe",
    objetivo:"Crear una rutina constante antes de cada golpe.", duracion:"20 min", emoji:"🧘",
    material:"Palos, bolas",
    descripcion:"Diseña una rutina fija: visualizar el golpe, un par de swings de práctica, alinearse, respirar y golpear. Repítela en cada bola para ganar consistencia.",
    progresion:["Diseñar la rutina","Repetirla en prácticas","Aplicarla en el campo"],
    kpis:["Consistencia de la rutina","Mejora bajo presión"],
    erroresComunes:["Saltarse pasos","Rutina demasiado larga"],
    tags:["mental","rutina","concentración"] },
];

// ═══════════════════════════════════════════════════════════════════
// BANCO DE PREGUNTAS PARA TESTS DINÁMICOS
// ═══════════════════════════════════════════════════════════════════

const TESTS_BANCO = {
  "Putt": [
    { id:"tp1", pregunta:"¿Cuál es la forma correcta de sostener el putter?", opciones:["Grip de béisbol","Grip de reverso","Grip de golpe con las palmas enfrentadas y pulgares en el eje del grip","Grip de dedo cruzado siempre"], correcta:2, explicacion:"El grip más utilizado es el de palmas enfrentadas con los pulgares sobre el eje del mango, lo que permite un movimiento pendular natural." },
    { id:"tp2", pregunta:"¿Dónde debe estar el peso del cuerpo en el putt?", opciones:["50/50 ambos pies","60% en el pie delantero","70% en el pie trasero","Completamente en el pie delantero"], correcta:0, explicacion:"En el putting el peso debe distribuirse de manera equilibrada, 50/50, para mantener estabilidad durante el movimiento pendular." },
    { id:"tp3", pregunta:"¿Qué parte del putter debe impactar la bola para un putt recto?", opciones:["El talón del putter","El punto dulce (sweet spot) del putter","La punta del putter","Cualquier parte es válida"], correcta:1, explicacion:"El impacto en el sweet spot garantiza la máxima transferencia de energía y un rodado más puro y predecible." },
    { id:"tp4", pregunta:"¿Cuándo se debe leer la línea de un putt?", opciones:["Solo desde detrás de la bola","Solo desde el lado","Desde múltiples ángulos: detrás, lateral y desde el hoyo","No es necesario leer la línea"], correcta:2, explicacion:"La lectura completa incluye ver la pendiente desde detrás de la bola, el lateral y desde el hoyo hacia la bola para entender el romper final." },
    { id:"tp5", pregunta:"¿Qué controla principalmente la distancia en el putt?", opciones:["La velocidad de la cabeza del putter","El tamaño del backswing y el through-swing","La fuerza de los brazos","El tipo de grip utilizado"], correcta:1, explicacion:"La distancia se controla fundamentalmente con el tamaño del swing (backswing y through-swing iguales), manteniendo la aceleración constante." },
    { id:"tp6", pregunta:"¿Qué es el 'break' o romper en un putt?", opciones:["Cuando la bola se parte","La curva que hace la bola por la pendiente del green","El sonido del impacto","La distancia total del putt"], correcta:1, explicacion:"El break es la curvatura que toma la bola al rodar sobre la pendiente del green. Leerlo correctamente es clave para la precisión." },
    { id:"tp7", pregunta:"¿Cuál es el error más común en putts cortos bajo presión?", opciones:["Demasiado backswing","Desaceleración en el impacto","Grip demasiado suave","Ojos abiertos"], correcta:1, explicacion:"La desaceleración (parar el putter en el impacto) es el error más frecuente bajo presión. La solución es un through-swing ligeramente mayor que el backswing." },
    { id:"tp8", pregunta:"¿Cómo afecta el poa annua (tipo de hierba del green) al putt?", opciones:["Hace que la bola vaya más recto","Puede generar rebotes por la irregularidad de la hierba al final del día","No tiene ningún efecto","Solo afecta en clima húmedo"], correcta:1, explicacion:"El poa annua produce semillas que crean irregularidades en la superficie, especialmente en greens maduros, lo que afecta al rodado, especialmente por la tarde." },
  ],
  "Juego Corto": [
    { id:"tc1", pregunta:"¿Qué palo produce menos rodado tras el aterrizaje en un chip?", opciones:["9-hierro","7-hierro","Sand wedge (SW)","5-hierro"], correcta:2, explicacion:"El sand wedge tiene mayor loft (54-58°) lo que da más altura y menos rodado tras el aterrizaje, ideal cuando necesitas parar la bola pronto." },
    { id:"tc2", pregunta:"¿Dónde debe estar el peso en el chip básico?", opciones:["50/50","70-80% en el pie delantero","70% en el pie trasero","No importa el peso"], correcta:1, explicacion:"En el chip el peso debe estar cargado en el pie delantero (70-80%) para favorecer un golpe descendente y contacto sólido primero bola después césped." },
    { id:"tc3", pregunta:"¿Qué significa 'contacto limpio' en el chip?", opciones:["Pegar la bola sin tocar el suelo","Que el palo golpee la bola antes que el suelo","Usar un guante limpio","Limpiar la cara del palo antes de golpear"], correcta:1, explicacion:"El contacto limpio implica que el palo impacte la bola ligeramente antes que el suelo, tomando un pequeño divot delante de la posición de la bola." },
    { id:"tc4", pregunta:"¿Cuándo es preferible chipear sobre puttear desde fuera del green?", opciones:["Siempre que estés fuera del green","Cuando la hierba entre la bola y el green está corta y uniforme","Cuando hay hierba larga o irregular entre la bola y el green","Solo en competición"], correcta:2, explicacion:"Si hay hierba larga o irregular entre la bola y el green, el putt puede desviarse. El chip vuela esa zona y solo rueda en el green." },
    { id:"tc5", pregunta:"¿Cómo se juega correctamente un bunker de greenside?", opciones:["Golpear directamente la bola","Entrar en la arena 5-7 cm detrás de la bola con cara abierta","Apuntar justo detrás de la bola y golpear suave","Cerrar la cara para aumentar el loft"], correcta:1, explicacion:"El bunker de greenside se juega con cara abierta entrando en la arena 5-7 cm detrás de la bola, usando el rebote del palo para expulsarla junto con la arena." },
    { id:"tc6", pregunta:"¿Qué es el 'rebote' (bounce) de un wedge?", opciones:["Cuando la bola bota en el green","El ángulo de la suela que impide que el palo se entierre en la arena","El efecto de la bola al aterrizar","La curvatura de la cara del wedge"], correcta:1, explicacion:"El bounce es el ángulo de la suela respecto al suelo. Un bounce alto ayuda en bunkers y hierba blanda, evitando que la suela se entierre." },
    { id:"tc7", pregunta:"¿Qué es el pitch y en qué se diferencia del chip?", opciones:["Son exactamente lo mismo","El pitch tiene más vuelo y menos rodado, el chip lo contrario","El chip tiene más vuelo","El pitch siempre usa el driver"], correcta:1, explicacion:"El pitch es un golpe con más elevación y menos rodado que el chip, ideal para distancias medias (20-80m) donde necesitas parar la bola rápidamente en el green." },
    { id:"tc8", pregunta:"¿Qué es el 'up and down'?", opciones:["Un tipo de swing","Embocar en dos golpes desde fuera del green (chip/bunker + putt)","Cuando la bola sube y baja en el air","Un ejercicio de calentamiento"], correcta:1, explicacion:"El up and down es conseguir embocar en dos golpes desde alrededor del green: el primer golpe (chip, pitch o bunker) y luego el putt." },
  ],
  "Juego Largo": [
    { id:"tl1", pregunta:"¿Dónde debe estar la bola en la postura para el driver?", opciones:["Centro del stance","A la altura del pie trasero","Alineada con el talón del pie delantero","A la altura del pie delantero pero un poco dentro"], correcta:2, explicacion:"Con el driver la bola se coloca alineada con el talón del pie delantero para golpear en el punto más alto del arco del swing (ascendente) y maximizar distancia." },
    { id:"tl2", pregunta:"¿Qué es el 'lag' en el swing?", opciones:["El retraso del cuerpo respecto a los brazos","El ángulo de palanca formado entre los brazos y el palo en la bajada","El seguimiento del palo tras el impacto","La posición del cuerpo en el backswing"], correcta:1, explicacion:"El lag es el ángulo de palanca formado entre los antebrazos y el shaft del palo durante la bajada. Un buen lag acumula energía que se libera en el impacto para mayor velocidad." },
    { id:"tl3", pregunta:"¿Qué produce un draw (curva de derecha a izquierda para diestros)?", opciones:["Cara abierta respecto al camino del swing","Cara cerrada respecto al camino del swing","Swing de fuera a dentro","Grip muy débil"], correcta:1, explicacion:"Un draw se produce cuando la cara está ligeramente cerrada respecto al camino del swing (de dentro a fuera). La bola sale con efecto de topspin lateral que la curva hacia la izquierda." },
    { id:"tl4", pregunta:"¿Qué es el 'tempo' en el swing de golf?", opciones:["La velocidad máxima del swing","La proporción de tiempo entre backswing y downswing","El ritmo de los pasos al caminar","La velocidad de la cabeza del palo en el impacto"], correcta:1, explicacion:"El tempo es la proporción entre backswing y downswing. Los mejores jugadores tienen un ratio aproximado de 3:1 (el backswing dura 3 veces más que el downswing)." },
    { id:"tl5", pregunta:"¿Qué es el 'angle of attack' o ángulo de ataque?", opciones:["El ángulo del grip","El ángulo con que la cabeza del palo golpea la bola (ascendente o descendente)","El ángulo de apertura de la cara","La dirección del swing"], correcta:1, explicacion:"El ángulo de ataque es si la cabeza del palo va descendiendo o ascendiendo al impactar la bola. Con hierros: descendente. Con driver: ascendente para maximizar distancia." },
    { id:"tl6", pregunta:"¿Qué causa una bola que sale directa y recta hacia la izquierda para un diestro (pull)?", opciones:["Swing de dentro a fuera con cara cerrada","Swing de fuera a dentro con la cara cuadrada al camino del swing","Grip demasiado fuerte","Peso atrás en el impacto"], correcta:1, explicacion:"Un pull es resultado de un swing de fuera a dentro (over the top) con la cara perpendicular al camino del swing. La bola sale directamente hacia la izquierda sin curva." },
    { id:"tl7", pregunta:"¿Por qué es importante la posición de la columna en la postura?", opciones:["Para parecer más profesional","Para permitir la rotación correcta del torso sin restricciones","Para tener más fuerza en los brazos","No tiene importancia"], correcta:1, explicacion:"La columna inclinada hacia delante (tilt) desde las caderas y ligeramente hacia atrás en la parte superior permite la rotación completa del torso y caderas sin bloqueos." },
    { id:"tl8", pregunta:"¿Qué es el 'smash factor'?", opciones:["Cuando la bola impacta en el árbil","La relación entre la velocidad de la bola y la velocidad de la cabeza del palo","La fuerza del impacto medida en decibelios","El ángulo de la cara en el impacto"], correcta:1, explicacion:"El smash factor es la eficiencia del impacto: velocidad de la bola dividido por velocidad de cabeza de palo. El máximo con driver es ~1.5. Un smash factor alto significa impacto en el sweet spot." },
  ],
  "Estrategia": [
    { id:"te1", pregunta:"En un par 3 con agua delante del green, ¿cuál es la estrategia más segura para un jugador de 20 de hándicap?", opciones:["Apuntar directamente a la bandera","Apuntar al centro del green aunque la bandera esté al fondo","Apuntar detrás del green (largo es mejor)","Usar el palo más largo posible"], correcta:1, explicacion:"El centro del green garantiza llegar al green evitando el agua. Para un 20 hcp, el centro siempre es mejor objetivo que la bandera que puede estar con agua justo delante." },
    { id:"te2", pregunta:"¿Qué es el 'miss management'?", opciones:["Errores de caddie","Planificar deliberadamente dónde quieres que la bola vaya si fallas, eligiendo el lado seguro","Gestionar el tiempo entre golpes","Calcular el número de mis por ronda"], correcta:1, explicacion:"Miss management es decidir antes de golpear qué lado es el error 'aceptable'. Si hay agua a la izquierda, apuntas ligeramente a la derecha para que un error izquierdo sea aceptable." },
    { id:"te3", pregunta:"Llevas -2 en los últimos 3 hoyos con par 4 difíciles. ¿Qué estrategia priorizas?", opciones:["Atacar banderas para intentar pares","Jugar seguro apuntando al centro del green","Usar solo hierros cortos para mayor precisión","Ir a por birdies en todos los hoyos"], correcta:1, explicacion:"Cuando vas bien en el score, la gestión conservadora (centro del green, bogeys aceptables) es más inteligente que arriesgar dobles bogeys intentando banderas difíciles." },
    { id:"te4", pregunta:"¿Qué factor tiene mayor impacto en el score de un amateur?", opciones:["La distancia con el driver","El número de putts","El juego corto y evitar penalizaciones","La precisión con los hierros"], correcta:2, explicacion:"Para los amateurs, el mayor impacto en el score viene de evitar penalizaciones (OB, agua) y del juego corto (chips y putts). La distancia importa mucho menos." },
    { id:"te5", pregunta:"¿Cuándo es correcto 'jugar seguro' y quedar corto intencionadamente?", opciones:["Nunca, siempre hay que ir al green","Cuando hay una trampa peligrosa justo detrás del green","Solo en los primeros hoyos","Cuando estás nervioso"], correcta:1, explicacion:"Si hay un peligro severo (barranco, OB, bunker profundo) detrás del green, quedarse corto intencionalmente es una decisión estratégica inteligente que evita scores desastrosos." },
    { id:"te6", pregunta:"En viento en contra intenso, ¿cuál es el ajuste correcto?", opciones:["Pegar más fuerte con el mismo palo","Tomar más palo y swing más suave","Cerrar la cara del palo","Abrir la postura"], correcta:1, explicacion:"En viento en contra se toma más palo (1-3 palos dependiendo del viento) y se hace un swing más controlado (75-80%). Un swing fuerte genera más efecto y la bola sube más, empeorando el efecto del viento." },
    { id:"te7", pregunta:"¿Qué es el 'course management'?", opciones:["El mantenimiento del campo de golf","La planificación inteligente de cada golpe basada en el propio nivel, el diseño del hoyo y las condiciones","Llevar el recuento de golpes del campo","La gestión del tiempo durante la ronda"], correcta:1, explicacion:"Course management es la disciplina de planificar cada hoyo estratégicamente: elegir el objetivo correcto, el palo adecuado y el tipo de golpe basado en el contexto completo." },
    { id:"te8", pregunta:"En un hoyo par 5, un jugador de 18 hcp, ¿cuál es la estrategia óptima?", opciones:["Intentar alcanzar el green en 2 golpes siempre","3 golpes tranquilos para llegar al green y luego puttear","Driver máximo distancia + madera al green","Siempre hierro de salida para mayor seguridad"], correcta:1, explicacion:"Para un 18 hcp en un par 5, la estrategia óptima es dividir el hoyo en 3 golpes cómodos: salida controlada, segundo a zona de ataque, approach tranquilo al green. El par 6 es un resultado excelente." },
  ],
  "Reglas": [
    { id:"tr1", pregunta:"¿Cuánto tiempo tienes para buscar una bola antes de declararla perdida?", opciones:["5 minutos","3 minutos","2 minutos","Sin límite de tiempo"], correcta:1, explicacion:"Desde 2019, el tiempo de búsqueda se redujo de 5 a 3 minutos. Pasados los 3 minutos, la bola se declara perdida y debes aplicar golpe y distancia." },
    { id:"tr2", pregunta:"¿Puedes mover una piedra en un bunker que molesta a tu swing?", opciones:["No, nunca","Sí siempre, es un obstáculo suelto","Sí, si no está tocando tu bola","Solo si el árbitro lo permite"], correcta:1, explicacion:"Las piedras son obstáculos sueltos y pueden removerse en cualquier zona, incluido el bunker, siempre que no muevas la bola. Si la bola se mueve al retirar la piedra, hay 1 golpe de penalización." },
    { id:"tr3", pregunta:"¿Qué es una bola provisional y cuándo se juega?", opciones:["Una bola de repuesto para training","Se juega cuando crees que tu bola puede estar perdida o OB, para ahorrar tiempo","Siempre que entras en rough","Cuando hay agua en el camino"], correcta:1, explicacion:"La bola provisional se juega cuando sospechas que tu bola puede estar perdida o OB (no en zona de penalización). Si encuentras la original en terreno en juego, debes jugar con la original." },
    { id:"tr4", pregunta:"¿Puedes pedir consejo a un compañero durante el juego?", opciones:["Sí siempre","Solo entre socios en mejor bola","No, pedir consejo a alguien que no sea tu caddie es penalización de 2 golpes","Solo en los primeros 9 hoyos"], correcta:2, explicacion:"Pedir consejo (qué palo, cómo golpear) a otro jugador que no sea tu caddie es penalización de 2 golpes en stroke play o pérdida del hoyo en match play." },
    { id:"tr5", pregunta:"¿Qué ocurre si mueves accidentalmente tu bola al retirar un obstáculo suelto?", opciones:["2 golpes de penalización","1 golpe de penalización y repones la bola","Sin penalización, repones la bola","Debes jugar desde donde quedó"], correcta:1, explicacion:"Si la bola se mueve accidentalmente al retirar un obstáculo suelto: 1 golpe de penalización y debes reponer la bola en su posición original." },
    { id:"tr6", pregunta:"En el green, ¿puedes reparar picos de zapatos en tu línea de putt?", opciones:["No, nunca","Sí, desde 2019 puedes reparar cualquier daño en el green en tu línea","Solo pichmarks naturales","Solo si el árbitro lo autoriza"], correcta:1, explicacion:"Desde 2019, puedes reparar cualquier daño en el green, incluyendo marcas de picos, animales, reparaciones antiguas, etc., estén o no en tu línea de putt." },
    { id:"tr7", pregunta:"¿Qué penalización tiene jugar desde fuera del área de tee?", opciones:["Descalificación","2 golpes de penalización y debes repetir el golpe desde dentro del tee","1 golpe de penalización","Sin penalización, solo aviso"], correcta:1, explicacion:"En stroke play, jugar desde fuera del área de tee (los dos tees + 2 palos hacia atrás) conlleva 2 golpes de penalización y debes repetir el golpe desde el área correcta." },
    { id:"tr8", pregunta:"¿Puedes usar un rangefinder (medidor de distancias) en competición?", opciones:["Nunca en competición","Sí si la condición local de la competición lo permite","Solo para medir distancias, nunca pendiente","Solo en rondas de prácticas"], correcta:1, explicacion:"Desde 2019, el uso de medidores de distancia está permitido salvo que la organización lo prohíba expresamente. Si el aparato mide pendiente o viento, debe desactivarse esa función." },
  ],
  "Mental": [
    { id:"tm1", pregunta:"¿Qué es el 'first tee nerves' y cómo se gestiona?", opciones:["Un tipo de hierba en el tee","Los nervios en el primer hoyo; se gestiona con respiración profunda, rutina habitual y reducir las expectativas","Un calentamiento obligatorio","La temperatura del campo por la mañana"], correcta:1, explicacion:"Los nervios en el primer tee son normales y útiles si se gestionan bien. La clave: rutina previa idéntica a siempre, respiración diafragmática, y bajar las expectativas del primer golpe." },
    { id:"tm2", pregunta:"¿Qué es el 'yips' en el putt?", opciones:["Un tipo de grip","Un espasmo involuntario del brazo o muñeca durante el putt, frecuentemente asociado a ansiedad","Un error de lectura del green","Una técnica de putt alternativa"], correcta:1, explicacion:"Los yips son movimientos involuntarios (temblores, espasmos) durante el putt causados por ansiedad o bloqueo neuromotor. Se tratan con cambio de grip, rutina diferente o apoyo psicológico." },
    { id:"tm3", pregunta:"¿Cuál es la diferencia entre 'proceso' y 'resultado' en el golf mental?", opciones:["No hay diferencia","El foco en el proceso significa concentrarse en la ejecución (alineación, ritmo); el resultado es el score final. El mental fuerte focaliza en el proceso","El proceso es el calentamiento","El resultado es siempre lo más importante"], correcta:1, explicacion:"El foco en el proceso (qué hago ahora mismo: alineación, ritmo, target) genera mejores resultados que obsesionarse con el score. Es un principio fundamental del golf de alto rendimiento." },
    { id:"tm4", pregunta:"¿Qué es la 'zona' o 'flow' en el deporte?", opciones:["Una zona del campo","Estado de máximo rendimiento con concentración plena y ejecución automática sin pensamiento consciente","Una técnica de respiración","El área alrededor del green"], correcta:1, explicacion:"El 'flow' o zona es el estado óptimo de rendimiento donde el jugador ejecuta de forma automática sin pensamiento consciente excesivo. Se busca con rutinas, respiración y foco en el proceso." },
    { id:"tm5", pregunta:"¿Cómo influye el diálogo interno negativo en el rendimiento?", opciones:["No influye, el golf es solo técnico","Aumenta la tensión muscular y reduce la velocidad del swing y la coordinación, empeorando el rendimiento","Solo afecta a principiantes","Mejora la concentración"], correcta:1, explicacion:"El diálogo interno negativo activa la respuesta de estrés: aumenta tensión muscular, reduce coordinación y velocidad de proceso. Sustituir con afirmaciones neutras o técnicas (ej: 'ritmo suave') mejora el rendimiento." },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// MÓDULO: EJERCICIOS Y TESTS — PANEL INSTRUCTOR
// ═══════════════════════════════════════════════════════════════════

const CATS = ["Todos","Putt","Juego Corto","Juego Largo","Estrategia","Reglas","Mental","Fitness Golf"];
const CAT_COLORS = {
  "Putt":"green","Juego Corto":"gold","Juego Largo":"blue",
  "Estrategia":"orange","Reglas":"red","Mental":"purple","Fitness Golf":"teal",
  "Drive":"blue","Hierros":"gray","Approach":"gold","Bunker":"orange","Chip":"green","Swing":"purple"
};
const CAT_ICONS = {
  "Putt":"🎯","Juego Corto":"⛳","Juego Largo":"🏌️",
  "Estrategia":"🧠","Reglas":"📋","Mental":"💭","Fitness Golf":"💪",
  "Drive":"🚀","Hierros":"⚙️","Approach":"🎪","Bunker":"🏖️","Chip":"🏑","Swing":"🔄"
};


// ═══════════════════════════════════════════════════════════════════
// GRUPOS DE EDAD — Escuela de Golf Ciudad Real 2026/2027
// ═══════════════════════════════════════════════════════════════════
const GRUPOS_EDAD = [
  // ── Categorías infantiles/juveniles (por edad) ──
  { id:"prebenjamin", nombre:"Prebenjamín", rango:"5-7 años",   color:"#f5a623", emoji:"🐣", descripcion:"Iniciación lúdica. Juego libre, coordinación básica y amor por el deporte." },
  { id:"benjamin",    nombre:"Benjamín",    rango:"8-10 años",  color:"#7b5ea7", emoji:"⛳", descripcion:"Fundamentos técnicos básicos. Aprenden el swing y las reglas elementales." },
  { id:"alevin",      nombre:"Alevín",      rango:"11-12 años", color:"#3a7abf", emoji:"🐦", descripcion:"Desarrollo técnico y competición iniciación. Torneos internos y primeras competencias." },
  { id:"infantil",    nombre:"Infantil",    rango:"13-14 años", color:"#16a085", emoji:"🦅", descripcion:"Perfeccionamiento técnico y preparación para competición." },
  { id:"cadete",      nombre:"Cadete",      rango:"15-16 años", color:"#2e7d3c", emoji:"🏌️", descripcion:"Entrenamiento específico y desarrollo competitivo." },
  { id:"boys_girls",  nombre:"Boys/Girls",  rango:"17-18 años", color:"#c0392b", emoji:"🏆", descripcion:"Alto rendimiento. Preparación para competición regional y nacional." },
  { id:"sub21",       nombre:"Sub-21",      rango:"19-21 años", color:"#8e44ad", emoji:"🎓", descripcion:"Categoría juvenil superior. Competición avanzada y desarrollo de élite." },
  // ── Grupos de adultos / modalidades ──
  { id:"adulto_bautismo",        nombre:"Bautismo de Golf",     rango:"Adultos", color:"#2e7d3c", emoji:"⛳", descripcion:"Primera toma de contacto con el golf. Sesión introductoria para descubrir el deporte." },
  { id:"adulto_iniciacion",      nombre:"Iniciación Adultos",   rango:"Adultos", color:"#1a5c2a", emoji:"🌱", descripcion:"Primeros pasos en el golf para adultos. Fundamentos básicos del swing y reglas." },
  { id:"adulto_perfeccionamiento", nombre:"Perfeccionamiento",  rango:"Adultos", color:"#c8a84b", emoji:"🎯", descripcion:"Mejora técnica para adultos con experiencia. Pulir el swing y bajar hándicap." },
  { id:"clase_individual",       nombre:"Clase Individual",     rango:"Adultos", color:"#e67e22", emoji:"👤", descripcion:"Clase particular personalizada uno a uno con el profesor." },
  { id:"bono_5",                 nombre:"Bono 5 Clases",        rango:"Adultos", color:"#3498db", emoji:"🎫", descripcion:"Paquete de 5 clases. Ahorro y continuidad en el aprendizaje." },
  { id:"bono_10",                nombre:"Bono 10 Clases",       rango:"Adultos", color:"#2980b9", emoji:"🎟️", descripcion:"Paquete de 10 clases. Máximo ahorro y progresión sostenida." },
  { id:"curso_hcp10",            nombre:"Curso Hándicap (10h)", rango:"Adultos", color:"#9b59b6", emoji:"📊", descripcion:"Curso intensivo de 10 horas para obtener la licencia y el hándicap." },
];

const EJERCICIOS_CURSO = [
{id:"p001",grupo:"prebenjamin",trimestre:1,semana:1,categoria:"Coordinación",nombre:"El Globo de Golf",objetivo:"Coordinación ojo-mano y equilibrio.",descripcion:"Golpear globos inflados con palos esponja (pool noodle). Objetivo: mantener el globo en el aire el mayor tiempo posible.",duracion:"15 min",material:"Globos, palos esponja",variantes:["En parejas pasan el globo", "Con la mano izquierda", "Contar cada golpe"],tags:["coordinación", "lúdico"]},
{id:"p002",grupo:"prebenjamin",trimestre:1,semana:2,categoria:"Putting",nombre:"El Puente de los Tesoros",objetivo:"Primera toma de contacto con el putting.",descripcion:"Bloques de foam forman 'puentes'. Los niños hacen pasar la bola por debajo rodando con el putter.",duracion:"15 min",material:"Putter junior, bolas foam, bloques",variantes:["Puentes más estrechos", "En curva", "Varios en serie"],tags:["putt", "lúdico", "primera vez"]},
{id:"p003",grupo:"prebenjamin",trimestre:1,semana:3,categoria:"Coordinación",nombre:"La Caza del Balón",objetivo:"Carrera, equilibrio y contacto básico.",descripcion:"Pelotas de colores por el campo. Los niños las 'cazan' golpeándolas hacia una zona marcada. Cada color vale diferente puntuación.",duracion:"20 min",material:"Palos esponja, bolas de colores, conos",variantes:["Equipos compitiendo", "Solo bolas del propio color", "Carrera al golpear"],tags:["lúdico", "colores"]},
{id:"p004",grupo:"prebenjamin",trimestre:1,semana:4,categoria:"Swing",nombre:"El Árbol que Baila",objetivo:"Aprender la rotación básica del cuerpo.",descripcion:"Imitar un árbol en el viento: brazos extendidos, girando el tronco a derecha e izquierda. Luego añadimos el palo.",duracion:"15 min",material:"Palos esponja",variantes:["Con música rítmica", "En parejas imitando", "Ojos cerrados"],tags:["rotación", "lúdico", "swing"]},
{id:"p005",grupo:"prebenjamin",trimestre:1,semana:5,categoria:"Putting",nombre:"La Pista de Bolos",objetivo:"Control de dirección y fuerza en putt básico.",descripcion:"Conos como bolos a 2 metros. Los niños los derriban con la bola usando el putter. Gana quien más derriba en 5 intentos.",duracion:"15 min",material:"Putter junior, bolas foam, conos",variantes:["Bolos a 3m", "Formaciones distintas", "En parejas"],tags:["dirección", "bolos", "putt"]},
{id:"p006",grupo:"prebenjamin",trimestre:1,semana:6,categoria:"Chip",nombre:"La Rana Saltarina",objetivo:"Primer contacto con el chip levantando la bola.",descripcion:"Con un hierro 9 junior, los niños intentan que la bola 'salte' sobre una cuerda tendida a 20cm del suelo.",duracion:"15 min",material:"Hierro 9 junior, bolas foam, cuerda",variantes:["Cuerda más alta (30cm)", "Aterrizar en zona marcada", "Varios saltos"],tags:["chip", "altura", "lúdico"]},
{id:"p007",grupo:"prebenjamin",trimestre:1,semana:7,categoria:"Juego",nombre:"Golf de Colores",objetivo:"Aprender la idea de fairway-green-hoyo lúdicamente.",descripcion:"Minicircuito de 3 hoyos con conos de colores. Los niños recorren el circuito golpeando la bola hasta el cono de su color.",duracion:"25 min",material:"Palos junior, bolas, conos de 3 colores",variantes:["Añadir un cuarto hoyo", "En equipos", "Con puntuación"],tags:["circuito", "lúdico", "colores"]},
{id:"p008",grupo:"prebenjamin",trimestre:1,semana:8,categoria:"Coordinación",nombre:"El Equilibrista",objetivo:"Mejorar el equilibrio estático y dinámico.",descripcion:"Los niños caminan sobre una línea con la bola equilibrada en la cabeza del putter. Sin dejarla caer llegan al hoyo.",duracion:"15 min",material:"Putter junior, bolas foam",variantes:["Con obstáculos", "En parejas", "Con música y pausas"],tags:["equilibrio", "lúdico"]},
{id:"p009",grupo:"prebenjamin",trimestre:2,semana:9,categoria:"Putting",nombre:"El Túnel Mágico",objetivo:"Mejorar la precisión en putt en línea recta.",descripcion:"Dos palos paralelos a 30cm de ancho forman un túnel. Los niños practican el putt pasando la bola por el túnel.",duracion:"15 min",material:"Putter junior, bolas, 4 palos como guías",variantes:["Túnel más estrecho", "Más largo", "Con curva al final"],tags:["putt", "precisión", "guía"]},
{id:"p010",grupo:"prebenjamin",trimestre:2,semana:10,categoria:"Juego",nombre:"Quién Llega Primero",objetivo:"Motivar la competición sana.",descripcion:"Dos niños salen a la vez. Gana quien llega primero al cono objetivo a 15m. Solo se puede avanzar golpeando.",duracion:"20 min",material:"Palos junior, bolas, conos",variantes:["En equipos de 2", "Con obstáculos", "Distancia progresiva"],tags:["competición", "lúdico", "carrera"]},
{id:"p011",grupo:"prebenjamin",trimestre:2,semana:11,categoria:"Swing",nombre:"La Máquina de Nieve",objetivo:"Sentir el peso del palo y el movimiento pendular.",descripcion:"Una media con pelota de tenis dentro oscila como péndulo. Los niños transfieren ese ritmo al swing con el palo esponja.",duracion:"15 min",material:"Media con pelota de tenis, palo esponja",variantes:["Con palo real", "Contar el ritmo en voz alta", "En espejo con el profesor"],tags:["ritmo", "péndulo", "swing"]},
{id:"p012",grupo:"prebenjamin",trimestre:2,semana:12,categoria:"Chip",nombre:"El Cesto de Frutas",objetivo:"Apuntar y aterrizar la bola en zona objetivo.",descripcion:"Cestos de diferentes tamaños a 5, 8 y 10 metros. Los niños intentan que la bola aterrice dentro del cesto con chip corto.",duracion:"15 min",material:"Hierro 9 junior, bolas foam, cestos",variantes:["Solo el más lejano", "Puntos según cesto", "Por equipos"],tags:["chip", "puntería", "cestos"]},
{id:"p013",grupo:"prebenjamin",trimestre:2,semana:13,categoria:"Putting",nombre:"El Río Serpenteante",objetivo:"Practicar el putt siguiendo una línea.",descripcion:"Camino serpenteante con cinta de colores. Los niños hacen rodar la bola siguiendo el camino hasta el hoyo al final.",duracion:"15 min",material:"Putter junior, bolas, cinta adhesiva",variantes:["Más curvas", "A más velocidad", "Sin salirse del camino"],tags:["putt", "curva", "camino"]},
{id:"p014",grupo:"prebenjamin",trimestre:2,semana:14,categoria:"Juego",nombre:"La Gran Exploración",objetivo:"Descubrir el campo de golf de forma lúdica.",descripcion:"Excursión por el campo real. El profesor explica cada zona (fairway, green, bunker, rough) con metáforas de animales y colores.",duracion:"40 min",material:"Palos junior",variantes:["Con mapa dibujado", "Fotos con tableta", "Preguntas con premio"],tags:["exploración", "campo real"]},
{id:"p015",grupo:"prebenjamin",trimestre:2,semana:15,categoria:"Coordinación",nombre:"El Malabarista",objetivo:"Mejorar la coordinación bilateral y el ritmo.",descripcion:"Con dos palos esponja, los niños golpean alternativamente dos bolas foam situadas a ambos lados. Rítmico y alternado.",duracion:"15 min",material:"2 palos esponja, 2 bolas foam",variantes:["Una mano sola", "Con música", "Más rápido o más lento"],tags:["bilateral", "ritmo", "coordinación"]},
{id:"p016",grupo:"prebenjamin",trimestre:3,semana:16,categoria:"Chip",nombre:"La Pesca Milagrosa",objetivo:"Afianzar el chip corto con control.",descripcion:"Se pinta un lago azul en el suelo. Hay que chipear desde fuera y hacer que la bola vuele el lago y aterrice al otro lado.",duracion:"15 min",material:"Hierro 9 junior, bolas foam, cinta azul",variantes:["Lago más grande", "Objetivo al otro lado", "En equipo"],tags:["chip", "altura", "agua"]},
{id:"p017",grupo:"prebenjamin",trimestre:3,semana:17,categoria:"Putting",nombre:"El Carrusel de Hoyos",objetivo:"Practicar putt en circuito de 6 miniatureholes.",descripcion:"6 mini-hoyos con nombre de animal. Los niños rotan en parejas.",duracion:"30 min",material:"Putter junior, bolas, 6 hoyos con banderines",variantes:["Con tiempo límite", "Puntuación acumulada", "En solitario"],tags:["circuito", "putt", "rotación"]},
{id:"p018",grupo:"prebenjamin",trimestre:3,semana:18,categoria:"Swing",nombre:"El Espejo Mágico",objetivo:"Aprender imitación postural.",descripcion:"En parejas frente a frente, uno hace de espejo e imita el swing del otro a velocidad muy lenta.",duracion:"15 min",material:"Palos esponja o junior",variantes:["Con profesor como modelo", "En fila india", "Con música lenta"],tags:["imitación", "espejo", "postura"]},
{id:"p019",grupo:"prebenjamin",trimestre:3,semana:19,categoria:"Juego",nombre:"El Tesoro Pirata",objetivo:"Desarrollar orientación espacial jugando al golf.",descripcion:"El profesor esconde tesoros (conos de colores). Los niños reciben un mapa dibujado y deben llegar a cada tesoro golpeando la bola.",duracion:"35 min",material:"Palos junior, bolas, mapa dibujado, conos",variantes:["Mapa más complejo", "Pistas con adivinanzas", "En equipos"],tags:["orientación", "mapa", "lúdico"]},
{id:"p020",grupo:"prebenjamin",trimestre:3,semana:20,categoria:"Coordinación",nombre:"La Danza del Golf",objetivo:"Integrar el movimiento del swing en la memoria corporal.",descripcion:"Al ritmo de música infantil: backswing (brazos arriba), impacto (palmada), follow-through (giro). Sin palo ni bola primero.",duracion:"15 min",material:"Música, altavoz",variantes:["Con palo esponja", "Con bola al final", "Coreografía inventada por los niños"],tags:["música", "ritmo", "danza"]},
{id:"p021",grupo:"prebenjamin",trimestre:3,semana:21,categoria:"Putting",nombre:"La Pared de Queso",objetivo:"Practicar el putt recto hacia un objetivo fijo.",descripcion:"Tabla de madera como pared a 2 metros. Los niños dan en la pared con el putt. Retroceden 50 cm cada vez que aciertan.",duracion:"15 min",material:"Putter junior, bolas foam, tabla/cartón",variantes:["Pared más pequeña", "Desde distintos ángulos", "Con puntuación"],tags:["putt", "precisión", "progresivo"]},
{id:"p022",grupo:"prebenjamin",trimestre:3,semana:22,categoria:"Chip",nombre:"El Helicóptero",objetivo:"Sentir la elevación de la bola en el chip.",descripcion:"El niño hace un movimiento suave hacia arriba intentando elevar la bola. El profesor refuerza el momento exacto del contacto.",duracion:"15 min",material:"Hierro 9 junior, bolas foam en tee bajo",variantes:["Sobre tee alto primero", "Luego tee bajo", "Finalmente en el suelo"],tags:["chip", "elevación", "tee"]},
{id:"p023",grupo:"prebenjamin",trimestre:4,semana:23,categoria:"Juego",nombre:"El Gran Premio",objetivo:"Primer torneo informal y vivencia de la competición positiva.",descripcion:"Torneo de 3 hoyos adaptados. Par 3 de 20m cada uno. Todos reciben medalla de participación.",duracion:"45 min",material:"Palos junior, bolas, banderines, medallas",variantes:["Jugar en parejas", "Con padres como caddies", "Foto de equipo"],tags:["torneo", "primer torneo", "medalla"]},
{id:"p024",grupo:"prebenjamin",trimestre:4,semana:24,categoria:"Putting",nombre:"El Laberinto",objetivo:"Control de dirección y fuerza en espacios limitados.",descripcion:"Laberinto en el putting green con palos tumbados como paredes. Los niños navegan la bola por el laberinto hasta el hoyo.",duracion:"20 min",material:"Putter junior, bolas, 8-10 palos como paredes",variantes:["Laberinto más complejo", "Contrarreloj", "Por relevos"],tags:["laberinto", "putt", "dirección"]},
{id:"p025",grupo:"prebenjamin",trimestre:4,semana:25,categoria:"Swing",nombre:"El Samurái del Golf",objetivo:"Afianzar la postura y el agarre correctos.",descripcion:"Con música épica: postura del samurái. Foto final de todos como samuráis.",duracion:"15 min",material:"Palos junior, música",variantes:["Foto de equipo", "Con espejo", "Profesor modelando"],tags:["postura", "agarre", "motivación"]},
{id:"p026",grupo:"prebenjamin",trimestre:4,semana:26,categoria:"Coordinación",nombre:"El Circuito Olímpico",objetivo:"Desarrollar agilidad, equilibrio y contacto con la bola.",descripcion:"5 estaciones: saltar conos, rodar bola con el palo, chip a cesto, putt al hoyo, slalom. Puntuación por tiempo y aciertos.",duracion:"30 min",material:"Conos, palos junior, bolas, cestos",variantes:["Contrarreloj", "Por equipos", "Dificultad creciente"],tags:["circuito", "agilidad", "polideportivo"]},
{id:"p027",grupo:"prebenjamin",trimestre:4,semana:27,categoria:"Chip",nombre:"El Aeropuerto",objetivo:"Afianzar la idea de vuelo y aterrizaje de la bola.",descripcion:"El green es el aeropuerto. Los niños hacen aterrizar la bola en distintas pistas (zonas marcadas con cintas).",duracion:"15 min",material:"Hierro 9 junior, bolas foam, cintas de colores",variantes:["Pistas más pequeñas", "Puntos por pista", "En equipos"],tags:["chip", "aterrizaje", "puntería"]},
{id:"p028",grupo:"prebenjamin",trimestre:4,semana:28,categoria:"Juego",nombre:"Safari de Golf",objetivo:"Consolidar todo lo aprendido de forma lúdica.",descripcion:"6 hoyos temáticos con nombre de animales africanos. Cada hoyo tiene un desafío diferente. Los niños llevan su tarjeta de safari.",duracion:"50 min",material:"Palos junior, bolas, 6 hoyos temáticos, tarjetas",variantes:["Con padres", "Fotografiando cada hoyo", "Puntuación colectiva"],tags:["safari", "circuito", "consolidación"]},
{id:"p029",grupo:"prebenjamin",trimestre:1,semana:3,categoria:"Coordinación",nombre:"La Pelota Rodante",objetivo:"Control del palo para rodar la bola en línea recta.",descripcion:"Los niños empujan la bola con el palo manteniéndola rodando. Deben llevarla de un cono a otro sin levantarla del suelo.",duracion:"10 min",material:"Palo junior, bola foam",variantes:["Slalom entre conos", "Con ojos cerrados", "En parejas"],tags:["control", "rodar", "primer contacto"]},
{id:"p030",grupo:"prebenjamin",trimestre:2,semana:11,categoria:"Putting",nombre:"El Camino de Baldosas",objetivo:"Memorizar una línea de putt y ejecutarla.",descripcion:"5 alfombrillas de colores en línea recta hasta el hoyo. El niño hace pasar la bola por encima de cada alfombrilla en orden.",duracion:"15 min",material:"Putter junior, bolas, 5 alfombrillas de colores",variantes:["Alfombrillas no alineadas", "Más alfombrillas", "Cronometrado"],tags:["putt", "secuencia", "alfombrillas"]},
{id:"p031",grupo:"prebenjamin",trimestre:3,semana:17,categoria:"Chip",nombre:"El Zoo de Pelotas",objetivo:"Clasificar y golpear bolas de colores a cestos.",descripcion:"Bolas de 4 colores mezcladas. Cada cesto tiene un color. Los niños golpean solo las bolas de su cesto. Gana quien primero llena el suyo.",duracion:"20 min",material:"Hierro 9 junior, bolas de 4 colores, 4 cestos",variantes:["Con señal de cambio de color", "Sin separar colores", "Carreras"],tags:["clasificar", "chip", "colores"]},
{id:"p032",grupo:"prebenjamin",trimestre:4,semana:23,categoria:"Swing",nombre:"El Robot de Golf",objetivo:"Identificar las partes del swing de forma divertida.",descripcion:"El profesor hace de robot programador. Los niños son robots a los que hay que programar: agarre, postura, backswing, etc.",duracion:"20 min",material:"Palos junior",variantes:["Niños programan al profesor", "Tarjetas de partes del swing", "Música de robot"],tags:["swing", "partes", "robot"]},
{id:"p033",grupo:"prebenjamin",trimestre:1,semana:5,categoria:"Coordinación",nombre:"El Juego de los Globos",objetivo:"Reacción rápida y coordinación ojo-mano.",descripcion:"El profesor lanza globos al aire. Los niños deben golpearlos con palos esponja antes de que toquen el suelo.",duracion:"15 min",material:"Globos, palos esponja",variantes:["2 globos a la vez", "Globos de un solo color", "Con música rápida"],tags:["globos", "reacción", "coordinación"]},
{id:"p034",grupo:"prebenjamin",trimestre:2,semana:13,categoria:"Juego",nombre:"El Golf de la Selva",objetivo:"Jugar un recorrido temático imaginativo.",descripcion:"El campo se convierte en selva: conos son árboles, telas azules son ríos. El profesor narra la historia mientras los niños juegan.",duracion:"30 min",material:"Conos, telas azules, palos junior, bolas",variantes:["Con disfraces de explorador", "Historia narrada por los niños", "Fotos del recorrido"],tags:["selva", "imaginación", "narración"]},
{id:"p035",grupo:"prebenjamin",trimestre:3,semana:19,categoria:"Putting",nombre:"El Putt Cooperativo",objetivo:"Fomentar el trabajo en equipo en el golf.",descripcion:"En grupos de 3, deben llegar al hoyo en exactamente 3 putts: cada niño da un putt. Si los 3 llegan al hoyo, ganan un punto.",duracion:"20 min",material:"Putters junior, bolas",variantes:["En 4 putts para 4 niños", "Con conversación de equipo antes", "Puntuación colectiva"],tags:["cooperación", "equipo", "putt"]},
{id:"p036",grupo:"prebenjamin",trimestre:1,semana:6,categoria:"Coordinación",nombre:"Pies de Golf",objetivo:"Aprender la posición de los pies correcta.",descripcion:"Siluetas de pies dibujadas en el suelo. Los niños colocan sus pies en las siluetas correctas (ancho de hombros) y practican la postura.",duracion:"10 min",material:"Siluetas de pies en cartulina o en el suelo",variantes:["Con y sin palo", "Buscar la postura cómoda", "Foto de la postura correcta"],tags:["postura", "pies", "fundamentos"]},
{id:"p037",grupo:"prebenjamin",trimestre:1,semana:7,categoria:"Swing",nombre:"La Palmera",objetivo:"Sentir el follow-through completo.",descripcion:"Terminar el swing con los brazos bien arriba como una palmera. El profesor pega una palmera de papel en la pared.",duracion:"10 min",material:"Palo esponja, palmera de papel en pared",variantes:["Palmera más alta", "Con palo real", "En espejo"],tags:["follow-through", "acabado", "palmera"]},
{id:"p038",grupo:"prebenjamin",trimestre:2,semana:9,categoria:"Chip",nombre:"El Saltamontes",objetivo:"Dar saltos cortos con la bola como un saltamontes.",descripcion:"La bola debe saltar 3 veces antes de llegar al objetivo a 6 metros. Los niños cuentan los botes en voz alta.",duracion:"15 min",material:"Hierro 9 junior, bolas",variantes:["Contar en inglés", "Zonas marcadas para cada bote", "Variar la distancia"],tags:["chip", "botes", "contar"]},
{id:"p039",grupo:"prebenjamin",trimestre:2,semana:10,categoria:"Juego",nombre:"La Vuelta al Mundo",objetivo:"Repasar todas las habilidades del trimestre.",descripcion:"6 estaciones representando 6 países. En cada país hay un reto diferente. Los niños llevan su pasaporte de papel sellándolo.",duracion:"40 min",material:"Palos junior, bolas, 6 estaciones, pasaportes de papel",variantes:["Con música de cada país", "Sellos personalizados", "Trajes típicos"],tags:["repaso", "circuito", "países", "pasaporte"]},
{id:"p040",grupo:"prebenjamin",trimestre:2,semana:12,categoria:"Putting",nombre:"El Hoyo Hablador",objetivo:"Desarrollar concentración antes del putt.",descripcion:"Muñeco de juguete en el hoyo. El niño debe hablarle diciéndole a dónde va a rodar la bola. Introduce la visualización infantil.",duracion:"10 min",material:"Putter junior, bola, muñeco de juguete",variantes:["El niño inventa el nombre del muñeco", "Con historia del muñeco", "Sin muñeco al final"],tags:["concentración", "visualización", "lúdico"]},
{id:"p041",grupo:"prebenjamin",trimestre:3,semana:15,categoria:"Swing",nombre:"El Cohete",objetivo:"Sentir la velocidad progresiva del swing.",descripcion:"Cuenta atrás 5-4-3-2-1 y al llegar a 0 el swing explota a máxima velocidad.",duracion:"10 min",material:"Palo esponja o junior",variantes:["Con bola y sin bola", "Cuenta atrás en inglés", "Solo el downswing rápido"],tags:["velocidad", "aceleración", "ritmo"]},
{id:"p042",grupo:"prebenjamin",trimestre:3,semana:16,categoria:"Chip",nombre:"La Sopa de Letras",objetivo:"Aprender vocabulario de golf chipeando.",descripcion:"Tarjetas con palabras de golf dispersas en el campo. Los niños golpean hacia la tarjeta que el profesor nombra.",duracion:"15 min",material:"Hierro junior, bolas, tarjetas con palabras",variantes:["Con dibujos en vez de palabras", "Vocabulario en inglés", "El que llega lee la palabra"],tags:["vocabulario", "chip", "palabras"]},
{id:"p043",grupo:"prebenjamin",trimestre:3,semana:18,categoria:"Coordinación",nombre:"El Lazarillo de Golf",objetivo:"Confianza, comunicación y orientación espacial.",descripcion:"En parejas: uno con los ojos tapados guiado por el otro con palabras (izquierda, derecha, fuerte, suave).",duracion:"20 min",material:"Palo junior, bola, venda para los ojos",variantes:["Sin venda pero mirando arriba", "El guía solo toca el hombro", "Cambiar roles"],tags:["confianza", "comunicación", "ciego"]},
{id:"p044",grupo:"prebenjamin",trimestre:4,semana:21,categoria:"Putting",nombre:"La Pecera",objetivo:"Control de velocidad y distancia en putt.",descripcion:"Círculo grande en el green. Los niños practican putts intentando que la bola pare dentro sin salir.",duracion:"15 min",material:"Putter junior, bola, cinta para marcar el círculo",variantes:["Pecera más pequeña", "Desde más lejos", "El que falla nada por el green"],tags:["velocidad", "control", "pecera"]},
{id:"p045",grupo:"prebenjamin",trimestre:4,semana:22,categoria:"Juego",nombre:"El Festival de Golf",objetivo:"Celebración de fin de temporada.",descripcion:"Festival en 8 estaciones con padres invitados. Cada niño muestra lo aprendido. Diploma de Pollito Golfista al final.",duracion:"60 min",material:"Toda la equipación, diplomas, música",variantes:["Con fotos para álbum del grupo", "Discurso del profesor", "Merienda de cierre"],tags:["festival", "cierre", "padres", "diploma"]},
{id:"p046",grupo:"prebenjamin",trimestre:4,semana:24,categoria:"Swing",nombre:"El Ninja del Golf",objetivo:"Reforzar la postura y el swing con un juego de roles.",descripcion:"Los niños son ninjas del golf. Cada swing perfecto es una técnica ninja que se añade a su libro secreto. El profesor evalúa con pegatinas.",duracion:"15 min",material:"Palos junior, pegatinas, libretita ninja",variantes:["Con disfraz", "El grupo vota el mejor ninja", "Técnicas con nombres inventados"],tags:["swing", "motivación", "ninja"]},
{id:"p047",grupo:"prebenjamin",trimestre:1,semana:8,categoria:"Putting",nombre:"El Pato Donald",objetivo:"Practicar el putt en una sola dirección repetida.",descripcion:"10 bolas en fila atrás del hoyo. Los niños intentan embocar de una en una sin moverse del sitio.",duracion:"10 min",material:"Putter junior, 10 bolas, hoyo",variantes:["15 bolas", "Con tiempo límite", "Celebrando cada emboque"],tags:["putt", "repetición", "paciencia"]},
{id:"p048",grupo:"prebenjamin",trimestre:2,semana:14,categoria:"Chip",nombre:"La Catapulta",objetivo:"Sentir la potencia controlada en el chip.",descripcion:"Como una catapulta medieval, el niño carga el backswing lento y luego libera rápido en el impacto.",duracion:"10 min",material:"Hierro 9 junior, bolas foam",variantes:["Bolas de distintos pesos", "En parejas", "Con objetivo"],tags:["aceleración", "chip", "catapulta"]},
{id:"p049",grupo:"prebenjamin",trimestre:3,semana:20,categoria:"Juego",nombre:"El Golf Gigante",objetivo:"Experiencia diferente y memorable del golf.",descripcion:"Se juega con palos de PVC de 2 metros y bolas gigantes. El campo se monta con cubos como hoyos. Todo a escala gigante.",duracion:"30 min",material:"Palos PVC grandes, bolas gigantes, cubos como hoyos",variantes:["En equipos", "Con cronómetro", "Video para los padres"],tags:["gigante", "lúdico", "especial", "memorable"]},
{id:"p050",grupo:"prebenjamin",trimestre:4,semana:26,categoria:"Coordinación",nombre:"El Gran Circo del Golf",objetivo:"Mostrar todo lo aprendido de forma espectacular.",descripcion:"Los niños montan un número de circo de golf: cada uno tiene un truco practicado durante el año. Función final para los padres.",duracion:"40 min",material:"Toda la equipación, música de circo",variantes:["Con disfraces de artistas", "Narrador el profesor", "Grabación en video"],tags:["circo", "espectáculo", "padres", "trucos"]},
{id:"e001",grupo:"cadete",trimestre:1,semana:1,categoria:"Postura",nombre:"Los 4 Puntos de Contacto",objetivo:"Establecer la postura correcta.",descripcion:"4 puntos: pies al ancho de hombros, rodillas flexionadas, cadera hacia atrás, espalda recta. El profesor revisa cada punto.",duracion:"15 min",material:"Palo de golf, espejo o pared",variantes:["Foto comparativa antes/después", "Con un palo en la espalda", "Check con compañero"],tags:["postura", "fundamentos"]},
{id:"e002",grupo:"cadete",trimestre:1,semana:2,categoria:"Agarre",nombre:"Los 3 Grips del Golf",objetivo:"Conocer los tres tipos de agarre.",descripcion:"Los 3 grips: entrelazado (Vardon), baseball y superpuesto. Cada alumno prueba los tres y elige el más cómodo.",duracion:"20 min",material:"Palos de golf",variantes:["Con grip trainer", "Foto de los 3 tipos", "Con ojos cerrados"],tags:["agarre", "grip", "fundamentos"]},
{id:"e003",grupo:"cadete",trimestre:1,semana:3,categoria:"Putting",nombre:"El Péndulo Perfecto",objetivo:"Aprender el movimiento pendular en putting.",descripcion:"Brazos y putter como péndulo de reloj. Backswing y follow-through iguales. Sin bola primero, luego con bola a 1 metro.",duracion:"20 min",material:"Putter, bola, hoyo",variantes:["Ojos cerrados", "Con guía de palos paralelos", "Con metrónomo app"],tags:["putt", "péndulo", "ritmo"]},
{id:"e004",grupo:"cadete",trimestre:1,semana:4,categoria:"Chip",nombre:"Posición de la Bola en el Chip",objetivo:"Aprender dónde colocar la bola en distintos chips.",descripcion:"3 posiciones de bola: adelantada, central y atrasada. Cada posición produce un resultado diferente.",duracion:"20 min",material:"Hierro 9, wedge, bolas, marcadores",variantes:["Con 3 palos distintos", "Foto de cada posición", "Anotar distancia conseguida"],tags:["chip", "posición de bola", "experimentar"]},
{id:"e005",grupo:"cadete",trimestre:1,semana:5,categoria:"Swing",nombre:"Las 9 Posiciones del Swing",objetivo:"Aprender las posiciones clave del swing completo.",descripcion:"El swing tiene 9 posiciones (P1 a P9). Se trabajan de dos en dos pausando en cada una.",duracion:"25 min",material:"Hierro 7, tablet/móvil para fotos",variantes:["En espejo", "Video a cámara lenta", "Ficha de checklist"],tags:["swing", "posiciones", "técnica"]},
{id:"e006",grupo:"cadete",trimestre:1,semana:6,categoria:"Putting",nombre:"La Regla de los Putts",objetivo:"Aprender a leer la velocidad del green.",descripcion:"5 bolas desde 3m, objetivo: dejar todas dentro de un aro de 50cm alrededor del hoyo. Se registran resultados.",duracion:"20 min",material:"Putter, 5 bolas, aro marcador",variantes:["Desde 5m", "En pendiente", "Con distintas velocidades de green"],tags:["velocidad", "putt", "aro", "registro"]},
{id:"e007",grupo:"cadete",trimestre:1,semana:7,categoria:"Chip",nombre:"El Chip y Corre",objetivo:"Dominar el chip de rodado con palo de baja trayectoria.",descripcion:"Usando un 8 o 7-hierro desde fuera del green, los alumnos practican el chip-and-run. La bola vuela poco y rueda mucho.",duracion:"20 min",material:"7 o 8 hierro, bolas, marcador de objetivo",variantes:["Comparar con SW", "Pendiente abajo", "Objetivo a 15, 20 y 25m"],tags:["chip", "rodado", "chip-and-run"]},
{id:"e008",grupo:"cadete",trimestre:1,semana:8,categoria:"Reglas",nombre:"Las 5 Reglas Básicas",objetivo:"Conocer las reglas fundamentales del golf.",descripcion:"Cuestionario gamificado: ¿Qué haces si la bola cae en el agua? ¿Y si no encuentras la bola? Con tarjetas ilustradas.",duracion:"20 min",material:"Tarjetas de reglas ilustradas, pizarra",variantes:["Quiz competitivo", "Escenas dramatizadas", "Con el reglamento en papel"],tags:["reglas", "básicas", "quiz"]},
{id:"e009",grupo:"cadete",trimestre:2,semana:9,categoria:"Swing",nombre:"El Peso en el Swing",objetivo:"Transferir el peso correctamente en el swing.",descripcion:"Con marcas en el suelo, los alumnos aprenden a cargar el peso atrás (backswing) y adelante (impacto).",duracion:"20 min",material:"Hierro 7, marcas de peso en suelo",variantes:["Swing con pie trasero levantado al final", "Vídeo de lado", "Con báscula digital"],tags:["peso", "transferencia", "balance"]},
{id:"e010",grupo:"cadete",trimestre:2,semana:10,categoria:"Putting",nombre:"Lectura de Green 101",objetivo:"Aprender a leer pendientes básicas.",descripcion:"3 putts con romper: plano, pendiente a la derecha y a la izquierda. Los alumnos predicen la dirección antes de ver rodar la bola.",duracion:"20 min",material:"Putter, bolas, putting green con pendiente",variantes:["Grabar la bola rodando", "Apostar puntos en la predicción", "Crear el propio putt con romper"],tags:["lectura de green", "pendiente", "predicción"]},
{id:"e011",grupo:"cadete",trimestre:2,semana:11,categoria:"Chip",nombre:"El Bunker por Primera Vez",objetivo:"Perder el miedo al bunker y aprender la salida básica.",descripcion:"Explicación del rebote (bounce) del SW. Cara abierta, línea de entrada en la arena, 20 repeticiones.",duracion:"25 min",material:"Sand wedge, bolas, bunker",variantes:["Sin bola (solo sentir la arena)", "Bola enterrada básica", "Objetivo: llegar al green"],tags:["bunker", "primera vez", "sand wedge"]},
{id:"e012",grupo:"cadete",trimestre:2,semana:12,categoria:"Swing",nombre:"La Línea de Swing",objetivo:"Entender el plano de swing correcto.",descripcion:"Con un aro hula-hoop a la altura de los hombros, se visualiza el plano de swing. El alumno gira el palo siguiendo el aro.",duracion:"20 min",material:"Aro hula-hoop, hierro 7",variantes:["Con palo en el aro", "Video de frente", "Comparar planos"],tags:["plano de swing", "hula-hoop", "visual"]},
{id:"e013",grupo:"cadete",trimestre:2,semana:13,categoria:"Juego",nombre:"Mi Primera Ronda de 3 Hoyos",objetivo:"Vivir la experiencia del campo real por primera vez.",descripcion:"3 hoyos del campo real (los más sencillos). Etiqueta y reglas en el campo. Tarjeta simplificada.",duracion:"60 min",material:"Set completo junior, tarjeta simplificada",variantes:["Con padres como caddies", "Solo alumnos con profesor", "Fotos de cada hoyo"],tags:["campo real", "primera ronda", "etiqueta"]},
{id:"e014",grupo:"cadete",trimestre:2,semana:14,categoria:"Putting",nombre:"El Torneo de Putting Eagles",objetivo:"Primer torneo de putting con reglas reales.",descripcion:"Torneo de 9 hoyos en el putting green. Se usa la tarjeta real. El profesor explica la etiqueta antes de empezar.",duracion:"45 min",material:"Putters, bolas, tarjeta de putting",variantes:["Con handicap", "En parejas match play", "Con premios de pegatinas"],tags:["torneo", "putting", "etiqueta"]},
{id:"e015",grupo:"cadete",trimestre:2,semana:15,categoria:"Swing",nombre:"El Control de la Cara",objetivo:"Entender la relación entre cara del palo y dirección.",descripcion:"Se golpean bolas con cara cerrada, cuadrada y abierta intencionalmente. Los alumnos observan y registran qué pasa.",duracion:"20 min",material:"Hierro 7, bolas, zona de práctica amplia",variantes:["Con tee bajo", "Video de la trayectoria", "Gráfico cara/trayectoria"],tags:["cara del palo", "dirección", "draw", "fade"]},
{id:"e016",grupo:"cadete",trimestre:3,semana:16,categoria:"Chip",nombre:"El Chip Perfecto — Check de 5",objetivo:"Checklist de 5 puntos del chip correcto.",descripcion:"5 puntos del chip perfecto: peso adelante, manos adelantadas, ball back, movimiento de hombros, contacto descendente. Autoevaluación.",duracion:"20 min",material:"Wedge, hierro 9, bolas, ficha de checklist",variantes:["En parejas evaluándose", "Video para comparar", "Audio check del profesor"],tags:["chip", "checklist", "autoevaluación"]},
{id:"e017",grupo:"cadete",trimestre:3,semana:17,categoria:"Swing",nombre:"El Finish Consistente",objetivo:"Finalizar siempre en la misma posición de follow-through.",descripcion:"El alumno hace el swing y mantiene el finish 3 segundos. El profesor fotografía y el alumno compara 10 fotos.",duracion:"20 min",material:"Hierro 7, bolas, móvil/tablet",variantes:["Con espejo", "Mantener 5 segundos", "Dibujar la posición ideal"],tags:["follow-through", "finish", "consistencia"]},
{id:"e018",grupo:"cadete",trimestre:3,semana:18,categoria:"Putting",nombre:"Las 100 Repeticiones",objetivo:"Automatizar el movimiento de putting mediante repetición masiva.",descripcion:"100 putts desde 1 metro en sesiones de 20. El alumno cuenta los emboques en un registro diario.",duracion:"25 min",material:"Putter, bolas, hoyo, registro en papel",variantes:["50 putts desde 1,5m", "Mezclar 1m y 2m", "Registro semanal visible"],tags:["repetición", "putt", "registro", "progresión"]},
{id:"e019",grupo:"cadete",trimestre:3,semana:19,categoria:"Reglas",nombre:"El Detective de Reglas",objetivo:"Identificar infracciones en situaciones reales.",descripcion:"El profesor presenta 6 situaciones en el campo. Los alumnos son detectives que identifican si hay infracción y cuál.",duracion:"25 min",material:"Tarjetas de situaciones, reglamento de bolsillo",variantes:["En equipos", "Con árbitro-alumno", "Situaciones filmadas"],tags:["reglas", "detective", "situaciones"]},
{id:"e020",grupo:"cadete",trimestre:3,semana:20,categoria:"Swing",nombre:"El Driver por Primera Vez",objetivo:"Primer contacto con el driver de forma segura.",descripcion:"Introducción al driver: posición de la bola, tee alto, swing ascendente. 20 golpes progresivos desde medio swing.",duracion:"25 min",material:"Driver junior, tees, bolas",variantes:["Empezar con 3-madera", "Con tee muy alto", "Video de frente y lado"],tags:["driver", "primera vez", "tee"]},
{id:"e021",grupo:"cadete",trimestre:3,semana:21,categoria:"Chip",nombre:"El Chip de Rough",objetivo:"Aprender a gestionar la bola desde el rough.",descripcion:"La bola en rough cambia el comportamiento del chip. Se practican chips desde rough corto y largo.",duracion:"20 min",material:"Wedge, hierro 9, bolas, zona de rough",variantes:["Rough muy largo", "Rough mojado", "Con viento cruzado"],tags:["rough", "chip", "adaptación"]},
{id:"e022",grupo:"cadete",trimestre:3,semana:22,categoria:"Juego",nombre:"La Competición de Eagles",objetivo:"Primera competición interna con tarjeta real.",descripcion:"Torneo interno de 6 hoyos entre los Eagles. Tarjeta real, reglas básicas, etiqueta.",duracion:"90 min",material:"Set completo, tarjetas de score",variantes:["Match play por parejas", "Con handicap sencillo", "Premio al más divertido"],tags:["torneo", "competición", "6 hoyos"]},
{id:"e023",grupo:"cadete",trimestre:4,semana:23,categoria:"Mental",nombre:"Respiración Antes del Golpe",objetivo:"Introducir la rutina de respiración pre-shot.",descripcion:"Antes de cada golpe: inspirar 4 seg, retener 2 seg, exhalar 4 seg. 10 veces sin palo y luego integrándolo en la rutina.",duracion:"15 min",material:"Ninguno",variantes:["Con música suave", "Medir frecuencia cardíaca antes/después", "En parejas sincronizados"],tags:["mental", "respiración", "rutina"]},
{id:"e024",grupo:"cadete",trimestre:4,semana:24,categoria:"Putting",nombre:"Putting Bajo Presión",objetivo:"Practicar putts con consecuencia emocional.",descripcion:"El alumno debe embocar 3 putts seguidos desde 1 metro. Si falla vuelve a empezar. Se añade un observador para generar presión.",duracion:"20 min",material:"Putter, bolas, cronómetro",variantes:["Con público", "Con música de tensión", "Embocar 5 seguidos"],tags:["presión", "putt", "consecuencia"]},
{id:"e025",grupo:"cadete",trimestre:4,semana:25,categoria:"Swing",nombre:"La Tabla de Distancias Eagles",objetivo:"Conocer las distancias propias con cada palo.",descripcion:"5 golpes con cada hierro (9, 8, 7, 6, PW). Se anota la distancia media con cada uno. Tabla personal del alumno.",duracion:"30 min",material:"Hierros 6-9 y PW, bolas, medidor",variantes:["Con app de medición", "Comparar entre alumnos", "Registrar en ficha individual"],tags:["distancias", "tabla", "hierros"]},
{id:"e026",grupo:"cadete",trimestre:4,semana:26,categoria:"Chip",nombre:"El Up & Down Eagles",objetivo:"Primer intento de up & down real.",descripcion:"Desde 5 posiciones alrededor del green: chip + putt en 2. Se registran los resultados. Objetivo: 2/5 up&downs.",duracion:"25 min",material:"Wedge, putter, bolas, 5 posiciones marcadas",variantes:["Solo chip", "Solo posiciones fáciles", "Comparar sesión a sesión"],tags:["up&down", "chip", "putt", "registro"]},
{id:"e027",grupo:"cadete",trimestre:4,semana:27,categoria:"Reglas",nombre:"La Etiqueta en el Campo",objetivo:"Aprender y practicar la etiqueta de golf.",descripcion:"10 normas de etiqueta: silencio en el swing del otro, reparar pitchmarks, no pisar líneas de putt, paso rápido.",duracion:"60 min",material:"Set completo, tarjeta de etiqueta",variantes:["Con semáforo verde/rojo por conducta", "Autoevaluación", "Vídeo de conducta correcta vs incorrecta"],tags:["etiqueta", "campo", "conducta", "respeto"]},
{id:"e028",grupo:"cadete",trimestre:4,semana:28,categoria:"Juego",nombre:"El Torneo de Fin de Curso Eagles",objetivo:"Cierre del curso con competición y celebración.",descripcion:"Torneo de 9 hoyos con tarjeta real. Ceremonia con trofeos. Diploma de Eagles Golfista.",duracion:"120 min",material:"Set completo, trofeos, diplomas",variantes:["Con padres", "Merienda posterior", "Video resumen del curso"],tags:["torneo", "cierre", "trofeos", "diploma"]},
{id:"e029",grupo:"cadete",trimestre:1,semana:4,categoria:"Coordinación",nombre:"El Malabarista de Hierros",objetivo:"Desarrollar sensibilidad con el palo.",descripcion:"Equilibrar el palo en la palma abierta. El que lo mantiene más tiempo sin que caiga gana. Luego alternar manos.",duracion:"10 min",material:"Hierro 7 o 8",variantes:["En movimiento", "Mano no dominante", "Caminando"],tags:["equilibrio", "palo", "sensación"]},
{id:"e030",grupo:"cadete",trimestre:2,semana:10,categoria:"Swing",nombre:"El Swing de Una Mano",objetivo:"Desarrollar la mano líder y la seguidora.",descripcion:"Swing completo solo con la mano izquierda (diestros). 20 repeticiones. Luego solo con la derecha. Finalmente con las dos.",duracion:"20 min",material:"Hierro 7, bolas foam",variantes:["Sin bola", "Con bola suave", "Identificar cuál es más difícil"],tags:["una mano", "swing", "dominancia"]},
{id:"e031",grupo:"cadete",trimestre:1,semana:6,categoria:"Putting",nombre:"El Metrónomo del Putt",objetivo:"Establecer un ritmo constante en el putt.",descripcion:"Con metrónomo a 60 BPM, el alumno sincroniza su putt: backswing en un tic, downswing en el siguiente.",duracion:"15 min",material:"Putter, bolas, móvil con app metrónomo",variantes:["A 80 BPM", "Con ojos cerrados", "Grabando el putt"],tags:["putt", "metrónomo", "ritmo"]},
{id:"e032",grupo:"cadete",trimestre:2,semana:12,categoria:"Chip",nombre:"El Chip sin Muñecas",objetivo:"Eliminar el uso de muñecas en el chip.",descripcion:"Goma elástica alrededor de los antebrazos. Si las muñecas se activan, la goma lo delata. 20 chips controlados.",duracion:"15 min",material:"Wedge, bolas, goma elástica",variantes:["Con guía de alineación", "Sin goma al final", "Video del movimiento de muñecas"],tags:["chip", "muñecas", "goma", "técnica"]},
{id:"e033",grupo:"cadete",trimestre:3,semana:16,categoria:"Reglas",nombre:"Tarjeta de Score Real",objetivo:"Aprender a rellenar correctamente la tarjeta de score.",descripcion:"Todos los campos de la tarjeta: handicap, stroke index, neto, bruto, out, in, total. Rellenan una tarjeta inventada.",duracion:"20 min",material:"Tarjetas de score reales, bolígrafos",variantes:["Tarjeta de torneo oficial", "Calcular Stableford", "Comparar tarjetas entre alumnos"],tags:["tarjeta", "score", "Stableford"]},
{id:"e034",grupo:"cadete",trimestre:3,semana:17,categoria:"Mental",nombre:"Mi Objetivo del Día",objetivo:"Aprender a fijar objetivos de proceso antes de entrenar.",descripcion:"Cada alumno escribe su objetivo del día en una pizarra. Al final evalúa si lo consiguió.",duracion:"10 min",material:"Pizarra, rotuladores",variantes:["Objetivo técnico vs actitud", "Compartirlo con el grupo", "Registro semanal"],tags:["objetivos", "proceso", "pizarra"]},
{id:"e035",grupo:"cadete",trimestre:3,semana:19,categoria:"Swing",nombre:"El Swing en L",objetivo:"Dominar el medio swing (L-to-L) para mayor control.",descripcion:"Swing donde los brazos forman una L en el backswing y otra L en el follow-through. Control de distancia y dirección.",duracion:"20 min",material:"PW o 9-hierro, bolas",variantes:["Con bola a 50m", "Medir consistencia", "Video de lado para verificar la L"],tags:["medio swing", "L-to-L", "control"]},
{id:"e036",grupo:"cadete",trimestre:4,semana:21,categoria:"Chip",nombre:"La Zona de Chip Landing",objetivo:"Predecir y controlar el punto exacto de aterrizaje.",descripcion:"Cartulina de 30×30cm como zona de aterrizaje a 1/3 del objetivo. El alumno predice en voz alta dónde caerá la bola.",duracion:"20 min",material:"Wedge, bolas, cartulinas de colores",variantes:["Zona más pequeña", "Varios colores = varios objetivos", "Predicción y resultado anotados"],tags:["chip", "aterrizaje", "predicción", "zona"]},
{id:"e037",grupo:"cadete",trimestre:4,semana:22,categoria:"Putting",nombre:"La Serie de Putts Cortos",objetivo:"Dominar los putts de 1 a 3 metros.",descripcion:"Serie escalonada: 5 putts de 1m (embocar 4), 5 de 1,5m (embocar 3), 5 de 2m (embocar 2), 5 de 3m (embocar 1).",duracion:"20 min",material:"Putter, bolas, hoyo",variantes:["Con pendiente", "Variando el ángulo", "Registrar cada sesión"],tags:["putt", "progresión", "cortos", "serie"]},
{id:"e038",grupo:"cadete",trimestre:1,semana:7,categoria:"Juego",nombre:"El Campo de 6 Hoyos Mini",objetivo:"Jugar un recorrido sencillo aprendiendo la secuencia de juego.",descripcion:"Se monta un campo de 6 mini-hoyos en el campo de prácticas: 4 par 3 cortos y 2 par 4 muy cortos.",duracion:"50 min",material:"Set junior completo, 6 banderines, tarjeta simplificada",variantes:["Match play vs profesor", "Con padres", "Fotografiar cada hoyo"],tags:["6 hoyos", "recorrido", "par 3"]},
{id:"e039",grupo:"cadete",trimestre:2,semana:14,categoria:"Coordinación",nombre:"La Escalera de Agilidad de Golf",objetivo:"Mejorar la agilidad y la preparación atlética.",descripcion:"Escalera de agilidad con ejercicios específicos de golf: pasos laterales, rotaciones de cadera, equilibrio en un pie.",duracion:"20 min",material:"Escalera de agilidad, hierro 7",variantes:["Solo los pasos", "Con el palo en las manos", "Cronometrado"],tags:["agilidad", "atletismo", "escalera", "preparación física"]},
{id:"e040",grupo:"cadete",trimestre:2,semana:15,categoria:"Swing",nombre:"El Video Análisis Eagle",objetivo:"Primer vídeo análisis del swing de cada alumno.",descripcion:"Se graba el swing de frente y de lado. El profesor hace un análisis básico señalando un punto positivo y uno de mejora.",duracion:"30 min",material:"Móvil/tablet, hierro 7, bolas",variantes:["Con app de análisis", "Comparar con pro", "Seguimiento en el siguiente trimestre"],tags:["video", "análisis", "feedback", "swing"]},
{id:"e041",grupo:"cadete",trimestre:3,semana:18,categoria:"Chip",nombre:"El Chip en Pendiente",objetivo:"Adaptar el chip a distintas pendientes.",descripcion:"Cuesta arriba: más loft natural. Cuesta abajo: menos loft, más rodado. Los alumnos practican desde 4 pendientes y anotan.",duracion:"20 min",material:"Wedge, 9-hierro, bolas, pendientes del campo",variantes:["Cuesta abajo con árbol delante", "Pendiente lateral", "Sin ver el objetivo"],tags:["chip", "pendiente", "adaptación"]},
{id:"e042",grupo:"cadete",trimestre:4,semana:23,categoria:"Mental",nombre:"El Diario del Golfista",objetivo:"Reflexionar sobre el aprendizaje semanalmente.",descripcion:"Cada alumno tiene un mini-diario donde anota: qué aprendió, qué salió bien, qué quiere mejorar. Se revisa al inicio de cada sesión.",duracion:"5 min",material:"Libreta pequeña, bolígrafo",variantes:["En formato digital", "Compartir una entrada con el grupo", "El profesor responde por escrito"],tags:["diario", "reflexión", "aprendizaje"]},
{id:"e043",grupo:"cadete",trimestre:4,semana:25,categoria:"Juego",nombre:"El Match Play Eagles",objetivo:"Aprender el formato match play.",descripcion:"Torneo de match play hoyo a hoyo entre los alumnos. El profesor explica el formato y actúa de árbitro.",duracion:"90 min",material:"Set completo, tarjeta de match play",variantes:["Por parejas", "Better ball", "Con handicap de hoyos"],tags:["match play", "torneo", "hoyo a hoyo"]},
{id:"e044",grupo:"cadete",trimestre:1,semana:5,categoria:"Putting",nombre:"Putting con Ambas Manos",objetivo:"Desarrollar sensibilidad en ambas manos para el putt.",descripcion:"15 putts con la mano derecha sola, 15 con la izquierda, 20 con las dos. Mejora la sensibilidad individual de cada mano.",duracion:"20 min",material:"Putter, bolas, hoyo",variantes:["Ojos cerrados", "Desde distintas distancias", "Registrar aciertos por mano"],tags:["putt", "manos", "sensibilidad", "bilateral"]},
{id:"e045",grupo:"cadete",trimestre:2,semana:11,categoria:"Reglas",nombre:"¿Qué Palo Eliges?",objetivo:"Aprender a elegir el palo correcto según la situación.",descripcion:"El profesor presenta 6 situaciones: distancia al green, posición de la bola, pendiente, viento. Los alumnos votan qué palo elegirían.",duracion:"20 min",material:"Set completo, tarjetas de situaciones",variantes:["Sin ver el palo del profesor", "Situaciones de campo real", "Con debate posterior"],tags:["elección de palo", "situación", "decisión", "estrategia"]},
{id:"e046",grupo:"cadete",trimestre:3,semana:20,categoria:"Chip",nombre:"El Pitch vs el Chip",objetivo:"Diferenciar y ejecutar correctamente pitch y chip.",descripcion:"Comparación práctica: chip (bola baja, más rodado) vs pitch (bola alta, parada rápida). El alumno elige cuál usar.",duracion:"20 min",material:"Wedge, 9-hierro, bolas, flag como obstáculo",variantes:["Sin obstáculo", "Con obstáculo grande", "El alumno propone la situación"],tags:["pitch", "chip", "diferencia", "elección"]},
{id:"e047",grupo:"cadete",trimestre:3,semana:21,categoria:"Swing",nombre:"El Tempo 3:1",objetivo:"Interiorizar el ratio correcto de tempo en el swing.",descripcion:"El backswing dura 3 veces más que el downswing. Con metrónomo a 80 BPM: 3 tics hacia atrás, 1 tic hacia la bola.",duracion:"15 min",material:"Hierro 7, bolas, metrónomo app",variantes:["Con bola", "Grabando el tempo", "Comparar con PGA pro en YouTube"],tags:["tempo", "3:1", "ritmo", "metrónomo"]},
{id:"e048",grupo:"cadete",trimestre:4,semana:26,categoria:"Juego",nombre:"9 Hoyos por Primera Vez",objetivo:"Completar los 9 hoyos del campo real.",descripcion:"Primera vuelta de 9 hoyos en el campo real. Tarjeta, reglas básicas y etiqueta. El profesor acompaña como caddie-maestro.",duracion:"120 min",material:"Set junior completo, tarjeta, zapatos de golf",variantes:["Con caddie adulto", "Fotos de cada hoyo", "Comentarios al final"],tags:["9 hoyos", "campo real", "primera vez", "experiencia"]},
{id:"e049",grupo:"cadete",trimestre:1,semana:8,categoria:"Chip",nombre:"El Chip con Tee",objetivo:"Establecer un contacto limpio y consistente en el chip.",descripcion:"La bola sobre un tee muy bajo facilita el contacto limpio y permite sentir el golpe descendente sin miedo a topar.",duracion:"15 min",material:"Wedge, 9-hierro, bolas, tees bajos",variantes:["Tee medio", "Tee normal para comparar", "Sin tee al final"],tags:["chip", "tee", "contacto", "confianza"]},
{id:"e050",grupo:"cadete",trimestre:4,semana:28,categoria:"Mental",nombre:"El Balance del Año Eagle",objetivo:"Reflexión final sobre el progreso del curso.",descripcion:"El profesor revisa con cada alumno los vídeos del inicio y del final del curso. Se comparan las mejoras y se establecen objetivos.",duracion:"30 min",material:"Videos del inicio y fin del curso, ficha de objetivos",variantes:["Con padres presentes", "Carta al yo del año siguiente", "Diploma personalizado"],tags:["balance", "reflexión", "progreso", "cierre"]},
{id:"b001",grupo:"alevin",trimestre:1,semana:1,categoria:"Swing",nombre:"Análisis de Swing con Vídeo",objetivo:"Identificar los 3 errores principales del propio swing.",descripcion:"Grabación del swing de frente, lateral y desde atrás. El alumno analiza con el profesor los 3 aspectos a mejorar. Plan de corrección personalizado.",duracion:"30 min",material:"Hierro 7, móvil/tablet, app de análisis",variantes:["Comparar con referencias de tour", "Análisis en pareja", "Repetir al final del curso"],tags:["video", "análisis", "swing", "corrección"]},
{id:"b002",grupo:"alevin",trimestre:1,semana:2,categoria:"Putting",nombre:"La Zona de 3 metros",objetivo:"Dominar los putts de media distancia con consistencia.",descripcion:"10 putts desde 3 metros desde 6 posiciones distintas alrededor del hoyo. Objetivo: embocar mínimo 4/10 desde cada posición.",duracion:"25 min",material:"Putter, bolas, hoyo, registro",variantes:["Solo posiciones difíciles", "Con pendiente", "Competición entre alumnos"],tags:["putt", "3 metros", "progresión", "registro"]},
{id:"b003",grupo:"alevin",trimestre:1,semana:3,categoria:"Chip",nombre:"El Chip de Competición",objetivo:"Presión en el chip simulando situaciones de torneo.",descripcion:"Circuito de 9 chips desde distintas posiciones alrededor del green. Puntuación: bola a menos de 1m=3pts, 2m=2pts, en green=1pt.",duracion:"25 min",material:"Wedges, bolas, 9 posiciones marcadas",variantes:["Con tiempo límite", "En parejas compitiendo", "Handicap entre alumnos"],tags:["chip", "competición", "puntuación", "presión"]},
{id:"b004",grupo:"alevin",trimestre:1,semana:4,categoria:"Juego Largo",nombre:"La Distancia de Control",objetivo:"Dominar golpes al 50%, 75% y 100% de fuerza.",descripcion:"Con el 7-hierro, practica golpes a 3 velocidades: swing corto (50%), normal (75%) y máximo (100%). Anota las distancias de cada uno.",duracion:"20 min",material:"Hierro 7, bolas, medidor de distancias",variantes:["Con PW para finesse", "Con driver", "Comparar entre alumnos"],tags:["distancia", "control", "velocidad"]},
{id:"b005",grupo:"alevin",trimestre:1,semana:5,categoria:"Mental",nombre:"La Rutina Pre-Shot Birdie",objetivo:"Establecer y automatizar una rutina pre-shot completa.",descripcion:"5 pasos con tiempo de 25 segundos total. Se cronometra cada golpe durante la sesión. La rutina se personaliza para cada alumno.",duracion:"20 min",material:"Palos, bolas, cronómetro",variantes:["Con público", "En situación de competición simulada", "Vídeo de la rutina"],tags:["rutina", "pre-shot", "concentración", "25 segundos"]},
{id:"b006",grupo:"alevin",trimestre:1,semana:6,categoria:"Juego Largo",nombre:"El Control del Driver",objetivo:"Mejorar la precisión y consistencia con el driver.",descripcion:"Fairway imaginario de 30 metros de ancho marcado. 20 drives: se cuenta el % de fairways. Objetivo: 60% de fairways.",duracion:"25 min",material:"Driver, tees, bolas, conos marcando el fairway",variantes:["Fairway de 20m", "Fairway estrecho de 15m", "Con viento cruzado"],tags:["driver", "fairway", "precisión", "porcentaje"]},
{id:"b007",grupo:"alevin",trimestre:1,semana:7,categoria:"Putting",nombre:"Los Putts de 5 Metros",objetivo:"Mejorar la distancia y dirección en putts largos.",descripcion:"Series de 5 putts desde 5 metros. Objetivo: dejar todas dentro de un círculo de 60cm. Se trabaja la velocidad y la pendiente.",duracion:"20 min",material:"Putter, bolas, círculo marcado",variantes:["Desde 7m", "Con doble pendiente", "Registrar % en zona objetivo"],tags:["putt", "5 metros", "velocidad", "distancia larga"]},
{id:"b008",grupo:"alevin",trimestre:1,semana:8,categoria:"Reglas",nombre:"Test Reglas Nivel Birdie",objetivo:"Conocer las reglas de competición básicas.",descripcion:"Test de 15 preguntas: zonas de penalización, drop, embedded ball, casual water en green, etc. Corrección en grupo.",duracion:"25 min",material:"Test impreso, reglamento RFEG",variantes:["Test oral", "Situaciones en el campo", "Quiz app competitivo"],tags:["reglas", "test", "competición"]},
{id:"b009",grupo:"alevin",trimestre:2,semana:9,categoria:"Juego Largo",nombre:"El Approach a Green",objetivo:"Dominar el golpe de approach a distintas distancias.",descripcion:"Approach shots desde 100m, 80m, 60m y 40m al green. Selección de palo y objetivo en el green. Registro de greens en regulación.",duracion:"25 min",material:"PW, 9-hierro, 8-hierro, bolas, green real",variantes:["Con agua delante", "Con bunker frontal", "Bandera en posición difícil"],tags:["approach", "GIR", "distancias", "selección de palo"]},
{id:"b010",grupo:"alevin",trimestre:2,semana:10,categoria:"Chip",nombre:"El Bunker de Competición",objetivo:"Salida de bunker consistente en situación de presión.",descripcion:"10 salidas de bunker desde posiciones estándar. Puntuación: fuera del bunker=1pt, en green=2pts, dentro de 3m=3pts.",duracion:"25 min",material:"SW, bolas, bunker, hoja de registro",variantes:["Bola enterrada", "Bunker a 30m del hoyo", "Pendiente de salida difícil"],tags:["bunker", "competición", "puntuación", "presión"]},
{id:"b011",grupo:"alevin",trimestre:2,semana:11,categoria:"Mental",nombre:"El Proceso vs el Resultado",objetivo:"Aprender a separar el proceso del resultado en competición.",descripcion:"Sesión teórica (15 min) + práctica (15 min). Se juegan 5 hoyos evaluando solo el proceso, sin mirar el score.",duracion:"30 min",material:"Set completo, hoja de evaluación de proceso",variantes:["Solo un hoyo", "Con un compañero evaluando el proceso", "Score vs proceso al final"],tags:["proceso", "resultado", "mental", "evaluación"]},
{id:"b012",grupo:"alevin",trimestre:2,semana:12,categoria:"Swing",nombre:"El Draw Intencional",objetivo:"Producir un draw controlado de forma repetible.",descripcion:"Alineación cerrada del cuerpo, cara apuntando al objetivo. Camino del swing de dentro a fuera. 20 repeticiones.",duracion:"25 min",material:"Hierro 7, driver, bolas, marcadores de alineación",variantes:["Solo con hierros", "Con driver", "Midiendo la curvatura conseguida"],tags:["draw", "intencional", "alineación", "curva"]},
{id:"b013",grupo:"alevin",trimestre:2,semana:13,categoria:"Juego Largo",nombre:"El Golpe desde el Rough",objetivo:"Gestionar diferentes situaciones de rough.",descripcion:"Rough largo: hierro más corto, swing más vertical. Rough húmedo: añadir club. Rough en pendiente: ajustar postura.",duracion:"25 min",material:"Hierros 5-8, bolas, zona de rough variada",variantes:["Rough entre 2-3cm", "Rough muy largo 6cm+", "Sin ver el objetivo"],tags:["rough", "gestión", "vertical", "adaptación"]},
{id:"b014",grupo:"alevin",trimestre:2,semana:14,categoria:"Putting",nombre:"El Putt de Zurdo",objetivo:"Desarrollar la mano no dominante para mayor sensibilidad.",descripcion:"Con el putter al revés (mano izquierda arriba para diestros), se practican 30 putts desde 1-3 metros.",duracion:"15 min",material:"Putter, bolas, hoyos",variantes:["Con putter de zurdo si disponible", "Solo mano no dominante", "Comparar accuracy con normal"],tags:["putt", "zurdo", "mano no dominante", "sensibilidad"]},
{id:"b015",grupo:"alevin",trimestre:2,semana:15,categoria:"Juego",nombre:"El Torneo Stableford Birdie",objetivo:"Competir en formato Stableford por primera vez.",descripcion:"9 hoyos en formato Stableford. Explicación del sistema de puntos: doble bogey=0, bogey=1, par=2, birdie=3, eagle=4.",duracion:"120 min",material:"Set completo, tarjeta Stableford",variantes:["Solo 6 hoyos", "Con handicap completo", "Equipos de 2"],tags:["Stableford", "torneo", "puntos", "formato"]},
{id:"b016",grupo:"alevin",trimestre:3,semana:16,categoria:"Swing",nombre:"El Fade Intencional",objetivo:"Producir un fade controlado de forma repetible.",descripcion:"Alineación abierta del cuerpo, cara apuntando al objetivo. Swing de fuera a dentro ligeramente. 20 repeticiones.",duracion:"25 min",material:"Hierro 7, bolas, marcadores de alineación",variantes:["Solo con hierros", "Con driver", "Situaciones de campo que requieren fade"],tags:["fade", "intencional", "alineación", "curvatura"]},
{id:"b017",grupo:"alevin",trimestre:3,semana:17,categoria:"Chip",nombre:"El Pitch de Alta Trayectoria",objetivo:"Dominar el pitch con máxima altura y parada rápida.",descripcion:"Con SW cara muy abierta, pitch a 20-30m que suba alto y pare rápido. 15 repeticiones desde rough y fairway.",duracion:"25 min",material:"SW o LW, bolas, zona de práctica",variantes:["Sobre un obstáculo", "Sobre bunker", "Con viento en contra"],tags:["pitch", "altura", "parada", "cara abierta"]},
{id:"b018",grupo:"alevin",trimestre:3,semana:18,categoria:"Juego Largo",nombre:"El Golpe Bajo el Viento",objetivo:"Ejecutar punch shot bajo el viento y bajo obstáculos.",descripcion:"Punch shot: pelota atrasada, manos adelantadas, swing 3/4, acabado bajo. Bola baja que penetra el viento. 20 repeticiones.",duracion:"20 min",material:"Hierros 6-8, bolas, campo de prácticas",variantes:["Con obstáculo bajo delante", "Con viento real", "Distancias variables"],tags:["punch shot", "viento", "bola baja", "3/4"]},
{id:"b019",grupo:"alevin",trimestre:3,semana:19,categoria:"Putting",nombre:"La Lectura de 3 Puntos",objetivo:"Sistema de lectura de green en 3 puntos de vista.",descripcion:"Leer el putt desde: (1) detrás de la bola, (2) lateral, (3) desde el hoyo. Aplicar en 10 putts de 3-5m con romper.",duracion:"25 min",material:"Putter, bolas, green con pendiente",variantes:["Solo la lectura sin golpear", "Con compañero leyendo distinto", "Anotar predicción vs resultado"],tags:["lectura", "3 puntos", "green", "pendiente"]},
{id:"b020",grupo:"alevin",trimestre:3,semana:20,categoria:"Mental",nombre:"El Semáforo Emocional",objetivo:"Aplicar el sistema de gestión emocional en el campo.",descripcion:"Durante un recorrido de 6 hoyos, el alumno identifica en qué fase del semáforo está tras cada golpe malo.",duracion:"90 min",material:"Set completo, ficha del semáforo",variantes:["Ficha de autoevaluación", "Con compañero que también evalúa", "Análisis post-ronda"],tags:["semáforo", "emocional", "gestión", "campo"]},
{id:"b021",grupo:"alevin",trimestre:3,semana:21,categoria:"Juego Largo",nombre:"El Juego de Approach 50/50",objetivo:"Mejorar el porcentaje de GIR.",descripcion:"Desde 12 posiciones a distintas distancias del green, el alumno lanza approach shots. Objetivo: llegar al green en al menos 6 de 12.",duracion:"25 min",material:"Hierros 7-PW, bolas, green real",variantes:["Solo distancias largas", "Con obstáculo frontal", "Medir distancia al hoyo"],tags:["approach", "GIR", "50%", "registro"]},
{id:"b022",grupo:"alevin",trimestre:3,semana:22,categoria:"Reglas",nombre:"Situaciones Avanzadas de Campo",objetivo:"Resolver situaciones complejas sin árbitro.",descripcion:"El profesor plantea 8 situaciones en el campo real. Los alumnos resuelven aplicando el reglamento.",duracion:"30 min",material:"Reglamento RFEG, campo real",variantes:["En parejas", "Con árbitro rotativo", "Situaciones de torneo real"],tags:["reglas", "situaciones", "campo real", "avanzado"]},
{id:"b023",grupo:"alevin",trimestre:4,semana:23,categoria:"Swing",nombre:"El Análisis Trimestral de Swing",objetivo:"Comparar la evolución del swing con el inicio de curso.",descripcion:"Se graba el swing y se compara con el vídeo del inicio. El alumno identifica las mejoras y los puntos pendientes.",duracion:"30 min",material:"Vídeo inicio de curso, hierro 7, móvil",variantes:["Con padres viendo", "Análisis conjunto", "Nuevo plan escrito"],tags:["análisis", "comparativa", "evolución", "vídeo"]},
{id:"b024",grupo:"alevin",trimestre:4,semana:24,categoria:"Juego",nombre:"El Recorrido Completo Birdie",objetivo:"Completar 18 hoyos por primera vez.",descripcion:"Primera ronda de 18 hoyos. Tarjeta real, etiqueta, reglas. El profesor acompaña los primeros 9 hoyos.",duracion:"240 min",material:"Set completo, tarjeta real",variantes:["Con caddie adulto", "Fotos y video de momentos clave", "9+9 en dos días"],tags:["18 hoyos", "primera vez", "ronda completa"]},
{id:"b025",grupo:"alevin",trimestre:4,semana:25,categoria:"Putting",nombre:"El Torneo de Putting Birdie",objetivo:"Competición de putting con presión real.",descripcion:"Torneo de 18 hoyos de putting. Formato stroke play real. Se publica clasificación. Premio al ganador y al más mejorado.",duracion:"60 min",material:"Putters, bolas, tarjeta de putting, trofeo",variantes:["Con handicap", "Match play knock-out", "Por parejas scramble"],tags:["torneo", "putting", "clasificación", "presión"]},
{id:"b026",grupo:"alevin",trimestre:4,semana:26,categoria:"Chip",nombre:"El Up & Down de Campeonato",objetivo:"Up & down desde 9 posiciones difíciles.",descripcion:"9 posiciones muy difíciles: rough largo, bunker a 30m, pendiente cuesta abajo, etc. Objetivo: 3 de 9 up&downs.",duracion:"30 min",material:"Wedges, putter, bolas, 9 posiciones marcadas",variantes:["Solo posiciones de bunker", "Solo rough", "Competición entre dos alumnos"],tags:["up&down", "difícil", "posiciones", "superación"]},
{id:"b027",grupo:"alevin",trimestre:4,semana:27,categoria:"Mental",nombre:"El Plan de Ronda",objetivo:"Preparar mentalmente una ronda antes de jugarla.",descripcion:"El día antes de un torneo: el alumno hace un plan escrito hoyo a hoyo. Incluye zona de seguridad y zona de riesgo de cada hoyo.",duracion:"30 min",material:"Mapa del campo, bolígrafo, plantilla de plan de ronda",variantes:["Solo los 3 hoyos más difíciles", "Visualización de cada hoyo", "Compartir con el profesor"],tags:["plan de ronda", "preparación", "mental", "estrategia"]},
{id:"b028",grupo:"alevin",trimestre:4,semana:28,categoria:"Juego",nombre:"El Torneo de Fin de Curso Birdie",objetivo:"Torneo de cierre de temporada con reglas federadas.",descripcion:"Torneo de 18 hoyos con reglas federadas, árbitro externo, horario de torneo real. Ceremonia de entrega con trofeos y diplomas.",duracion:"240 min",material:"Set completo, trofeos, diplomas",variantes:["Solo 9 hoyos si no da tiempo", "Con padres en el hoyo 18", "Cena de equipo posterior"],tags:["torneo", "cierre", "federadas", "diploma"]},
{id:"b029",grupo:"alevin",trimestre:1,semana:3,categoria:"Juego Largo",nombre:"El Hierro de Partida",objetivo:"Dominar el uso de hierros largos en el tee.",descripcion:"En hoyos difíciles, el driver no siempre es la mejor opción. Se practica la salida con 4-hierro, 5-hierro y híbrido buscando el fairway.",duracion:"20 min",material:"Hierros 4-5, híbrido, conos, bolas",variantes:["Con pasillo de 20m", "Con obstáculo a 200m", "Comparar distancia vs fairway ganado"],tags:["hierro de salida", "fairway", "seguridad", "táctica"]},
{id:"b030",grupo:"alevin",trimestre:2,semana:9,categoria:"Coordinación",nombre:"Preparación Física del Golfista",objetivo:"Desarrollar movilidad y fuerza específica para el golf.",descripcion:"Rutina de 20 min: hip hinge 3×15, rotación torácica 3×10, plank lateral 2×30seg, band pull-apart 3×15.",duracion:"20 min",material:"Bandas elásticas, esterilla, palo de golf",variantes:["Con pelotas de pilates", "Solo la parte de movilidad", "Pre-ronda de 10 min"],tags:["físico", "movilidad", "fuerza", "core"]},
{id:"b031",grupo:"alevin",trimestre:2,semana:13,categoria:"Putting",nombre:"El Putting de Presión Birdie",objetivo:"Mantener el ritmo de putt bajo presión.",descripcion:"El alumno debe embocar 5 putts seguidos desde 1,5 metros. Si falla uno, vuelve a empezar.",duracion:"20 min",material:"Putter, bolas, hoyo, registro",variantes:["Desde 2m", "Con observador", "En parejas compitiendo"],tags:["presión", "putt", "5 seguidos", "resistencia"]},
{id:"b032",grupo:"alevin",trimestre:3,semana:15,categoria:"Swing",nombre:"El Driver Controlado",objetivo:"Priorizar la dirección sobre la distancia con el driver.",descripcion:"Driver al 80%: swing controlado, finish equilibrado. Se compara la dispersión con el driver al 100%.",duracion:"20 min",material:"Driver, bolas, conos en fairway imaginario",variantes:["Con cronómetro de vuelo", "App de dispersión", "Al 70% también"],tags:["driver", "control", "80%", "dispersión"]},
{id:"b033",grupo:"alevin",trimestre:1,semana:5,categoria:"Chip",nombre:"El Pitch de 40 Metros",objetivo:"Dominar el pitch como golpe de aproximación real.",descripcion:"Pitch de 40m al green. Swing de ¾, cara cuadrada, punto de caída 2/3 del objetivo. 20 repeticiones desde hierba corta y rough.",duracion:"20 min",material:"PW o 9-hierro, bolas, green a 40m",variantes:["Desde 30m", "Desde 50m", "Con bandera en borde frontal"],tags:["pitch", "40 metros", "approach", "¾ swing"]},
{id:"b034",grupo:"alevin",trimestre:2,semana:10,categoria:"Juego",nombre:"Matchplay Birdie Interno",objetivo:"Competición de match play entre compañeros.",descripcion:"Todos contra todos en match play hoyo a hoyo con handicap. El profesor actúa de árbitro. Cuadro de eliminatorias.",duracion:"120 min",material:"Set completo, cuadro de eliminatorias",variantes:["Solo 9 hoyos", "Mejor bola por parejas", "Ronda robin"],tags:["matchplay", "eliminatorias", "handicap", "competición"]},
{id:"b035",grupo:"alevin",trimestre:3,semana:17,categoria:"Reglas",nombre:"El Árbitro por un Día",objetivo:"Aplicar las reglas desde el rol de árbitro.",descripcion:"Los alumnos se turnan como árbitros durante una ronda de 6 hoyos. El árbitro debe resolver 3 situaciones reales.",duracion:"90 min",material:"Reglamento RFEG, campo real",variantes:["Con libro de reglas siempre", "Sin libro de memoria", "Árbitro en parejas"],tags:["árbitro", "reglas", "rol", "situaciones reales"]},
{id:"b036",grupo:"alevin",trimestre:4,semana:21,categoria:"Juego Largo",nombre:"El Juego de Hierros Largos",objetivo:"Dominar los hierros 4 y 5 para situaciones específicas.",descripcion:"Hierro 4 y 5 desde el suelo (sin tee): 20 golpes con cada uno anotando dirección y distancia.",duracion:"25 min",material:"Hierros 4 y 5, bolas, zona de práctica",variantes:["Con tee bajo primero", "Comparar con híbrido", "Situaciones de campo específicas"],tags:["hierros largos", "4-hierro", "5-hierro", "dificultad"]},
{id:"b037",grupo:"alevin",trimestre:4,semana:22,categoria:"Mental",nombre:"El Diario de Competición",objetivo:"Analizar cada ronda para extraer aprendizajes.",descripcion:"Después de cada torneo: 3 cosas bien, 1 área de mejora, 1 decisión que cambiaría. El profesor añade comentarios.",duracion:"15 min",material:"Diario de competición, bolígrafo",variantes:["En formato digital", "Compartir con padres", "Revisión trimestral del diario"],tags:["diario", "análisis", "post-ronda", "reflexión"]},
{id:"b038",grupo:"alevin",trimestre:2,semana:11,categoria:"Swing",nombre:"La Alineación Perfecta",objetivo:"Establecer una rutina de alineación precisa y repetible.",descripcion:"Varillas de alineación en el suelo: una para los pies, otra para la cara del palo. 20 golpes practicando la rutina desde atrás del objetivo.",duracion:"20 min",material:"Hierro 7, bolas, 2 varillas de alineación",variantes:["Sin varillas para ver si se alinea igual", "Video desde detrás", "Con objetivo a distancia variable"],tags:["alineación", "varillas", "rutina", "precisión"]},
{id:"b039",grupo:"alevin",trimestre:3,semana:18,categoria:"Chip",nombre:"El Bunker de Pendiente",objetivo:"Salir de bunkers con pendientes cuesta abajo y arriba.",descripcion:"Cuesta arriba: abrir más la cara, stance más cerrada. Cuesta abajo: cerrar ligeramente la cara, peso adelante. 10 repeticiones de cada.",duracion:"25 min",material:"SW, bolas, bunker con pendientes",variantes:["Solo cuesta abajo", "Con hoyo muy cerca del bunker", "Con diferentes profundidades de arena"],tags:["bunker", "pendiente", "cuesta abajo", "cuesta arriba"]},
{id:"b040",grupo:"alevin",trimestre:1,semana:7,categoria:"Putting",nombre:"El Putt de 10 Metros",objetivo:"Gestionar el putt largo para llegar cerca del hoyo.",descripcion:"Desde 10 metros, el objetivo no es embocar sino dejar la bola en zona gimme (60cm del hoyo). 15 putts registrados.",duracion:"20 min",material:"Putter, bolas, zona marcada de 60cm",variantes:["Desde 12m", "Con pendiente fuerte", "Registro de resultados semanales"],tags:["putt largo", "10 metros", "gimme", "3-putt"]},
{id:"b041",grupo:"alevin",trimestre:2,semana:14,categoria:"Juego Largo",nombre:"El Golpe de Salida Controlada",objetivo:"Dominar la salida de tee con diferentes palos.",descripcion:"Análisis de 3 tipos de hoyo: estrecho, largo, dogleg. Para cada tipo: qué palo, a qué zona, con qué trayectoria. Práctica simulada.",duracion:"25 min",material:"Driver, 3-madera, 5-hierro, bolas, conos",variantes:["Solo dogleg", "Con obstáculos simulados", "Game plan escrito"],tags:["salida", "tee", "selección de palo", "dogleg"]},
{id:"b042",grupo:"alevin",trimestre:4,semana:24,categoria:"Coordinación",nombre:"Entreno de Velocidad de Swing",objetivo:"Desarrollar velocidad de swing progresivamente.",descripcion:"Series: 5 muy rápidos, 5 normales, 5 al ritmo del rápido. Sensación de más velocidad.",duracion:"20 min",material:"Speed sticks o palo muy ligero, hierro 7, bolas",variantes:["Con medidor de velocidad radar", "Solo la fase de acabado rápido", "En series de 3"],tags:["velocidad", "speed sticks", "rápido", "potencia"]},
{id:"b043",grupo:"alevin",trimestre:3,semana:21,categoria:"Chip",nombre:"El Phil Mickelson Flop",objetivo:"Aprender el golpe flop para parar la bola en muy poco espacio.",descripcion:"Cara muy abierta (60-70°), postura muy abierta, swing largo de fuera a dentro. La bola sube casi vertical y para en 2-3 metros.",duracion:"20 min",material:"SW o LW con mucho loft, bolas, obstáculo delante",variantes:["Con bunker delante", "Con agua delante", "Desde rough largo"],tags:["flop shot", "cara abierta", "parada", "alto riesgo"]},
{id:"b044",grupo:"alevin",trimestre:4,semana:26,categoria:"Swing",nombre:"El Swing con Viento",objetivo:"Ajustar el swing según las condiciones de viento.",descripcion:"Viento en contra: más palo, swing suave, bola baja. Viento a favor: menos palo, swing normal. Viento cruzado: apuntar compensando.",duracion:"25 min",material:"Hierros, bolas, campo abierto con viento",variantes:["Simular el viento con ventilador", "Con viento real", "Registrar la desviación"],tags:["viento", "ajuste", "bola baja", "compensación"]},
{id:"b045",grupo:"alevin",trimestre:1,semana:6,categoria:"Juego",nombre:"La Ronda de Práctica Temática",objetivo:"Practicar un aspecto concreto durante toda una ronda.",descripcion:"El alumno elige UN objetivo para la ronda. Al finalizar, evalúa cuántas veces siguió el plan.",duracion:"90 min",material:"Set completo, ficha de objetivos",variantes:["Solo los primeros 6 hoyos", "El profesor elige el objetivo", "Registro de adherencia al plan"],tags:["objetivo único", "ronda", "plan", "práctica deliberada"]},
{id:"b046",grupo:"alevin",trimestre:2,semana:12,categoria:"Putting",nombre:"El Putting Cuesta Abajo",objetivo:"Dominar el putt más difícil: cuesta abajo.",descripcion:"Putt cuesta abajo: la bola rueda más rápido, el romper se exagera. 15 putts desde 3m cuesta abajo desde distintos ángulos.",duracion:"20 min",material:"Putter, bolas, zona de green con pendiente",variantes:["Comparar con cuesta arriba", "Con velocidad de green rápido", "Desde 5m"],tags:["putt", "cuesta abajo", "velocidad", "romper"]},
{id:"b047",grupo:"alevin",trimestre:3,semana:19,categoria:"Mental",nombre:"Mi Palabra Clave",objetivo:"Establecer una palabra clave de activación pre-shot.",descripcion:"Cada alumno elige UNA palabra clave personal que lo centra antes de golpear. Se practica durante 10 golpes repetiéndola en voz alta.",duracion:"15 min",material:"Palos, bolas",variantes:["Palabra en otro idioma", "Frase corta de 2 palabras", "Gesto físico como gatillo"],tags:["palabra clave", "gatillo", "mental", "activación"]},
{id:"b048",grupo:"alevin",trimestre:4,semana:23,categoria:"Juego Largo",nombre:"El Segundo Golpe en Par 5",objetivo:"Gestionar el segundo golpe de un par 5 inteligentemente.",descripcion:"No siempre hay que ir al green en 2. Se practican las dos opciones y se calcula el score esperado.",duracion:"25 min",material:"Madera 3, híbrido, hierros, bolas",variantes:["Con agua a 80m del green", "Calculando score esperado", "Game plan escrito del par 5"],tags:["par 5", "segundo golpe", "gestión", "lay up"]},
{id:"b049",grupo:"alevin",trimestre:4,semana:27,categoria:"Chip",nombre:"El Short Game de Campeonato",objetivo:"Competición de short game con todas las habilidades.",descripcion:"Circuito de 9 estaciones: chip desde rough, pitch de 30m, flop, bunker, putt de 1m, putt de 3m, putt de 5m, chip de pendiente, up&down.",duracion:"40 min",material:"Wedges, putter, bolas, 9 estaciones",variantes:["Solo short game", "Por parejas", "Con tiempo límite por estación"],tags:["short game", "circuito", "campeonato", "puntuación"]},
{id:"b050",grupo:"alevin",trimestre:4,semana:28,categoria:"Mental",nombre:"Carta al Yo del Siguiente Año",objetivo:"Reflexión profunda sobre el curso y los objetivos futuros.",descripcion:"El alumno escribe una carta a su yo del año próximo. El profesor la guarda y la entrega al inicio del siguiente año.",duracion:"20 min",material:"Papel, sobre, bolígrafo",variantes:["En digital email a futuro", "Compartirla con el grupo", "Con foto del alumno dentro"],tags:["reflexión", "carta", "objetivos", "crecimiento", "cierre"]},
{id:"pa001",grupo:"benjamin",trimestre:1,semana:1,categoria:"Swing",nombre:"Biomecánica del Swing — Análisis 3D",objetivo:"Entender la biomecánica del swing a nivel técnico avanzado.",descripcion:"Análisis de los 4 pilares: plano de swing, path de la cabeza, ángulo de ataque y cara en el impacto.",duracion:"30 min",material:"Hierro 7, tecnología de análisis si disponible",variantes:["Sin tecnología solo video", "Con radar de velocidad", "Comparar con pro de tour"],tags:["biomecánica", "plano", "path", "ángulo de ataque"]},
{id:"pa002",grupo:"benjamin",trimestre:1,semana:2,categoria:"Putting",nombre:"Estadísticas de Putting",objetivo:"Medir y analizar el rendimiento en el putting.",descripcion:"Medir el % de emboques a 1m, 2m, 3m y 5m. Calcular la media de putts por ronda. Identificar la distancia más débil.",duracion:"30 min",material:"Putter, bolas, app de estadísticas o hoja Excel",variantes:["Con app de putting", "Comparar con media del Tour", "Plan mensual de mejora"],tags:["estadísticas", "putting", "porcentaje", "análisis"]},
{id:"pa003",grupo:"benjamin",trimestre:1,semana:3,categoria:"Juego Largo",nombre:"Smash Factor y Eficiencia de Impacto",objetivo:"Maximizar la eficiencia del impacto con cada palo.",descripcion:"El smash factor ideal con driver es 1.5. Se trabajan los factores que lo mejoran: sweet spot, ángulo de ataque, cara cuadrada.",duracion:"25 min",material:"Driver, 7-hierro, marcadores de impacto, bolas",variantes:["Con radar si disponible", "Solo hierros", "Comparar marcas de impacto antes/después"],tags:["smash factor", "impacto", "sweet spot", "eficiencia"]},
{id:"pa004",grupo:"benjamin",trimestre:1,semana:4,categoria:"Mental",nombre:"El Plan de Temporada",objetivo:"Establecer objetivos de la temporada de competición.",descripcion:"El alumno establece: handicap objetivo, torneos a disputar, objetivos técnicos y mentales. Plan firmado con el profesor.",duracion:"30 min",material:"Plantilla de plan de temporada, bolígrafo",variantes:["Con padres", "Revisión mensual", "Tablero visual de objetivos"],tags:["temporada", "objetivos", "plan", "competición"]},
{id:"pa005",grupo:"benjamin",trimestre:1,semana:5,categoria:"Chip",nombre:"El Short Game Test",objetivo:"Medir la situación actual del short game de forma objetiva.",descripcion:"Test estándar de short game: 18 chips desde posiciones específicas alrededor del green. Se mide la distancia de cada bola al hoyo.",duracion:"30 min",material:"Wedges, putter, bolas, medidor de distancias",variantes:["Solo bunker", "Solo putts", "Comparar con promedio del grupo"],tags:["test", "short game", "medición", "mensual"]},
{id:"pa006",grupo:"benjamin",trimestre:1,semana:6,categoria:"Juego Largo",nombre:"El Driving Range Eficiente",objetivo:"Practicar en el campo de prácticas con intención y estructura.",descripcion:"Sesión de 45 min con estructura: 10 min calentamiento, 15 min hierros, 10 min approach, 10 min driver.",duracion:"45 min",material:"Set completo, bolas",variantes:["Con registro de aciertos", "Con objetivo específico en cada palo", "Con compañero evaluando"],tags:["campo de prácticas", "estructura", "intención", "calentamiento"]},
{id:"pa007",grupo:"benjamin",trimestre:1,semana:7,categoria:"Putting",nombre:"La Línea de Putt Perfecta",objetivo:"Dominar la alineación de la cara del putter.",descripcion:"Con una línea dibujada en la bola, el alumno la alinea con la línea de putt. Verifica que la cara también está perfectamente alineada.",duracion:"20 min",material:"Putter, bolas con línea marcada, regla de putting",variantes:["Con laser de alineación", "En green con pendiente", "Velocidades de green distintas"],tags:["alineación", "línea de putt", "cara del putter", "precisión"]},
{id:"pa008",grupo:"benjamin",trimestre:1,semana:8,categoria:"Reglas",nombre:"Reglamento de Torneo",objetivo:"Conocer las condiciones locales y reglas de torneo.",descripcion:"Análisis de un cartel de condiciones locales real. El alumno lee y explica cada condición.",duracion:"30 min",material:"Cartel de condiciones locales, reglamento RFEG",variantes:["Con arbitraje real", "Preguntas sobre condiciones locales", "Comparar condiciones de varios torneos"],tags:["condiciones locales", "torneo", "reglamento", "preparación"]},
{id:"pa009",grupo:"benjamin",trimestre:2,semana:9,categoria:"Swing",nombre:"La Velocidad de Cabeza de Palo",objetivo:"Aumentar la velocidad de swing de forma controlada.",descripcion:"Series de velocidad: 5 swings al 60%, 5 al 80%, 5 al 100%, 5 al 110% (máximo). El objetivo: aumentar 5 km/h en 4 semanas.",duracion:"25 min",material:"Driver, hierros, radar de velocidad si disponible",variantes:["Con speed sticks", "Solo con hierro 7", "Warm-up dinámico antes"],tags:["velocidad", "head speed", "km/h", "potencia"]},
{id:"pa010",grupo:"benjamin",trimestre:2,semana:10,categoria:"Juego Largo",nombre:"El Approach de Torneo",objetivo:"Reproducir approach shots de competición bajo presión.",descripcion:"Desde 5 posiciones distintas (100m-140m) se lanza a un green real. Se cuenta el % de greens alcanzados.",duracion:"30 min",material:"Set de hierros, bolas, green real",variantes:["Con agua o bunker frontal", "Bandera en borde de green", "Registrar distancia exacta al hoyo"],tags:["approach", "torneo", "presión", "GIR"]},
{id:"pa011",grupo:"benjamin",trimestre:2,semana:11,categoria:"Chip",nombre:"El Short Game Score",objetivo:"Simular el short game de una ronda completa.",descripcion:"18 situaciones alrededor del green simulando una ronda: 6 chips, 6 pitches, 6 putts. Score total de la ronda de short game.",duracion:"45 min",material:"Wedges, putter, bolas, 18 posiciones marcadas",variantes:["Con el mismo recorrido siempre", "Variando las posiciones", "Comparar con compañero"],tags:["short game", "score", "18 situaciones", "ronda simulada"]},
{id:"pa012",grupo:"benjamin",trimestre:2,semana:12,categoria:"Mental",nombre:"El Pre-Torneo Mental",objetivo:"Preparación mental completa antes de una competición.",descripcion:"La noche antes del torneo: revisar plan de ronda, visualización de 5 hoyos clave, rutina de sueño. Mañana: calentamiento estructurado.",duracion:"45 min",material:"Plan de torneo, diario",variantes:["Audio guiado de visualización", "Con el profesor", "Protocolo personalizado"],tags:["pre-torneo", "mental", "visualización", "noche antes", "protocolo"]},
{id:"pa013",grupo:"benjamin",trimestre:2,semana:13,categoria:"Putting",nombre:"La Consistencia de Putting",objetivo:"Medir y mejorar la consistencia del stroke.",descripcion:"Con un putting mirror, el alumno trabaja: alineación de ojos sobre la línea, cabeza inmóvil, cara cuadrada al impacto. 50 putts de 1,5m.",duracion:"25 min",material:"Putter, bolas, putting mirror",variantes:["Sin espejo", "Con línea en el suelo", "Video desde atrás"],tags:["consistencia", "putting mirror", "alineación", "ojos"]},
{id:"pa014",grupo:"benjamin",trimestre:2,semana:14,categoria:"Swing",nombre:"El Swing de Recuperación",objetivo:"Ejecutar golpes de recuperación desde posiciones difíciles.",descripcion:"Situaciones: bajo árbol (punch shot), rough muy largo, terreno irregular, bola sobre raíz de árbol.",duracion:"30 min",material:"Set completo, campo real",variantes:["Solo situaciones de rough", "Con árbol real", "Con reglamento en mano"],tags:["recuperación", "situaciones difíciles", "punch shot", "creatividad"]},
{id:"pa015",grupo:"benjamin",trimestre:2,semana:15,categoria:"Juego",nombre:"El Torneo de Hándicap",objetivo:"Competición con hándicap completo en torneo oficial.",descripcion:"Participación en torneo federado con hándicap real. El profesor hace seguimiento y feedback post-ronda.",duracion:"240 min",material:"Set completo, tarjeta federada",variantes:["Solo 18 hoyos", "9 hoyos si es el primero", "Análisis post-torneo en grupo"],tags:["torneo", "hándicap", "federado", "oficial"]},
{id:"pa016",grupo:"benjamin",trimestre:3,semana:16,categoria:"Swing",nombre:"El Work-in del Iron Swing",objetivo:"Dominar el divot correcto con hierros medios y cortos.",descripcion:"Divot delante de la bola siempre. Se practica en zona de tierra para ver el patrón del divot. El divot ideal es delgado y alargado.",duracion:"20 min",material:"Hierros 7-9, PW, zona de tierra o arena",variantes:["En fairway real", "Video de frente y lado", "Comparar divot antes/después"],tags:["divot", "hierros", "contacto", "descendente"]},
{id:"pa017",grupo:"benjamin",trimestre:3,semana:17,categoria:"Juego Largo",nombre:"El Juego de Números — Trackman",objetivo:"Entender los datos de vuelo de la bola.",descripcion:"Si hay radar: analizar carry, distance, spin rate, launch angle y smash factor. Si no: app gratuita de análisis de vuelo.",duracion:"30 min",material:"Driver y hierros, radar/app si disponible",variantes:["Sin radar solo estimación", "Con hoja de datos completa", "Objetivos por dato"],tags:["datos", "trackman", "carry", "spin", "launch angle"]},
{id:"pa018",grupo:"benjamin",trimestre:3,semana:18,categoria:"Chip",nombre:"El Bunker Mojado y Duro",objetivo:"Gestionar el bunker con arena mojada o muy compacta.",descripcion:"Arena mojada: no hay explosión, abrir menos la cara y golpear más limpio. Arena dura: jugar como chip desde suelo. 15 repeticiones.",duracion:"25 min",material:"SW, bolas, bunker mojado/arena compacta",variantes:["Arena muy suelta", "Sin arena sobre cemento", "Bola en agua dentro del bunker"],tags:["bunker", "mojado", "duro", "adaptación"]},
{id:"pa019",grupo:"benjamin",trimestre:3,semana:19,categoria:"Mental",nombre:"El Post-Mortem de Torneo",objetivo:"Analizar un torneo completo con metodología estructurada.",descripcion:"Tras un torneo: (1) Estadísticas por categoría, (2) Decisiones clave (buenas y malas), (3) Emocional.",duracion:"45 min",material:"Tarjeta del torneo, hoja de análisis",variantes:["Con el profesor", "Video de algunos golpes", "Comparar con anterior torneo"],tags:["post-mortem", "análisis", "torneo", "estadísticas"]},
{id:"pa020",grupo:"benjamin",trimestre:3,semana:20,categoria:"Putting",nombre:"El Putting en Velocidad Alta",objetivo:"Adaptar el putt a greens rápidos.",descripcion:"Se simulan greens rápidos. El alumno aprende a reducir el backswing y a golpear muy suave. 20 putts de 3m.",duracion:"20 min",material:"Putter, bolas, green rápido o tabla inclinada",variantes:["Desde 5m", "Cuesta abajo en green rápido", "Comparar 2m en lento vs rápido"],tags:["putting", "green rápido", "velocidad alta", "adaptación"]},
{id:"pa021",grupo:"benjamin",trimestre:3,semana:21,categoria:"Juego",nombre:"Torneo Stableford Pars — 18 Hoyos",objetivo:"Competición de alto nivel con reglas y tarjeta real.",descripcion:"Torneo de 18 hoyos en Stableford con hándicap completo. Se compite contra todos los Pars y la plantilla histórica del grupo.",duracion:"240 min",material:"Set completo, tarjeta Stableford",variantes:["Con árbitro externo", "En parejas mejor bola", "Clasificación con premios"],tags:["Stableford", "18 hoyos", "hándicap", "clasificación"]},
{id:"pa022",grupo:"benjamin",trimestre:3,semana:22,categoria:"Juego Largo",nombre:"El Juego de Viento Cruzado",objetivo:"Manejar el viento lateral de ambos lados.",descripcion:"Viento de la derecha: apuntar a la derecha y dejar que la bola baje. Viento de la izquierda: al revés. Alternativa: curvar la bola contra el viento.",duracion:"25 min",material:"Hierros, driver, bolas, campo abierto",variantes:["Solo viento de la derecha", "Con bandera de referencia", "Comparar curvar vs compensar"],tags:["viento cruzado", "compensación", "curva", "lateral"]},
{id:"pa023",grupo:"benjamin",trimestre:4,semana:23,categoria:"Swing",nombre:"La Corrección del Error Principal",objetivo:"Trabajar específicamente en el error técnico más importante.",descripcion:"Basada en el vídeo análisis del trimestre anterior, se trabaja el error #1 del alumno con un drill específico. 200 repeticiones.",duracion:"45 min",material:"Palo específico según el error, bolas, drill tools",variantes:["Con espejo", "Con varilla de corrección", "Video de confirmación al final"],tags:["corrección", "error principal", "drill", "repetición"]},
{id:"pa024",grupo:"benjamin",trimestre:4,semana:24,categoria:"Juego",nombre:"El Recorrido de Match Play Pars",objetivo:"Competición de match play de 18 hoyos entre los Pars.",descripcion:"Torneo de match play. Cuadro de eliminatorias. El ganador se enfrenta al profesor en el hoyo 18. Premio especial.",duracion:"240 min",material:"Set completo, cuadro de eliminatorias, trofeo",variantes:["Por parejas mejor bola", "Hoyo 18 con galería de padres", "Nassau"],tags:["match play", "eliminatorias", "18 hoyos", "reto final"]},
{id:"pa025",grupo:"benjamin",trimestre:4,semana:25,categoria:"Mental",nombre:"El Score Mental de la Ronda",objetivo:"Evaluar el rendimiento mental durante una ronda.",descripcion:"El alumno lleva un score mental en paralelo: +1 si completó la rutina, +1 si gestionó bien una emoción, -1 si se descontroló.",duracion:"120 min",material:"Tarjeta de score mental, bolígrafo",variantes:["Solo 9 hoyos", "Con compañero que también evalúa", "Comparar score mental vs score real"],tags:["mental", "score mental", "autoevaluación", "rutina"]},
{id:"pa026",grupo:"benjamin",trimestre:4,semana:26,categoria:"Chip",nombre:"El Short Game Total Pars",objetivo:"Test final de short game con todas las habilidades.",descripcion:"Test final del año: 9 chips, 6 pitches, 3 bunkers, 9 putts. Score total máximo de 54 puntos. Comparar con test de inicio de curso.",duracion:"45 min",material:"Set de short game completo",variantes:["Solo comparar inicio vs final", "Publicar resultados del grupo", "Premio al más mejorado"],tags:["test final", "short game", "comparativa", "mejora"]},
{id:"pa027",grupo:"benjamin",trimestre:4,semana:27,categoria:"Juego Largo",nombre:"El Driving de Fin de Curso",objetivo:"Medir la mejora en distancia y precisión con el driver.",descripcion:"Test final: 10 drives midiendo distancia y si entra en el fairway. Comparar con el test de inicio de curso.",duracion:"20 min",material:"Driver, tees, bolas, medidor",variantes:["Solo distancia", "Solo fairways", "Con video comparativo inicio/fin"],tags:["driver", "test final", "distancia", "fairway"]},
{id:"pa028",grupo:"benjamin",trimestre:4,semana:28,categoria:"Juego",nombre:"Torneo de Clausura Pars",objetivo:"Torneo de fin de curso con reconocimiento y celebración.",descripcion:"Torneo de 18 hoyos Stableford con hándicap. Ceremonia de entrega de trofeos, diplomas y discurso.",duracion:"240 min",material:"Set completo, trofeos, diplomas",variantes:["Con padres en los últimos hoyos", "Con buffet posterior", "Video del año"],tags:["clausura", "trofeos", "diploma", "celebración"]},
{id:"pa029",grupo:"benjamin",trimestre:1,semana:3,categoria:"Putting",nombre:"La Rueda del Putting",objetivo:"Dominar los putts desde los 8 puntos cardinales a 2 metros.",descripcion:"8 bolas a 2m alrededor del hoyo. El alumno debe embocar las 8. Si falla una, empieza desde donde falló.",duracion:"25 min",material:"Putter, 8 bolas, hoyo",variantes:["A 2,5m", "Solo los 4 puntos cardinales", "Con observador"],tags:["putting", "8 puntos", "cardinales", "presión"]},
{id:"pa030",grupo:"benjamin",trimestre:2,semana:11,categoria:"Coordinación",nombre:"Preparación Física Específica Golf",objetivo:"Programa completo de preparación física para el golf.",descripcion:"Sesión completa: movilidad articular (15 min), fuerza de core (15 min), velocidad de rotación (10 min), estiramiento final (5 min).",duracion:"45 min",material:"Bandas, esterilla, palo de golf, pelota medicinal",variantes:["Versión de 20 min", "Solo calentamiento pre-ronda", "Con video guía"],tags:["preparación física", "fuerza", "movilidad", "velocidad"]},
{id:"pa031",grupo:"benjamin",trimestre:3,semana:16,categoria:"Putting",nombre:"El Putting Gate",objetivo:"Controlar la cara del putter al impacto.",descripcion:"Dos tees a 2cm a cada lado de la bola. El putter debe pasar por la puerta sin tocarlos. Garantiza una cara cuadrada al impacto.",duracion:"20 min",material:"Putter, bolas, tees",variantes:["Puerta más estrecha (1,5cm)", "Desde 2m", "Con putting mirror además"],tags:["putting gate", "cara cuadrada", "tees", "técnica"]},
{id:"pa032",grupo:"benjamin",trimestre:1,semana:6,categoria:"Chip",nombre:"El Pitch de Maestría",objetivo:"Dominar el pitch a distintas alturas según la situación.",descripcion:"3 tipos de pitch: alto (cara abierta), medio (stance normal), bajo (manos adelantadas, bola atrasada). Los 3 desde la misma posición.",duracion:"25 min",material:"SW, PW, 9-hierro, bolas",variantes:["Con obstáculo intermedio", "Solo alto", "Identificar cuándo usar cada uno"],tags:["pitch", "alto", "medio", "bajo", "versatilidad"]},
{id:"pa033",grupo:"benjamin",trimestre:2,semana:14,categoria:"Mental",nombre:"Gestión del Hándicap",objetivo:"Entender y trabajar para bajar el hándicap.",descripcion:"Cálculo del hándicap: las 8 mejores de las últimas 20 rondas. El alumno identifica qué hoyos le cuestan más diferencial.",duracion:"30 min",material:"Histórico de tarjetas, calculadora, hoja de Excel",variantes:["Con app de hándicap", "Simular diferentes scores", "Objetivo de hándicap a final de año"],tags:["hándicap", "diferencial", "cálculo", "objetivo"]},
{id:"pa034",grupo:"benjamin",trimestre:3,semana:18,categoria:"Juego Largo",nombre:"El Approach Controlado",objetivo:"Approach shots de alta precisión a zonas específicas del green.",descripcion:"En lugar de apuntar a la bandera, apuntar a cuadrantes del green. Desde 100-150m, elegir el cuadrante correcto según la bandera y el viento.",duracion:"25 min",material:"Hierros, bolas, green dividido en 4 cuadrantes",variantes:["Con radar de distancia", "Registrar cuadrante alcanzado", "Comparar vs apuntar siempre a la bandera"],tags:["approach", "cuadrantes", "precisión", "estrategia de green"]},
{id:"pa035",grupo:"benjamin",trimestre:4,semana:21,categoria:"Swing",nombre:"El Swing en Terreno Irregular",objetivo:"Adaptar el swing a los 4 tipos de terreno irregular.",descripcion:"Bola por encima de los pies, por debajo de los pies, cuesta arriba, cuesta abajo. Para cada situación: ajuste de postura y cara.",duracion:"30 min",material:"Set de hierros, bolas, terreno irregular del campo",variantes:["Solo un tipo por sesión", "En campo real", "Registrar el ajuste necesario"],tags:["terreno irregular", "adaptación", "cuesta arriba", "cuesta abajo"]},
{id:"pa036",grupo:"benjamin",trimestre:1,semana:7,categoria:"Juego",nombre:"9 Hoyos de Práctica Deliberada",objetivo:"Jugar 9 hoyos con un objetivo técnico específico.",descripcion:"El alumno elige UN objetivo técnico y lo aplica en 9 hoyos. No importa el score, solo el % de cumplimiento del objetivo.",duracion:"120 min",material:"Set completo, ficha de objetivos",variantes:["El profesor elige el objetivo", "2 objetivos complementarios", "Comparar score con objetivo vs sin objetivo"],tags:["práctica deliberada", "objetivo único", "9 hoyos", "proceso"]},
{id:"pa037",grupo:"benjamin",trimestre:2,semana:10,categoria:"Chip",nombre:"El Par Propio en Short Game",objetivo:"Definir y mejorar el par propio en el short game.",descripcion:"Se define el par propio para chip y putt según el nivel del alumno. Objetivo: alcanzar ese par propio en el 70% de las situaciones.",duracion:"25 min",material:"Wedges, putter, bolas",variantes:["Desde 20m", "Desde rough (par propio de 4)", "Registrar % semanalmente"],tags:["par propio", "short game", "chip", "porcentaje"]},
{id:"pa038",grupo:"benjamin",trimestre:3,semana:20,categoria:"Putting",nombre:"El Putting de Puente",objetivo:"Eliminar el error de desaceleración en el putt.",descripcion:"Dos tees paralelos forman un puente. El putter debe pasar siempre acelerando hacia el hoyo (through-swing siempre mayor).",duracion:"20 min",material:"Putter, bolas, tees formando puente",variantes:["Con metrónomo de aceleración", "Sin puente para confirmar", "En pendiente"],tags:["putting", "aceleración", "desaceleración", "through-swing"]},
{id:"pa039",grupo:"benjamin",trimestre:4,semana:22,categoria:"Reglas",nombre:"Árbitro Certificado Nivel 1",objetivo:"Prepararse para el curso de árbitro de nivel 1 de la RFEG.",descripcion:"Las 10 reglas más usadas en torneo, resolución de incidentes, comunicación con los jugadores. Práctica de arbitraje en torneo interno.",duracion:"60 min",material:"Reglamento RFEG completo, casos prácticos",variantes:["Con árbitro oficial invitado", "Examen simulado", "Arbitrando el torneo de los Birdies"],tags:["árbitro", "RFEG", "nivel 1", "reglamento"]},
{id:"pa040",grupo:"benjamin",trimestre:2,semana:13,categoria:"Swing",nombre:"La Presión del Grip Perfecta",objetivo:"Identificar y mantener la presión ideal del grip.",descripcion:"En escala del 1 al 10 (1=suave, 10=máximo), la presión ideal es entre 5 y 6. 30 golpes evaluando la presión.",duracion:"20 min",material:"Hierro 7, bolas, escala de presión visual",variantes:["Desde 1 a 10 de forma progresiva", "Con varillas en las manos", "Autoevaluación post-golpe"],tags:["grip", "presión", "sensación", "escala"]},
{id:"pa041",grupo:"benjamin",trimestre:3,semana:19,categoria:"Juego",nombre:"La Ronda Táctica",objetivo:"Jugar una ronda completa con enfoque 100% táctico.",descripcion:"18 hoyos verbalizando en voz alta la decisión táctica completa antes de cada golpe.",duracion:"240 min",material:"Set completo, ficha de evaluación táctica",variantes:["Solo 9 hoyos", "Con caddie que pregunta la decisión", "Grabar las verbalizaciones"],tags:["táctica", "verbalizar", "decisión", "ronda"]},
{id:"pa042",grupo:"benjamin",trimestre:4,semana:24,categoria:"Chip",nombre:"La Competición de Short Game Pars",objetivo:"Torneo de short game completo.",descripcion:"18 situaciones: chips, pitches, bunkers, putts. Score total. Clasificación y premio especial.",duracion:"60 min",material:"Wedges, putter, bolas, clasificación",variantes:["Solo pitches y chips", "Con puntuación por cercanía al hoyo", "Equipos de 2"],tags:["competición", "short game", "clasificación", "trofeo"]},
{id:"pa043",grupo:"benjamin",trimestre:1,semana:4,categoria:"Juego Largo",nombre:"El Hitting Stations",objetivo:"Practicar todos los palos en rotación con objetivos.",descripcion:"10 estaciones en el campo de prácticas, cada una con un palo y un objetivo específico. El alumno rota cada 10 minutos.",duracion:"50 min",material:"Set completo, 10 objetivos marcados",variantes:["Solo los 5 palos más usados", "Con scorecard por estación", "Un palo toda la sesión como contraejemplo"],tags:["rotación", "estaciones", "todos los palos", "variedad"]},
{id:"pa044",grupo:"benjamin",trimestre:2,semana:12,categoria:"Mental",nombre:"La Rueda de Rendimiento",objetivo:"Evaluar el rendimiento en 8 áreas del juego.",descripcion:"Rueda de rendimiento con 8 áreas (driver, hierros, approach, chip, bunker, putt largo, putt corto, mental). El alumno puntúa del 1 al 10.",duracion:"20 min",material:"Plantilla de rueda de rendimiento, bolígrafo",variantes:["Trimestral", "Con el profesor", "Compartir con el grupo"],tags:["rueda de rendimiento", "evaluación", "8 áreas", "autodiagnóstico"]},
{id:"pa045",grupo:"benjamin",trimestre:3,semana:17,categoria:"Putting",nombre:"El Putting de Lectura Avanzada",objetivo:"Leer putts de doble pendiente.",descripcion:"Putts de doble break: la bola rompe en un sentido y luego en otro. Se aprende a leer el break más cerca del hoyo primero.",duracion:"25 min",material:"Putter, bolas, green con doble pendiente",variantes:["Solo el break final", "Predecir la línea completa dibujándola", "Con compañero que lee y el otro golpea"],tags:["putting", "doble break", "lectura avanzada", "pendiente compleja"]},
{id:"pa046",grupo:"benjamin",trimestre:4,semana:23,categoria:"Juego Largo",nombre:"El Drive de Precisión Máxima",objetivo:"Maximizar el fairway sin sacrificar demasiada distancia.",descripcion:"Driver a 85% de velocidad en un pasillo de 20m. 20 drives midiendo distancia y fairway.",duracion:"25 min",material:"Driver, tees, bolas, conos en fairway",variantes:["Pasillo de 15m", "Con consecuencia si sale del pasillo", "Registrar el % óptimo personal"],tags:["driver", "precisión", "85%", "fairway", "velocidad óptima"]},
{id:"pa047",grupo:"benjamin",trimestre:2,semana:15,categoria:"Chip",nombre:"La Salida de Bunker con Viento",objetivo:"Gestionar el viento en la salida de bunker.",descripcion:"Viento en contra: abrir más la cara, más fuerza. Viento a favor: menos swing, cara menos abierta. Viento cruzado: apuntar compensando.",duracion:"20 min",material:"SW, bolas, bunker, día de viento o ventilador",variantes:["Solo viento en contra", "Con objetivo específico", "Comparar los 3 tipos"],tags:["bunker", "viento", "adaptación", "cara abierta"]},
{id:"pa048",grupo:"benjamin",trimestre:3,semana:21,categoria:"Swing",nombre:"La Sesión de Feedback de Pares",objetivo:"Aprender del swing de los compañeros.",descripcion:"En grupos de 3: uno golpea, otro graba, el tercero da feedback verbal. Rotan. El profesor supervisa la calidad del feedback.",duracion:"30 min",material:"Hierros, bolas, móvil para grabar",variantes:["Con checklist de observación", "Feedback escrito", "Solo feedback positivo"],tags:["feedback", "pares", "aprendizaje colaborativo", "observación"]},
{id:"pa049",grupo:"benjamin",trimestre:4,semana:26,categoria:"Juego",nombre:"El Scramble de Clausura",objetivo:"Torneo de equipo de cierre de curso en formato scramble.",descripcion:"Equipos de 4 alumnos mezclando grupos de edad. Formato scramble: todos golpean desde la mejor bola. 18 hoyos.",duracion:"240 min",material:"Set completo, tarjeta de scramble, premios de equipo",variantes:["Solo 9 hoyos", "Con padres como compañeros", "Fotos del torneo y publicación"],tags:["scramble", "equipos", "clausura", "mezcla de edades"]},
{id:"pa050",grupo:"benjamin",trimestre:4,semana:28,categoria:"Mental",nombre:"El Objetivo del Próximo Año",objetivo:"Planificar la temporada siguiente.",descripcion:"¿Qué hándicap quiero tener? ¿Qué torneos? ¿Qué aspecto técnico será mi prioridad? Plan firmado con el profesor.",duracion:"30 min",material:"Plantilla de plan anual, sobre sellado",variantes:["Con padres", "Presentación al grupo", "Audio personal grabado"],tags:["planificación", "objetivos", "temporada siguiente", "hándicap"]},
{id:"bp001",grupo:"infantil",trimestre:1,semana:1,categoria:"Swing",nombre:"Análisis de Swing de Alto Rendimiento",objetivo:"Análisis técnico exhaustivo al inicio de temporada.",descripcion:"Análisis de 360°: frente, lateral, atrás y desde arriba. Identificación de 3 prioridades técnicas para la temporada. Plan firmado.",duracion:"45 min",material:"Set completo, tecnología de análisis avanzada",variantes:["Con Trackman si disponible", "Con comparativa de temporada anterior", "Plan técnico documentado"],tags:["alto rendimiento", "análisis 360°", "prioridades", "plan técnico"]},
{id:"bp002",grupo:"infantil",trimestre:1,semana:2,categoria:"Putting",nombre:"Estadísticas Avanzadas de Putting",objetivo:"Gestionar el putting con datos de alto nivel.",descripcion:"Strokes Gained Putting. Promedios: putts por ronda, conversión desde 2-5m, 3-putt avoidance, birdie putts. App de estadísticas.",duracion:"30 min",material:"App de estadísticas (Arccos, Shot Scope o similar), bolas, putter",variantes:["Con app gratuita", "Solo los 3 datos más importantes", "Comparar con benchmark Tour"],tags:["estadísticas", "strokes gained", "putting", "datos avanzados"]},
{id:"bp003",grupo:"infantil",trimestre:1,semana:3,categoria:"Mental",nombre:"El Perfil Mental del Competidor",objetivo:"Identificar el perfil mental y las áreas de mejora psicológica.",descripcion:"Cuestionario de perfil mental: ansiedad competitiva, concentración, motivación, resiliencia, visión de futuro.",duracion:"45 min",material:"Cuestionario de perfil mental, bolígrafo",variantes:["Con psicólogo deportivo", "Solo autoevaluación", "Comparar inicio vs final de curso"],tags:["perfil mental", "psicología", "competidor", "evaluación", "resiliencia"]},
{id:"bp004",grupo:"infantil",trimestre:1,semana:4,categoria:"Juego Largo",nombre:"El Protocolo de Calentamiento de Competición",objetivo:"Desarrollar un protocolo de calentamiento reproducible.",descripcion:"45 min pre-ronda: estiramientos dinámicos (10min), chipping y putting (15min), hierros cortos a largos (10min), driver (5min), putting pre-salida (5min).",duracion:"45 min",material:"Set completo, zona de práctica",variantes:["Versión de 30 min", "Versión de 20 min", "Adaptado al horario del torneo"],tags:["calentamiento", "protocolo", "competición", "pre-ronda"]},
{id:"bp005",grupo:"infantil",trimestre:1,semana:5,categoria:"Chip",nombre:"El Short Game de Alta Presión",objetivo:"Ejecutar el short game en situaciones de máxima presión.",descripcion:"Simulación de torneo: el alumno debe hacer up&down en los últimos 3 hoyos de un campeonato. El profesor y otros observan.",duracion:"30 min",material:"Wedges, putter, bolas, 3 posiciones de alta dificultad",variantes:["Con cronómetro", "Con galería de espectadores", "Con comentario en vivo del profesor"],tags:["presión", "short game", "up&down", "galería", "simulación"]},
{id:"bp006",grupo:"infantil",trimestre:1,semana:6,categoria:"Juego",nombre:"El Recorrido de Reconocimiento",objetivo:"Preparar el campo para un torneo conociendo cada hoyo.",descripcion:"9 hoyos de reconocimiento: el alumno anota zona de caída de salida, punto de peligro, zona segura del green y breaks principales de putt.",duracion:"120 min",material:"Libreta de campo, bolígrafo, set completo",variantes:["18 hoyos", "Con mapa del campo", "Comparar notas con compañero"],tags:["reconocimiento", "campo", "preparación", "notas", "estrategia"]},
{id:"bp007",grupo:"infantil",trimestre:1,semana:7,categoria:"Putting",nombre:"El Putt de 1 Metro bajo Presión Máxima",objetivo:"Dominar el putt de 1 metro en cualquier condición.",descripcion:"La presión máxima: embocar 10 putts seguidos de 1 metro. Si fallas el décimo, empiezas desde 1. Registrar el tiempo. Hacerlo semanal.",duracion:"20 min",material:"Putter, bolas, hoyo, cronómetro",variantes:["15 seguidos", "Con observadores", "Con consecuencia deportiva real"],tags:["1 metro", "presión máxima", "10 seguidos", "resistencia"]},
{id:"bp008",grupo:"infantil",trimestre:1,semana:8,categoria:"Reglas",nombre:"Reglamento a Nivel Árbitro",objetivo:"Dominar el reglamento a nivel de árbitro nivel 2.",descripcion:"Preparación para árbitro nivel 2 RFEG: casos complejos, recurso de decisiones, reglas especiales de handicap.",duracion:"60 min",material:"Reglamento RFEG completo, decisiones de comité",variantes:["Con árbitro oficial", "Casos de la Real Academia de Árbitros", "Examen online RFEG"],tags:["árbitro", "nivel 2", "RFEG", "reglamento avanzado"]},
{id:"bp009",grupo:"infantil",trimestre:2,semana:9,categoria:"Swing",nombre:"Optimización de la Velocidad de Swing",objetivo:"Maximizar la velocidad de swing sin sacrificar la dirección.",descripcion:"Protocolo de velocidad: calentamiento de velocidad (5 swings máximo), series de speed sticks (3 series de 5), vuelta a la técnica.",duracion:"30 min",material:"Speed sticks, driver, radar de velocidad",variantes:["Con SuperSpeed o similar", "Solo en temporada baja", "Programa de 6 semanas"],tags:["velocidad", "speed sticks", "km/h", "maximizar", "protocolo"]},
{id:"bp010",grupo:"infantil",trimestre:2,semana:10,categoria:"Juego Largo",nombre:"Strokes Gained Approach",objetivo:"Analizar y mejorar el rendimiento en approach shots con datos.",descripcion:"Durante 3 rondas, registrar cada approach shot: distancia, resultado. Calcular el Strokes Gained Approach personal.",duracion:"Trabajo de 3 rondas + análisis 30 min",material:"App de estadísticas, set de hierros",variantes:["Solo distancias de 100-150m", "Comparar viento/sin viento", "Plan de mejora por rango de distancia"],tags:["strokes gained", "approach", "estadísticas avanzadas", "benchmark"]},
{id:"bp011",grupo:"infantil",trimestre:2,semana:11,categoria:"Chip",nombre:"El Short Game con Trackman",objetivo:"Analizar el short game con datos objetivos.",descripcion:"Con Trackman/Flightscope: medir spin rate, launch angle y distancia en chips y pitches. Identificar patrones.",duracion:"30 min",material:"Wedges, bolas, Trackman o similar",variantes:["Sin tecnología solo análisis visual", "Con radar básico", "Enfoque en un solo palo"],tags:["Trackman", "spin rate", "launch angle", "short game"]},
{id:"bp012",grupo:"infantil",trimestre:2,semana:12,categoria:"Mental",nombre:"Mindfulness para Golfistas",objetivo:"Técnicas de mindfulness aplicadas a la concentración.",descripcion:"Sesión de 20 min de mindfulness: respiración consciente, body scan, anchoring en el presente. Aplicación en el campo.",duracion:"45 min",material:"Esterilla, espacio tranquilo, app de meditación",variantes:["App Headspace/Calm", "Solo 5 min diarios", "Con psicólogo deportivo"],tags:["mindfulness", "meditación", "presente", "anchor", "concentración"]},
{id:"bp013",grupo:"infantil",trimestre:2,semana:13,categoria:"Putting",nombre:"El Putting Estadístico",objetivo:"Usar estadísticas para mejorar el putting.",descripcion:"Sesión de medición: 10 putts desde cada distancia (1m-10m). Calcular el % de emboques desde cada distancia. Identificar el make zone personal.",duracion:"40 min",material:"Putter, bolas, hoja de registro, calculadora",variantes:["Con app de estadísticas", "Comparar con media del Tour", "Plan semanal basado en datos"],tags:["estadísticas", "putting", "make zone", "porcentaje"]},
{id:"bp014",grupo:"infantil",trimestre:2,semana:14,categoria:"Juego",nombre:"El Torneo de Clasificación",objetivo:"Torneo de clasificación para selección de equipo.",descripcion:"Torneo de clasificación interno: los 2 mejores representan al club en torneo externo. Presión real de selección. Stableford 18 hoyos.",duracion:"240 min",material:"Set completo, tarjeta federada",variantes:["Con árbitro externo", "Transmisión de scores en tiempo real", "Análisis post-torneo obligatorio"],tags:["clasificación", "selección", "representación", "presión real"]},
{id:"bp015",grupo:"infantil",trimestre:2,semana:15,categoria:"Swing",nombre:"La Corrección Técnica de Alto Nivel",objetivo:"Trabajar un cambio técnico complejo con método y paciencia.",descripcion:"Los cambios técnicos requieren 2000-5000 repeticiones. Se establece un drill específico y un plan de 8 semanas.",duracion:"45 min",material:"El palo específico del cambio, bolas, drill tools",variantes:["Con espejo", "Video diario del cambio", "Con coach externo visitante"],tags:["corrección técnica", "repeticiones", "8 semanas", "cambio", "método"]},
{id:"bp016",grupo:"infantil",trimestre:3,semana:16,categoria:"Juego Largo",nombre:"El Driving de Alta Velocidad Controlada",objetivo:"Maximizar la distancia manteniendo el 75% de fairways.",descripcion:"El alumno trabaja en encontrar su velocidad óptima: la que maximiza la distancia mientras mantiene el 75% de fairways.",duracion:"30 min",material:"Driver, conos en fairway imaginario, bolas",variantes:["Con radar de velocidad", "En campo real", "Registrar velocidad vs % fairway"],tags:["driving", "velocidad óptima", "fairway", "75%"]},
{id:"bp017",grupo:"infantil",trimestre:3,semana:17,categoria:"Chip",nombre:"El Bunker de Competición Avanzado",objetivo:"Dominar el bunker en todas las condiciones de competición.",descripcion:"Situaciones avanzadas: bunker borde de green, bunker de 30m al hoyo, arena muy suelta, arena húmeda, bola cerca del labio.",duracion:"40 min",material:"SW, LW, bolas, bunker con distintas condiciones",variantes:["Solo situaciones de torneo", "Con observador puntuando", "Comparar SW vs LW en cada situación"],tags:["bunker", "avanzado", "competición", "versatilidad"]},
{id:"bp018",grupo:"infantil",trimestre:3,semana:18,categoria:"Mental",nombre:"El Protocolo de Recuperación Mental",objetivo:"Recuperarse de un mal inicio de ronda.",descripcion:"Cuando la ronda empieza mal: reset físico (respiración profunda), reset emocional (semáforo), reset táctico (objetivo próximo hoyo).",duracion:"30 min",material:"Hoja de protocolo, bolígrafo",variantes:["Simulación de mal inicio", "Con compañero que evalúa la recuperación", "Vídeo de pro recuperándose"],tags:["recuperación", "mal inicio", "protocolo", "reset", "resiliencia"]},
{id:"bp019",grupo:"infantil",trimestre:3,semana:19,categoria:"Putting",nombre:"La Gestión del Putting en Torneo",objetivo:"Estrategia de putting para minimizar los 3-putts.",descripcion:"El 3-putt destruye el score. Estrategia: desde más de 6m, prioridad la distancia no la dirección. Lag putting a zona de 1m. Nunca el primer putt corto.",duracion:"30 min",material:"Putter, bolas, green real",variantes:["Con mediciones en el putting green", "Registrar 3-putts en 3 rondas", "Comparar antes/después del protocolo"],tags:["putting", "3-putt", "lag", "torneo", "estrategia"]},
{id:"bp020",grupo:"infantil",trimestre:3,semana:20,categoria:"Juego",nombre:"Torneo Regional — Preparación y Ejecución",objetivo:"Preparación completa para un torneo regional.",descripcion:"Semana de torneo: lunes reconocimiento, martes práctica larga, miércoles práctica corta, jueves ronda de práctica, viernes torneo.",duracion:"Semana completa",material:"Set completo, plan de torneo escrito",variantes:["Solo los 2 días previos", "Con psicólogo deportivo", "Análisis post-torneo en video"],tags:["torneo regional", "preparación", "semana de torneo", "plan"]},
{id:"bp021",grupo:"infantil",trimestre:3,semana:21,categoria:"Chip",nombre:"El Flop Shot de Alta Presión",objetivo:"Ejecutar el flop shot en situaciones de máxima dificultad.",descripcion:"El flop shot requiere valentía y técnica. Se entrena especialmente en situaciones de alta presión: hoyo 18, necesito par.",duracion:"25 min",material:"LW o SW, bolas, bunker, obstáculo",variantes:["Con espectadores", "Con consecuencia real", "Solo desde rough largo"],tags:["flop shot", "alta presión", "valentía", "situación límite"]},
{id:"bp022",grupo:"infantil",trimestre:3,semana:22,categoria:"Swing",nombre:"El Work-in de Driver en Competición",objetivo:"Mejorar el driver específicamente para condiciones de torneo.",descripcion:"Simulación de primer tee de torneo: rutina completa, observadores, primera bola con consecuencia. 10 repeticiones.",duracion:"30 min",material:"Driver, tees, bolas, simulación de público",variantes:["Con música de torneo", "Con árbitro observando", "Con cuenta atrás de tiempo"],tags:["driver", "torneo", "primer tee", "presión", "rutina"]},
{id:"bp023",grupo:"infantil",trimestre:4,semana:23,categoria:"Juego Largo",nombre:"El Game Plan del Torneo",objetivo:"Diseñar un game plan completo de 18 hoyos para un torneo.",descripcion:"Para cada hoyo: salida óptima y palo, approach desde zona A y zona B, posición de bandera: atacar o no. Mapa del campo.",duracion:"60 min",material:"Mapa del campo, bolígrafo, tarjeta de anotaciones",variantes:["Solo 9 hoyos", "Con guía anterior del campo", "Revisar el plan vs lo ejecutado"],tags:["game plan", "18 hoyos", "torneo", "mapa", "estrategia completa"]},
{id:"bp024",grupo:"infantil",trimestre:4,semana:24,categoria:"Mental",nombre:"La Carta al Yo Competidor",objetivo:"Conectar con la motivación profunda para la competición.",descripcion:"El alumno escribe una carta a su yo competidor: por qué juego al golf, qué significa competir, cómo quiero que me recuerden.",duracion:"20 min",material:"Papel, bolígrafo",variantes:["Audio grabado", "Se comparte con el profesor", "Revisarla al final de la temporada"],tags:["motivación", "carta", "competidor", "por qué", "propósito"]},
{id:"bp025",grupo:"infantil",trimestre:4,semana:25,categoria:"Putting",nombre:"La Sesión de Putting de 500 Bolas",objetivo:"Sesión intensiva de putting para automatizar el stroke.",descripcion:"500 putts distribuidos: 200 de 1m (automatización), 150 de 2m (confianza), 100 de 3m (control), 50 de 5m+ (distancia).",duracion:"90 min",material:"Putter, bolas, hoyos, registro",variantes:["Con agua cada 100 bolas", "Con música de concentración", "Evaluando cada 50 bolas"],tags:["500 bolas", "putting", "intensivo", "automatización"]},
{id:"bp026",grupo:"infantil",trimestre:4,semana:26,categoria:"Juego",nombre:"El Torneo de Alto Rendimiento Birdie+",objetivo:"Torneo de máximo nivel del grupo Birdie+.",descripcion:"18 hoyos con reglas federadas de máximo nivel, árbitro externo, horario de torneo real, caddie permitido.",duracion:"240 min",material:"Set completo, árbitro externo, trofeo importante",variantes:["Con invitados de otros clubes", "Con scoring en app", "Con entrevista posterior"],tags:["alto rendimiento", "torneo", "árbitro externo", "caddie"]},
{id:"bp027",grupo:"infantil",trimestre:4,semana:27,categoria:"Swing",nombre:"El Test de Rendimiento Birdie+",objetivo:"Medir todos los parámetros de rendimiento al final del curso.",descripcion:"Test completo: distancia driver, % fairways (10 drives), % GIR (10 approach de 150m), chips (10 a 10m), putts (10 de 2m).",duracion:"60 min",material:"Set completo, medidor de distancias, registro",variantes:["Con radar de velocidad", "Publicar resultados del grupo", "Premio al más mejorado"],tags:["test", "rendimiento", "distancia", "fairway", "GIR"]},
{id:"bp028",grupo:"infantil",trimestre:4,semana:28,categoria:"Juego",nombre:"El Torneo de Clausura y Premiación Birdie+",objetivo:"Cierre de temporada con máxima exigencia y celebración.",descripcion:"18 hoyos. Ceremonia de entrega de trofeos con clasificación, mención al mejor mejorado, mejor actitud. Diploma de Birdie+ Golfista.",duracion:"240 min",material:"Set completo, trofeos, diplomas personalizados",variantes:["Con padres y familiares", "Video del año", "Cena de cierre"],tags:["clausura", "gala", "trofeos", "diplomas", "celebración"]},
{id:"bp029",grupo:"infantil",trimestre:1,semana:3,categoria:"Juego Largo",nombre:"El Driving en Condiciones Adversas",objetivo:"Mantener la eficiencia con el driver en lluvia, viento y frío.",descripcion:"Protocolo de condiciones adversas: guante de lluvia, grip seco, swing más corto al 85%, más palo en viento.",duracion:"30 min",material:"Driver, guantes de lluvia, toalla de golf",variantes:["Con lluvia real", "Con ventilador", "Comparar condiciones buenas vs adversas"],tags:["condiciones adversas", "lluvia", "viento", "frío"]},
{id:"bp030",grupo:"infantil",trimestre:2,semana:10,categoria:"Chip",nombre:"El Wedge System Personal",objetivo:"Dominar las distancias exactas con cada wedge.",descripcion:"Con 4 wedges y 3 posiciones de swing (¼, ½, ¾), el alumno tiene 12 distancias exactas. Medir, anotar y memorizar el sistema.",duracion:"45 min",material:"4 wedges, bolas, medidor de distancias",variantes:["Solo 3 wedges", "Solo swing ½", "Crear tarjeta de bolsillo con las distancias"],tags:["wedge system", "4 wedges", "distancias exactas", "memorizar"]},
{id:"bp031",grupo:"infantil",trimestre:3,semana:15,categoria:"Putting",nombre:"La Velocidad de Green Avanzada",objetivo:"Leer y adaptarse a la velocidad del green en minutos.",descripcion:"Antes de un torneo: 5 putts largos para calibrar la velocidad. Ajustar el backswing según la velocidad medida.",duracion:"20 min",material:"Putter, bolas, Stimpmeter si disponible",variantes:["Con Stimpmeter", "Comparar mañana vs tarde", "En distintos greens"],tags:["velocidad de green", "calibrar", "Stimpmeter", "adaptación"]},
{id:"bp032",grupo:"infantil",trimestre:1,semana:5,categoria:"Mental",nombre:"La Zona de Confort y el Rendimiento",objetivo:"Entender y expandir la zona de confort competitiva.",descripcion:"El rendimiento óptimo está en el borde de la zona de confort. Sesión teórica + práctica fuera de la zona de confort del alumno.",duracion:"45 min",material:"Pizarra, materiales de la situación elegida",variantes:["Con psicólogo deportivo", "Solo la parte práctica", "Situar al alumno en torneo más difícil"],tags:["zona de confort", "rendimiento óptimo", "expansión", "crecimiento"]},
{id:"bp033",grupo:"infantil",trimestre:2,semana:12,categoria:"Juego",nombre:"La Ronda de Score Objetivo",objetivo:"Jugar una ronda con un score objetivo específico.",descripcion:"El alumno establece un score objetivo realista. Diseña la estrategia hoyo a hoyo: dónde puede hacer birdie, dónde evitar doble bogey.",duracion:"240 min",material:"Set completo, tarjeta con plan y score objetivo",variantes:["Con el profesor en los últimos hoyos", "Evaluación post-ronda del plan", "Revisión quincenal del mejor score"],tags:["score objetivo", "estrategia", "birdie", "bogey doble"]},
{id:"bp034",grupo:"infantil",trimestre:3,semana:17,categoria:"Chip",nombre:"El Análisis de Short Game con Video",objetivo:"Detectar y corregir errores sutiles del short game.",descripcion:"Grabación de 10 chips y 10 pitches desde ángulos clave. Análisis con el profesor: cara al impacto, punto de entrada, follow-through.",duracion:"40 min",material:"Wedges, bolas, móvil/tablet, app de análisis",variantes:["Comparar con pro del Tour", "App CoachesEye o similar", "Plan de corrección de 4 semanas"],tags:["video análisis", "short game", "error sutil", "corrección", "drill"]},
{id:"bp035",grupo:"infantil",trimestre:4,semana:21,categoria:"Putting",nombre:"El Putting Psicológico",objetivo:"Dominar el aspecto psicológico del putting en momentos clave.",descripcion:"Yips y presión en putts cortos. Técnicas: cambio de grip, putt de atrás hacia delante, respiración, mirada corta.",duracion:"30 min",material:"Putter, bolas, situaciones de presión simuladas",variantes:["Con compañeros observando", "Con consecuencias reales", "Con psicólogo deportivo"],tags:["yips", "presión", "putting psicológico", "solución personal"]},
{id:"bp036",grupo:"infantil",trimestre:1,semana:7,categoria:"Juego Largo",nombre:"El Fitting de Palos",objetivo:"Entender y realizar un fitting básico de palos para alto rendimiento.",descripcion:"El fitting determina: longitud del palo, loft y lie, flex del shaft, grip size. Sesión de fitting básico.",duracion:"60 min",material:"Palos de fitting si disponibles, radar de velocidad",variantes:["En tienda de golf especializada", "Fitting digital con datos", "Comparar antes/después del fitting"],tags:["fitting", "personalización", "shaft", "loft", "grip size"]},
{id:"bp037",grupo:"infantil",trimestre:2,semana:11,categoria:"Swing",nombre:"El Swing en Situación de Play-off",objetivo:"Reproducir el mejor swing bajo la máxima presión posible.",descripcion:"Simulación de play-off: hoyo 18, empate, solo 1 alumno puede ganar. Debe ejecutar su mejor drive y approach.",duracion:"30 min",material:"Set completo, conos en el hoyo de play-off elegido",variantes:["Con cronómetro para la rutina", "Con árbitro externo", "Repetir hasta dominar la situación"],tags:["play-off", "presión máxima", "swing", "rutina", "eliminación"]},
{id:"bp038",grupo:"infantil",trimestre:3,semana:19,categoria:"Juego",nombre:"La Semana de Intensificación",objetivo:"Semana de entrenamiento intensivo pre-temporada.",descripcion:"Lunes-viernes: 4h diarias divididas en técnica (2h), juego (1h) y físico/mental (1h).",duracion:"4h x 5 días",material:"Set completo, todos los recursos del club",variantes:["Solo 3 días", "Con nutricionista", "Con psicólogo deportivo"],tags:["intensificación", "semana", "4 horas", "salto de rendimiento"]},
{id:"bp039",grupo:"infantil",trimestre:4,semana:22,categoria:"Juego Largo",nombre:"El Iron Play de Tour",objetivo:"Dominar el juego de hierros con consistencia de nivel de tour.",descripcion:"Objetivo: 70% GIR desde 150m en green real. 20 approach shots midiendo resultado. Análisis de dispersión.",duracion:"40 min",material:"Hierros, bolas, green real, medidor",variantes:["Desde 120m", "Desde 170m", "Bajo presión con observadores"],tags:["iron play", "GIR", "70%", "150m", "dispersión"]},
{id:"bp040",grupo:"infantil",trimestre:2,semana:13,categoria:"Chip",nombre:"El Chip de 1 Mano",objetivo:"Desarrollar la sensación en la mano líder del chip.",descripcion:"20 chips solo con la mano izquierda (diestros), luego 20 con la derecha, luego 20 con las dos. La mano izquierda controla la cara.",duracion:"20 min",material:"Wedge, bolas",variantes:["Ojos cerrados", "Alternando sin parar", "Desde rough"],tags:["chip", "una mano", "mano líder", "sensación"]},
{id:"bp041",grupo:"infantil",trimestre:3,semana:20,categoria:"Mental",nombre:"La Concentración Entre Golpes",objetivo:"Gestionar la energía mental entre golpe y golpe.",descripcion:"Entre golpe y golpe: desconexión total. Antes del siguiente golpe: reconexión total (rutina). Técnica on/off.",duracion:"Práctica en campo (ronda de 9 hoyos)",material:"Set completo, ficha de evaluación on/off",variantes:["Con cronómetro del tiempo de conexión", "Evaluación post-ronda", "Comparar con ronda sin técnica on/off"],tags:["concentración", "on/off", "entre golpes", "energía mental"]},
{id:"bp042",grupo:"infantil",trimestre:4,semana:23,categoria:"Putting",nombre:"El Tour of Greens",objetivo:"Practicar en todos los greens del campo para conocer sus particularidades.",descripcion:"5 putts en cada green del campo (18 greens). En cada green: nota la velocidad, el break predominante y el comportamiento cerca del hoyo.",duracion:"120 min",material:"Putter, bolas, libreta de campo",variantes:["Solo los 9 greens más difíciles", "Con compañero comparando lecturas", "Repetir en condiciones diferentes"],tags:["greens", "libreta", "velocidad", "break", "conocimiento del campo"]},
{id:"bp043",grupo:"infantil",trimestre:1,semana:8,categoria:"Juego",nombre:"La Simulación de Torneo Nacional",objetivo:"Simular las condiciones de un torneo de nivel nacional.",descripcion:"18 hoyos en condiciones de torneo nacional: salida en hora exacta, árbitro, grupo de 3, scoring en vivo.",duracion:"240 min",material:"Set completo, árbitro, app de scoring",variantes:["Con scoring app público", "Con galería de padres", "Con invited pro"],tags:["simulación", "nacional", "árbitro", "scoring"]},
{id:"bp044",grupo:"infantil",trimestre:2,semana:14,categoria:"Swing",nombre:"El Trabajo de Video Diario",objetivo:"Establecer una práctica diaria de auto-análisis con video.",descripcion:"El alumno graba un vídeo de 20 golpes cada sesión y lo analiza durante 5 minutos. Compara con la semana anterior.",duracion:"5 min diarios de análisis",material:"Móvil, trípode, hierro 7",variantes:["App CoachesEye", "Análisis quincenal con profesor", "Compendio de 3 meses"],tags:["video diario", "auto-análisis", "seguimiento", "progresión", "hábito"]},
{id:"bp045",grupo:"infantil",trimestre:3,semana:18,categoria:"Juego Largo",nombre:"El Approach en Torneo Federado",objetivo:"Ejecutar approach shots en condiciones de torneo federado.",descripcion:"En un torneo federado real: registrar todos los approach shots (distancia, palo elegido, resultado). Análisis post-torneo.",duracion:"Torneo real + análisis 30 min",material:"Set completo, registro de approach shots",variantes:["Con app de estadísticas", "Solo los approach de par 4", "Comparar con torneos anteriores"],tags:["approach", "torneo federado", "estadísticas", "análisis real"]},
{id:"bp046",grupo:"infantil",trimestre:4,semana:25,categoria:"Chip",nombre:"El High Pressure Short Game Test",objetivo:"Test de short game en condiciones de presión extrema.",descripcion:"El alumno ejecuta 18 situaciones de short game con el grupo observando y con puntuación pública.",duracion:"45 min",material:"Wedges, putter, bolas, tabla de puntuación pública",variantes:["Transmisión por pantalla", "Con árbitro externo", "Premio significativo al ganador"],tags:["test", "presión extrema", "short game", "público"]},
{id:"bp047",grupo:"infantil",trimestre:1,semana:6,categoria:"Putting",nombre:"La Lectura de Green Profesional",objetivo:"Leer el green como un profesional con AimPoint o similar.",descripcion:"Introducción al sistema AimPoint Express: lectura de la pendiente con los pies, número de dedos = cantidad de break.",duracion:"30 min",material:"Putter, bolas, green con pendientes variadas",variantes:["Sistema de 3 puntos", "Con GPS de inclinación", "Comparar 5 lecturas hechas y predichas"],tags:["AimPoint", "lectura profesional", "pendiente", "break"]},
{id:"bp048",grupo:"infantil",trimestre:2,semana:15,categoria:"Mental",nombre:"El Control de la Adrenalina",objetivo:"Transformar la adrenalina competitiva en energía positiva.",descripcion:"La adrenalina es energía, no el enemigo. Técnicas: respiración de activación, movimiento físico, palabras de activación.",duracion:"30 min",material:"Situaciones de presión simuladas",variantes:["Con psicólogo deportivo", "En situación de torneo real", "Comparar rendimiento con/sin protocolo"],tags:["adrenalina", "activación", "energía positiva", "competición"]},
{id:"bp049",grupo:"infantil",trimestre:3,semana:21,categoria:"Juego",nombre:"El Grand Slam de la Academia",objetivo:"Torneo por equipos donde compiten todos los grupos.",descripcion:"Torneo especial donde Pollitos, Eagles, Birdies, Pars y Birdie+ compiten en formato adaptado. El Birdie+ actúa como capitán.",duracion:"120 min",material:"Set completo adaptado, formato especial por grupos",variantes:["Formato scramble mixto", "Con padres", "Video y fotos para redes sociales"],tags:["grand slam", "academia", "equipos mixtos", "espíritu de escuela"]},
{id:"bp050",grupo:"infantil",trimestre:4,semana:28,categoria:"Mental",nombre:"El Legado del Birdie+",objetivo:"Reflexión final y traspaso de conocimiento a los grupos menores.",descripcion:"Los alumnos Birdie+ hacen una presentación al resto: qué aprendieron, su momento más especial, su consejo para los más pequeños.",duracion:"45 min",material:"Presentación simple, sala o campo al aire libre",variantes:["Con vídeo de los mejores momentos", "Con padres", "Carta al próximo Birdie+"],tags:["legado", "traspaso", "presentación", "emocional", "cierre de año"]},
];



// ═══════════════════════════════════════════════════════════════════
// MÓDULO: MENSAJERÍA Y ARCHIVOS
// ═══════════════════════════════════════════════════════════════════
function ModMensajeria({data,setData}){
  const [fbMensajes,setFbMensajes]=useState([]);
  useEffect(()=>{
    const unsub=onSnapshot(
      query(collection(db,"mensajes"),orderBy("timestamp","desc")),
      snap=>setFbMensajes(snap.docs.map(d=>({...d.data(),_fbId:d.id}))),
      err=>console.warn("Mensajes Firebase error:",err)
    );
    return ()=>unsub();
  },[]);
  const [tab,setTab]=useState("recibidos");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [verMsg,setVerMsg]=useState(null);

  const localMensajes=data.mensajes||[];
  // Merge Firebase messages with local, deduplicate by id
  const mensajes=useMemo(()=>{
    const all=[...localMensajes,...fbMensajes];
    const seen=new Set();
    return all.filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;})
      .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  },[localMensajes,fbMensajes]);
  const alumnos=data.alumnos||[];

  function alumnoNombre(id){return alumnos.find(a=>a.id===id)?.nombre||"—";}

  const recibidos=mensajes.filter(m=>m.para==="profesor").sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const enviados=mensajes.filter(m=>m.de==="profesor").sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const noLeidos=recibidos.filter(m=>!m.leido).length;

  function marcarLeido(id){
    setData({...data,mensajes:mensajes.map(m=>m.id===id?{...m,leido:true}:m)});
    // Also update in Firebase
    const fbMsg=fbMensajes.find(m=>m.id===id);
    if(fbMsg?._fbId) updateDoc(doc(db,"mensajes",fbMsg._fbId),{leido:true}).catch(e=>console.warn(e));
  }

  function eliminarMsg(id){
    if(!confirm("¿Eliminar este mensaje?")) return;
    setData({...data,mensajes:mensajes.filter(m=>m.id!==id)});
  }

  function openNuevo(){
    setForm({destinatario:"alumno",alumnoIds:[],grupoId:"",asunto:"",cuerpo:"",tipo:"mensaje"});
    setModal("nuevo");
  }

  function enviar(){
    if(!form.asunto.trim()||!form.cuerpo.trim()) return;
    const fecha=new Date().toISOString();
    let destinatarios=[];
    if(form.destinatario==="alumno") destinatarios=form.alumnoIds;
    else if(form.destinatario==="grupo") destinatarios=alumnos.filter(a=>a.nivel===form.grupoId&&a.activo).map(a=>a.id);
    else if(form.destinatario==="todos") destinatarios=alumnos.filter(a=>a.activo).map(a=>a.id);

    const nuevos=destinatarios.map(aid=>({
      id:uid(), de:"profesor", para:aid,
      asunto:form.asunto, cuerpo:form.cuerpo,
      tipo:form.tipo, adjunto:form.adjunto||null,
      adjuntoNombre:form.adjuntoNombre||null,
      fecha, leido:false,
    }));
    // Guardar en Firebase para sincronización entre dispositivos
    Promise.all(nuevos.map(msg=>addDoc(collection(db,"mensajes"),{...msg,timestamp:serverTimestamp()}))).catch(e=>console.warn("Firebase msg error:",e));
    // También en localStorage como backup
    setData({...data,mensajes:[...mensajes,...nuevos]});
    setModal(null);
    alert(`✅ Mensaje enviado a ${nuevos.length} alumno${nuevos.length!==1?"s":""}.`);
  }

  function leerArchivo(e){
    const file=e.target.files[0]; if(!file) return;
    if(file.size>2*1024*1024){alert("El archivo no puede superar 2MB.");return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      setForm(f=>({...f,adjunto:ev.target.result,adjuntoNombre:file.name}));
    };
    reader.readAsDataURL(file);
  }

  function descargarAdjunto(adjunto,nombre){
    const a=document.createElement("a");
    a.href=adjunto; a.download=nombre||"archivo";
    a.click();
  }

  const MsgCard=({m,tipo})=>{
    const alumno=alumnos.find(a=>a.id===(tipo==="recibido"?m.de:m.para));
    return <div onClick={()=>{setVerMsg(m);if(tipo==="recibido"&&!m.leido)marcarLeido(m.id);}}
      style={{background:G.white,borderRadius:12,boxShadow:"0 2px 8px rgba(0,0,0,.07)",padding:"14px 16px",marginBottom:10,cursor:"pointer",
        borderLeft:`4px solid ${m.tipo==="informe"?G.purple:m.tipo==="archivo"?G.sky:G.grass}`,
        opacity:tipo==="recibido"&&!m.leido?1:0.85}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{fontSize:20,flexShrink:0}}>{m.tipo==="informe"?"📋":m.tipo==="archivo"?"📎":"💬"}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontWeight:700,color:G.ink,fontSize:14}}>{m.asunto}</span>
            {tipo==="recibido"&&!m.leido&&<span style={{background:G.danger,color:G.white,borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700}}>NUEVO</span>}
            <span style={{fontSize:11,color:G.soft,marginLeft:"auto"}}>{m.fecha?.slice(0,16).replace("T"," ")}</span>
          </div>
          <div style={{fontSize:12,color:G.soft,marginTop:3}}>
            {tipo==="recibido"?"De: "+(alumno?.nombre||"Alumno"):"Para: "+(alumno?.nombre||"Alumno")}
          </div>
          <div style={{fontSize:13,color:"#555",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.cuerpo}</div>
          {m.adjuntoNombre&&<div style={{fontSize:12,color:G.sky,marginTop:4}}>📎 {m.adjuntoNombre}</div>}
        </div>
        <Btn small color="danger" onClick={e=>{e.stopPropagation();eliminarMsg(m.id);}}>✕</Btn>
      </div>
    </div>;
  };

  const SUBTABS=[
    {id:"recibidos",label:`📥 Recibidos${noLeidos>0?` (${noLeidos})`:""}` },
    {id:"enviados", label:"📤 Enviados"},
  ];

  return <div>
    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:12,marginBottom:20}}>
      {[[recibidos.length,"Recibidos","📥",G.fairway],[noLeidos,"Sin leer","🔴",G.danger],[enviados.length,"Enviados","📤",G.sky],[mensajes.filter(m=>m.adjunto).length,"Con archivo","📎",G.purple]].map(([v,l,i,c])=>(
        <Card key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:4}}>{i}</div>
          <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
          <div style={{fontSize:11,color:G.soft,marginTop:1}}>{l}</div>
        </Card>
      ))}
    </div>

    {/* Subtabs + botón nuevo */}
    <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
      {SUBTABS.map(s=><button key={s.id} onClick={()=>setTab(s.id)}
        style={{background:tab===s.id?G.fairway:G.mist,color:tab===s.id?G.white:G.fairway,border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
        {s.label}
      </button>)}
      <div style={{marginLeft:"auto"}}>
        <Btn color="primary" onClick={openNuevo}>✉ Nuevo mensaje</Btn>
      </div>
    </div>

    {/* Lista mensajes */}
    {tab==="recibidos"&&<div>
      {recibidos.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>Sin mensajes recibidos.</div>}
      {recibidos.map(m=><MsgCard key={m.id} m={m} tipo="recibido"/>)}
    </div>}
    {tab==="enviados"&&<div>
      {enviados.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>Sin mensajes enviados.</div>}
      {enviados.map(m=><MsgCard key={m.id} m={m} tipo="enviado"/>)}
    </div>}

    {/* Modal: ver mensaje completo */}
    {verMsg&&<Modal title={verMsg.asunto} onClose={()=>setVerMsg(null)} wide>
      <div style={{fontSize:12,color:G.soft,marginBottom:12}}>
        {verMsg.de==="profesor"
          ?<>📤 Enviado a <b>{alumnoNombre(verMsg.para)}</b></>
          :<>📥 De <b>{alumnoNombre(verMsg.de)}</b></>
        } · {verMsg.fecha?.slice(0,16).replace("T"," ")}
      </div>
      <div style={{background:"#f9f9f9",borderRadius:10,padding:16,fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:14}}>
        {verMsg.cuerpo}
      </div>
      {verMsg.adjunto&&<div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:G.sky,marginBottom:8}}>📎 ARCHIVO ADJUNTO</div>
        <Btn color="sky" onClick={()=>descargarAdjunto(verMsg.adjunto,verMsg.adjuntoNombre)}>⬇ Descargar {verMsg.adjuntoNombre}</Btn>
      </div>}
      <Btn color="secondary" onClick={()=>setVerMsg(null)}>Cerrar</Btn>
    </Modal>}

    {/* Modal: nuevo mensaje */}
    {modal==="nuevo"&&<Modal title="Nuevo mensaje / archivo" onClose={()=>setModal(null)} wide>
      {/* Tipo de mensaje */}
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:G.soft,marginBottom:6}}>TIPO</label>
        <div style={{display:"flex",gap:8}}>
          {[["mensaje","💬 Mensaje"],["informe","📋 Informe"],["archivo","📎 Archivo"]].map(([v,l])=>(
            <button key={v} onClick={()=>setForm(f=>({...f,tipo:v}))}
              style={{background:form.tipo===v?G.fairway:G.mist,color:form.tipo===v?G.white:G.fairway,border:"none",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Destinatario */}
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:G.soft,marginBottom:6}}>ENVIAR A</label>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {[["alumno","👤 Alumno concreto"],["grupo","👥 Grupo/Nivel"],["todos","📢 Todos los alumnos"]].map(([v,l])=>(
            <button key={v} onClick={()=>setForm(f=>({...f,destinatario:v,alumnoIds:[],grupoId:""}))}
              style={{background:form.destinatario===v?G.fairway:G.mist,color:form.destinatario===v?G.white:G.fairway,border:"none",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {form.destinatario==="alumno"&&<div>
          <label style={{fontSize:12,color:G.soft,marginBottom:4,display:"block"}}>Selecciona alumno(s):</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6}}>
            {alumnos.filter(a=>a.activo).map(a=>{
              const sel=(form.alumnoIds||[]).includes(a.id);
              return <button key={a.id} onClick={()=>setForm(f=>{
                const ids=f.alumnoIds||[];
                return {...f,alumnoIds:sel?ids.filter(x=>x!==a.id):[...ids,a.id]};
              })} style={{background:sel?G.grass:G.mist,color:sel?G.white:G.fairway,border:"none",borderRadius:8,padding:"7px 12px",fontSize:13,fontWeight:sel?700:400,cursor:"pointer",textAlign:"left"}}>
                {sel?"✔ ":""}{a.nombre}
              </button>;
            })}
          </div>
        </div>}

        {form.destinatario==="grupo"&&<div>
          <label style={{fontSize:12,color:G.soft,marginBottom:4,display:"block"}}>Selecciona nivel:</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["Iniciación","Intermedio","Avanzado","Competición"].map(n=>(
              <button key={n} onClick={()=>setForm(f=>({...f,grupoId:n}))}
                style={{background:form.grupoId===n?G.fairway:G.mist,color:form.grupoId===n?G.white:G.fairway,border:"none",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                {n} ({alumnos.filter(a=>a.nivel===n&&a.activo).length})
              </button>
            ))}
          </div>
          {form.grupoId&&<div style={{fontSize:12,color:G.soft,marginTop:6}}>
            Se enviará a {alumnos.filter(a=>a.nivel===form.grupoId&&a.activo).length} alumno(s).
          </div>}
        </div>}

        {form.destinatario==="todos"&&<div style={{background:G.mist,borderRadius:8,padding:"8px 12px",fontSize:13,color:G.fairway,fontWeight:600}}>
          📢 Se enviará a todos los {alumnos.filter(a=>a.activo).length} alumnos activos.
        </div>}
      </div>

      <Field label="Asunto *"><Input value={form.asunto||""} onChange={v=>setForm(f=>({...f,asunto:v}))} placeholder="Asunto del mensaje"/></Field>
      <Field label="Mensaje *"><Textarea value={form.cuerpo||""} onChange={v=>setForm(f=>({...f,cuerpo:v}))} rows={5} placeholder="Escribe aquí el contenido del mensaje o informe…"/></Field>

      {/* Adjunto */}
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:G.soft,marginBottom:6}}>ADJUNTAR ARCHIVO (máx. 2MB)</label>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <label style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer",display:"inline-block"}}>
            📎 Seleccionar archivo
            <input type="file" onChange={leerArchivo} style={{display:"none"}} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.mp4,.xlsx,.xls"/>
          </label>
          {form.adjuntoNombre&&<div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,color:G.sky}}>✔ {form.adjuntoNombre}</span>
            <Btn small color="danger" onClick={()=>setForm(f=>({...f,adjunto:null,adjuntoNombre:null}))}>✕</Btn>
          </div>}
        </div>
        <div style={{fontSize:11,color:G.soft,marginTop:4}}>Formatos: PDF, Word, imagen (JPG/PNG), video (MP4), Excel</div>
      </div>

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn onClick={enviar} disabled={!form.asunto.trim()||!form.cuerpo.trim()||(form.destinatario==="alumno"&&(form.alumnoIds||[]).length===0)||(form.destinatario==="grupo"&&!form.grupoId)}>
          ✉ Enviar
        </Btn>
      </div>
    </Modal>}
  </div>;
}

// ── MENSAJERÍA EN EL PORTAL DEL ALUMNO ──────────────────────────
function ModMensajeriaAlumno({data,setData,alumnoId}){
  const [tab,setTab]=useState("recibidos");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [verMsg,setVerMsg]=useState(null);

  const mensajes=data.mensajes||[];
  const recibidos=mensajes.filter(m=>m.para===alumnoId).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const enviados=mensajes.filter(m=>m.de===alumnoId).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const noLeidos=recibidos.filter(m=>!m.leido).length;

  function marcarLeido(id){
    setData({...data,mensajes:mensajes.map(m=>m.id===id?{...m,leido:true}:m)});
    // Also update in Firebase
    const fbMsg=fbMensajes.find(m=>m.id===id);
    if(fbMsg?._fbId) updateDoc(doc(db,"mensajes",fbMsg._fbId),{leido:true}).catch(e=>console.warn(e));
  }

  function leerArchivo(e){
    const file=e.target.files[0]; if(!file) return;
    if(file.size>2*1024*1024){alert("El archivo no puede superar 2MB.");return;}
    const reader=new FileReader();
    reader.onload=ev=>setForm(f=>({...f,adjunto:ev.target.result,adjuntoNombre:file.name}));
    reader.readAsDataURL(file);
  }

  function enviarAlProfesor(){
    if(!form.asunto?.trim()||!form.cuerpo?.trim()) return;
    const nuevo={
      id:uid(), de:alumnoId, para:"profesor",
      asunto:form.asunto, cuerpo:form.cuerpo,
      tipo:"mensaje", adjunto:form.adjunto||null,
      adjuntoNombre:form.adjuntoNombre||null,
      fecha:new Date().toISOString(), leido:false,
    };
    setData({...data,mensajes:[...mensajes,nuevo]});
    setModal(null);
    alert("✅ Mensaje enviado al profesor.");
  }

  function descargarAdjunto(adjunto,nombre){
    const a=document.createElement("a"); a.href=adjunto; a.download=nombre||"archivo"; a.click();
  }

  const MsgCardA=({m,tipo})=><div onClick={()=>{setVerMsg(m);if(tipo==="recibido"&&!m.leido)marcarLeido(m.id);}}
    style={{background:G.white,borderRadius:12,boxShadow:"0 2px 8px rgba(0,0,0,.07)",padding:"14px 16px",marginBottom:10,cursor:"pointer",
      borderLeft:`4px solid ${m.tipo==="informe"?G.purple:m.tipo==="archivo"?G.sky:G.grass}`,
      opacity:tipo==="recibido"&&!m.leido?1:0.85}}>
    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
      <div style={{fontSize:20,flexShrink:0}}>{m.tipo==="informe"?"📋":m.tipo==="archivo"?"📎":"💬"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:G.ink,fontSize:14}}>{m.asunto}</span>
          {tipo==="recibido"&&!m.leido&&<span style={{background:G.danger,color:G.white,borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700}}>NUEVO</span>}
          <span style={{fontSize:11,color:G.soft,marginLeft:"auto"}}>{m.fecha?.slice(0,16).replace("T"," ")}</span>
        </div>
        <div style={{fontSize:12,color:G.soft,marginTop:3}}>{tipo==="recibido"?"De: Tu profesor":"Para: Tu profesor"}</div>
        <div style={{fontSize:13,color:"#555",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.cuerpo}</div>
        {m.adjuntoNombre&&<div style={{fontSize:12,color:G.sky,marginTop:4}}>📎 {m.adjuntoNombre}</div>}
      </div>
    </div>
  </div>;

  return <div>
    {/* Subtabs */}
    <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
      {[{id:"recibidos",label:`📥 Del profesor${noLeidos>0?` (${noLeidos})`:""}` },{id:"enviados",label:"📤 Mis mensajes"}].map(s=>(
        <button key={s.id} onClick={()=>setTab(s.id)}
          style={{background:tab===s.id?G.fairway:G.mist,color:tab===s.id?G.white:G.fairway,border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          {s.label}
        </button>
      ))}
      <div style={{marginLeft:"auto"}}>
        <Btn onClick={()=>{setForm({asunto:"",cuerpo:""});setModal("nuevo");}}>✉ Escribir al profesor</Btn>
      </div>
    </div>

    {tab==="recibidos"&&<div>
      {recibidos.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>No tienes mensajes de tu profesor todavía.</div>}
      {recibidos.map(m=><MsgCardA key={m.id} m={m} tipo="recibido"/>)}
    </div>}
    {tab==="enviados"&&<div>
      {enviados.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>Aún no has enviado ningún mensaje.</div>}
      {enviados.map(m=><MsgCardA key={m.id} m={m} tipo="enviado"/>)}
    </div>}

    {/* Ver mensaje */}
    {verMsg&&<Modal title={verMsg.asunto} onClose={()=>setVerMsg(null)} wide>
      <div style={{fontSize:12,color:G.soft,marginBottom:12}}>
        {verMsg.de==="profesor"?"📥 De tu profesor":"📤 Enviado a tu profesor"} · {verMsg.fecha?.slice(0,16).replace("T"," ")}
      </div>
      <div style={{background:"#f9f9f9",borderRadius:10,padding:16,fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:14}}>{verMsg.cuerpo}</div>
      {verMsg.adjunto&&<div style={{marginBottom:14}}>
        <Btn color="sky" onClick={()=>descargarAdjunto(verMsg.adjunto,verMsg.adjuntoNombre)}>⬇ Descargar {verMsg.adjuntoNombre}</Btn>
      </div>}
      <Btn color="secondary" onClick={()=>setVerMsg(null)}>Cerrar</Btn>
    </Modal>}

    {/* Nuevo mensaje al profesor */}
    {modal==="nuevo"&&<Modal title="Mensaje para el profesor" onClose={()=>setModal(null)}>
      <Field label="Asunto *"><Input value={form.asunto||""} onChange={v=>setForm(f=>({...f,asunto:v}))} placeholder="Asunto del mensaje"/></Field>
      <Field label="Mensaje *"><Textarea value={form.cuerpo||""} onChange={v=>setForm(f=>({...f,cuerpo:v}))} rows={5} placeholder="Escribe tu mensaje aquí…"/></Field>
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:12,fontWeight:600,color:G.soft,marginBottom:6}}>ADJUNTAR ARCHIVO (opcional, máx. 2MB)</label>
        <label style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer",display:"inline-block"}}>
          📎 Seleccionar archivo
          <input type="file" onChange={leerArchivo} style={{display:"none"}} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.mp4,.xlsx"/>
        </label>
        {form.adjuntoNombre&&<span style={{marginLeft:10,fontSize:13,color:G.sky}}>✔ {form.adjuntoNombre}</span>}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn onClick={enviarAlProfesor} disabled={!form.asunto?.trim()||!form.cuerpo?.trim()}>✉ Enviar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// MÓDULO CURSO 2026/2027
// ═══════════════════════════════════════════════════════════════════
function ModCurso({data,setData,alumnos}){
  const [grupoSel,setGrupoSel]=useState("prebenjamin");
  const [trimSel,setTrimSel]=useState("todos");
  const [catSel,setCatSel]=useState("Todos");
  const [verEj,setVerEj]=useState(null);
  const [asignarEj,setAsignarEj]=useState(null);
  const asignaciones=data.asignaciones||[];

  const grupo=GRUPOS_EDAD.find(g=>g.id===grupoSel);
  const filtrados=EJERCICIOS_CURSO.filter(e=>{
    const matchGrupo=e.grupo===grupoSel;
    const matchTrim=trimSel==="todos"||e.trimestre===Number(trimSel);
    const matchCat=catSel==="Todos"||e.categoria===catSel;
    return matchGrupo&&matchTrim&&matchCat;
  });

  const cats=["Todos",...new Set(EJERCICIOS_CURSO.filter(e=>e.grupo===grupoSel).map(e=>e.categoria))];

  function asignarEjercicio(ejId,alumnoId,notas){
    setData({...data,asignaciones:[...asignaciones,{id:uid(),ejId,alumnoId,fecha:today(),notas,completado:false}]});
    setAsignarEj(null);
  }

  return <div>
    {/* Selector de grupo */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      {GRUPOS_EDAD.map(g=>(
        <button key={g.id} onClick={()=>{setGrupoSel(g.id);setCatSel("Todos");}}
          style={{background:grupoSel===g.id?g.color:"#f0f0f0",color:grupoSel===g.id?G.white:"#555",border:"none",borderRadius:20,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>
          {g.emoji} {g.nombre} <span style={{fontSize:11,opacity:.8}}>({g.rango})</span>
        </button>
      ))}
    </div>

    {/* Info del grupo */}
    {grupo&&<div style={{background:grupo.color,color:G.white,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:32}}>{grupo.emoji}</span>
      <div>
        <div style={{fontWeight:800,fontSize:16}}>{grupo.nombre} — {grupo.rango}</div>
        <div style={{fontSize:13,opacity:.9,marginTop:2}}>{grupo.descripcion}</div>
        <div style={{fontSize:12,opacity:.8,marginTop:4}}>
          {EJERCICIOS_CURSO.filter(e=>e.grupo===grupoSel).length} ejercicios programados para el curso 2026/2027
        </div>
      </div>
    </div>}

    {/* Filtros */}
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <Sel value={trimSel} onChange={setTrimSel} options={[{value:"todos",label:"Todos los trimestres"},{value:"1",label:"1er Trimestre"},{value:"2",label:"2º Trimestre"},{value:"3",label:"3er Trimestre"},{value:"4",label:"4º Trimestre"}]}/>
      <Sel value={catSel} onChange={setCatSel} options={cats.map(c=>({value:c,label:c}))}/>
      <span style={{fontSize:13,color:G.soft}}>{filtrados.length} ejercicio{filtrados.length!==1?"s":""}</span>
    </div>

    {/* Lista por semana */}
    <div style={{display:"grid",gap:8}}>
      {filtrados.sort((a,b)=>a.trimestre-b.trimestre||a.semana-b.semana).map(e=>{
        const asignado=asignaciones.some(a=>a.ejId===e.id);
        return <Card key={e.id} style={{borderLeft:`3px solid ${grupo?.color||G.grass}`}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{background:grupo?.color||G.grass,color:G.white,borderRadius:8,padding:"4px 8px",textAlign:"center",flexShrink:0,minWidth:52}}>
              <div style={{fontSize:9,opacity:.8}}>T{e.trimestre} S{e.semana}</div>
              <div style={{fontSize:13,fontWeight:800}}>{e.categoria.split(" ")[0]}</div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:G.ink,fontSize:14}}>{e.nombre}</div>
              <div style={{fontSize:12,color:G.soft,marginTop:2}}>{e.objetivo}</div>
              <div style={{fontSize:11,color:G.soft,marginTop:3}}>⏱ {e.duracion} · 🎒 {e.material.split(",")[0]}{e.material.includes(",")?"…":""}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:5}}>
                {(e.tags||[]).slice(0,4).map(t=><span key={t} style={{background:"#f0f0f0",color:"#666",borderRadius:10,padding:"1px 7px",fontSize:10}}>#{t}</span>)}
              </div>
            </div>
            <div style={{display:"flex",gap:5,flexShrink:0,flexDirection:"column",alignItems:"flex-end"}}>
              <Btn small color="secondary" onClick={()=>setVerEj(e)}>Ver</Btn>
              <Btn small color={asignado?"gold":"sky"} onClick={()=>setAsignarEj(e)}>{asignado?"+ Reasignar":"Asignar"}</Btn>
            </div>
          </div>
        </Card>;
      })}
    </div>

    {/* Modal detalle */}
    {verEj&&<EjercicioDetalle ej={verEj} onClose={()=>setVerEj(null)} onAsignar={()=>{setAsignarEj(verEj);setVerEj(null);}}/>}
    {asignarEj&&<AsignarModal ej={asignarEj} alumnos={alumnos} onClose={()=>setAsignarEj(null)} onSave={asignarEjercicio}/>}
  </div>;
}

function ModEjerciciosAdmin({ data, setData }) {
  const [catFiltro, setCatFiltro] = useState("Todos");
  const [nivelFiltro, setNivelFiltro] = useState("Todos");
  const [search, setSearch] = useState("");
  const [verEj, setVerEj] = useState(null);
  const [asignarModal, setAsignarModal] = useState(null);
  const [tabPrincipal, setTabPrincipal] = useState("biblioteca"); // "biblioteca"|"tests"|"asignados"|"resultados"

  // Ejercicios personalizados creados por el profesor
  const ejerciciosCustom = data.ejerciciosCustom || [];
  const asignaciones = data.asignaciones || [];   // {id, alumnoId, ejId, fecha, notas, completado}
  const resultadosTest = data.resultadosTest || []; // {id, alumnoId, testCat, fecha, score, total, detalle}
  const alumnos = data.alumnos || [];

  const todosEj = [...EJERCICIOS_BIBLIOTECA, ...ejerciciosCustom];

  const filtrados = todosEj.filter(e => {
    const matchCat = catFiltro === "Todos" || e.categoria === catFiltro;
    const matchNivel = nivelFiltro === "Todos" || e.nivel === nivelFiltro || e.nivel === "Todos";
    const matchSearch = !search || e.nombre.toLowerCase().includes(search.toLowerCase()) || (e.tags||[]).some(t=>t.includes(search.toLowerCase()));
    return matchCat && matchNivel && matchSearch;
  });

  function asignarEjercicio(ejId, alumnoId, notas) {
    const nueva = { id: uid(), ejId, alumnoId, fecha: today(), notas, completado: false };
    setData({ ...data, asignaciones: [...asignaciones, nueva] });
    setAsignarModal(null);
  }

  function toggleCompletado(id) {
    setData({ ...data, asignaciones: asignaciones.map(a => a.id === id ? { ...a, completado: !a.completado } : a) });
  }

  function alumnoNombre(id) { return alumnos.find(a => a.id === id)?.nombre || "—"; }
  function ejNombre(id) { return todosEj.find(e => e.id === id)?.nombre || "—"; }

  // ── Sub-tabs ──────────────────────────────────────────────────────
  const SUB = [
    { id:"biblioteca", label:"📚 Biblioteca" },
    { id:"curso",      label:"🏫 Curso 2026/27" },
    { id:"asignados",  label:"📌 Asignados" },
    { id:"tests",      label:"🧩 Tests" },
    { id:"resultados", label:"📊 Resultados" },
  ];

  return (
    <div>
      {/* Sub-navegación */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {SUB.map(s => (
          <button key={s.id} onClick={() => setTabPrincipal(s.id)}
            style={{ background: tabPrincipal===s.id ? G.fairway : G.mist, color: tabPrincipal===s.id ? G.white : G.fairway,
              border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── CURSO 2026/2027 ── */}
      {tabPrincipal==="curso" && <ModCurso data={data} setData={setData} alumnos={alumnos}/>}

      {/* ── BIBLIOTECA ── */}
      {tabPrincipal==="biblioteca" && <div>
        {/* Filtros */}
        <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar ejercicio o tag…"
            style={{ flex:1, minWidth:160, border:"1.5px solid #d0e0d0", borderRadius:8, padding:"8px 12px", fontSize:14, fontFamily:"inherit" }}/>
          <Sel value={nivelFiltro} onChange={setNivelFiltro} options={["Todos","Iniciación","Intermedio","Avanzado"].map(v=>({value:v,label:v}))}/>
        </div>
        {/* Categorías */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCatFiltro(c)}
              style={{ background: catFiltro===c ? G.fairway : "#f0f0f0", color: catFiltro===c ? G.white : G.soft,
                border:"none", borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {CAT_ICONS[c]||"📌"} {c} {c!=="Todos"&&<span style={{opacity:.7}}>({todosEj.filter(e=>e.categoria===c).length})</span>}
            </button>
          ))}
        </div>
        <div style={{ fontSize:13, color:G.soft, marginBottom:12 }}>{filtrados.length} ejercicio{filtrados.length!==1?"s":""}</div>
        <div style={{ display:"grid", gap:10 }}>
          {filtrados.map(e => (
            <Card key={e.id}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ fontSize:28, flexShrink:0 }}>{CAT_ICONS[e.categoria]||"📌"}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontWeight:700, color:G.ink, fontSize:15 }}>{e.nombre}</span>
                    <Badge color={CAT_COLORS[e.categoria]||"gray"}>{e.categoria}</Badge>
                    <Badge color={e.nivel==="Iniciación"?"green":e.nivel==="Intermedio"?"gold":e.nivel==="Avanzado"?"blue":"gray"}>{e.nivel}</Badge>
                    {e.duracion && <Badge color="gray">⏱ {e.duracion}</Badge>}
                  </div>
                  <div style={{ fontSize:13, color:G.soft, marginBottom:6 }}>{e.objetivo}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {(e.tags||[]).map(t => <span key={t} style={{ background:"#f0f0f0", color:"#666", borderRadius:12, padding:"2px 8px", fontSize:11 }}>#{t}</span>)}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <Btn small color="secondary" onClick={() => setVerEj(e)}>Ver</Btn>
                  <Btn small color="sky" onClick={() => setAsignarModal(e)}>Asignar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>}

      {/* ── ASIGNADOS ── */}
      {tabPrincipal==="asignados" && <div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:12, marginBottom:20 }}>
          {[[asignaciones.length,"Total asignados",G.fairway],[asignaciones.filter(a=>!a.completado).length,"Pendientes",G.orange],[asignaciones.filter(a=>a.completado).length,"Completados",G.grass]].map(([v,l,c])=>(
            <Card key={l} style={{textAlign:"center"}}><div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:12,color:G.soft,marginTop:2}}>{l}</div></Card>
          ))}
        </div>
        <div style={{ display:"grid", gap:10 }}>
          {asignaciones.length===0 && <div style={{ color:G.soft, textAlign:"center", padding:30 }}>Sin ejercicios asignados. Ve a la Biblioteca y asigna ejercicios a los alumnos.</div>}
          {[...asignaciones].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(a => (
            <Card key={a.id} style={{ borderLeft:`3px solid ${a.completado?G.grass:G.orange}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:20 }}>{a.completado?"✅":"📌"}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, color:G.ink }}>{ejNombre(a.ejId)}</div>
                  <div style={{ fontSize:12, color:G.soft }}>👤 {alumnoNombre(a.alumnoId)} · 📅 {a.fecha}</div>
                  {a.notas && <div style={{ fontSize:12, color:"#555", marginTop:3 }}>{a.notas}</div>}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <Badge color={a.completado?"green":"gold"}>{a.completado?"Hecho":"Pendiente"}</Badge>
                  <Btn small color={a.completado?"secondary":"sky"} onClick={()=>toggleCompletado(a.id)}>{a.completado?"↩":"✔"}</Btn>
                  <Btn small color="danger" onClick={()=>{if(confirm("¿Eliminar?"))setData({...data,asignaciones:asignaciones.filter(x=>x.id!==a.id)});}}>✕</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>}

      {/* ── TESTS ── */}
      {tabPrincipal==="tests" && <PanelTests data={data} setData={setData} modo="admin"/>}

      {/* ── RESULTADOS ── */}
      {tabPrincipal==="resultados" && <div>
        <h3 style={{ margin:"0 0 14px", color:G.fairway }}>📊 Resultados de Tests</h3>
        {resultadosTest.length===0 && <div style={{ color:G.soft, textAlign:"center", padding:30 }}>Sin resultados de tests todavía.</div>}
        {[...resultadosTest].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(r => (
          <Card key={r.id} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", gap:12, alignItems:"center" }}>
              <div style={{ fontSize:28 }}>{CAT_ICONS[r.testCat]||"🧩"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:G.ink }}>{alumnoNombre(r.alumnoId)}</div>
                <div style={{ fontSize:13, color:G.soft }}>Test {r.testCat} · {r.fecha}</div>
                <div style={{ marginTop:6 }}>
                  <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:G.mist, borderRadius:8, padding:"4px 10px" }}>
                    <span style={{ fontWeight:800, color:G.fairway, fontSize:18 }}>{r.score}/{r.total}</span>
                    <span style={{ fontSize:13, color:G.soft }}>({Math.round(r.score/r.total*100)}%)</span>
                    <Badge color={r.score/r.total>=.7?"green":r.score/r.total>=.5?"gold":"red"}>{r.score/r.total>=.7?"Superado":r.score/r.total>=.5?"Mejorable":"Repasar"}</Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>}

      {/* Modal: Ver ejercicio completo */}
      {verEj && <EjercicioDetalle ej={verEj} onClose={()=>setVerEj(null)} onAsignar={()=>{setAsignarModal(verEj);setVerEj(null);}}/>}

      {/* Modal: Asignar ejercicio */}
      {asignarModal && <AsignarModal ej={asignarModal} alumnos={alumnos} onClose={()=>setAsignarModal(null)} onSave={asignarEjercicio}/>}
    </div>
  );
}

// ─── Detalle ejercicio ────────────────────────────────────────────
// Golf exercise illustrations - SVG React components
// One per exercise ID

const ILUSTRACIONES = {

// ══════════════════════════════════════════════════
// PUTT
// ══════════════════════════════════════════════════

"ej001": ({}) => (
<svg viewBox="0 0 260 220" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="220" fill="#e8f5eb" rx="14"/>
  {/* Green surface */}
  <ellipse cx="130" cy="130" rx="110" ry="75" fill="#4caf65" opacity="0.3"/>
  <ellipse cx="130" cy="130" rx="85" ry="58" fill="#2e7d3c" opacity="0.2"/>
  {/* Hole */}
  <circle cx="130" cy="125" r="11" fill="#1a2e1d"/>
  <circle cx="130" cy="125" r="7" fill="#0d1f10"/>
  {/* Flag */}
  <line x1="130" y1="114" x2="130" y2="78" stroke="#999" strokeWidth="2.5"/>
  <polygon points="130,78 152,86 130,94" fill="#c0392b"/>
  {/* Square 1m */}
  <rect x="82" y="83" width="96" height="96" fill="none" stroke="#c8a84b" strokeWidth="2.5" strokeDasharray="8,5" rx="3"/>
  {/* Tee markers at corners */}
  {[["82","83"],["178","83"],["82","179"],["178","179"]].map(([cx,cy],i)=>(
    <g key={i}>
      <line x1={Number(cx)} y1={Number(cy)-10} x2={Number(cx)} y2={Number(cy)} stroke="#8B6914" strokeWidth="3" strokeLinecap="round"/>
      <line x1={Number(cx)-5} y1={Number(cy)-2} x2={Number(cx)+5} y2={Number(cy)-2} stroke="#8B6914" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ))}
  {/* Balls */}
  <circle cx="82" cy="83" r="6" fill="white" stroke="#aaa" strokeWidth="2"/>
  <circle cx="178" cy="83" r="6" fill="white" stroke="#aaa" strokeWidth="2"/>
  <circle cx="82" cy="179" r="6" fill="white" stroke="#aaa" strokeWidth="2"/>
  <circle cx="178" cy="179" r="6" fill="white" stroke="#aaa" strokeWidth="2"/>
  {/* Arrow from top-left ball to hole */}
  <path d="M88,89 Q110,100 121,116" fill="none" stroke="#1a5c2a" strokeWidth="2.5" markerEnd="url(#a1)"/>
  <defs><marker id="a1" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#1a5c2a"/></marker></defs>
  {/* Dimension labels */}
  <text x="130" y="210" textAnchor="middle" fontSize="12" fill="#1a2e1d" fontWeight="bold">1 metro entre tees</text>
  <text x="130" y="30" textAnchor="middle" fontSize="10" fill="#555">Embocar 3 consecutivos desde cada esquina</text>
  <text x="130" y="44" textAnchor="middle" fontSize="10" fill="#555">sin fallar · Repite hasta conseguirlo</text>
</svg>
),

"ej002": ({}) => (
<svg viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="260" fill="#e8f5eb" rx="14"/>
  {/* Green circles */}
  <circle cx="130" cy="130" r="110" fill="#4caf65" opacity="0.2"/>
  <circle cx="130" cy="130" r="80" fill="#2e7d3c" opacity="0.15"/>
  <circle cx="130" cy="130" r="50" fill="#1a5c2a" opacity="0.12"/>
  {/* Hole */}
  <circle cx="130" cy="130" r="10" fill="#1a2e1d"/>
  <line x1="130" y1="120" x2="130" y2="90" stroke="#aaa" strokeWidth="2"/>
  <polygon points="130,90 148,98 130,106" fill="#c0392b"/>
  {/* 12 balls at clock positions */}
  {Array.from({length:12},(_,i)=>{
    const ang=(i*30-90)*Math.PI/180;
    const r=90, bx=130+r*Math.cos(ang), by=130+r*Math.sin(ang);
    const hour=i===0?12:i;
    const done=i<4;
    return <g key={i}>
      <circle cx={bx} cy={by} r="8" fill={done?"#c8a84b":"white"} stroke={done?"#8B6914":"#aaa"} strokeWidth="2"/>
      <text x={bx} y={by+4} textAnchor="middle" fontSize="8" fill={done?"white":"#555"} fontWeight="bold">{hour}</text>
    </g>;
  })}
  {/* Radial lines */}
  {Array.from({length:12},(_,i)=>{
    const ang=(i*30-90)*Math.PI/180;
    return <line key={i} x1={130+42*Math.cos(ang)} y1={130+42*Math.sin(ang)}
      x2={130+78*Math.cos(ang)} y2={130+78*Math.sin(ang)}
      stroke="#2e7d3c" strokeWidth="1" opacity="0.3"/>;
  })}
  <text x="130" y="252" textAnchor="middle" fontSize="11" fill="#1a2e1d" fontWeight="bold">12 posiciones · Sin fallar ninguna</text>
</svg>
),

"ej003": ({}) => (
<svg viewBox="0 0 280 200" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:320,display:"block",margin:"0 auto"}}>
  <rect width="280" height="200" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="50" width="260" height="120" fill="#4caf65" opacity="0.2" rx="8"/>
  {/* Hole+flag */}
  <circle cx="240" cy="115" r="10" fill="#1a2e1d"/>
  <line x1="240" y1="105" x2="240" y2="75" stroke="#aaa" strokeWidth="2"/>
  <polygon points="240,75 258,83 240,91" fill="#c0392b"/>
  {/* Target ring */}
  <circle cx="240" cy="115" r="22" fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="5,3" opacity="0.8"/>
  <text x="240" y="148" textAnchor="middle" fontSize="9" fill="#c0392b" fontWeight="bold">zona 30cm</text>
  {/* Distance lines */}
  {[[60,"3m"],[120,"6m"],[180,"9m"]].map(([x,label])=>(
    <g key={label}>
      <line x1={x} y1="52" x2={x} y2="168" stroke="#c8a84b" strokeWidth="1.5" strokeDasharray="6,4"/>
      <text x={x} y="46" textAnchor="middle" fontSize="11" fill="#8B6914" fontWeight="bold">{label}</text>
    </g>
  ))}
  {/* Balls */}
  {[[60,115],[120,115],[180,115]].map(([x,y],i)=>(
    <g key={i}>
      <circle cx={x} cy={y} r="7" fill="white" stroke="#888" strokeWidth="2"/>
      <line x1={x+7} y1={y} x2={220} y2={115} stroke="#1a5c2a" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5"/>
    </g>
  ))}
  {/* Putter */}
  <line x1="30" y1="90" x2="52" y2="112" stroke="#555" strokeWidth="4" strokeLinecap="round"/>
  <rect x="47" y="110" width="14" height="8" fill="#777" rx="3"/>
  <text x="140" y="192" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Deja la bola cerca del hoyo — controla la velocidad</text>
</svg>
),

"ej004": ({}) => (
<svg viewBox="0 0 260 230" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="230" fill="#e8f5eb" rx="14"/>
  <ellipse cx="130" cy="115" rx="115" ry="90" fill="#4caf65" opacity="0.25"/>
  {/* 18 numbered holes as a winding path */}
  {[
    [30,80],[58,55],[95,45],[135,48],[170,60],[200,85],[210,115],
    [198,148],[170,170],[135,178],[95,175],[58,162],[35,138],[45,108],
    [72,90],[108,75],[148,80],[182,105]
  ].map(([x,y],i)=>(
    <g key={i}>
      <circle cx={x} cy={y} r="9" fill={i<9?"#1a5c2a":"#3a7abf"} stroke="white" strokeWidth="1.5"/>
      <text x={x} y={y+4} textAnchor="middle" fontSize="7.5" fill="white" fontWeight="bold">{i+1}</text>
    </g>
  ))}
  {/* Winding path */}
  <polyline points="30,80 58,55 95,45 135,48 170,60 200,85 210,115 198,148 170,170 135,178 95,175 58,162 35,138 45,108 72,90 108,75 148,80 182,105"
    fill="none" stroke="#c8a84b" strokeWidth="2" strokeDasharray="6,4" opacity="0.6"/>
  {/* Putter + ball at start */}
  <circle cx="30" cy="80" r="6" fill="white" stroke="#888" strokeWidth="2"/>
  <line x1="20" y1="65" x2="28" y2="77" stroke="#555" strokeWidth="3" strokeLinecap="round"/>
  {/* Legend */}
  <circle cx="20" cy="210" r="7" fill="#1a5c2a"/>
  <text x="32" y="214" fontSize="10" fill="#555">Hoyos 1-9</text>
  <circle cx="110" cy="210" r="7" fill="#3a7abf"/>
  <text x="122" y="214" fontSize="10" fill="#555">Hoyos 10-18</text>
  <text x="130" y="228" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Diseña tu propio recorrido de 18 putts</text>
</svg>
),

// ══════════════════════════════════════════════════
// JUEGO CORTO
// ══════════════════════════════════════════════════

"ej005": ({}) => (
<svg viewBox="0 0 280 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:320,display:"block",margin:"0 auto"}}>
  <rect width="280" height="210" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="55" width="260" height="125" fill="#4caf65" opacity="0.25" rx="8"/>
  {/* Green */}
  <ellipse cx="230" cy="120" rx="40" ry="30" fill="#2e7d3c" opacity="0.5"/>
  <circle cx="230" cy="116" r="8" fill="#1a2e1d"/>
  <line x1="230" y1="108" x2="230" y2="82" stroke="#aaa" strokeWidth="2"/>
  <polygon points="230,82 246,90 230,98" fill="#c0392b"/>
  {/* Ball */}
  <circle cx="30" cy="120" r="8" fill="white" stroke="#888" strokeWidth="2"/>
  {/* Landing coin */}
  <circle cx="110" cy="118" r="9" fill="#c8a84b" stroke="#8B6914" strokeWidth="2"/>
  <text x="110" y="122" textAnchor="middle" fontSize="9" fill="#4a3000" fontWeight="bold">€</text>
  <line x1="110" y1="108" x2="110" y2="98" stroke="#8B6914" strokeWidth="1.5"/>
  <text x="110" y="95" textAnchor="middle" fontSize="9" fill="#8B6914" fontWeight="bold">1/3</text>
  {/* Trajectory arc */}
  <path d="M38,118 Q110,55 202,116" fill="none" stroke="#1a5c2a" strokeWidth="3" strokeDasharray="7,4"/>
  <polygon points="202,116 192,112 194,123" fill="#1a5c2a"/>
  {/* Roll arrow */}
  <path d="M202,116 Q218,118 222,116" fill="none" stroke="#1a5c2a" strokeWidth="2"/>
  {/* Labels */}
  <text x="30" y="148" textAnchor="middle" fontSize="9" fill="#555">bola</text>
  <text x="230" y="158" textAnchor="middle" fontSize="9" fill="#555">objetivo</text>
  <text x="140" y="200" textAnchor="middle" fontSize="11" fill="#1a2e1d" fontWeight="bold">Moneda = punto de caída (1/3 distancia)</text>
</svg>
),

"ej006": ({}) => (
<svg viewBox="0 0 280 200" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:320,display:"block",margin:"0 auto"}}>
  <rect width="280" height="200" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="45" width="260" height="120" fill="#4caf65" opacity="0.25" rx="8"/>
  {/* Player silhouette */}
  <circle cx="30" cy="95" r="10" fill="#1a5c2a"/>
  <line x1="30" y1="105" x2="30" y2="130" stroke="#1a5c2a" strokeWidth="4" strokeLinecap="round"/>
  <line x1="30" y1="115" x2="18" y2="128" stroke="#1a5c2a" strokeWidth="3" strokeLinecap="round"/>
  <line x1="30" y1="115" x2="44" y2="126" stroke="#1a5c2a" strokeWidth="3" strokeLinecap="round"/>
  {/* Distance markers */}
  {[[70,"5m"],[120,"10m"],[170,"15m"],[230,"20m"]].map(([x,label],i)=>(
    <g key={i}>
      <line x1={x} y1="48" x2={x} y2="165" stroke={["#3a7abf","#2e7d3c","#c8a84b","#c0392b"][i]} strokeWidth="2" strokeDasharray="6,4"/>
      <text x={x} y="43" textAnchor="middle" fontSize="11" fill={["#3a7abf","#2e7d3c","#c8a84b","#c0392b"][i]} fontWeight="bold">{label}</text>
      {/* Ball arc for each */}
      <path d={`M42,118 Q${(42+x)/2},${75-i*8} ${x-3},118`} fill="none"
        stroke={["#3a7abf","#2e7d3c","#c8a84b","#c0392b"][i]} strokeWidth="2" strokeDasharray="5,3" opacity="0.8"/>
      <circle cx={x-3} cy="118" r="5" fill="white" stroke={["#3a7abf","#2e7d3c","#c8a84b","#c0392b"][i]} strokeWidth="1.5"/>
    </g>
  ))}
  <text x="140" y="192" textAnchor="middle" fontSize="11" fill="#1a2e1d" fontWeight="bold">Mismo palo · Varía solo el tamaño del swing</text>
</svg>
),

"ej007": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  {/* Bunker shape */}
  <ellipse cx="125" cy="155" rx="100" ry="50" fill="#f5f0e8"/>
  <ellipse cx="125" cy="155" rx="88" ry="42" fill="#e8d5a0"/>
  {/* Sand texture dots */}
  {[[80,145],[100,160],[120,148],[140,162],[160,145],[90,168],[150,168],[115,172]].map(([x,y],i)=>(
    <ellipse key={i} cx={x} cy={y} rx="7" ry="3.5" fill="#d4b866" opacity="0.45" transform={`rotate(${i*22},${x},${y})`}/>
  ))}
  {/* Ball in bunker */}
  <circle cx="115" cy="148" r="8" fill="white" stroke="#888" strokeWidth="2"/>
  {/* Entry point - 5-7cm behind */}
  <line x1="96" y1="148" x2="107" y2="148" stroke="#c0392b" strokeWidth="3" strokeLinecap="round"/>
  <text x="95" y="143" textAnchor="middle" fontSize="9" fill="#c0392b" fontWeight="bold">5-7cm</text>
  {/* Club - open face indicator */}
  <line x1="80" y1="95" x2="105" y2="142" stroke="#555" strokeWidth="4" strokeLinecap="round"/>
  <ellipse cx="107" cy="146" rx="12" ry="6" fill="none" stroke="#555" strokeWidth="3" transform="rotate(-25,107,146)"/>
  <text x="68" y="108" textAnchor="middle" fontSize="9" fill="#555" fontWeight="bold">cara</text>
  <text x="68" y="118" textAnchor="middle" fontSize="9" fill="#555" fontWeight="bold">abierta</text>
  {/* Trajectory */}
  <path d="M115,140 Q148,75 195,65" fill="none" stroke="#1a5c2a" strokeWidth="3"/>
  <polygon points="195,65 183,68 186,79" fill="#1a5c2a"/>
  {/* Green target */}
  <ellipse cx="210" cy="60" rx="30" ry="18" fill="#2e7d3c" opacity="0.6"/>
  <circle cx="210" cy="57" r="6" fill="#1a2e1d"/>
  <line x1="210" y1="51" x2="210" y2="35" stroke="#aaa" strokeWidth="1.5"/>
  <polygon points="210,35 222,41 210,47" fill="#c0392b"/>
  <text x="130" y="205" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Entrada 5-7cm tras la bola · Cara abierta · Explosión</text>
</svg>
),

"ej008": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="140" width="240" height="50" fill="#4caf65" opacity="0.35" rx="5"/>
  {/* Green target */}
  <ellipse cx="210" cy="138" rx="32" ry="12" fill="#2e7d3c" opacity="0.7"/>
  <circle cx="210" cy="135" r="6" fill="#1a2e1d"/>
  <line x1="210" y1="129" x2="210" y2="108" stroke="#aaa" strokeWidth="1.5"/>
  <polygon points="210,108 222,114 210,120" fill="#c0392b"/>
  {/* Obstacle */}
  <rect x="110" y="70" width="8" height="72" fill="#888" rx="3"/>
  <rect x="90" y="67" width="48" height="10" fill="#c0392b" rx="4"/>
  <text x="114" y="63" textAnchor="middle" fontSize="9" fill="#555" fontWeight="bold">obstáculo</text>
  {/* Measurement */}
  <line x1="90" y1="55" x2="90" y2="67" stroke="#555" strokeWidth="1" strokeDasharray="3,2"/>
  <line x1="138" y1="55" x2="138" y2="67" stroke="#555" strokeWidth="1" strokeDasharray="3,2"/>
  <line x1="90" y1="58" x2="138" y2="58" stroke="#555" strokeWidth="1.5"/>
  <text x="114" y="52" textAnchor="middle" fontSize="9" fill="#555">~1m alto</text>
  {/* Ball */}
  <circle cx="38" cy="138" r="8" fill="white" stroke="#888" strokeWidth="2"/>
  {/* High lob trajectory */}
  <path d="M46,134 Q114,18 178,134" fill="none" stroke="#1a5c2a" strokeWidth="3"/>
  <polygon points="178,134 168,130 170,141" fill="#1a5c2a"/>
  {/* Swing arc */}
  <path d="M26,150 Q38,112 50,150" fill="none" stroke="#c8a84b" strokeWidth="2.5" strokeDasharray="4,3"/>
  <text x="35" y="170" textAnchor="middle" fontSize="9" fill="#c8a84b">swing U</text>
  <text x="130" y="205" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Lob sobre obstáculo · Cara muy abierta · Swing en U</text>
</svg>
),

"ej009": ({}) => (
<svg viewBox="0 0 260 240" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="240" fill="#e8f5eb" rx="14"/>
  <ellipse cx="130" cy="110" rx="110" ry="85" fill="#2e7d3c" opacity="0.3"/>
  {/* Hole */}
  <circle cx="130" cy="100" r="10" fill="#1a2e1d"/>
  <line x1="130" y1="90" x2="130" y2="62" stroke="#aaa" strokeWidth="2"/>
  <polygon points="130,62 146,70 130,78" fill="#c0392b"/>
  {/* 9 positions with terrain types */}
  {[
    [22,85,"rough","#2e7d3c"],
    [30,148,"pendiente","#4caf65"],
    [72,188,"bunker","#e8d5a0"],
    [130,196,"fairway","#81c784"],
    [190,188,"rough","#2e7d3c"],
    [232,140,"pendiente","#4caf65"],
    [236,80,"rough","#2e7d3c"],
    [185,30,"fairway","#81c784"],
    [65,32,"bunker","#e8d5a0"],
  ].map(([x,y,tipo,color],i)=>(
    <g key={i}>
      <circle cx={x} cy={y} r="14" fill={color} stroke="#555" strokeWidth="1.5"/>
      <text x={x} y={y+5} textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">{i+1}</text>
    </g>
  ))}
  {/* Legend */}
  {[["#e8d5a0","bunker"],["#2e7d3c","rough"],["#81c784","fairway"],["#4caf65","pendiente"]].map(([c,l],i)=>(
    <g key={l}>
      <rect x={10+i*62} y={218} width="12" height="12" fill={c} stroke="#555" strokeWidth="1" rx="3"/>
      <text x={25+i*62} y={228} fontSize="9" fill="#555">{l}</text>
    </g>
  ))}
</svg>
),

// ══════════════════════════════════════════════════
// JUEGO LARGO
// ══════════════════════════════════════════════════

"ej010": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="125" width="240" height="55" fill="#4caf65" opacity="0.35" rx="6"/>
  {/* Ball */}
  <circle cx="130" cy="123" r="9" fill="white" stroke="#888" strokeWidth="2.5"/>
  {/* Divot AFTER ball */}
  <path d="M140,130 Q162,136 182,129" fill="#8B6914" opacity="0.7"/>
  <text x="162" y="150" textAnchor="middle" fontSize="9" fill="#8B6914" fontWeight="bold">divot → delante</text>
  <line x1="162" y1="142" x2="158" y2="130" stroke="#8B6914" strokeWidth="1.5"/>
  {/* Club - 7 iron */}
  <line x1="108" y1="55" x2="128" y2="118" stroke="#555" strokeWidth="4" strokeLinecap="round"/>
  <rect x="122" y="116" width="16" height="20" fill="#777" rx="3" transform="rotate(-15,130,126)"/>
  {/* Pendulum arc */}
  <path d="M72,75 Q130,42 188,75" fill="none" stroke="#c8a84b" strokeWidth="2.5" strokeDasharray="6,4"/>
  <text x="130" y="38" textAnchor="middle" fontSize="10" fill="#c8a84b" fontWeight="bold">swing pendular</text>
  {/* Weight arrows */}
  <text x="55" y="100" textAnchor="middle" fontSize="11" fill="#1a5c2a" fontWeight="bold">50%</text>
  <text x="205" y="100" textAnchor="middle" fontSize="11" fill="#1a5c2a" fontWeight="bold">50%</text>
  <text x="55" y="112" textAnchor="middle" fontSize="9" fill="#555">atrás</text>
  <text x="205" y="112" textAnchor="middle" fontSize="9" fill="#555">adelante</text>
  {/* Foot marks */}
  <ellipse cx="108" cy="162" rx="14" ry="7" fill="#1a5c2a" opacity="0.3"/>
  <ellipse cx="152" cy="162" rx="14" ry="7" fill="#1a5c2a" opacity="0.3"/>
  <text x="130" y="202" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">7-hierro al 50% · Solo el contacto importa</text>
</svg>
),

"ej011": ({}) => (
<svg viewBox="0 0 280 200" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:320,display:"block",margin:"0 auto"}}>
  <rect width="280" height="200" fill="#e8f5eb" rx="14"/>
  {/* Fairway */}
  <rect x="10" y="55" width="260" height="110" fill="#4caf65" opacity="0.3" rx="6"/>
  {/* Rough sides */}
  <rect x="10" y="55" width="38" height="110" fill="#2e7d3c" opacity="0.5"/>
  <rect x="232" y="55" width="38" height="110" fill="#2e7d3c" opacity="0.5"/>
  <text x="29" y="115" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" transform="rotate(-90,29,115)">ROUGH</text>
  <text x="251" y="115" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" transform="rotate(90,251,115)">ROUGH</text>
  {/* Target zone */}
  <rect x="158" y="72" width="62" height="76" fill="#c8a84b" opacity="0.3" rx="5"/>
  <rect x="158" y="72" width="62" height="76" fill="none" stroke="#c8a84b" strokeWidth="3" rx="5" strokeDasharray="7,4"/>
  <text x="189" y="112" textAnchor="middle" fontSize="11" fill="#8B6914" fontWeight="bold">ZONA</text>
  <text x="189" y="126" textAnchor="middle" fontSize="10" fill="#8B6914">20×20m</text>
  {/* Player */}
  <circle cx="42" cy="108" r="9" fill="#1a5c2a"/>
  <line x1="42" y1="117" x2="42" y2="138" stroke="#1a5c2a" strokeWidth="3" strokeLinecap="round"/>
  {/* Trajectories */}
  <path d="M52,108 Q105,72 165,108" fill="none" stroke="#1a5c2a" strokeWidth="2.5" strokeDasharray="6,3"/>
  <path d="M52,110 Q100,85 168,100" fill="none" stroke="#1a5c2a" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6"/>
  <path d="M52,106 Q108,78 160,118" fill="none" stroke="#1a5c2a" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6"/>
  <circle cx="168" cy="106" r="6" fill="white" stroke="#888" strokeWidth="2"/>
  <text x="140" y="192" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">30 golpes · Aterriza en la zona objetivo</text>
</svg>
),

"ej012": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  {/* Fairway top view */}
  <rect x="95" y="15" width="70" height="178" fill="#4caf65" opacity="0.3" rx="10"/>
  {/* Tee */}
  <rect x="108" y="168" width="44" height="10" fill="#888" rx="3"/>
  <circle cx="130" cy="166" r="7" fill="white" stroke="#888" strokeWidth="2.5"/>
  {/* Draw - curves right to left */}
  <path d="M130,166 Q162,108 145,22" fill="none" stroke="#3a7abf" strokeWidth="3.5"/>
  <polygon points="145,22 137,33 148,31" fill="#3a7abf"/>
  <text x="170" y="70" fontSize="11" fill="#3a7abf" fontWeight="bold">DRAW</text>
  <text x="170" y="84" fontSize="9" fill="#3a7abf">der→izq</text>
  {/* Fade - curves left to right */}
  <path d="M130,166 Q98,108 115,22" fill="none" stroke="#c0392b" strokeWidth="3.5"/>
  <polygon points="115,22 108,31 119,33" fill="#c0392b"/>
  <text x="22" y="70" fontSize="11" fill="#c0392b" fontWeight="bold">FADE</text>
  <text x="22" y="84" fontSize="9" fill="#c0392b">izq→der</text>
  {/* Straight reference */}
  <line x1="130" y1="166" x2="130" y2="20" stroke="#555" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.35"/>
  {/* Driver club */}
  <line x1="116" y1="174" x2="106" y2="190" stroke="#555" strokeWidth="4" strokeLinecap="round"/>
  <ellipse cx="105" cy="192" rx="9" ry="6" fill="#333"/>
  <text x="130" y="208" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Alterna draw (azul) y fade (rojo) · 10 de cada</text>
</svg>
),

"ej013": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  {/* Table */}
  <rect x="12" y="14" width="236" height="28" fill="#1a5c2a" rx="8"/>
  <text x="130" y="33" textAnchor="middle" fontSize="13" fill="white" fontWeight="bold">Mi tabla de distancias</text>
  {[
    ["🏌️ Driver","230m","#c8a84b"],
    ["🌲 3-madera","200m","#3a7abf"],
    ["🔷 5-hierro","165m","#2e7d3c"],
    ["7️⃣ 7-hierro","140m","#1a5c2a"],
    ["9️⃣ 9-hierro","115m","#7b5ea7"],
    ["🎯 PW","95m","#c8a84b"],
    ["⛳ SW","70m","#c0392b"],
  ].map(([palo,dist,col],i)=>(
    <g key={i}>
      <rect x="12" y={46+i*23} width="236" height="23" fill={i%2===0?"#f0f8f0":"white"} rx="2"/>
      <text x="22" y={62+i*23} fontSize="12" fill="#1a2e1d">{palo}</text>
      <rect x="168" y={48+i*23} width="68" height="19" fill={col} opacity="0.2" rx="4"/>
      <text x="202" y={62+i*23} textAnchor="middle" fontSize="12" fill={col} fontWeight="bold">{dist}</text>
    </g>
  ))}
  <text x="130" y="208" textAnchor="middle" fontSize="10" fill="#555">5 golpes por palo · Anota tu distancia media real</text>
</svg>
),

"ej014": ({}) => (
<svg viewBox="0 0 260 220" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="220" fill="#e8f5eb" rx="14"/>
  {/* Hole layout - dogleg */}
  <path d="M25,185 L88,185 L88,128 L152,128 L152,60 L215,60"
    fill="none" stroke="#4caf65" strokeWidth="24" strokeOpacity="0.35" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M25,185 L88,185 L88,128 L152,128 L152,60 L215,60"
    fill="none" stroke="#2e7d3c" strokeWidth="9" strokeOpacity="0.65" strokeLinecap="round" strokeLinejoin="round"/>
  {/* Water */}
  <ellipse cx="120" cy="128" rx="26" ry="18" fill="#3a7abf" opacity="0.65"/>
  <text x="120" y="133" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">💧agua</text>
  {/* Tree */}
  <circle cx="88" cy="96" r="16" fill="#1a5c2a" opacity="0.85"/>
  <line x1="88" y1="112" x2="88" y2="126" stroke="#6B3A2A" strokeWidth="4"/>
  <text x="88" y="82" textAnchor="middle" fontSize="9" fill="#1a2e1d">árbol</text>
  {/* Green */}
  <ellipse cx="210" cy="60" rx="24" ry="18" fill="#4caf65" opacity="0.9"/>
  <circle cx="210" cy="57" r="6" fill="#1a2e1d"/>
  <line x1="210" y1="51" x2="210" y2="34" stroke="#aaa" strokeWidth="2"/>
  <polygon points="210,34 222,41 210,48" fill="#c0392b"/>
  {/* Tee */}
  <circle cx="32" cy="177" r="8" fill="white" stroke="#888" strokeWidth="2.5"/>
  {/* Arrows */}
  <path d="M40,170 Q65,148 100,132" fill="none" stroke="#1a5c2a" strokeWidth="2.5" strokeDasharray="6,3"/>
  <polygon points="100,132 90,129 92,140" fill="#1a5c2a"/>
  <text x="72" y="162" fontSize="9" fill="#1a5c2a" fontWeight="bold">zona segura</text>
  <path d="M40,172 Q85,152 120,132" fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="4,3" opacity="0.7"/>
  <text x="130" y="215" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Planifica antes de golpear · Zona segura siempre</text>
</svg>
),

// ══════════════════════════════════════════════════
// ESTRATEGIA
// ══════════════════════════════════════════════════

"ej015": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  <path d="M25,180 Q115,165 205,105" fill="none" stroke="#4caf65" strokeWidth="24" strokeOpacity="0.35" strokeLinecap="round"/>
  <path d="M25,180 Q115,165 205,105" fill="none" stroke="#2e7d3c" strokeWidth="9" strokeOpacity="0.6" strokeLinecap="round"/>
  {/* Danger zone */}
  <ellipse cx="172" cy="118" rx="32" ry="22" fill="#c0392b" opacity="0.3"/>
  <text x="172" y="115" textAnchor="middle" fontSize="10" fill="#c0392b" fontWeight="bold">⚠ RIESGO</text>
  <text x="172" y="128" textAnchor="middle" fontSize="9" fill="#c0392b">agua/OB</text>
  {/* Safe zone */}
  <ellipse cx="115" cy="150" rx="34" ry="22" fill="#1a5c2a" opacity="0.2"/>
  <text x="115" y="148" textAnchor="middle" fontSize="10" fill="#1a5c2a" fontWeight="bold">✓ SEGURO</text>
  {/* Ball */}
  <circle cx="32" cy="172" r="8" fill="white" stroke="#888" strokeWidth="2.5"/>
  {/* Safe arrow */}
  <path d="M40,168 Q78,155 106,152" fill="none" stroke="#1a5c2a" strokeWidth="3.5"/>
  <polygon points="106,152 96,147 96,158" fill="#1a5c2a"/>
  {/* Risky arrow */}
  <path d="M40,170 Q108,140 158,120" fill="none" stroke="#c0392b" strokeWidth="2.5" strokeDasharray="6,3" opacity="0.75"/>
  <polygon points="158,120 148,117 150,128" fill="#c0392b" opacity="0.75"/>
  {/* Green */}
  <ellipse cx="210" cy="104" rx="25" ry="18" fill="#4caf65" opacity="0.75"/>
  <circle cx="210" cy="101" r="6" fill="#1a2e1d"/>
  <text x="130" y="204" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Elige siempre la zona segura · Evita riesgos</text>
</svg>
),

"ej016": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="12" width="240" height="32" fill="#1a5c2a" rx="8"/>
  <text x="130" y="33" textAnchor="middle" fontSize="13" fill="white" fontWeight="bold">GAME PLAN — Hoyo 7 par 4</text>
  {[
    ["1","Salida","Fairway izq · Evitar OB derecho · 5-hierro","#3a7abf"],
    ["2","Approach","Desde zona A: 130m · 8-hierro · Centro del green","#2e7d3c"],
    ["3","No hacer","Bunker trasero izq · No atacar bandera atrás","#c0392b"],
    ["4","Green","Leer desde detrás · Lag putt a 1m · Sin 3-putt","#7b5ea7"],
  ].map(([n,tit,desc,col],i)=>(
    <g key={n}>
      <rect x="10" y={50+i*38} width="240" height="36" fill="white" stroke={col} strokeWidth="2" rx="8"/>
      <circle cx="30" cy={68+i*38} r="12" fill={col}/>
      <text x="30" y={73+i*38} textAnchor="middle" fontSize="13" fill="white" fontWeight="bold">{n}</text>
      <text x="47" y={63+i*38} fontSize="11" fill={col} fontWeight="bold">{tit}</text>
      <text x="47" y={76+i*38} fontSize="9.5" fill="#555">{desc}</text>
    </g>
  ))}
  <text x="130" y="206" textAnchor="middle" fontSize="9.5" fill="#555">Planifica hoyo a hoyo antes de salir al campo</text>
</svg>
),

"ej017": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  <rect x="10" y="12" width="240" height="28" fill="#1a5c2a" rx="7"/>
  <text x="130" y="31" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold">Par propio — Hándicap 18</text>
  {/* Table */}
  {[["Hoyo","Dif.","Par oficial","Tu par","Objetivo"],
    ["1","1","4","6","bogey doble ✓"],
    ["2","5","4","5","bogey ✓"],
    ["3","10","3","4","bogey ✓"],
    ["4","2","5","7","doble ✓"],
    ["5","8","4","5","bogey ✓"],
    ["...","...","...","...","..."],
  ].map((row,i)=>(
    <g key={i}>
      <rect x="10" y={44+i*25} width="240" height="25" fill={i===0?"#2e7d3c":i%2===0?"#f0f8f0":"white"} rx={i===0?4:2}/>
      {row.map((cell,j)=>(
        <text key={j} x={20+j*48} y={61+i*25} fontSize={i===0?9.5:9}
          fill={i===0?"white":j===3?"#3a7abf":j===4?"#2e7d3c":"#1a2e1d"}
          fontWeight={i===0||j===3?"bold":"normal"}>{cell}</text>
      ))}
    </g>
  ))}
  <text x="130" y="207" textAnchor="middle" fontSize="9.5" fill="#555">Juega contra tu propio par, no el oficial del campo</text>
</svg>
),

// ══════════════════════════════════════════════════
// REGLAS
// ══════════════════════════════════════════════════

"ej018": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  {/* Book */}
  <rect x="28" y="18" width="168" height="140" fill="white" stroke="#1a5c2a" strokeWidth="3" rx="8"/>
  <rect x="28" y="18" width="10" height="140" fill="#1a5c2a" rx="4"/>
  <text x="118" y="46" textAnchor="middle" fontSize="12" fill="#1a5c2a" fontWeight="bold">REGLAMENTO</text>
  <text x="118" y="60" textAnchor="middle" fontSize="11" fill="#1a5c2a" fontWeight="bold">RFEG 2023</text>
  {[
    ["💧","Zona roja → 3 opciones de alivio"],
    ["🔍","Bola perdida → 3 min búsqueda"],
    ["🚫","OB → golpe y distancia (penaliza)"],
    ["🔧","Obst. inamovible → alivio sin penal."],
    ["📍","Pitchmark → reparar siempre"],
  ].map(([icon,text],i)=>(
    <g key={i}>
      <text x="42" y={82+i*18} fontSize="13">{icon}</text>
      <text x="60" y={82+i*18} fontSize="9.5" fill="#1a2e1d">{text}</text>
    </g>
  ))}
  {/* Stakes */}
  <line x1="58" y1="168" x2="66" y2="205" stroke="#c0392b" strokeWidth="5" strokeLinecap="round"/>
  <line x1="78" y1="168" x2="86" y2="205" stroke="#c0392b" strokeWidth="5" strokeLinecap="round"/>
  <text x="72" y="164" textAnchor="middle" fontSize="9" fill="#c0392b" fontWeight="bold">ROJA</text>
  <line x1="175" y1="168" x2="183" y2="205" stroke="white" strokeWidth="4" strokeLinecap="round"/>
  <line x1="175" y1="168" x2="183" y2="205" stroke="#aaa" strokeWidth="1.5" strokeDasharray="4,3"/>
  <text x="179" y="164" textAnchor="middle" fontSize="9" fill="#555" fontWeight="bold">OB</text>
  <line x1="115" y1="168" x2="123" y2="205" stroke="#3a7abf" strokeWidth="5" strokeLinecap="round"/>
  <text x="119" y="164" textAnchor="middle" fontSize="9" fill="#3a7abf" fontWeight="bold">AZUL</text>
</svg>
),

"ej019": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  <ellipse cx="130" cy="105" rx="110" ry="85" fill="#2e7d3c" opacity="0.35"/>
  {/* Hole */}
  <circle cx="130" cy="98" r="10" fill="#1a2e1d"/>
  <line x1="130" y1="88" x2="130" y2="62" stroke="white" strokeWidth="2"/>
  <polygon points="130,62 148,70 130,78" fill="#c0392b"/>
  {/* Pitchmark to repair */}
  <ellipse cx="92" cy="108" rx="10" ry="6" fill="#1a5c2a" opacity="0.7"/>
  <text x="92" y="124" textAnchor="middle" fontSize="8" fill="#1a5c2a" fontWeight="bold">reparar ✓</text>
  {/* Ball marked */}
  <circle cx="72" cy="96" r="8" fill="white" stroke="#888" strokeWidth="2"/>
  <rect x="68" y="105" width="10" height="6" fill="#c8a84b" rx="2"/>
  <text x="72" y="120" textAnchor="middle" fontSize="8" fill="#555">marcar</text>
  {/* Competitor ball */}
  <circle cx="162" cy="114" r="8" fill="#f5f549" stroke="#888" strokeWidth="2"/>
  <rect x="158" y="123" width="10" height="6" fill="#3a7abf" rx="2"/>
  <text x="162" y="138" textAnchor="middle" fontSize="8" fill="#555">rival</text>
  {/* Casual water */}
  <ellipse cx="145" cy="82" rx="18" ry="10" fill="#3a7abf" opacity="0.5"/>
  <text x="145" y="86" textAnchor="middle" fontSize="7.5" fill="#1a2e1d">agua casual</text>
  <text x="145" y="68" textAnchor="middle" fontSize="8" fill="#3a7abf" fontWeight="bold">alivio s/pen.</text>
  <line x1="145" y1="70" x2="145" y2="72" stroke="#3a7abf" strokeWidth="1.5"/>
  {/* Putt line */}
  <path d="M78,97 Q105,88 120,94" fill="none" stroke="#1a5c2a" strokeWidth="2" strokeDasharray="4,2"/>
  <text x="130" y="205" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Reglas del green · Marcar · Reparar · Respetar</text>
</svg>
),

"ej020": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  {[
    {x:65,y:55,icon:"⛳",label:"Bola incrustada",sub:"alivio sin penalidad",col:"#1a5c2a"},
    {x:195,y:55,icon:"📋",label:"Score incorrecto",sub:"descalificación",col:"#c0392b"},
    {x:65,y:135,icon:"⚠️",label:"Bola equivocada",sub:"2 golpes penalización",col:"#c8a84b"},
    {x:195,y:135,icon:"🎯",label:"Caddie alineando",sub:"1 golpe penalización",col:"#3a7abf"},
  ].map(({x,y,icon,label,sub,col})=>(
    <g key={label}>
      <rect x={x-52} y={y-32} width="104" height="66" fill="white" stroke={col} strokeWidth="2.5" rx="10"/>
      <text x={x} y={y-10} textAnchor="middle" fontSize="20">{icon}</text>
      <text x={x} y={y+10} textAnchor="middle" fontSize="9.5" fill={col} fontWeight="bold">{label}</text>
      <text x={x} y={y+24} textAnchor="middle" fontSize="8.5" fill="#555">{sub}</text>
    </g>
  ))}
  {/* RFEG badge */}
  <circle cx="130" cy="95" r="22" fill="none" stroke="#1a5c2a" strokeWidth="2.5"/>
  <text x="130" y="92" textAnchor="middle" fontSize="10" fill="#1a5c2a" fontWeight="bold">RFEG</text>
  <text x="130" y="105" textAnchor="middle" fontSize="8" fill="#1a5c2a">2023</text>
  <text x="130" y="205" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Situaciones avanzadas en competición</text>
</svg>
),

// ══════════════════════════════════════════════════
// MENTAL
// ══════════════════════════════════════════════════

"ej021": ({}) => (
<svg viewBox="0 0 280 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:320,display:"block",margin:"0 auto"}}>
  <rect width="280" height="210" fill="#e8f5eb" rx="14"/>
  {/* Timeline */}
  <line x1="20" y1="110" x2="260" y2="110" stroke="#ddd" strokeWidth="4"/>
  {[
    {x:20,n:"1",l:"Leer",s:"situación",c:"#3a7abf"},
    {x:68,n:"2",l:"Elegir",s:"palo/obj.",c:"#2e7d3c"},
    {x:120,n:"3",l:"2 swings",s:"práctica",c:"#c8a84b"},
    {x:172,n:"4",l:"Alinear",s:"cara+pies",c:"#7b5ea7"},
    {x:230,n:"5",l:"Gatillo",s:"inicio",c:"#c0392b"},
  ].map(({x,n,l,s,c})=>(
    <g key={n}>
      <circle cx={x} cy="110" r="20" fill={c} stroke="white" strokeWidth="2"/>
      <text x={x} y="116" textAnchor="middle" fontSize="15" fill="white" fontWeight="bold">{n}</text>
      <text x={x} y="140" textAnchor="middle" fontSize="9.5" fill={c} fontWeight="bold">{l}</text>
      <text x={x} y="152" textAnchor="middle" fontSize="8.5" fill="#555">{s}</text>
    </g>
  ))}
  {/* Clock */}
  <circle cx="140" cy="55" r="35" fill="white" stroke="#c8a84b" strokeWidth="3.5"/>
  <line x1="140" y1="55" x2="140" y2="28" stroke="#c8a84b" strokeWidth="3" strokeLinecap="round"/>
  <line x1="140" y1="55" x2="158" y2="61" stroke="#1a2e1d" strokeWidth="3" strokeLinecap="round"/>
  <circle cx="140" cy="55" r="4" fill="#1a2e1d"/>
  {/* Tick marks */}
  {Array.from({length:12},(_,i)=>{
    const a=(i*30-90)*Math.PI/180;
    return <line key={i} x1={140+28*Math.cos(a)} y1={55+28*Math.sin(a)}
      x2={140+33*Math.cos(a)} y2={55+33*Math.sin(a)} stroke="#ccc" strokeWidth="2"/>;
  })}
  <text x="140" y="72" textAnchor="middle" fontSize="8.5" fill="#c8a84b" fontWeight="bold">20-25 seg</text>
  <text x="140" y="204" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Misma rutina · Mismo tiempo · Siempre</text>
</svg>
),

"ej022": ({}) => (
<svg viewBox="0 0 220 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:260,display:"block",margin:"0 auto"}}>
  <rect width="220" height="210" fill="#e8f5eb" rx="14"/>
  {/* Traffic light body */}
  <rect x="75" y="14" width="70" height="148" fill="#333" rx="35"/>
  {/* Red */}
  <circle cx="110" cy="45" r="22" fill="#c0392b"/>
  <text x="110" y="41" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">ROJO</text>
  <text x="110" y="53" textAnchor="middle" fontSize="9" fill="white">0-10 seg</text>
  {/* Amber */}
  <circle cx="110" cy="90" r="22" fill="#c8a84b"/>
  <text x="110" y="86" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">ÁMBAR</text>
  <text x="110" y="98" textAnchor="middle" fontSize="9" fill="white">10-30 seg</text>
  {/* Green */}
  <circle cx="110" cy="135" r="22" fill="#2e7d3c"/>
  <text x="110" y="131" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">VERDE</text>
  <text x="110" y="143" textAnchor="middle" fontSize="9" fill="white">&gt;30 seg</text>
  {/* Labels right */}
  <text x="152" y="42" fontSize="9" fill="#c0392b" fontWeight="bold">Reacción</text>
  <text x="152" y="53" fontSize="8.5" fill="#555">natural</text>
  <text x="152" y="87" fontSize="9" fill="#c8a84b" fontWeight="bold">Respira</text>
  <text x="152" y="98" fontSize="8.5" fill="#555">y suelta</text>
  <text x="152" y="132" fontSize="9" fill="#2e7d3c" fontWeight="bold">Siguiente</text>
  <text x="152" y="143" fontSize="8.5" fill="#555">golpe</text>
  {/* Post */}
  <rect x="107" y="162" width="6" height="28" fill="#555"/>
  <text x="110" y="205" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Reset emocional tras cada mal golpe</text>
</svg>
),

"ej023": ({}) => (
<svg viewBox="0 0 240 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:280,display:"block",margin:"0 auto"}}>
  <rect width="240" height="210" fill="#e8f5eb" rx="14"/>
  {/* Head outline */}
  <ellipse cx="120" cy="80" rx="62" ry="68" fill="#f0ebfa" stroke="#7b5ea7" strokeWidth="3"/>
  {/* Brain folds */}
  {["M80,52 Q100,42 120,52 Q140,42 160,52","M75,68 Q98,55 120,68 Q142,55 165,68",
    "M72,84 Q95,72 120,84 Q145,72 168,84"].map((d,i)=>(
    <path key={i} d={d} fill="none" stroke="#7b5ea7" strokeWidth="1.5" opacity="0.4"/>
  ))}
  {/* Golf scene inside */}
  <ellipse cx="120" cy="88" rx="44" ry="32" fill="#4caf65" opacity="0.4"/>
  {/* Mini golfer */}
  <circle cx="90" cy="78" r="6" fill="#1a5c2a"/>
  <line x1="90" y1="84" x2="90" y2="96" stroke="#1a5c2a" strokeWidth="2.5" strokeLinecap="round"/>
  <line x1="90" y1="88" x2="82" y2="94" stroke="#1a5c2a" strokeWidth="2" strokeLinecap="round"/>
  {/* Ball flight */}
  <path d="M93,80 Q118,58 150,78" fill="none" stroke="#c8a84b" strokeWidth="3"/>
  <circle cx="150" cy="78" r="5" fill="white" stroke="#888" strokeWidth="1.5"/>
  {/* Sparkles */}
  {[[95,55],[130,50],[158,62],[75,62]].map(([x,y],i)=>(
    <text key={i} x={x} y={y} fontSize="12">✨</text>
  ))}
  {/* Steps */}
  <text x="120" y="162" textAnchor="middle" fontSize="9.5" fill="#7b5ea7" fontWeight="bold">Cierra los ojos · Imagina el golpe perfecto</text>
  <text x="120" y="176" textAnchor="middle" fontSize="9" fill="#7b5ea7">Siente el contacto · Ve la bola volar</text>
  <text x="120" y="190" textAnchor="middle" fontSize="8.5" fill="#555">10 minutos diarios · Antes de entrenar</text>
  <text x="120" y="206" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Visualización · El swing mental perfecto</text>
</svg>
),

// ══════════════════════════════════════════════════
// FITNESS GOLF
// ══════════════════════════════════════════════════

"ej024": ({}) => (
<svg viewBox="0 0 280 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:320,display:"block",margin:"0 auto"}}>
  <rect width="280" height="210" fill="#e8f5eb" rx="14"/>
  {/* 5 exercise circles */}
  {[
    {x:50,y:62,icon:"🧘",label:"Hip 90/90",sub:"2×30seg"},
    {x:140,y:62,icon:"🏋️",label:"Goblet squat",sub:"3×10"},
    {x:230,y:62,icon:"🔄",label:"Rot. torácica",sub:"3×15"},
    {x:90,y:152,icon:"🦵",label:"Paso cruzado",sub:"2×12"},
    {x:190,y:152,icon:"🤸",label:"Hip hinge",sub:"3×12"},
  ].map(({x,y,icon,label,sub})=>(
    <g key={label}>
      <circle cx={x} cy={y} r="34" fill="white" stroke="#d4651a" strokeWidth="2.5"/>
      <text x={x} y={y-8} textAnchor="middle" fontSize="18">{icon}</text>
      <text x={x} y={y+10} textAnchor="middle" fontSize="8.5" fill="#d4651a" fontWeight="bold">{label}</text>
      <text x={x} y={y+22} textAnchor="middle" fontSize="8.5" fill="#555">{sub}</text>
    </g>
  ))}
  {/* Hip rotation arrow */}
  <path d="M104,120 Q140,108 176,120" fill="none" stroke="#d4651a" strokeWidth="3"/>
  <polygon points="176,120 165,114 165,126" fill="#d4651a"/>
  <text x="140" y="116" textAnchor="middle" fontSize="9" fill="#d4651a" fontWeight="bold">rotación</text>
  <text x="140" y="204" textAnchor="middle" fontSize="10" fill="#1a2e1d" fontWeight="bold">Movilidad de cadera → más velocidad de swing</text>
</svg>
),

"ej025": ({}) => (
<svg viewBox="0 0 260 210" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
  <rect width="260" height="210" fill="#e8f5eb" rx="14"/>
  {/* Plank figure */}
  <rect x="28" y="90" width="130" height="14" fill="#1a5c2a" opacity="0.85" rx="7"/>
  <circle cx="172" cy="93" r="14" fill="#d4a574"/>
  {/* Arms */}
  <line x1="28" y1="97" x2="14" y2="116" stroke="#1a5c2a" strokeWidth="7" strokeLinecap="round"/>
  <rect x="6" y="114" width="18" height="7" fill="#888" rx="3"/>
  {/* Legs */}
  <line x1="28" y1="104" x2="12" y2="128" stroke="#1a5c2a" strokeWidth="6" strokeLinecap="round"/>
  <line x1="20" y1="104" x2="5" y2="126" stroke="#1a5c2a" strokeWidth="5" strokeLinecap="round"/>
  {/* Core triangle */}
  <polygon points="80,85 120,85 100,58" fill="none" stroke="#c0392b" strokeWidth="3" strokeDasharray="5,3"/>
  <text x="100" y="75" textAnchor="middle" fontSize="9" fill="#c0392b" fontWeight="bold">CORE</text>
  {/* Exercises list */}
  {[
    ["1","Plank + toque hombros","3×20"],
    ["2","Pallof press","3×12"],
    ["3","Dead bug","3×10"],
    ["4","Plank lateral","2×30seg"],
    ["5","Rotación con palo","3×15"],
  ].map(([n,ex,sets],i)=>(
    <g key={n}>
      <circle cx="22" cy={130+i*14} r="8" fill="#1a5c2a"/>
      <text x="22" y={134+i*14} textAnchor="middle" fontSize="8.5" fill="white" fontWeight="bold">{n}</text>
      <text x="34" y={134+i*14} fontSize="9" fill="#1a2e1d">{ex}</text>
      <text x="248" y={134+i*14} textAnchor="end" fontSize="8.5" fill="#888">{sets}</text>
    </g>
  ))}
  <text x="130" y="207" textAnchor="middle" fontSize="9.5" fill="#1a2e1d" fontWeight="bold">Core estable = postura consistente en el swing</text>
</svg>
),

};


function EjercicioDetalle({ ej, onClose, onAsignar }) {
  const Ilus = ILUSTRACIONES[ej.id];
  return (
    <Modal title={ej.nombre} onClose={onClose} wide color={G.grass}>
      {Ilus && <div style={{background:"#f0f8f0",borderRadius:12,padding:"12px 8px",marginBottom:16}}><Ilus/></div>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <Badge color={CAT_COLORS[ej.categoria]||"gray"}>{CAT_ICONS[ej.categoria]} {ej.categoria}</Badge>
        <Badge color={ej.nivel==="Iniciación"?"green":ej.nivel==="Intermedio"?"gold":"blue"}>{ej.nivel}</Badge>
        {ej.duracion && <Badge color="gray">⏱ {ej.duracion}</Badge>}
        {ej.material && <Badge color="gray">🎒 {ej.material}</Badge>}
      </div>

      <div style={{ background:G.mist, borderRadius:10, padding:14, marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:G.fairway, marginBottom:4 }}>🎯 OBJETIVO</div>
        <div style={{ fontSize:14, color:G.ink }}>{ej.objetivo}</div>
      </div>

      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:G.soft, marginBottom:6 }}>📝 DESCRIPCIÓN</div>
        <div style={{ fontSize:14, color:G.ink, lineHeight:1.6 }}>{ej.descripcion}</div>
      </div>

      {ej.variantes && ej.variantes.length>0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:G.sky, marginBottom:6 }}>🔄 VARIANTES</div>
          {ej.variantes.map((v,i) => <div key={i} style={{ fontSize:13, color:G.ink, marginBottom:4, paddingLeft:8, borderLeft:`2px solid ${G.sky}` }}>· {v}</div>)}
        </div>
      )}

      {ej.kpis && ej.kpis.length>0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:G.flag, marginBottom:6 }}>📏 KPIs — Cómo medir el progreso</div>
          {ej.kpis.map((k,i) => <div key={i} style={{ fontSize:13, color:G.ink, marginBottom:4 }}>✔ {k}</div>)}
        </div>
      )}

      {ej.erroresComunes && ej.erroresComunes.length>0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:G.danger, marginBottom:6 }}>⚠️ ERRORES COMUNES</div>
          {ej.erroresComunes.map((e,i) => <div key={i} style={{ fontSize:13, color:G.ink, marginBottom:4 }}>✗ {e}</div>)}
        </div>
      )}

      {/* Test preguntas si lo tiene (reglas) */}
      {ej.preguntas && ej.preguntas.length>0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:G.purple, marginBottom:8 }}>❓ PREGUNTAS DEL TEST</div>
          {ej.preguntas.map((p,i) => (
            <div key={i} style={{ background:G.lavender, borderRadius:10, padding:12, marginBottom:8 }}>
              <div style={{ fontWeight:600, fontSize:13, color:G.purple, marginBottom:4 }}>P{i+1}: {p.p}</div>
              <div style={{ fontSize:12, color:G.fairway, fontStyle:"italic" }}>R: {p.r}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {(ej.tags||[]).map(t=><span key={t} style={{ background:"#f0f0f0",color:"#666",borderRadius:12,padding:"2px 8px",fontSize:11 }}>#{t}</span>)}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn color="secondary" onClick={onClose}>Cerrar</Btn>
          {onAsignar && <Btn color="sky" onClick={onAsignar}>Asignar a alumno</Btn>}
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal asignar ────────────────────────────────────────────────
function AsignarModal({ ej, alumnos, onClose, onSave }) {
  const [alumnoId, setAlumnoId] = useState(alumnos[0]?.id||"");
  const [notas, setNotas] = useState("");
  return (
    <Modal title={`Asignar: ${ej.nombre}`} onClose={onClose}>
      <div style={{ background:G.mist, borderRadius:10, padding:12, marginBottom:16 }}>
        <Badge color={CAT_COLORS[ej.categoria]||"gray"}>{CAT_ICONS[ej.categoria]} {ej.categoria}</Badge>
        <span style={{ marginLeft:8, fontSize:13, color:G.soft }}>{ej.nivel} · {ej.duracion}</span>
      </div>
      <Field label="Alumno *">
        <Sel value={alumnoId} onChange={setAlumnoId} options={alumnos.map(a=>({value:a.id,label:a.nombre}))}/>
      </Field>
      <Field label="Notas para el alumno (opcional)">
        <Textarea value={notas} onChange={setNotas} placeholder="Instrucciones adicionales, contexto…" rows={3}/>
      </Field>
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:8 }}>
        <Btn color="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn color="sky" onClick={()=>onSave(ej.id,alumnoId,notas)} disabled={!alumnoId}>Asignar</Btn>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PANEL TESTS (compartido admin + alumno)
// ═══════════════════════════════════════════════════════════════════
function PanelTests({ data, setData, modo, alumnoId }) {
  const [catSel, setCatSel] = useState(null);      // null = no sesión
  const [testActivo, setTestActivo] = useState(null);
  const [resumen, setResumen] = useState(null);

  const testCats = Object.keys(TESTS_BANCO);
  const resultadosTest = data.resultadosTest || [];
  const alumnoActivo = alumnoId || null;

  function iniciarTest(cat) {
    const pregs = [...TESTS_BANCO[cat]].sort(() => Math.random()-0.5).slice(0,6);
    setTestActivo({ cat, pregs, idx:0, respuestas:[], empezadoEn: Date.now() });
    setCatSel(cat);
  }

  function responder(opIdx) {
    const t = testActivo;
    const correcta = t.pregs[t.idx].correcta;
    const correctaRespuesta = opIdx === correcta;
    const nuevasRespuestas = [...t.respuestas, { opIdx, correcta: correctaRespuesta }];

    if (t.idx + 1 >= t.pregs.length) {
      // Fin del test
      const score = nuevasRespuestas.filter(r=>r.correcta).length;
      const resultado = {
        id: uid(),
        alumnoId: alumnoActivo || "profesor",
        testCat: t.cat,
        fecha: today(),
        score,
        total: t.pregs.length,
        detalle: t.pregs.map((p,i)=>({pregunta:p.pregunta,correcta:i<nuevasRespuestas.length?nuevasRespuestas[i].correcta:false,explicacion:p.explicacion}))
      };
      setData({ ...data, resultadosTest: [...resultadosTest, resultado] });
      setResumen({ ...resultado, pregs: t.pregs, respuestas: nuevasRespuestas });
      setTestActivo(null);
    } else {
      setTestActivo({ ...t, idx: t.idx+1, respuestas: nuevasRespuestas });
    }
  }

  // ── Selector de categoría ─────────────────────────────────────────
  if (!testActivo && !resumen) return (
    <div>
      <div style={{ marginBottom:16, color:G.soft, fontSize:14 }}>Selecciona la categoría del test. Cada test tiene 6 preguntas aleatorias.</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12 }}>
        {testCats.map(cat => {
          const misRes = resultadosTest.filter(r=>(alumnoActivo?r.alumnoId===alumnoActivo:true)&&r.testCat===cat);
          const ultimoScore = misRes.length>0 ? misRes[misRes.length-1] : null;
          return (
            <Card key={cat} style={{ textAlign:"center", cursor:"pointer", border:`2px solid transparent`, transition:"border .15s" }}
              onMouseEnter={e=>e.currentTarget.style.border=`2px solid ${G.grass}`}
              onMouseLeave={e=>e.currentTarget.style.border="2px solid transparent"}
              onClick={()=>iniciarTest(cat)}>
              <div style={{ fontSize:32, marginBottom:6 }}>{CAT_ICONS[cat]||"🧩"}</div>
              <div style={{ fontWeight:700, color:G.ink, marginBottom:4 }}>{cat}</div>
              <div style={{ fontSize:11, color:G.soft, marginBottom:8 }}>{TESTS_BANCO[cat].length} preguntas disponibles</div>
              {ultimoScore
                ? <Badge color={ultimoScore.score/ultimoScore.total>=.7?"green":ultimoScore.score/ultimoScore.total>=.5?"gold":"red"}>
                    Último: {ultimoScore.score}/{ultimoScore.total}
                  </Badge>
                : <Badge color="gray">Sin intentar</Badge>
              }
            </Card>
          );
        })}
      </div>

      {/* Historial de resultados del alumno */}
      {alumnoActivo && resultadosTest.filter(r=>r.alumnoId===alumnoActivo).length>0 && (
        <div style={{ marginTop:24 }}>
          <h3 style={{ margin:"0 0 12px", color:G.fairway }}>📊 Mis resultados</h3>
          {[...resultadosTest.filter(r=>r.alumnoId===alumnoActivo)].sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,10).map(r=>(
            <Card key={r.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
              <div style={{ fontSize:22 }}>{CAT_ICONS[r.testCat]||"🧩"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:G.ink }}>Test {r.testCat}</div>
                <div style={{ fontSize:12, color:G.soft }}>{r.fecha}</div>
              </div>
              <div style={{ fontWeight:800, color:G.fairway, fontSize:17 }}>{r.score}/{r.total}</div>
              <Badge color={r.score/r.total>=.7?"green":r.score/r.total>=.5?"gold":"red"}>{Math.round(r.score/r.total*100)}%</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ── Test activo ────────────────────────────────────────────────────
  if (testActivo) {
    const preg = testActivo.pregs[testActivo.idx];
    const progreso = ((testActivo.idx) / testActivo.pregs.length) * 100;
    return (
      <div style={{ maxWidth:560, margin:"0 auto" }}>
        {/* Progreso */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <Badge color={CAT_COLORS[testActivo.cat]||"gray"}>{CAT_ICONS[testActivo.cat]} {testActivo.cat}</Badge>
          <span style={{ fontSize:13, color:G.soft }}>Pregunta {testActivo.idx+1} de {testActivo.pregs.length}</span>
        </div>
        <div style={{ background:"#e8e8e8", borderRadius:6, height:6, marginBottom:20, overflow:"hidden" }}>
          <div style={{ width:`${progreso}%`, height:"100%", background:G.grass, transition:"width .3s" }}/>
        </div>
        <Card>
          <div style={{ fontSize:16, fontWeight:700, color:G.ink, marginBottom:20, lineHeight:1.5 }}>❓ {preg.pregunta}</div>
          <div style={{ display:"grid", gap:10 }}>
            {preg.opciones.map((op,i) => (
              <button key={i} onClick={()=>responder(i)}
                style={{ background:G.mist, color:G.ink, border:`2px solid ${G.mist}`, borderRadius:10, padding:"12px 16px", fontSize:14, textAlign:"left", cursor:"pointer", fontFamily:"inherit", lineHeight:1.4, transition:"all .15s" }}
                onMouseEnter={e=>{e.currentTarget.style.background=G.fairway;e.currentTarget.style.color=G.white;}}
                onMouseLeave={e=>{e.currentTarget.style.background=G.mist;e.currentTarget.style.color=G.ink;}}>
                <span style={{ fontWeight:700, marginRight:8 }}>{String.fromCharCode(65+i)}.</span>{op}
              </button>
            ))}
          </div>
        </Card>
        <div style={{ textAlign:"center", marginTop:14 }}>
          <button onClick={()=>{setTestActivo(null);setResumen(null);}} style={{ background:"none", border:"none", color:G.soft, fontSize:13, cursor:"pointer" }}>Abandonar test</button>
        </div>
      </div>
    );
  }

  // ── Resumen final ─────────────────────────────────────────────────
  if (resumen) {
    const pct = Math.round(resumen.score / resumen.total * 100);
    const emoji = pct>=80?"🏆":pct>=60?"⭐":pct>=40?"👍":"📚";
    return (
      <div style={{ maxWidth:560, margin:"0 auto" }}>
        <Card style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>{emoji}</div>
          <div style={{ fontSize:28, fontWeight:800, color:pct>=70?G.grass:pct>=50?G.flag:G.danger }}>{resumen.score}/{resumen.total}</div>
          <div style={{ fontSize:18, fontWeight:700, color:G.ink, marginBottom:4 }}>{pct}% correcto</div>
          <div style={{ color:G.soft, fontSize:14 }}>
            {pct>=80?"¡Excelente! Dominas esta categoría.":pct>=60?"Bien. Repasa los errores.":pct>=40?"Sigue practicando, vas por buen camino.":"Necesitas repasar esta categoría con tu profesor."}
          </div>
        </Card>

        {/* Detalle pregunta a pregunta */}
        <div style={{ marginBottom:16 }}>
          {resumen.pregs.map((p,i) => {
            const resp = resumen.respuestas[i];
            const acierto = resp?.correcta;
            return (
              <Card key={i} style={{ marginBottom:10, borderLeft:`3px solid ${acierto?G.grass:G.danger}` }}>
                <div style={{ fontSize:13, fontWeight:700, color:G.ink, marginBottom:6 }}>{i+1}. {p.pregunta}</div>
                <div style={{ fontSize:12, marginBottom:4 }}>
                  <span style={{ fontWeight:600, color:G.soft }}>Tu respuesta: </span>
                  <span style={{ color:acierto?G.grass:G.danger }}>{acierto?"✔":"✗"} {p.opciones[resp?.opIdx??0]}</span>
                </div>
                {!acierto && <div style={{ fontSize:12, marginBottom:4 }}>
                  <span style={{ fontWeight:600, color:G.soft }}>Correcta: </span>
                  <span style={{ color:G.grass }}>✔ {p.opciones[p.correcta]}</span>
                </div>}
                <div style={{ fontSize:12, color:"#555", background:"#f9f9f9", borderRadius:8, padding:"6px 10px", marginTop:6, lineHeight:1.5 }}>
                  💡 {p.explicacion}
                </div>
              </Card>
            );
          })}
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <Btn color="secondary" onClick={()=>{setResumen(null);setCatSel(null);}}>Volver</Btn>
          <Btn color="primary" onClick={()=>iniciarTest(resumen.testCat)}>Repetir test</Btn>
        </div>
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// PORTAL ALUMNO: MÓDULO EJERCICIOS Y TESTS
// ═══════════════════════════════════════════════════════════════════
function ModEjerciciosAlumno({ data, setData, alumnoId }) {
  const [tab, setTab] = useState("asignados");
  const [verEj, setVerEj] = useState(null);

  const asignaciones = (data.asignaciones||[]).filter(a=>a.alumnoId===alumnoId);
  const todos = [...EJERCICIOS_BIBLIOTECA, ...(data.ejerciciosCustom||[])];
  function ejDet(id){ return todos.find(e=>e.id===id); }

  function completar(id){
    setData({...data,asignaciones:(data.asignaciones||[]).map(a=>a.id===id?{...a,completado:true,fechaCompletado:today()}:a)});
  }

  const ATABS=[{id:"asignados",label:"📌 Mis ejercicios"},{id:"biblioteca",label:"📚 Biblioteca"},{id:"tests",label:"🧩 Tests"}];

  return <div>
    <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
      {ATABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
        style={{ background:tab===t.id?G.fairway:G.mist, color:tab===t.id?G.white:G.fairway,
          border:"none", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
        {t.label}
      </button>)}
    </div>

    {/* ── MIS EJERCICIOS ASIGNADOS ── */}
    {tab==="asignados" && <div>
      {asignaciones.length===0 && <div style={{ color:G.soft, textAlign:"center", padding:30, background:G.mist, borderRadius:10 }}>
        Tu profesor aún no te ha asignado ejercicios. Puedes explorar la Biblioteca mientras tanto.
      </div>}
      {asignaciones.map(a => {
        const ej = ejDet(a.ejId);
        if(!ej) return null;
        return <Card key={a.id} style={{ marginBottom:12, borderLeft:`3px solid ${a.completado?G.grass:G.flag}` }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
            <div style={{ fontSize:26 }}>{CAT_ICONS[ej.categoria]||"📌"}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:G.ink }}>{ej.nombre}</div>
              <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                <Badge color={CAT_COLORS[ej.categoria]||"gray"}>{ej.categoria}</Badge>
                <Badge color="gray">⏱ {ej.duracion}</Badge>
                {a.completado && <Badge color="green">✅ Completado</Badge>}
              </div>
              <div style={{ fontSize:13, color:G.soft, marginTop:6 }}>{ej.objetivo}</div>
              {a.notas && <div style={{ fontSize:12, color:G.fairway, marginTop:4, fontStyle:"italic" }}>📝 Nota del profesor: {a.notas}</div>}
            </div>
            <div style={{ display:"flex", gap:6, flexShrink:0, flexDirection:"column", alignItems:"flex-end" }}>
              <Btn small color="secondary" onClick={()=>setVerEj(ej)}>Ver</Btn>
              {!a.completado && <Btn small color="primary" onClick={()=>completar(a.id)}>✔ Hecho</Btn>}
            </div>
          </div>
        </Card>;
      })}
    </div>}

    {/* ── BIBLIOTECA (solo lectura) ── */}
    {tab==="biblioteca" && <div>
      <div style={{ color:G.soft, fontSize:13, marginBottom:14 }}>Explora todos los ejercicios disponibles. Habla con tu profesor para que te los asigne.</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
        {EJERCICIOS_BIBLIOTECA.map(e=>(
          <Card key={e.id} style={{ cursor:"pointer" }} onClick={()=>setVerEj(e)}>
            <div style={{ fontSize:24, marginBottom:6 }}>{CAT_ICONS[e.categoria]||"📌"}</div>
            <div style={{ fontWeight:700, color:G.ink, fontSize:13, marginBottom:4 }}>{e.nombre}</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              <Badge color={CAT_COLORS[e.categoria]||"gray"}>{e.categoria}</Badge>
            </div>
            <div style={{ fontSize:11, color:G.soft, marginTop:6 }}>{e.nivel} · {e.duracion}</div>
          </Card>
        ))}
      </div>
    </div>}

    {/* ── TESTS ── */}
    {tab==="tests" && <PanelTests data={data} setData={setData} modo="alumno" alumnoId={alumnoId}/>}

    {/* Modal detalle ejercicio */}
    {verEj && <EjercicioDetalle ej={verEj} onClose={()=>setVerEj(null)}/>}
  </div>;
}





// ═══════════════════════════════════════════════════════════════════
// MÓDULO: PROGRAMAS TRIMESTRALES
// ═══════════════════════════════════════════════════════════════════

const TIPOS_CLASE = [
  { id:"Individual",  label:"👤 Individual",      color:"#1a5c2a", bg:"#e8f5eb" },
  { id:"Grupo",       label:"👥 Grupo",            color:"#3a7abf", bg:"#e8f0fb" },
  { id:"Empresa",     label:"🏢 Empresa/Evento",   color:"#c0392b", bg:"#fdecea" },
  { id:"Junior",      label:"🧒 Junior/Infantil",  color:"#c8a84b", bg:"#fdf6e3" },
  { id:"Online",      label:"💻 Online",           color:"#555",    bg:"#f0f0f0" },
];

// Contenidos específicos de clase
const CONTENIDOS_CLASE = [
  { id:"swing_completo",   label:"🏌️ Swing completo",        categoria:"Técnica" },
  { id:"swing_corto",      label:"✂️ Juego corto (chipping)", categoria:"Técnica" },
  { id:"putt",             label:"🎯 Trabajo de putt",        categoria:"Técnica" },
  { id:"bunker",           label:"🏖️ Salidas de bunker",      categoria:"Técnica" },
  { id:"approach",         label:"🎯 Approach / Approach",    categoria:"Técnica" },
  { id:"driving",          label:"🚀 Driver / Tee shots",     categoria:"Técnica" },
  { id:"hierros",          label:"⛳ Hierros medios y largos", categoria:"Técnica" },
  { id:"estrategia",       label:"🗺️ Estrategia de juego",    categoria:"Táctica" },
  { id:"gestion_campo",    label:"🧠 Gestión del campo",      categoria:"Táctica" },
  { id:"lectura_greens",   label:"📐 Lectura de greens",      categoria:"Táctica" },
  { id:"juego_campo",      label:"⛳ Juego en campo real",     categoria:"Campo" },
  { id:"competicion",      label:"🏆 Preparación competición",categoria:"Campo" },
  { id:"mental",           label:"🧘 Juego mental / Concentración", categoria:"Mental" },
  { id:"fisico",           label:"💪 Preparación física golf",categoria:"Mental" },
  { id:"reglas",           label:"📚 Reglas de golf",         categoria:"Teoría" },
  { id:"etiqueta",         label:"🎩 Etiqueta y protocolo",   categoria:"Teoría" },
  { id:"evaluacion",       label:"📊 Evaluación y seguimiento",categoria:"Evaluación"},
  { id:"otro",             label:"📝 Otro / Libre",           categoria:"Otro" },
];

const TRIMESTRES_CURSO = [
  { id:"t1", label:"1er Trimestre", meses:"Sep–Dic 2026", color:"#3a7abf" },
  { id:"t2", label:"2º Trimestre",  meses:"Ene–Mar 2027", color:"#2e7d3c" },
  { id:"t3", label:"3er Trimestre", meses:"Abr–Jun 2027", color:"#c0392b" },
];

// ── Subcomponente: Sesión individual de clase ─────────────────────
function SesionRow({sesion, alumnos, onUpdate, onDelete}){
  const [open, setOpen] = useState(false);
  const tipo = TIPOS_CLASE.find(t=>t.id===sesion.tipo)||TIPOS_CLASE[0];

  const presentes = (sesion.asistencia||[]).filter(a=>a.presente).length;
  const total     = (sesion.asistencia||[]).length;

  return <div style={{border:`1px solid ${tipo.color}22`,borderRadius:12,overflow:"hidden",marginBottom:8}}>
    {/* Cabecera sesión */}
    <div onClick={()=>setOpen(o=>!o)}
      style={{background:tipo.bg,padding:"10px 14px",cursor:"pointer",
        display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{background:tipo.color,color:"#fff",borderRadius:8,padding:"3px 10px",
        fontSize:12,fontWeight:700,flexShrink:0}}>{tipo.label}</span>
      <span style={{fontWeight:700,color:"#333",fontSize:14,flex:1}}>{sesion.titulo||"Sin título"}</span>
      <span style={{fontSize:12,color:"#666"}}>{sesion.fecha||"Sin fecha"}</span>
      {total>0&&<span style={{fontSize:12,color:tipo.color,fontWeight:700}}>
        👥 {presentes}/{total}
      </span>}
      <span style={{fontSize:14,color:"#888"}}>{open?"▲":"▼"}</span>
    </div>

    {open&&<div style={{padding:14,background:"#fff"}}>
      {/* Editar sesión */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <Field label="Fecha">
          <Input type="date" value={sesion.fecha||""} onChange={v=>onUpdate({...sesion,fecha:v})}/>
        </Field>
        <Field label="Tipo de clase">
          <select value={sesion.tipo||"tecnica"} onChange={e=>onUpdate({...sesion,tipo:e.target.value})}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
              fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            {TIPOS_CLASE.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Título / Objetivo de la sesión">
        <Input value={sesion.titulo||""} onChange={v=>onUpdate({...sesion,titulo:v})}
          placeholder="Ej: Fundamentos del swing, Putting 1m..."/>
      </Field>
      <Field label="Contenido trabajado">
        <Textarea value={sesion.contenido||""} onChange={v=>onUpdate({...sesion,contenido:v})}
          rows={2} placeholder="Ejercicios realizados, aspectos técnicos, materiales usados..."/>
      </Field>
      <Field label="Observaciones del profesor">
        <Textarea value={sesion.observaciones||""} onChange={v=>onUpdate({...sesion,observaciones:v})}
          rows={2} placeholder="Notas generales de la sesión, incidencias, aspectos a reforzar..."/>
      </Field>

      {/* Control de asistencia */}
      {(sesion.asistencia||[]).length>0&&<div style={{marginTop:12}}>
        <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:8}}>
          ✋ Control de asistencia
        </div>
        <div style={{display:"grid",gap:6}}>
          {(sesion.asistencia||[]).map((a,i)=>{
            const alumno = alumnos.find(x=>x.id===a.alumnoId);
            if(!alumno) return null;
            return <div key={a.alumnoId} style={{display:"flex",alignItems:"center",gap:10,
              background:a.presente?"#e8f5eb":"#fdecea",borderRadius:8,padding:"8px 12px"}}>
              <span style={{fontSize:16}}>{a.presente?"✅":"❌"}</span>
              <span style={{flex:1,fontWeight:600,fontSize:14}}>{alumno.nombre}</span>
              <button onClick={()=>{
                const newAs=[...(sesion.asistencia||[])];
                newAs[i]={...newAs[i],presente:!newAs[i].presente};
                onUpdate({...sesion,asistencia:newAs});
              }} style={{background:a.presente?"#c0392b":"#2e7d3c",color:"#fff",border:"none",
                borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {a.presente?"Marcar ausente":"Marcar presente"}
              </button>
              <Field label="" style={{margin:0}}>
                <Input value={a.notaAsistencia||""} onChange={v=>{
                  const newAs=[...(sesion.asistencia||[])];
                  newAs[i]={...newAs[i],notaAsistencia:v};
                  onUpdate({...sesion,asistencia:newAs});
                }} placeholder="Nota individual..." style={{fontSize:12,padding:"4px 8px"}}/>
              </Field>
            </div>;
          })}
        </div>
        <div style={{fontSize:12,color:G.soft,marginTop:6,textAlign:"right"}}>
          Asistencia: {presentes}/{total} ({total>0?Math.round(presentes/total*100):0}%)
        </div>
      </div>}

      {/* Ejercicios programados */}
      {(sesion.ejerciciosProg||[]).length>0&&<div style={{marginTop:12}}>
        <div style={{fontWeight:700,color:G.fairway,fontSize:13,marginBottom:6}}>
          🏋️ Ejercicios programados
        </div>
        {(sesion.ejerciciosProg||[]).map((ej,i)=>(
          <div key={i} style={{background:G.mist,borderRadius:8,padding:"6px 12px",marginBottom:4,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13}}>{ej}</span>
            <button onClick={()=>{
              const newEj=(sesion.ejerciciosProg||[]).filter((_,j)=>j!==i);
              onUpdate({...sesion,ejerciciosProg:newEj});
            }} style={{background:"none",border:"none",color:G.danger,cursor:"pointer",fontSize:16}}>✕</button>
          </div>
        ))}
      </div>}
      <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>{
          const texto=window.prompt("Añadir ejercicio a esta sesión:");
          if(texto?.trim()) onUpdate({...sesion,ejerciciosProg:[...(sesion.ejerciciosProg||[]),texto.trim()]});
        }} style={{background:G.mist,color:G.fairway,border:"none",borderRadius:8,
          padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          + Añadir ejercicio
        </button>
        <button onClick={()=>{if(golfConfirm("¿Eliminar esta sesión?"))onDelete();}}
          style={{background:"#fdecea",color:G.danger,border:"none",borderRadius:8,
            padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          🗑 Eliminar sesión
        </button>
      </div>
    </div>}
  </div>;
}

// ── Subcomponente: Detalle de un Programa ────────────────────────
function ProgramaDetalle({prog, data, setData, onBack}){
  const alumnos = data.alumnos||[];
  const [tabP, setTabP] = useState("sesiones");

  function updateProg(updated){
    setData({...data, programas:(data.programas||[]).map(p=>p.id===prog.id?updated:p)});
  }

  function addSesion(){
    const newSesion = {
      id: uid(),
      fecha: today(),
      tipo: "tecnica",
      titulo: "",
      contenido: "",
      observaciones: "",
      ejerciciosProg: [],
      asistencia: (prog.alumnoIds||[]).map(aid=>({alumnoId:aid, presente:false, notaAsistencia:""})),
    };
    updateProg({...prog, sesiones:[...(prog.sesiones||[]), newSesion]});
  }

  function updateSesion(sid, updated){
    updateProg({...prog, sesiones:(prog.sesiones||[]).map(s=>s.id===sid?updated:s)});
  }

  function deleteSesion(sid){
    updateProg({...prog, sesiones:(prog.sesiones||[]).filter(s=>s.id!==sid)});
  }

  function toggleAlumno(aid){
    const ids = prog.alumnoIds||[];
    const newIds = ids.includes(aid)?ids.filter(x=>x!==aid):[...ids,aid];
    // Update asistencia in all sessions too
    const newSesiones = (prog.sesiones||[]).map(s=>({
      ...s,
      asistencia: newIds.map(a=>
        (s.asistencia||[]).find(x=>x.alumnoId===a)||{alumnoId:a,presente:false,notaAsistencia:""}
      )
    }));
    updateProg({...prog, alumnoIds:newIds, sesiones:newSesiones});
  }

  const alumnosPrograma = alumnos.filter(a=>(prog.alumnoIds||[]).includes(a.id));
  const sesiones = prog.sesiones||[];
  const trimestre = TRIMESTRES_CURSO.find(t=>t.id===prog.trimestre)||TRIMESTRES_CURSO[0];

  // Stats
  const totalSesiones = sesiones.length;
  const sesionesConFecha = sesiones.filter(s=>s.fecha&&s.fecha<=today()).length;
  const totalAsistencias = sesiones.reduce((acc,s)=>{
    const pres=(s.asistencia||[]).filter(a=>a.presente).length;
    const tot=(s.asistencia||[]).length;
    return acc+(tot>0?pres/tot*100:0);
  },0);
  const pctAsistencia = sesionesConFecha>0?Math.round(totalAsistencias/sesionesConFecha):0;

  const TABS_P=[
    {id:"sesiones",label:"📅 Sesiones"},
    {id:"alumnos",label:"👤 Alumnos"},
    {id:"resumen",label:"📊 Resumen"},
    {id:"programacion",label:"📋 Programación"},
  ];

  return <div>
    {/* Header */}
    <div style={{background:`linear-gradient(135deg,${trimestre.color},${trimestre.color}cc)`,
      borderRadius:14,padding:"16px 20px",marginBottom:16,color:"#fff"}}>
      <button onClick={onBack} style={{background:"rgba(255,255,255,.2)",border:"none",
        color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",marginBottom:10}}>
        ← Volver a programas
      </button>
      <div style={{fontWeight:800,fontSize:18,marginBottom:2}}>{prog.nombre}</div>
      <div style={{fontSize:13,opacity:.85}}>{trimestre.label} · {trimestre.meses}</div>
      <div style={{fontSize:12,opacity:.75,marginTop:4}}>
        👥 {alumnosPrograma.length} alumnos · 📅 {totalSesiones} sesiones
        {pctAsistencia>0&&` · ✋ ${pctAsistencia}% asistencia`}
      </div>
    </div>

    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:10,marginBottom:16}}>
      {[
        [totalSesiones,"Sesiones","📅",trimestre.color],
        [alumnosPrograma.length,"Alumnos","👥",G.fairway],
        [sesionesConFecha,"Realizadas","✅",G.grass],
        [pctAsistencia+"%","Asistencia","✋","#c8a84b"],
      ].map(([v,l,i,c])=>(
        <Card key={l} style={{textAlign:"center",padding:12}}>
          <div style={{fontSize:18}}>{i}</div>
          <div style={{fontWeight:800,color:c,fontSize:18}}>{v}</div>
          <div style={{fontSize:11,color:G.soft}}>{l}</div>
        </Card>
      ))}
    </div>

    {/* Subtabs */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      {TABS_P.map(t=><button key={t.id} onClick={()=>setTabP(t.id)}
        style={{background:tabP===t.id?trimestre.color:G.mist,
          color:tabP===t.id?"#fff":G.fairway,border:"none",borderRadius:8,
          padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
        {t.label}
      </button>)}
    </div>

    {/* ── SESIONES ── */}
    {tabP==="sesiones"&&<div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <Btn onClick={addSesion}>+ Nueva sesión</Btn>
      </div>
      {sesiones.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,
        background:G.mist,borderRadius:10}}>
        Sin sesiones. Pulsa "+ Nueva sesión" para empezar.
      </div>}
      {[...sesiones].sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"")).map(s=>(
        <SesionRow key={s.id} sesion={s} alumnos={alumnos}
          onUpdate={u=>updateSesion(s.id,u)}
          onDelete={()=>deleteSesion(s.id)}/>
      ))}
    </div>}

    {/* ── ALUMNOS ── */}
    {tabP==="alumnos"&&<div>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 12px",color:G.fairway}}>Alumnos inscritos en este programa</h4>
        <div style={{display:"grid",gap:8}}>
          {alumnos.filter(a=>a.activo).map(a=>{
            const inscrito=(prog.alumnoIds||[]).includes(a.id);
            const grupo = GRUPOS_EDAD.find(g=>g.id===a.nivel)||{emoji:"👤",color:G.fairway};
            return <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,
              background:inscrito?G.mist:"#f9f9f9",borderRadius:10,padding:"10px 14px",
              border:`2px solid ${inscrito?G.grass:"#eee"}`}}>
              <span style={{fontSize:20}}>{grupo.emoji}</span>
              <span style={{flex:1,fontWeight:inscrito?700:400,color:G.ink}}>{a.nombre}</span>
              <span style={{fontSize:12,color:grupo.color,fontWeight:600}}>{a.nivel||"Sin grupo"}</span>
              <button onClick={()=>toggleAlumno(a.id)}
                style={{background:inscrito?G.danger:G.grass,color:"#fff",border:"none",
                  borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {inscrito?"Quitar":"Añadir"}
              </button>
            </div>;
          })}
        </div>
      </Card>
    </div>}

    {/* ── RESUMEN DE ASISTENCIA ── */}
    {tabP==="resumen"&&<div>
      <Card>
        <h4 style={{margin:"0 0 14px",color:G.fairway}}>📊 Resumen de asistencia por alumno</h4>
        {alumnosPrograma.length===0&&<div style={{color:G.soft,textAlign:"center",padding:20}}>
          No hay alumnos inscritos.
        </div>}
        {alumnosPrograma.map(a=>{
          const sesionesConAl = sesiones.filter(s=>(s.asistencia||[]).some(x=>x.alumnoId===a.id));
          const presentes = sesiones.reduce((acc,s)=>{
            const r=(s.asistencia||[]).find(x=>x.alumnoId===a.id);
            return acc+(r?.presente?1:0);
          },0);
          const pct = sesionesConAl.length>0?Math.round(presentes/sesionesConAl.length*100):0;
          const barColor = pct>=80?G.grass:pct>=60?"#c8a84b":G.danger;
          return <div key={a.id} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontWeight:700,fontSize:14}}>{a.nombre}</span>
              <span style={{fontWeight:700,color:barColor}}>{presentes}/{sesionesConAl.length} ({pct}%)</span>
            </div>
            <div style={{background:"#eee",borderRadius:20,height:8}}>
              <div style={{background:barColor,borderRadius:20,height:8,
                width:pct+"%",transition:"width .3s"}}/>
            </div>
            {/* Detalle por sesión */}
            <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
              {sesiones.sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"")).map(s=>{
                const r=(s.asistencia||[]).find(x=>x.alumnoId===a.id);
                return <div key={s.id} title={`${s.fecha||"?"}: ${r?.presente?"Presente":"Ausente"}`}
                  style={{width:20,height:20,borderRadius:4,
                    background:r?.presente?G.grass:"#fdecea",
                    border:`1px solid ${r?.presente?"#2e7d3c":"#c0392b"}`,
                    fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",
                    color:r?.presente?"#fff":"#c0392b"}}>
                  {r?.presente?"✓":"✗"}
                </div>;
              })}
            </div>
          </div>;
        })}
      </Card>

      {/* Resumen por tipo de clase */}
      <Card style={{marginTop:12}}>
        <h4 style={{margin:"0 0 12px",color:G.fairway}}>🏌️ Sesiones por tipo</h4>
        {TIPOS_CLASE.map(tipo=>{
          const n = sesiones.filter(s=>s.tipo===tipo.id).length;
          if(n===0) return null;
          return <div key={tipo.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <span style={{background:tipo.color,color:"#fff",borderRadius:8,padding:"3px 10px",
              fontSize:12,fontWeight:700,minWidth:140}}>{tipo.label}</span>
            <div style={{flex:1,background:"#eee",borderRadius:20,height:8}}>
              <div style={{background:tipo.color,borderRadius:20,height:8,
                width:(n/Math.max(totalSesiones,1)*100)+"%"}}/>
            </div>
            <span style={{fontWeight:700,color:tipo.color,minWidth:24}}>{n}</span>
          </div>;
        })}
      </Card>
    </div>}

    {/* ── PROGRAMACIÓN ── */}
    {tabP==="programacion"&&<div>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>📋 Descripción del programa</h4>
        <Textarea value={prog.descripcion||""} rows={3}
          onChange={v=>updateProg({...prog,descripcion:v})}
          placeholder="Objetivos generales del trimestre, metodología, materiales..."/>
      </Card>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>🎯 Objetivos del trimestre</h4>
        <Textarea value={prog.objetivos||""} rows={3}
          onChange={v=>updateProg({...prog,objetivos:v})}
          placeholder="Objetivos técnicos, físicos y mentales del grupo para este trimestre..."/>
      </Card>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>📅 Horario del programa</h4>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Día(s) de la semana">
            <Input value={prog.horarioDia||""} onChange={v=>updateProg({...prog,horarioDia:v})}
              placeholder="Ej: Martes y Jueves"/>
          </Field>
          <Field label="Hora">
            <Input value={prog.horarioHora||""} onChange={v=>updateProg({...prog,horarioHora:v})}
              placeholder="Ej: 17:00 - 18:30"/>
          </Field>
          <Field label="Lugar">
            <Input value={prog.lugar||""} onChange={v=>updateProg({...prog,lugar:v})}
              placeholder="Ej: Zona Putting Green"/>
          </Field>
          <Field label="Duración por sesión">
            <Input value={prog.duracion||""} onChange={v=>updateProg({...prog,duracion:v})}
              placeholder="Ej: 90 minutos"/>
          </Field>
        </div>
      </Card>
      <Card>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>🏋️ Ejercicios del programa</h4>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 10px"}}>
          Lista de ejercicios base para todo el programa (puedes añadir más en cada sesión).
        </p>
        {(prog.ejerciciosBase||[]).map((ej,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
            <div style={{flex:1,background:G.mist,borderRadius:8,padding:"7px 12px",fontSize:13}}>{ej}</div>
            <button onClick={()=>updateProg({...prog,ejerciciosBase:(prog.ejerciciosBase||[]).filter((_,j)=>j!==i)})}
              style={{background:"none",border:"none",color:G.danger,cursor:"pointer",fontSize:18}}>✕</button>
          </div>
        ))}
        <button onClick={()=>{
          const t=window.prompt("Añadir ejercicio al programa:");
          if(t?.trim())updateProg({...prog,ejerciciosBase:[...(prog.ejerciciosBase||[]),t.trim()]});
        }} style={{background:G.mist,color:G.fairway,border:"none",borderRadius:8,
          padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>
          + Añadir ejercicio
        </button>
      </Card>
    </div>}
  </div>;
}

// ── Módulo principal: Programas ───────────────────────────────────
function ModProgramas({data, setData}){
  const [verProg, setVerProg] = useState(null);
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({});
  const [filtroTrim, setFiltroTrim] = useState("todos");

  const programas = data.programas||[];

  // Si estamos viendo un programa en detalle
  if(verProg){
    const prog = programas.find(p=>p.id===verProg);
    if(!prog){ setVerProg(null); return null; }
    return <ProgramaDetalle prog={prog} data={data} setData={setData} onBack={()=>setVerProg(null)}/>;
  }

  function openNew(){
    setForm({nombre:"",trimestre:"t1",grupo:"",descripcion:"",alumnoIds:[]});
    setModal(true);
  }

  function guardar(){
    if(!form.nombre?.trim()) return;
    const nuevo={...form, id:uid(), sesiones:[], ejerciciosBase:[],
      fechaCreacion:today()};
    setData({...data, programas:[...programas, nuevo]});
    setModal(false);
  }

  const filtrados = filtroTrim==="todos"
    ? programas
    : programas.filter(p=>p.trimestre===filtroTrim);

  return <div>
    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:12,marginBottom:20}}>
      {[
        [programas.length,"Programas","📋",G.fairway],
        [programas.reduce((a,p)=>(p.sesiones||[]).length+a,0),"Sesiones total","📅",G.sky],
        [programas.reduce((a,p)=>new Set([...a,...(p.alumnoIds||[])]).size,new Set()).size,"Alumnos activos","👥",G.grass],
      ].map(([v,l,i,c])=>(
        <Card key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:4}}>{i}</div>
          <div style={{fontWeight:800,color:c,fontSize:22}}>{v}</div>
          <div style={{fontSize:11,color:G.soft}}>{l}</div>
        </Card>
      ))}
    </div>

    {/* Filtros + nuevo */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      {[{id:"todos",label:"Todos"},...TRIMESTRES_CURSO].map(t=>(
        <button key={t.id} onClick={()=>setFiltroTrim(t.id)}
          style={{background:filtroTrim===t.id?(t.color||G.fairway):G.mist,
            color:filtroTrim===t.id?"#fff":G.fairway,border:"none",borderRadius:8,
            padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          {t.label}
        </button>
      ))}
      <div style={{marginLeft:"auto"}}>
        <Btn onClick={openNew}>+ Nuevo programa</Btn>
      </div>
    </div>

    {/* Lista de programas */}
    {filtrados.length===0&&<div style={{color:G.soft,textAlign:"center",padding:40,
      background:G.mist,borderRadius:12}}>
      Sin programas. Pulsa "+ Nuevo programa" para crear el primero.
    </div>}
    <div style={{display:"grid",gap:12}}>
      {filtrados.map(prog=>{
        const trimestre = TRIMESTRES_CURSO.find(t=>t.id===prog.trimestre)||TRIMESTRES_CURSO[0];
        const sesiones  = prog.sesiones||[];
        const numAlumnos= (prog.alumnoIds||[]).length;
        const realizadas= sesiones.filter(s=>s.fecha&&s.fecha<=today()).length;
        return <div key={prog.id} style={{background:"#fff",borderRadius:14,
          boxShadow:"0 2px 12px rgba(0,0,0,.07)",overflow:"hidden",
          borderLeft:`5px solid ${trimestre.color}`}}>
          {/* Header */}
          <div style={{background:trimestre.color+"18",padding:"12px 16px",
            display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,color:G.ink,fontSize:16}}>{prog.nombre}</div>
              <div style={{fontSize:12,color:G.soft,marginTop:2}}>
                {trimestre.label} · {trimestre.meses}
                {prog.horarioDia&&` · ${prog.horarioDia}`}
                {prog.horarioHora&&` ${prog.horarioHora}`}
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{background:trimestre.color,color:"#fff",borderRadius:10,
                padding:"3px 10px",fontSize:12,fontWeight:700}}>
                {trimestre.label}
              </span>
            </div>
          </div>
          {/* Body */}
          <div style={{padding:"12px 16px",display:"flex",gap:16,flexWrap:"wrap",
            alignItems:"center"}}>
            <div style={{display:"flex",gap:16,flex:1,flexWrap:"wrap"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:800,fontSize:20,color:G.fairway}}>{numAlumnos}</div>
                <div style={{fontSize:11,color:G.soft}}>Alumnos</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:800,fontSize:20,color:G.sky}}>{sesiones.length}</div>
                <div style={{fontSize:11,color:G.soft}}>Sesiones</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:800,fontSize:20,color:G.grass}}>{realizadas}</div>
                <div style={{fontSize:11,color:G.soft}}>Realizadas</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn small onClick={()=>setVerProg(prog.id)}>📂 Abrir</Btn>
              <Btn small color="danger" onClick={()=>{
                if(golfConfirm("¿Eliminar el programa "+prog.nombre+"?"))
                  setData({...data,programas:programas.filter(p=>p.id!==prog.id)});
              }}>🗑</Btn>
            </div>
          </div>
        </div>;
      })}
    </div>

    {/* Modal nuevo programa */}
    {modal&&<Modal title="Nuevo programa" onClose={()=>setModal(false)} wide>
      <Field label="Nombre del programa *">
        <Input value={form.nombre||""} onChange={v=>setForm(f=>({...f,nombre:v}))}
          placeholder="Ej: Iniciación Pollitos T1, Técnica Eagles Primavera..."/>
      </Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Trimestre">
          <select value={form.trimestre||"t1"} onChange={e=>setForm(f=>({...f,trimestre:e.target.value}))}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
              fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            {TRIMESTRES_CURSO.map(t=><option key={t.id} value={t.id}>{t.label} — {t.meses}</option>)}
          </select>
        </Field>
        <Field label="Grupo de edad">
          <select value={form.grupo||""} onChange={e=>setForm(f=>({...f,grupo:e.target.value}))}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
              fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            <option value="">Sin especificar</option>
            {GRUPOS_EDAD.map(g=><option key={g.id} value={g.id}>{g.emoji} {g.nombre} ({g.rango})</option>)}
          </select>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Día(s) de la semana">
          <Input value={form.horarioDia||""} onChange={v=>setForm(f=>({...f,horarioDia:v}))}
            placeholder="Ej: Martes y Jueves"/>
        </Field>
        <Field label="Hora">
          <Input value={form.horarioHora||""} onChange={v=>setForm(f=>({...f,horarioHora:v}))}
            placeholder="Ej: 17:00 - 18:30"/>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Tipo de programa">
          <Input value={form.tipoProg||""} onChange={v=>setForm(f=>({...f,tipoProg:v}))}
            placeholder="Ej: Iniciación, Técnica, Competición, Perfeccionamiento..."/>
        </Field>
        <Field label="Duración de cada jornada">
          <Input value={form.duracionJornada||""} onChange={v=>setForm(f=>({...f,duracionJornada:v}))}
            placeholder="Ej: 60 min, 90 min, 2 horas..."/>
        </Field>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Nº de jornadas totales">
          <Input type="number" value={form.numJornadas||""} onChange={v=>setForm(f=>({...f,numJornadas:v}))}
            placeholder="Ej: 12"/>
        </Field>
        <Field label="Nº de alumnos máximo">
          <Input type="number" value={form.maxAlumnos||""} onChange={v=>setForm(f=>({...f,maxAlumnos:v}))}
            placeholder="Ej: 6"/>
        </Field>
      </div>
      <Field label="Descripción / Objetivos generales">
        <Textarea value={form.descripcion||""} onChange={v=>setForm(f=>({...f,descripcion:v}))}
          rows={3} placeholder="Describe los objetivos y contenidos generales del programa..."/>
      </Field>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
        <Btn color="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre?.trim()}>Crear programa</Btn>
      </div>
    </Modal>}
  </div>;
}


// ═══════════════════════════════════════════════════════════════════
// MÓDULO: INFORMES PERSONALIZADOS
// ═══════════════════════════════════════════════════════════════════

// ── Secciones disponibles en el informe ──────────────────────────
const INFORME_SECCIONES = [
  { id:"portada",      label:"📋 Portada",               desc:"Título, alumno, fechas y logo" },
  { id:"resumen",      label:"📝 Resumen ejecutivo",      desc:"Texto libre de evaluación general" },
  { id:"hcp",          label:"📈 Evolución del hándicap", desc:"Gráfica de progresión del hándicap" },
  { id:"estadisticas", label:"📊 Estadísticas de juego",  desc:"Golpes, fairways, GIR, putts, bunkers" },
  { id:"tecnico",      label:"🏌️ Análisis técnico",       desc:"Evaluación técnica por áreas" },
  { id:"imagenes",     label:"📷 Imágenes",               desc:"Fotos de entrenamientos y torneos" },
  { id:"videos",       label:"🎬 Vídeos de análisis",     desc:"Capturas y notas de vídeo análisis" },
  { id:"ejercicios",   label:"🏋️ Ejercicios realizados",  desc:"Lista de ejercicios del período" },
  { id:"objetivos",    label:"🎯 Objetivos y plan",       desc:"Logros conseguidos y próximos objetivos" },
  { id:"firma",        label:"✍️ Firma del profesor",     desc:"Cierre y firma del informe" },
];

const AREAS_TECNICAS = [
  "Drive / Salida", "Fairway woods / Maderas", "Hierros largos (2-5)",
  "Hierros medios (6-8)", "Hierros cortos (9-PW)", "Chip / Juego corto",
  "Pitch", "Bunker", "Putt largo", "Putt corto", "Mental / Gestión", "Físico / Condición",
];

const VALORACIONES = [
  { id:"5", label:"⭐⭐⭐⭐⭐ Excelente",  color:"#1a5c2a" },
  { id:"4", label:"⭐⭐⭐⭐  Muy bien",    color:"#2e7d3c" },
  { id:"3", label:"⭐⭐⭐   Bien",         color:"#c8a84b" },
  { id:"2", label:"⭐⭐    En progreso",   color:"#d4651a" },
  { id:"1", label:"⭐     A trabajar",    color:"#c0392b" },
];

// ── Mini gráfica de evolución HCP ────────────────────────────────
function HcpChart({stats}){
  const datos = stats
    .filter(s=>s.handicap)
    .sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""))
    .slice(-12);
  if(datos.length<2) return <div style={{color:G.soft,fontSize:13,padding:16,textAlign:"center"}}>
    Sin datos suficientes de hándicap (mínimo 2 rondas con hándicap registrado).
  </div>;
  const vals = datos.map(d=>Number(d.handicap));
  const mx=Math.max(...vals), mn=Math.min(...vals), rng=mx-mn||1;
  const W=320, H=120, px=20, py=16;
  const pts = vals.map((v,i)=>`${px+(i/(vals.length-1))*(W-px*2)},${py+(v-mn)/rng*(H-py*2)}`);
  const polyline = pts.join(" ");
  const last = pts[pts.length-1].split(",");
  const first = pts[0].split(",");
  return <div style={{overflowX:"auto"}}>
    <svg width={W} height={H+30} style={{display:"block",margin:"0 auto"}}>
      {/* Grid lines */}
      {[0,0.25,0.5,0.75,1].map(p=>(
        <line key={p} x1={px} y1={py+p*(H-py*2)} x2={W-px} y2={py+p*(H-py*2)}
          stroke="#e0e0e0" strokeWidth="1"/>
      ))}
      {/* Area fill */}
      <polygon points={`${pts[0].split(",")[0]},${H-py} ${polyline} ${last[0]},${H-py}`}
        fill="#1a5c2a" opacity="0.1"/>
      {/* Line */}
      <polyline fill="none" stroke="#1a5c2a" strokeWidth="2.5" points={polyline}/>
      {/* Points */}
      {pts.map((pt,i)=>{
        const [x,y]=pt.split(",");
        return <g key={i}>
          <circle cx={x} cy={y} r="5" fill="#1a5c2a" stroke="white" strokeWidth="1.5"/>
          <text x={x} y={Number(y)-10} textAnchor="middle" fontSize="10" fill="#1a5c2a" fontWeight="bold">
            {vals[i]}
          </text>
        </g>;
      })}
      {/* X labels */}
      {datos.map((d,i)=>{
        const x=px+(i/(vals.length-1))*(W-px*2);
        return <text key={i} x={x} y={H+24} textAnchor="middle" fontSize="9" fill="#888">
          {(d.fecha||"").slice(5)}
        </text>;
      })}
      {/* Trend arrow */}
      {vals[0]>vals[vals.length-1]
        ? <text x={W-px} y={py} textAnchor="end" fontSize="11" fill="#2e7d3c" fontWeight="bold">▼ Bajando ✓</text>
        : <text x={W-px} y={py} textAnchor="end" fontSize="11" fill="#c0392b" fontWeight="bold">▲ Subiendo</text>
      }
    </svg>
    <div style={{display:"flex",justifyContent:"space-between",padding:"0 20px",fontSize:12,color:G.soft}}>
      <span>Inicial: <b>{vals[0]}</b></span>
      <span>Mejor: <b>{Math.min(...vals)}</b></span>
      <span>Actual: <b>{vals[vals.length-1]}</b></span>
    </div>
  </div>;
}

// ── Estadísticas del período ──────────────────────────────────────
function StatsResumen({stats}){
  if(!stats.length) return <div style={{color:G.soft,textAlign:"center",padding:16,fontSize:13}}>Sin rondas en el período seleccionado.</div>;
  const num  = v => stats.map(s=>Number(s[v])).filter(n=>n>0);
  const avg  = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : "—";
  const best = arr => arr.length ? Math.min(...arr) : "—";
  const campos = [
    ["⛳ Golpes medios",    avg(num("golpes")),              G.fairway],
    ["🏆 Mejor ronda",     best(num("golpes")),             G.grass],
    ["🎯 Fairways %",      avg(num("fairwaysPorcentaje")),  G.sky],
    ["✅ GIR %",           avg(num("greensRegulacion")),    "#7b5ea7"],
    ["⚪ Putts medios",    avg(num("putts")),               G.flag],
    ["🏖️ Bunkers medios", avg(num("bunkers")),             "#c8a84b"],
  ];
  return <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
    {campos.map(([label,val,color])=>(
      <div key={label} style={{background:G.mist,borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
        <div style={{fontWeight:800,fontSize:20,color}}>{val}</div>
        <div style={{fontSize:11,color:G.soft,marginTop:2}}>{label}</div>
      </div>
    ))}
  </div>;
}

// ── Componente principal ModInformes ─────────────────────────────
function ModInformes({data,setData}){
  const alumnos = (data.alumnos||[]).filter(a=>a.activo);
  const [vista,  setVista]  = useState("lista"); // lista | editor | preview
  const [informe,setInforme]= useState(null);

  const informes = data.informes||[];

  function nuevoInforme(){
    const nuevo = {
      id: uid(),
      titulo: "Informe de seguimiento",
      alumnoId: alumnos[0]?.id||"",
      fechaDesde: "",
      fechaHasta: today(),
      fechaCreacion: today(),
      secciones: ["portada","resumen","hcp","estadisticas","tecnico","objetivos","firma"],
      // Contenido de cada sección
      resumenTexto: "",
      areasEval: {},        // {area: {val:"4", notas:""}}
      imagenesData: [],     // [{base64, caption}]
      videosNotas: [],      // [{url, titulo, notas, captura}]
      objetivosLogrados: "",
      objetivosProximos: "",
      planTrabajo: "",
      firmaTexto: "José Manuel Caballero Fernández\nPGA España Nº 1908P\nGolf Ciudad Real C.D.",
      publicado: false,
    };
    setData({...data, informes:[...informes, nuevo]});
    setInforme(nuevo.id);
    setVista("editor");
  }

  function guardarInforme(updated){
    setData({...data, informes:informes.map(r=>r.id===updated.id?updated:r)});
  }

  function eliminarInforme(id){
    setData({...data, informes:informes.filter(r=>r.id!==id)});
    if(informe===id){ setInforme(null); setVista("lista"); }
  }

  // Vista lista
  if(vista==="lista") return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
      <div>
        <h2 style={{margin:0,color:G.fairway}}>📑 Informes personalizados</h2>
        <div style={{fontSize:12,color:G.soft,marginTop:2}}>Crea informes de seguimiento para cada alumno</div>
      </div>
      <Btn onClick={nuevoInforme} disabled={!alumnos.length}>+ Nuevo informe</Btn>
    </div>

    {informes.length===0
      ? <div style={{textAlign:"center",padding:50,background:G.mist,borderRadius:14,color:G.soft}}>
          <div style={{fontSize:32,marginBottom:10}}>📑</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>Sin informes todavía</div>
          <div style={{fontSize:13}}>Pulsa "+ Nuevo informe" para crear el primero.</div>
        </div>
      : <div style={{display:"grid",gap:12}}>
          {informes.sort((a,b)=>(b.fechaCreacion||"").localeCompare(a.fechaCreacion||"")).map(r=>{
            const alumno = alumnos.find(a=>a.id===r.alumnoId);
            return <Card key={r.id} style={{borderLeft:`4px solid ${r.publicado?G.grass:G.flag}`}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <FotoAlumno foto={alumno?.foto} nombre={alumno?.nombre||"?"} size={44}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:15,color:G.ink}}>{r.titulo}</div>
                  <div style={{fontSize:13,color:G.soft,marginTop:2}}>
                    {alumno?.nombre||"Sin alumno"} · Creado: {r.fechaCreacion}
                    {r.fechaDesde&&r.fechaHasta&&` · ${r.fechaDesde} → ${r.fechaHasta}`}
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                    {(r.secciones||[]).slice(0,4).map(s=>{
                      const sec=INFORME_SECCIONES.find(x=>x.id===s);
                      return sec?<span key={s} style={{background:G.mist,color:G.fairway,
                        borderRadius:8,padding:"2px 8px",fontSize:11}}>{sec.label}</span>:null;
                    })}
                    {(r.secciones||[]).length>4&&<span style={{fontSize:11,color:G.soft}}>
                      +{(r.secciones||[]).length-4} más
                    </span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexDirection:"column",flexShrink:0}}>
                  <Btn small onClick={()=>{setInforme(r.id);setVista("editor");}}>✎ Editar</Btn>
                  <Btn small color="sky" onClick={()=>{setInforme(r.id);setVista("preview");}}>👁 Ver</Btn>
                  <Btn small color="danger" onClick={()=>{if(golfConfirm("¿Eliminar este informe?"))eliminarInforme(r.id);}}>🗑</Btn>
                </div>
              </div>
            </Card>;
          })}
        </div>
    }
  </div>;

  // Editor / Preview
  const rpt = informes.find(r=>r.id===informe);
  if(!rpt) return null;

  if(vista==="preview") return <InformePreview
    rpt={rpt} alumnos={alumnos} data={data}
    onEdit={()=>setVista("editor")}
    onBack={()=>setVista("lista")}
    onPublicar={()=>guardarInforme({...rpt,publicado:true})}
  />;

  return <InformeEditor
    rpt={rpt} alumnos={alumnos} data={data}
    onChange={guardarInforme}
    onPreview={()=>setVista("preview")}
    onBack={()=>setVista("lista")}
  />;
}

// ── Editor del informe ───────────────────────────────────────────
function InformeEditor({rpt, alumnos, data, onChange, onPreview, onBack}){
  const upd = (k,v) => onChange({...rpt,[k]:v});
  const alumno = alumnos.find(a=>a.id===rpt.alumnoId);
  const stats  = (data.estadisticas||[]).filter(s=>s.alumnoId===rpt.alumnoId&&
    (!rpt.fechaDesde||s.fecha>=rpt.fechaDesde)&&(!rpt.fechaHasta||s.fecha<=rpt.fechaHasta));

  const [tabE, setTabE] = useState("config");

  const TABS_E=[
    {id:"config",    label:"⚙️ Config"},
    {id:"resumen",   label:"📝 Resumen"},
    {id:"tecnico",   label:"🏌️ Técnico"},
    {id:"imagenes",  label:"📷 Imágenes"},
    {id:"videos",    label:"🎬 Vídeos"},
    {id:"objetivos", label:"🎯 Objetivos"},
  ];

  function addImagen(e){
    const file=e.target.files[0]; if(!file) return;
    if(file.size>2*1024*1024){alert("La imagen no puede superar 2MB.");return;}
    const reader=new FileReader();
    reader.onload=ev=>upd("imagenesData",[...(rpt.imagenesData||[]),{base64:ev.target.result,caption:""}]);
    reader.readAsDataURL(file);
    e.target.value="";
  }

  function updCaption(i,v){
    const imgs=[...(rpt.imagenesData||[])];
    imgs[i]={...imgs[i],caption:v};
    upd("imagenesData",imgs);
  }

  function delImagen(i){ upd("imagenesData",(rpt.imagenesData||[]).filter((_,j)=>j!==i)); }

  function addVideo(){
    upd("videosNotas",[...(rpt.videosNotas||[]),{url:"",titulo:"",notas:"",fecha:""}]);
  }

  function updVideo(i,k,v){
    const vids=[...(rpt.videosNotas||[])];
    vids[i]={...vids[i],[k]:v};
    upd("videosNotas",vids);
  }

  function delVideo(i){ upd("videosNotas",(rpt.videosNotas||[]).filter((_,j)=>j!==i)); }

  function toggleSeccion(sid){
    const secs=rpt.secciones||[];
    upd("secciones",secs.includes(sid)?secs.filter(s=>s!==sid):[...secs,sid]);
  }

  function updArea(area,k,v){
    const ae={...rpt.areasEval};
    ae[area]={...ae[area],[k]:v};
    upd("areasEval",ae);
  }

  return <div>
    {/* Barra superior */}
    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:G.mist,color:G.fairway,border:"none",
        borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
        ← Volver
      </button>
      <div style={{flex:1,fontWeight:700,color:G.ink,fontSize:15}}>{rpt.titulo}</div>
      <Btn color="sky" onClick={onPreview}>👁 Vista previa</Btn>
    </div>

    {/* Subtabs */}
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      {TABS_E.map(t=><button key={t.id} onClick={()=>setTabE(t.id)}
        style={{background:tabE===t.id?G.fairway:G.mist,color:tabE===t.id?"#fff":G.fairway,
          border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
        {t.label}
      </button>)}
    </div>

    {/* ── CONFIG ── */}
    {tabE==="config"&&<div>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 12px",color:G.fairway}}>📋 Datos del informe</h4>
        <Field label="Título del informe">
          <Input value={rpt.titulo||""} onChange={v=>upd("titulo",v)}
            placeholder="Ej: Informe trimestral T1 2027 · Nombre del alumno"/>
        </Field>
        <Field label="Alumno">
          <select value={rpt.alumnoId||""} onChange={e=>upd("alumnoId",e.target.value)}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",
              fontSize:14,background:"#fff",fontFamily:"inherit"}}>
            <option value="">Seleccionar alumno</option>
            {alumnos.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Período desde">
            <Input type="date" value={rpt.fechaDesde||""} onChange={v=>upd("fechaDesde",v)}/>
          </Field>
          <Field label="Período hasta">
            <Input type="date" value={rpt.fechaHasta||today()} onChange={v=>upd("fechaHasta",v)}/>
          </Field>
        </div>
        <div style={{background:G.mist,borderRadius:8,padding:"8px 12px",fontSize:12,color:G.fairway}}>
          📊 Rondas en este período: <b>{stats.length}</b>
          {stats.length>0&&` · Hándicap: ${stats.filter(s=>s.handicap).map(s=>s.handicap).join(", ")}`}
        </div>
      </Card>

      <Card>
        <h4 style={{margin:"0 0 12px",color:G.fairway}}>📑 Secciones del informe</h4>
        <div style={{display:"grid",gap:8}}>
          {INFORME_SECCIONES.map(sec=>{
            const activa=(rpt.secciones||[]).includes(sec.id);
            return <div key={sec.id} style={{display:"flex",alignItems:"center",gap:12,
              background:activa?G.mist:"#f9f9f9",borderRadius:10,padding:"10px 14px",
              border:`2px solid ${activa?G.grass:"#eee"}`}}>
              <input type="checkbox" checked={activa} onChange={()=>toggleSeccion(sec.id)}
                style={{width:18,height:18,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,color:G.ink}}>{sec.label}</div>
                <div style={{fontSize:12,color:G.soft}}>{sec.desc}</div>
              </div>
            </div>;
          })}
        </div>
      </Card>
    </div>}

    {/* ── RESUMEN ── */}
    {tabE==="resumen"&&<Card>
      <h4 style={{margin:"0 0 8px",color:G.fairway}}>📝 Resumen ejecutivo y evaluación general</h4>
      <p style={{fontSize:13,color:G.soft,margin:"0 0 12px"}}>
        Escribe una valoración general del período: progreso, actitud, puntos destacados.
      </p>
      <Textarea value={rpt.resumenTexto||""}
        onChange={v=>upd("resumenTexto",v)}
        rows={8}
        placeholder={"Durante este período, el alumno ha demostrado una notable mejora en...\n\nLos aspectos más destacados han sido...\n\nLas áreas que requieren mayor atención son..."}/>
      <div style={{marginTop:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>📈 Evolución del hándicap</h4>
        <HcpChart stats={stats}/>
        <div style={{marginTop:10}}>
          <h5 style={{margin:"8px 0 4px",color:G.soft,fontWeight:600,fontSize:13}}>Estadísticas del período</h5>
          <StatsResumen stats={stats}/>
        </div>
      </div>
    </Card>}

    {/* ── TÉCNICO ── */}
    {tabE==="tecnico"&&<Card>
      <h4 style={{margin:"0 0 8px",color:G.fairway}}>🏌️ Evaluación técnica por áreas</h4>
      <p style={{fontSize:13,color:G.soft,margin:"0 0 14px"}}>
        Valora cada área técnica y añade notas específicas.
      </p>
      <div style={{display:"grid",gap:10}}>
        {AREAS_TECNICAS.map(area=>{
          const ev=rpt.areasEval?.[area]||{val:"",notas:""};
          const valInfo=VALORACIONES.find(v=>v.id===ev.val);
          return <div key={area} style={{background:"#f9f9f9",borderRadius:10,padding:12,
            borderLeft:`4px solid ${valInfo?.color||"#ddd"}`}}>
            <div style={{fontWeight:700,color:G.ink,fontSize:14,marginBottom:8}}>{area}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <label style={{fontSize:11,color:G.soft,fontWeight:600,display:"block",marginBottom:4}}>VALORACIÓN</label>
                <select value={ev.val||""} onChange={e=>updArea(area,"val",e.target.value)}
                  style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"7px 10px",
                    fontSize:13,background:"#fff",fontFamily:"inherit",
                    color:valInfo?.color||"#555",fontWeight:valInfo?"700":"400"}}>
                  <option value="">Sin evaluar</option>
                  {VALORACIONES.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,color:G.soft,fontWeight:600,display:"block",marginBottom:4}}>NOTAS</label>
                <Input value={ev.notas||""} onChange={v=>updArea(area,"notas",v)}
                  placeholder="Observaciones específicas..."/>
              </div>
            </div>
          </div>;
        })}
      </div>
    </Card>}

    {/* ── IMÁGENES ── */}
    {tabE==="imagenes"&&<div>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>📷 Imágenes del período</h4>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 12px"}}>
          Añade fotos de entrenamientos, torneos o capturas de swing. Máx. 2MB por imagen.
        </p>
        <label style={{background:G.mist,color:G.fairway,borderRadius:8,
          padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",display:"inline-block"}}>
          📷 Añadir imagen
          <input type="file" accept="image/*" onChange={addImagen} style={{display:"none"}} multiple/>
        </label>
      </Card>
      {(rpt.imagenesData||[]).length===0
        ? <div style={{textAlign:"center",padding:30,background:G.mist,borderRadius:12,color:G.soft,fontSize:13}}>
            Sin imágenes. Pulsa "Añadir imagen" para subir fotos.
          </div>
        : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
            {(rpt.imagenesData||[]).map((img,i)=>(
              <div key={i} style={{background:"#fff",borderRadius:12,overflow:"hidden",
                boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
                <img src={img.base64} alt="" style={{width:"100%",height:160,objectFit:"cover"}}/>
                <div style={{padding:10}}>
                  <Input value={img.caption||""} onChange={v=>updCaption(i,v)}
                    placeholder="Descripción de la foto..."/>
                  <button onClick={()=>delImagen(i)}
                    style={{background:"none",border:"none",color:G.danger,cursor:"pointer",
                      fontSize:12,fontWeight:600,marginTop:4}}>
                    ✕ Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
      }
    </div>}

    {/* ── VÍDEOS ── */}
    {tabE==="videos"&&<div>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>🎬 Vídeos de análisis</h4>
        <p style={{fontSize:13,color:G.soft,margin:"0 0 12px"}}>
          Añade URLs de YouTube, Google Drive o cualquier enlace de vídeo, con notas de análisis.
        </p>
        <Btn onClick={addVideo} color="sky">+ Añadir vídeo</Btn>
      </Card>
      {(rpt.videosNotas||[]).length===0
        ? <div style={{textAlign:"center",padding:30,background:G.mist,borderRadius:12,color:G.soft,fontSize:13}}>
            Sin vídeos. Pulsa "+ Añadir vídeo" para añadir el primero.
          </div>
        : <div style={{display:"grid",gap:12}}>
            {(rpt.videosNotas||[]).map((vid,i)=>(
              <Card key={i} style={{borderLeft:"4px solid #c0392b"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <Field label="Título del vídeo">
                    <Input value={vid.titulo||""} onChange={v=>updVideo(i,"titulo",v)}
                      placeholder="Ej: Swing driver — 15 enero"/>
                  </Field>
                  <Field label="Fecha">
                    <Input type="date" value={vid.fecha||""} onChange={v=>updVideo(i,"fecha",v)}/>
                  </Field>
                </div>
                <Field label="URL del vídeo (YouTube, Drive, etc.)">
                  <Input value={vid.url||""} onChange={v=>updVideo(i,"url",v)}
                    placeholder="https://youtube.com/watch?v=..."/>
                </Field>
                {vid.url&&vid.url.includes("youtube")&&<div style={{marginTop:8,borderRadius:8,overflow:"hidden"}}>
                  <iframe
                    src={vid.url.replace("watch?v=","embed/").replace("youtu.be/","youtube.com/embed/")}
                    width="100%" height="180" frameBorder="0" allowFullScreen
                    style={{borderRadius:8,display:"block"}}/>
                </div>}
                <Field label="Notas de análisis técnico">
                  <Textarea value={vid.notas||""} onChange={v=>updVideo(i,"notas",v)}
                    rows={3} placeholder="Aspectos positivos, puntos a mejorar, ejercicios recomendados..."/>
                </Field>
                <button onClick={()=>delVideo(i)}
                  style={{background:"none",border:"none",color:G.danger,cursor:"pointer",
                    fontSize:12,fontWeight:600}}>✕ Eliminar vídeo</button>
              </Card>
            ))}
          </div>
      }
    </div>}

    {/* ── OBJETIVOS ── */}
    {tabE==="objetivos"&&<div>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>🎯 Logros conseguidos</h4>
        <Textarea value={rpt.objetivosLogrados||""}
          onChange={v=>upd("objetivosLogrados",v)} rows={4}
          placeholder={"• Ha mejorado la consistencia en el putt corto (1-2m)\n• Ha reducido el hándicap en 2 puntos\n• Ha completado el primer torneo federado..."}/>
      </Card>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>🚀 Objetivos próximo período</h4>
        <Textarea value={rpt.objetivosProximos||""}
          onChange={v=>upd("objetivosProximos",v)} rows={4}
          placeholder={"• Mejorar el % de GIR desde 100-120m\n• Trabajar la salida de bunker\n• Participar en el torneo de primavera..."}/>
      </Card>
      <Card style={{marginBottom:12}}>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>📋 Plan de trabajo</h4>
        <Textarea value={rpt.planTrabajo||""}
          onChange={v=>upd("planTrabajo",v)} rows={4}
          placeholder={"3 sesiones/semana:\n• Martes 17h: Técnica de hierros + approach\n• Jueves 17h: Short game + putting\n• Sábado 10h: Juego en campo completo..."}/>
      </Card>
      <Card>
        <h4 style={{margin:"0 0 8px",color:G.fairway}}>✍️ Firma del profesor</h4>
        <Textarea value={rpt.firmaTexto||""}
          onChange={v=>upd("firmaTexto",v)} rows={3}
          placeholder="José Manuel Caballero Fernández&#10;PGA España Nº 1908P&#10;Golf Ciudad Real C.D."/>
      </Card>
    </div>}
  </div>;
}

// ── Vista previa del informe ──────────────────────────────────────
function InformePreview({rpt, alumnos, data, onEdit, onBack, onPublicar}){
  const alumno = alumnos.find(a=>a.id===rpt.alumnoId);
  const stats  = (data.estadisticas||[]).filter(s=>s.alumnoId===rpt.alumnoId&&
    (!rpt.fechaDesde||s.fecha>=rpt.fechaDesde)&&(!rpt.fechaHasta||s.fecha<=rpt.fechaHasta));
  const secs = rpt.secciones||[];
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [reenviando, setRenviando] = useState(false);
  const [reenviado, setRenviado] = useState(false);

  async function handlePublicar(){
    setEnviando(true);
    await publicarInformeFirestore(rpt, alumno);
    onPublicar();
    setEnviado(true);
    setEnviando(false);
  }

  async function handleReenviar(){
    setRenviando(true);
    await publicarInformeFirestore(rpt, alumno);
    setRenviado(true);
    setRenviando(false);
    setTimeout(()=>setRenviado(false), 3000);
  }

  function descargarPDF(){
    generarPDFInforme(rpt, alumno?.nombre||"alumno");
  }

  const SecTitle=({children,color=G.fairway})=><div style={{
    background:`linear-gradient(135deg,${color},${color}dd)`,
    color:"#fff",borderRadius:"10px 10px 0 0",padding:"10px 18px",
    fontWeight:800,fontSize:15,marginTop:20}}>
    {children}
  </div>;

  const SecBody=({children})=><div style={{background:"#fff",border:"1px solid #e0eee0",
    borderTop:"none",borderRadius:"0 0 10px 10px",padding:16,marginBottom:4}}>
    {children}
  </div>;

  return <div style={{maxWidth:680,margin:"0 auto"}}>
    {/* Barra de acciones */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:G.mist,color:G.fairway,border:"none",
        borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>← Volver</button>
      <Btn color="secondary" onClick={onEdit}>✎ Editar</Btn>
      <Btn color="sky" onClick={descargarPDF}>⬇️ Descargar PDF</Btn>
      {!rpt.publicado&&!enviado&&<Btn color="primary" onClick={handlePublicar} disabled={enviando}>
        {enviando?"Enviando...":"📤 Publicar y enviar al alumno"}
      </Btn>}
      {(rpt.publicado||enviado)&&<>
        <span style={{background:G.mist,color:G.grass,borderRadius:8,
          padding:"7px 14px",fontSize:13,fontWeight:600}}>✅ Publicado y enviado</span>
        <Btn color="sky" onClick={handleReenviar} disabled={reenviando}>
          {reenviando?"Reenviando...":reenviado?"✅ Reenviado":"🔄 Reenviar"}
        </Btn>
      </>}
    </div>

    {/* ── CONTENIDO DEL INFORME (para PDF) ── */}
    <div id="informe-preview-content">
    {/* ── PORTADA ── */}
    {secs.includes("portada")&&<div style={{background:`linear-gradient(160deg,${G.fairway},#0f3518)`,
      borderRadius:14,padding:"30px 24px",marginBottom:4,textAlign:"center",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:16}}>
        <img src={LOGO_GCR} alt="GCR" style={{height:52,objectFit:"contain",filter:"brightness(0) invert(1)",opacity:.9}}/>
        <img src={LOGO_PGA} alt="PGA" style={{height:48,objectFit:"contain"}}/>
      </div>
      <div style={{fontSize:22,fontWeight:800,marginBottom:6}}>{rpt.titulo}</div>
      <div style={{fontSize:16,opacity:.85,marginBottom:4}}>
        {alumno?.nombre}
      </div>
      {alumno&&<div style={{fontSize:13,opacity:.7,marginBottom:8}}>
        {alumno.nivel&&`Grupo: ${GRUPOS_EDAD.find(g=>g.id===alumno.nivel)?.nombre||alumno.nivel} · `}
        {alumno.tipoEscuela==="adultos"?"Escuela de Adultos":"Escuela Infantil"}
      </div>}
      {rpt.fechaDesde&&<div style={{fontSize:13,opacity:.7}}>
        Período: {rpt.fechaDesde} → {rpt.fechaHasta}
      </div>}
      <div style={{fontSize:12,opacity:.6,marginTop:4}}>Informe generado: {rpt.fechaCreacion}</div>
    </div>}

    {/* ── RESUMEN ── */}
    {secs.includes("resumen")&&rpt.resumenTexto&&<>
      <SecTitle>📝 Resumen ejecutivo</SecTitle>
      <SecBody><p style={{margin:0,lineHeight:1.7,whiteSpace:"pre-wrap",fontSize:14}}>{rpt.resumenTexto}</p></SecBody>
    </>}

    {/* ── HCP ── */}
    {secs.includes("hcp")&&<>
      <SecTitle color="#2e7d3c">📈 Evolución del hándicap</SecTitle>
      <SecBody><HcpChart stats={stats}/></SecBody>
    </>}

    {/* ── ESTADÍSTICAS ── */}
    {secs.includes("estadisticas")&&<>
      <SecTitle color="#3a7abf">📊 Estadísticas del período</SecTitle>
      <SecBody>
        <StatsResumen stats={stats}/>
        {stats.length>0&&<div style={{marginTop:12,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:G.fairway,color:"#fff"}}>
                {["Fecha","Hoyos","Golpes","FW%","GIR%","Putts","Hcp"].map(h=>(
                  <th key={h} style={{padding:"6px 8px",textAlign:"center"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||"")).map((s,i)=>(
                <tr key={i} style={{background:i%2?"#f9f9f9":"#fff"}}>
                  {[s.fecha,s.hoyos,s.golpes,s.fairwaysPorcentaje?s.fairwaysPorcentaje+"%":"—",
                    s.greensRegulacion?s.greensRegulacion+"%":"—",s.putts,s.handicap||"—"].map((v,j)=>(
                    <td key={j} style={{padding:"5px 8px",textAlign:"center",borderBottom:"1px solid #eee"}}>{v||"—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </SecBody>
    </>}

    {/* ── TÉCNICO ── */}
    {secs.includes("tecnico")&&Object.keys(rpt.areasEval||{}).length>0&&<>
      <SecTitle color="#7b5ea7">🏌️ Análisis técnico</SecTitle>
      <SecBody>
        <div style={{display:"grid",gap:8}}>
          {AREAS_TECNICAS.filter(a=>rpt.areasEval?.[a]?.val).map(area=>{
            const ev=rpt.areasEval[area];
            const vi=VALORACIONES.find(v=>v.id===ev.val);
            return <div key={area} style={{display:"flex",gap:12,alignItems:"center",
              background:"#f9f9f9",borderRadius:8,padding:"8px 12px",
              borderLeft:`4px solid ${vi?.color||"#ddd"}`}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13}}>{area}</div>
                {ev.notas&&<div style={{fontSize:12,color:"#555",marginTop:2}}>{ev.notas}</div>}
              </div>
              <div style={{fontWeight:700,color:vi?.color,fontSize:13,flexShrink:0}}>{vi?.label}</div>
            </div>;
          })}
        </div>
      </SecBody>
    </>}

    {/* ── IMÁGENES ── */}
    {secs.includes("imagenes")&&(rpt.imagenesData||[]).length>0&&<>
      <SecTitle color="#c8a84b">📷 Imágenes</SecTitle>
      <SecBody>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {(rpt.imagenesData||[]).map((img,i)=>(
            <div key={i} style={{borderRadius:10,overflow:"hidden",boxShadow:"0 2px 6px rgba(0,0,0,.1)"}}>
              <img src={img.base64} alt={img.caption||""} style={{width:"100%",height:140,objectFit:"cover"}}/>
              {img.caption&&<div style={{padding:"6px 10px",fontSize:12,color:"#555",background:"#fafafa"}}>
                {img.caption}
              </div>}
            </div>
          ))}
        </div>
      </SecBody>
    </>}

    {/* ── VÍDEOS ── */}
    {secs.includes("videos")&&(rpt.videosNotas||[]).length>0&&<>
      <SecTitle color="#c0392b">🎬 Vídeos de análisis</SecTitle>
      <SecBody>
        {(rpt.videosNotas||[]).map((vid,i)=>(
          <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:"1px solid #eee"}}>
            <div style={{fontWeight:700,color:G.ink,marginBottom:4}}>
              {vid.titulo||"Vídeo "+(i+1)} {vid.fecha&&`· ${vid.fecha}`}
            </div>
            {vid.url&&<a href={vid.url} target="_blank" rel="noopener noreferrer"
              style={{fontSize:13,color:G.sky,display:"block",marginBottom:8,
                wordBreak:"break-all"}}>🔗 {vid.url}</a>}
            {vid.url&&vid.url.includes("youtube")&&<div style={{marginBottom:8,borderRadius:8,overflow:"hidden"}}>
              <iframe src={vid.url.replace("watch?v=","embed/").replace("youtu.be/","youtube.com/embed/")}
                width="100%" height="200" frameBorder="0" allowFullScreen style={{borderRadius:8,display:"block"}}/>
            </div>}
            {vid.notas&&<div style={{fontSize:13,color:"#555",lineHeight:1.6,
              background:"#f9f9f9",borderRadius:8,padding:"8px 12px",whiteSpace:"pre-wrap"}}>
              {vid.notas}
            </div>}
          </div>
        ))}
      </SecBody>
    </>}

    {/* ── EJERCICIOS ── */}
    {secs.includes("ejercicios")&&<>
      <SecTitle color="#d4651a">🏋️ Ejercicios del período</SecTitle>
      <SecBody>
        {(data.asignaciones||[]).filter(a=>a.alumnoId===rpt.alumnoId&&a.completado).length===0
          ? <div style={{color:G.soft,fontSize:13}}>Sin ejercicios completados en este período.</div>
          : <div style={{display:"grid",gap:6}}>
              {(data.asignaciones||[])
                .filter(a=>a.alumnoId===rpt.alumnoId&&a.completado)
                .map((a,i)=>{
                  const ej=(data.ejerciciosCurso||EJERCICIOS_CURSO||[]).find(e=>e.id===a.ejId)||
                            (EJERCICIOS_BIBLIOTECA||[]).find(e=>e.id===a.ejId);
                  return ej?<div key={i} style={{background:G.mist,borderRadius:8,
                    padding:"6px 12px",fontSize:13}}>
                    ✅ {ej.nombre} <span style={{color:G.soft,fontSize:11}}>— {a.fecha}</span>
                  </div>:null;
                }).filter(Boolean)}
            </div>
        }
      </SecBody>
    </>}

    {/* ── OBJETIVOS ── */}
    {secs.includes("objetivos")&&(rpt.objetivosLogrados||rpt.objetivosProximos||rpt.planTrabajo)&&<>
      <SecTitle>🎯 Objetivos y plan de trabajo</SecTitle>
      <SecBody>
        {rpt.objetivosLogrados&&<div style={{marginBottom:14}}>
          <div style={{fontWeight:700,color:G.grass,marginBottom:6}}>✅ Logros conseguidos</div>
          <p style={{margin:0,fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.objetivosLogrados}</p>
        </div>}
        {rpt.objetivosProximos&&<div style={{marginBottom:14}}>
          <div style={{fontWeight:700,color:G.sky,marginBottom:6}}>🚀 Próximos objetivos</div>
          <p style={{margin:0,fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.objetivosProximos}</p>
        </div>}
        {rpt.planTrabajo&&<div>
          <div style={{fontWeight:700,color:"#7b5ea7",marginBottom:6}}>📋 Plan de trabajo</div>
          <p style={{margin:0,fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rpt.planTrabajo}</p>
        </div>}
      </SecBody>
    </>}

    {/* ── FIRMA ── */}
    {secs.includes("firma")&&<>
      <SecTitle>✍️ Firma del profesor</SecTitle>
      <SecBody>
        <div style={{display:"flex",alignItems:"center",gap:16,padding:"8px 0"}}>
          <img src={LOGO_GCR} alt="GCR" style={{height:50,objectFit:"contain"}}/>
          <div>
            <div style={{fontWeight:700,color:G.fairway,fontSize:15}}>
              {rpt.firmaTexto?.split("\n")[0]||"José Manuel Caballero Fernández"}
            </div>
            {rpt.firmaTexto?.split("\n").slice(1).map((l,i)=>(
              <div key={i} style={{fontSize:13,color:"#555",marginTop:2}}>{l}</div>
            ))}
          </div>
        </div>
        <div style={{fontSize:12,color:G.soft,marginTop:8,borderTop:"1px solid #eee",paddingTop:8}}>
          Fecha del informe: {rpt.fechaCreacion}
        </div>
      </SecBody>
    </>}

    </div>{/* fin informe-preview-content */}
    <div style={{height:30}}/>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ZONAS DE TRABAJO
// ═══════════════════════════════════════════════════════════════════
const ZONAS_TRABAJO = [
  { id:"putting",   nombre:"Zona Putting Green",    color:"#1a5c2a", bg:"#e8f5eb", emoji:"🏌️" },
  { id:"corto",     nombre:"Zona Juego Corto",       color:"#c8a84b", bg:"#fdf6e3", emoji:"⛳" },
  { id:"techada",   nombre:"Zona Cancha Techada",    color:"#3a7abf", bg:"#e8f0fb", emoji:"🏠" },
  { id:"largo",     nombre:"Zona Juego Largo",       color:"#7b5ea7", bg:"#f0ebfa", emoji:"🎯" },
  { id:"hoyo8",     nombre:"Zona Hoyo 8 P&P",        color:"#c0392b", bg:"#fdecea", emoji:"🚩" },
  { id:"general",   nombre:"General / Instalaciones",color:"#555555", bg:"#f0f0f0", emoji:"🔧" },
];

const PRIORIDADES = [
  { id:"alta",   label:"Alta",   color:"#c0392b", bg:"#fdecea" },
  { id:"media",  label:"Media",  color:"#c8a84b", bg:"#fdf6e3" },
  { id:"baja",   label:"Baja",   color:"#2e7d3c", bg:"#e8f5eb" },
];

const ESTADOS_TAREA = [
  { id:"pendiente",    label:"Pendiente",    color:"#c8a84b" },
  { id:"en_curso",     label:"En curso",     color:"#3a7abf" },
  { id:"completada",   label:"Completada",   color:"#2e7d3c" },
];

// ═══════════════════════════════════════════════════════════════════
// MÓDULO: TAREAS PROGRAMADAS
// ═══════════════════════════════════════════════════════════════════
function ModTareas({data,setData}){
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [filtroZona,setFiltroZona]=useState("todas");
  const [filtroEstado,setFiltroEstado]=useState("todos");
  const [vistaCalendario,setVistaCalendario]=useState(false);

  const tareas=data.tareas||[];
  const trabajadores=["Mario","Manolo","Miguel","Aleyda","Yaiza","Mecánico","José Manuel"];

  function openNew(){
    setForm({titulo:"",zona:"putting",prioridad:"media",estado:"pendiente",fecha:today(),fechaFin:"",asignado:"",descripcion:"",recurrente:false});
    setModal("new");
  }
  function openEdit(t){setForm({...t});setModal(t.id);}

  function save(){
    if(!form.titulo.trim()) return;
    const updated=modal==="new"
      ?[...tareas,{...form,id:uid(),fechaCreacion:today()}]
      :tareas.map(t=>t.id===modal?{...form}:t);
    setData({...data,tareas:updated});setModal(null);
  }

  function cambiarEstado(id,nuevoEstado){
    setData({...data,tareas:tareas.map(t=>t.id===id?{...t,estado:nuevoEstado}:t)});
  }

  function eliminar(id){
    if(!confirm("¿Eliminar esta tarea?")) return;
    setData({...data,tareas:tareas.filter(t=>t.id!==id)});
  }

  const filtradas=tareas.filter(t=>{
    const mZona=filtroZona==="todas"||t.zona===filtroZona;
    const mEst=filtroEstado==="todos"||t.estado===filtroEstado;
    return mZona&&mEst;
  }).sort((a,b)=>{
    const pOrd={alta:0,media:1,baja:2};
    if(pOrd[a.prioridad]!==pOrd[b.prioridad]) return pOrd[a.prioridad]-pOrd[b.prioridad];
    return (a.fecha||"").localeCompare(b.fecha||"");
  });

  const pendientes=tareas.filter(t=>t.estado==="pendiente").length;
  const enCurso=tareas.filter(t=>t.estado==="en_curso").length;
  const completadas=tareas.filter(t=>t.estado==="completada").length;

  function zonaInfo(id){return ZONAS_TRABAJO.find(z=>z.id===id)||ZONAS_TRABAJO[5];}
  function prioInfo(id){return PRIORIDADES.find(p=>p.id===id)||PRIORIDADES[1];}
  function estadoInfo(id){return ESTADOS_TAREA.find(e=>e.id===id)||ESTADOS_TAREA[0];}

  return <div>
    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:12,marginBottom:20}}>
      {[[tareas.length,"Total",G.fairway,"📋"],[pendientes,"Pendientes","#c8a84b","⏳"],[enCurso,"En curso",G.sky,"🔄"],[completadas,"Completadas",G.grass,"✅"]].map(([v,l,c,i])=>(
        <Card key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:20,marginBottom:4}}>{i}</div>
          <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
          <div style={{fontSize:11,color:G.soft,marginTop:1}}>{l}</div>
        </Card>
      ))}
    </div>

    {/* Leyenda de zonas */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
      {ZONAS_TRABAJO.map(z=>(
        <button key={z.id} onClick={()=>setFiltroZona(filtroZona===z.id?"todas":z.id)}
          style={{background:filtroZona===z.id?z.color:z.bg,color:filtroZona===z.id?G.white:z.color,
            border:`2px solid ${z.color}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          {z.emoji} {z.nombre}
        </button>
      ))}
    </div>

    {/* Filtro estado + botón nueva */}
    <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:6}}>
        {[{id:"todos",label:"Todas"},...ESTADOS_TAREA].map(e=>(
          <button key={e.id} onClick={()=>setFiltroEstado(e.id)}
            style={{background:filtroEstado===e.id?(e.color||G.fairway):"#f0f0f0",color:filtroEstado===e.id?G.white:"#555",
              border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {e.label}
          </button>
        ))}
      </div>
      <div style={{marginLeft:"auto"}}>
        <Btn onClick={openNew}>+ Nueva tarea</Btn>
      </div>
    </div>

    {/* Lista de tareas */}
    <div style={{display:"grid",gap:10}}>
      {filtradas.length===0&&<div style={{color:G.soft,textAlign:"center",padding:30,background:G.mist,borderRadius:10}}>Sin tareas. Pulsa "+ Nueva tarea" para empezar.</div>}
      {filtradas.map(t=>{
        const zona=zonaInfo(t.zona);
        const prio=prioInfo(t.prioridad);
        const est=estadoInfo(t.estado);
        return <div key={t.id} style={{background:G.white,borderRadius:14,boxShadow:"0 2px 12px rgba(0,0,0,.07)",overflow:"hidden",borderLeft:`5px solid ${zona.color}`}}>
          {/* Cabecera de zona */}
          <div style={{background:zona.bg,padding:"6px 16px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>{zona.emoji}</span>
            <span style={{fontSize:12,fontWeight:700,color:zona.color}}>{zona.nombre}</span>
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              <span style={{background:prio.bg,color:prio.color,borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:700}}>{prio.label}</span>
              <span style={{background:est.color+"22",color:est.color,borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:700}}>{est.label}</span>
            </div>
          </div>
          {/* Contenido */}
          <div style={{padding:"12px 16px"}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,color:G.ink,fontSize:15,marginBottom:4}}>{t.titulo}</div>
                {t.descripcion&&<div style={{fontSize:13,color:"#555",marginBottom:6}}>{t.descripcion}</div>}
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:G.soft}}>
                  {t.fecha&&<span>📅 {fmtDate(t.fecha)}{t.fechaFin?` → ${fmtDate(t.fechaFin)}`:""}</span>}
                  {t.asignado&&<span>👤 {t.asignado}</span>}
                  {t.recurrente&&<span>🔄 Recurrente</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {t.estado==="pendiente"&&<Btn small color="sky" onClick={()=>cambiarEstado(t.id,"en_curso")}>▶ Iniciar</Btn>}
                {t.estado==="en_curso"&&<Btn small color="primary" onClick={()=>cambiarEstado(t.id,"completada")}>✔ Completar</Btn>}
                {t.estado==="completada"&&<Btn small color="secondary" onClick={()=>cambiarEstado(t.id,"pendiente")}>↩ Reabrir</Btn>}
                <Btn small color="secondary" onClick={()=>openEdit(t)}>✎</Btn>
                <Btn small color="danger" onClick={()=>eliminar(t.id)}>✕</Btn>
              </div>
            </div>
          </div>
        </div>;
      })}
    </div>

    {/* Modal nueva/editar tarea */}
    {modal&&<Modal title={modal==="new"?"Nueva tarea":"Editar tarea"} onClose={()=>setModal(null)} wide>
      <Field label="Título *"><Input value={form.titulo||""} onChange={v=>setForm({...form,titulo:v})} placeholder="Descripción breve de la tarea"/></Field>

      <Field label="Zona de trabajo *">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {ZONAS_TRABAJO.map(z=>(
            <button key={z.id} onClick={()=>setForm({...form,zona:z.id})}
              style={{background:form.zona===z.id?z.color:z.bg,color:form.zona===z.id?G.white:z.color,
                border:`2px solid ${z.color}`,borderRadius:10,padding:"7px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {z.emoji} {z.nombre}
            </button>
          ))}
        </div>
      </Field>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Field label="Prioridad">
          <select value={form.prioridad||"media"} onChange={e=>setForm({...form,prioridad:e.target.value})}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",fontSize:14,background:G.white,fontFamily:"inherit"}}>
            {PRIORIDADES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select value={form.estado||"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",fontSize:14,background:G.white,fontFamily:"inherit"}}>
            {ESTADOS_TAREA.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </Field>
        <Field label="Asignado a">
          <select value={form.asignado||""} onChange={e=>setForm({...form,asignado:e.target.value})}
            style={{width:"100%",border:"1.5px solid #d0e0d0",borderRadius:8,padding:"8px 10px",fontSize:14,background:G.white,fontFamily:"inherit"}}>
            <option value="">Sin asignar</option>
            {trabajadores.map(w=><option key={w} value={w}>{w}</option>)}
          </select>
        </Field>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Fecha inicio"><Input type="date" value={form.fecha||""} onChange={v=>setForm({...form,fecha:v})}/></Field>
        <Field label="Fecha fin (opcional)"><Input type="date" value={form.fechaFin||""} onChange={v=>setForm({...form,fechaFin:v})}/></Field>
      </div>

      <Field label="Descripción detallada">
        <Textarea value={form.descripcion||""} onChange={v=>setForm({...form,descripcion:v})} placeholder="Instrucciones, materiales necesarios, observaciones…" rows={3}/>
      </Field>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <input type="checkbox" id="recurrente" checked={!!form.recurrente} onChange={e=>setForm({...form,recurrente:e.target.checked})} style={{width:16,height:16}}/>
        <label htmlFor="recurrente" style={{fontSize:14,color:G.ink,cursor:"pointer"}}>Tarea recurrente (se repite periódicamente)</label>
      </div>

      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}>
        <Btn color="secondary" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn onClick={save}>Guardar tarea</Btn>
      </div>
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN SHELL
// ═══════════════════════════════════════════════════════════════════
const ADMIN_TABS=[
  {id:"calendario",label:"Calendario",icon:"🗓️"},
  {id:"alumnos",label:"Alumnos",icon:"👤"},
  {id:"pendientes",label:"Pendientes",icon:"🔔"},
  {id:"programas",label:"Programas",icon:"📚"},
  {id:"clases",label:"Clases",icon:"📅"},
  {id:"estadisticas",label:"Estadísticas",icon:"📊"},
  {id:"analisis",label:"Vídeo Análisis",icon:"🎬"},
  {id:"ejercicios",label:"Ejercicios & Tests",icon:"🏋️"},
  {id:"informes",label:"Informes",icon:"📑"},
  {id:"mensajes",label:"Mensajes",icon:"✉️"},
  {id:"tareas",label:"Tareas",icon:"📋"},
  {id:"pagos",label:"Pagos",icon:"💶"},
  {id:"ajustes",label:"Ajustes",icon:"⚙️"},
// ── POLLITOS ampliación (p051-p075) ──────────────────────────────
{id:"p051",grupo:"pollitos",trimestre:1,semana:2,categoria:"Coordinación",nombre:"El Semáforo de Golf",objetivo:"Aprender señales de inicio y parada con el palo.",descripcion:"El instructor actúa de semáforo: verde = golpear, rojo = parar. Los niños practican comenzar y detener el swing según la señal. Trabaja la concentración y el autocontrol.",duracion:"12 min",material:"Palos esponja, tarjetas de colores",variantes:["Con pito en lugar de colores","Varios semáforos simultáneos","El niño hace de semáforo"],tags:["coordinación","autocontrol","señales","lúdico"]},
{id:"p052",grupo:"pollitos",trimestre:1,semana:4,categoria:"Putting",nombre:"La Rampa Mágica",objetivo:"Entender la gravedad y la velocidad de la bola.",descripcion:"Con una tabla inclinada como rampa, los niños lanzan la bola por ella y la reciben con el putter intentando dirigirla al hoyo. Aprenden cómo la pendiente afecta la velocidad.",duracion:"15 min",material:"Tabla inclinada, putter junior, bolas foam",variantes:["Rampa más empinada","Varios hoyos al pie de la rampa","Contar los rebotes"],tags:["putt","gravedad","pendiente","lúdico"]},
{id:"p053",grupo:"pollitos",trimestre:1,semana:6,categoria:"Swing",nombre:"El Helado de Golf",objetivo:"Aprender el agarre correcto de forma lúdica.",descripcion:"El instructor pide que sujeten el palo como si fuera un helado: suave, sin aplastarlo. Luego frotan las manos como para calentar y vuelven al agarre. Sensación de presión ideal.",duracion:"10 min",material:"Palos junior",variantes:["Con grip especial de colores","Midiendo la presión con una báscula pequeña","Comparar agarre fuerte vs suave"],tags:["agarre","presión","lúdico","helado"]},
{id:"p054",grupo:"pollitos",trimestre:2,semana:8,categoria:"Juego",nombre:"El Tren del Golf",objetivo:"Aprender a jugar en secuencia y respetar el turno.",descripcion:"Los niños forman un tren. El primero golpea, va al final, el segundo golpea, etc. La bola va pasando de uno a otro hasta llegar al hoyo. Aprenden la secuencia de juego y el respeto al turno.",duracion:"20 min",material:"Palos junior, bola, hoyo marcado",variantes:["Tren más largo (5-6 niños)","Dos trenes en paralelo compitiendo","El conductor del tren cambia cada hoyo"],tags:["secuencia","turno","equipo","lúdico"]},
{id:"p055",grupo:"pollitos",trimestre:2,semana:9,categoria:"Coordinación",nombre:"El Cocinero de Golf",objetivo:"Trabajar la coordinación y seguir instrucciones.",descripcion:"El instructor es el chef y los niños son cocineros. Cada instrucción es un movimiento: 'añadir sal' = swing, 'remover' = rotación de cadera, 'probar' = mirar el objetivo. Aprenden movimientos sin darse cuenta.",duracion:"15 min",material:"Palos esponja",variantes:["Con delantales de broma","Nombres de ingredientes para movimientos","Los niños inventan la receta"],tags:["coordinación","lúdico","instrucciones","cocina"]},
{id:"p056",grupo:"pollitos",trimestre:2,semana:10,categoria:"Chip",nombre:"El Paracaidista",objetivo:"Entender la trayectoria alta y el aterrizaje suave.",descripcion:"La bola es un paracaidista que sube alto y aterriza suave. Con hierro 9, los niños intentan que la bola suba 'a las nubes' y baje despacio. Se refuerza la sensación de lanzar hacia arriba.",duracion:"15 min",material:"Hierro 9 junior, bolas foam, tee",variantes:["Con dibujo de nubes en cartón arriba","Comparar trayectoria alta vs baja","Medir dónde aterriza el paracaidista"],tags:["chip","altura","trayectoria","lúdico"]},
{id:"p057",grupo:"pollitos",trimestre:3,semana:12,categoria:"Putting",nombre:"El Puzle de Putts",objetivo:"Precisión y concentración en distancias cortas.",descripcion:"Se colocan piezas de un puzle gigante alrededor del hoyo. Cada vez que embocan, reciben una pieza. El objetivo es completar el puzle entre todos. Trabajo cooperativo.",duracion:"20 min",material:"Putter junior, bolas, puzle de suelo de piezas grandes",variantes:["Puzle más complejo","Cada niño tiene sus piezas","Con tiempo límite"],tags:["putt","cooperación","puzle","motivación"]},
{id:"p058",grupo:"pollitos",trimestre:3,semana:13,categoria:"Juego",nombre:"El Monstruo del Golf",objetivo:"Superar obstáculos con imaginación.",descripcion:"El instructor narra: 'Hay un monstruo en el hoyo 3 que solo deja pasar si golpeas con suavidad.' Los niños deben usar la velocidad adecuada para superar cada 'prueba del monstruo'.",duracion:"25 min",material:"Palos junior, bolas, conos como obstáculos",variantes:["Distintos monstruos en cada hoyo","El niño inventa el nombre del monstruo","El monstruo cambia de regla cada vez"],tags:["imaginación","control","velocidad","narración"]},
{id:"p059",grupo:"pollitos",trimestre:3,semana:14,categoria:"Coordinación",nombre:"La Estatua del Golfista",objetivo:"Mantener la postura al final del swing.",descripcion:"Al terminar el swing, el instructor dice '¡Estatua!' y todos deben quedarse inmóviles en su posición de finish. El que mejor mantiene el equilibrio gana.",duracion:"12 min",material:"Palos esponja o junior",variantes:["Estátua progresiva (3, 5, 10 segundos)","Foto de la mejor estatua","Con música — parar cuando pare la música"],tags:["follow-through","equilibrio","estatua","postura"]},
{id:"p060",grupo:"pollitos",trimestre:3,semana:16,categoria:"Swing",nombre:"El Columpio del Parque",objetivo:"Sentir el ritmo natural del swing.",descripcion:"Comparar el swing con un columpio del parque: va atrás despacio, vuelve rápido. El instructor empuja suavemente el backswing y el niño siente la aceleración natural al bajar.",duracion:"15 min",material:"Palos esponja o junior",variantes:["Canción del columpio","Con música lenta para el backswing","Contando: 1-2-3 atrás, 1 adelante"],tags:["ritmo","columpio","aceleración","swing"]},
{id:"p061",grupo:"pollitos",trimestre:3,semana:17,categoria:"Chip",nombre:"El Buzón de Pelotas",objetivo:"Dirigir la bola hacia un objetivo pequeño.",descripcion:"Se colocan cajas de cartón como 'buzones' a distintas distancias. Los niños deben meter la bola chipeando directamente en la ranura del buzón. Premia la precisión.",duracion:"15 min",material:"Hierro 9 junior, bolas foam, cajas de cartón",variantes:["Buzones de distintos tamaños","Buzones a distintas alturas","Buzón con nombre del destinatario"],tags:["chip","precisión","buzón","puntería"]},
{id:"p062",grupo:"pollitos",trimestre:4,semana:18,categoria:"Juego",nombre:"El Rally de Golf",objetivo:"Encadenar varios golpes seguidos con control.",descripcion:"Como en el tenis, los niños intentan encadenar el máximo número de golpes consecutivos sin perder la bola. El instructor cuenta en voz alta. Récord del grupo.",duracion:"20 min",material:"Palos junior, bolas foam",variantes:["Con diana fija","Cambiando de palo cada golpe","El récord se anota en la pizarra"],tags:["encadenar","control","récord","lúdico"]},
{id:"p063",grupo:"pollitos",trimestre:4,semana:19,categoria:"Putting",nombre:"El Túnel del Tiempo",objetivo:"Mejorar la velocidad y dirección a la vez.",descripcion:"Dos palos en el suelo forman un túnel. La bola debe entrar en el túnel, recorrerlo y llegar al hoyo. Se va alejando el punto de partida cada vez que lo consiguen.",duracion:"15 min",material:"Putter junior, bolas, 2 palos como guía",variantes:["Túnel más corto","Túnel con curva al final","Contrarreloj"],tags:["putt","túnel","velocidad","progresivo"]},
{id:"p064",grupo:"pollitos",trimestre:4,semana:20,categoria:"Coordinación",nombre:"El Detective de Pelotas",objetivo:"Observación, atención y reacción.",descripcion:"El instructor esconde bolas de distintos colores. Los niños deben encontrar solo las del color asignado y golpearlas al hoyo antes de que el cronómetro llegue a cero.",duracion:"15 min",material:"Palos junior, bolas de colores, conos",variantes:["Más colores mezclados","Bolas escondidas bajo conos","Dos equipos buscando colores distintos"],tags:["observación","color","reacción","lúdico"]},
{id:"p065",grupo:"pollitos",trimestre:4,semana:21,categoria:"Swing",nombre:"El Superhéroe del Golf",objetivo:"Asociar el swing a un personaje motivador.",descripcion:"Cada niño elige su superhéroe favorito y le pone poderes de golf. El instructor guía la postura y el swing con el lenguaje del superhéroe elegido. Máxima motivación.",duracion:"15 min",material:"Palos junior",variantes:["Disfraz o capa","Cada superhéroe tiene un swing especial","Foto del superhéroe del grupo"],tags:["motivación","superhéroe","postura","lúdico"]},
{id:"p066",grupo:"pollitos",trimestre:1,semana:3,categoria:"Putting",nombre:"El Camino de Flores",objetivo:"Rodar la bola siguiendo una trayectoria marcada.",descripcion:"Se pegan flores de papel en el suelo formando un camino hasta el hoyo. El niño debe rodar la bola pisando todas las flores con el putt. Coordinación y dirección.",duracion:"12 min",material:"Putter junior, bolas, flores de papel adhesivas",variantes:["Flores más pequeñas","Camino en zigzag","Con obstáculos entre flores"],tags:["putt","dirección","flores","coordinación"]},
{id:"p067",grupo:"pollitos",trimestre:2,semana:9,categoria:"Chip",nombre:"El Astronauta del Golf",objetivo:"Imaginar trayectorias altas como viajes espaciales.",descripcion:"La bola es una nave espacial que sale de la Tierra (el palo), sube hasta la Luna (la cima de la trayectoria) y aterriza en Marte (el objetivo). El instructor narra el viaje.",duracion:"15 min",material:"Hierro 9 junior, bolas foam",variantes:["Distintos planetas = distintas distancias","Con música espacial","Dibujar la trayectoria espacial"],tags:["chip","imaginación","trayectoria","espacio"]},
{id:"p068",grupo:"pollitos",trimestre:3,semana:15,categoria:"Juego",nombre:"El Cumpleaños del Golf",objetivo:"Celebrar el aprendizaje con un juego especial.",descripcion:"Se monta un 'cumpleaños de golf': hay estaciones con juegos (soplar velas golpeando bolas, globos, pastel de conos). Solo se pueden hacer los juegos si se golpea bien.",duracion:"40 min",material:"Decoración de cumpleaños, palos junior, bolas, conos",variantes:["Música de cumpleaños","Cada niño sopla sus velas (bolos)","Foto del cumpleaños"],tags:["cumpleaños","celebración","lúdico","especial"]},
{id:"p069",grupo:"pollitos",trimestre:4,semana:22,categoria:"Coordinación",nombre:"El Robot Roto",objetivo:"Diferenciar movimientos correctos de incorrectos.",descripcion:"El instructor hace swings incorrectos (demasiado rígido, muy rápido, sin giro) y los niños deben detectar qué está mal. Luego el instructor hace el correcto y los niños aplauden.",duracion:"12 min",material:"Palos esponja",variantes:["Los niños hacen el robot roto","Tarjetas con movimientos correctos e incorrectos","El niño corrige al robot"],tags:["observación","corrección","lúdico","swing"]},
{id:"p070",grupo:"pollitos",trimestre:1,semana:5,categoria:"Putting",nombre:"El Dominó de Golf",objetivo:"Encadenar putts consecutivos.",descripcion:"5 hoyos pequeños en línea. El niño debe meter la bola en el primero, luego en el segundo, y así hasta el quinto, sin saltarse ninguno. Como el dominó: uno lleva al otro.",duracion:"15 min",material:"Putter junior, bolas, 5 hoyos pequeños",variantes:["Hoyos en curva","Con time limit","En parejas alternando"],tags:["putt","secuencia","encadenar","motivación"]},
{id:"p071",grupo:"pollitos",trimestre:2,semana:11,categoria:"Swing",nombre:"El Pintor de Golf",objetivo:"Trabajar el follow-through como un movimiento de pintura.",descripcion:"El palo es un pincel y el campo es un lienzo. El niño 'pinta' con el swing: backswing es cargar el pincel, el impacto es el toque al lienzo, el follow-through es extender la pincelada.",duracion:"12 min",material:"Palos esponja o junior",variantes:["Con música artística","Distintos tipos de pincelada (corta, larga, curva)","Foto del pintor de golf"],tags:["follow-through","imaginación","pintura","swing"]},
{id:"p072",grupo:"pollitos",trimestre:3,semana:18,categoria:"Chip",nombre:"La Catapulta de Colores",objetivo:"Apuntar a dianas de distintos colores con chip.",descripcion:"Dianas de colores (aros) a diferentes distancias. El instructor dice un color y el niño debe chipear la bola directamente dentro del aro de ese color antes de que cambie.",duracion:"15 min",material:"Hierro 9 junior, bolas foam, aros de colores",variantes:["Más aros","Cambio de color rápido","Puntuación por dificultad"],tags:["chip","color","reacción","puntería"]},
{id:"p073",grupo:"pollitos",trimestre:4,semana:24,categoria:"Juego",nombre:"El Explorador de Hoyos",objetivo:"Conocer todos los hoyos del campo con aventura.",descripcion:"Con un 'mapa del tesoro' del campo, los niños deben llegar a 6 hoyos balizados. En cada hoyo hay un sobre con una prueba divertida (un putt, un chip, una pregunta). Al final, premio.",duracion:"50 min",material:"Mapa del campo dibujado, sobres con pruebas, palos junior",variantes:["Mapa más detallado","Con cámara para fotos","En parejas"],tags:["exploración","aventura","campo real","lúdico"]},
{id:"p074",grupo:"pollitos",trimestre:4,semana:25,categoria:"Coordinación",nombre:"El Congelado de Golf",objetivo:"Trabajar reacción, equilibrio y concentración.",descripcion:"Mientras suena la música, los niños caminan alrededor del campo. Cuando para, deben quedarse congelados en postura de golf (preparación). El que mueve es eliminado.",duracion:"15 min",material:"Música, palos junior",variantes:["Postura de backswing al congelarse","En parejas (el que se congela antes gana)","Con movimiento específico al congelarse"],tags:["congelado","música","postura","equilibrio"]},
{id:"p075",grupo:"pollitos",trimestre:4,semana:28,categoria:"Juego",nombre:"Mi Primer Hoyo Real",objetivo:"Jugar un hoyo real completo por primera vez.",descripcion:"Cada Pollito juega un hoyo del campo real (el más corto y sencillo). Tee, salida, fairway, green y embocar. Con la tarjeta en mano y el instructor al lado. Momento histórico.",duracion:"30 min",material:"Set junior completo, tarjeta simplificada, banderín especial",variantes:["Foto en el tee","Guardar la tarjeta como recuerdo","Firma del instructor en la tarjeta"],tags:["primer hoyo","campo real","histórico","memorable"]},

// ── EAGLES ampliación (e051-e075) ────────────────────────────────
{id:"e051",grupo:"eagles",trimestre:1,semana:3,categoria:"Putting",nombre:"El Cuadrado de 2 Metros",objetivo:"Ampliar la zona de dominio del putt corto.",descripcion:"Igual que el cuadrado de 1 metro pero con 2 metros. 4 bolas en los 4 tees. Se necesita embocar al menos 3 de las 4 para superar el nivel. Registro semanal.",duracion:"20 min",material:"Putter, 4 bolas, 4 tees como esquinas",variantes:["Cuadrado de 2,5m","Con pendiente","Sin marcar las esquinas (de memoria)"],tags:["putt","cuadrado","2 metros","progresión"]},
{id:"e052",grupo:"eagles",trimestre:1,semana:4,categoria:"Chip",nombre:"El Chip de las 3 Alturas",objetivo:"Dominar tres trayectorias distintas según la situación.",descripcion:"Alta (SW cara abierta), media (PW normal) y baja (9-hierro bola atrasada). Desde la misma posición al mismo objetivo, el alumno practica las 3 trayectorias y anota cuál para mejor.",duracion:"20 min",material:"SW, PW, 9-hierro, bolas",variantes:["Con obstáculo que obliga a elegir","Solo la trayectoria baja","Predecir dónde para cada una"],tags:["chip","trayectorias","alto","medio","bajo"]},
{id:"e053",grupo:"eagles",trimestre:1,semana:5,categoria:"Swing",nombre:"El Swing Espejo",objetivo:"Desarrollar la simetría del swing mediante observación.",descripcion:"En parejas frente a un espejo real o grabados. Uno golpea y el otro observa solo la posición de las manos. Buscan que la posición de las manos en P4 (parallel) sea consistente.",duracion:"20 min",material:"Hierro 7, bolas, espejo o móvil de apoyo",variantes:["Video de frente","Comparar 5 swings entre sí","Con checklist de posición de manos"],tags:["simetría","swing","espejo","posición de manos"]},
{id:"e054",grupo:"eagles",trimestre:1,semana:6,categoria:"Reglas",nombre:"Los Palos y sus Límites",objetivo:"Conocer las reglas sobre el uso de palos.",descripcion:"Máximo 14 palos en la bolsa. Tipos de palos permitidos (no palos ajustables en ronda sin permiso). Rotura de palo: cuándo se puede seguir usando. Situaciones prácticas con fotos.",duracion:"20 min",material:"Set completo, tarjetas de situaciones",variantes:["Quiz de reglas sobre palos","Situación: se rompe el driver en el hoyo 1","Con el reglamento en la mano"],tags:["reglas","14 palos","límites","material"]},
{id:"e055",grupo:"eagles",trimestre:2,semana:9,categoria:"Juego Largo",nombre:"El Approach de las 3 Distancias",objetivo:"Dominar 3 distancias clave de approach.",descripcion:"60m, 80m y 100m al green. 5 approach shots desde cada distancia. Se cuentan los greens alcanzados en cada rango. Objetivo: al menos 3/5 en cada distancia.",duracion:"30 min",material:"PW, 9-hierro, 8-hierro, bolas, green",variantes:["Solo la distancia más difícil","Con viento","Registrar semana a semana"],tags:["approach","3 distancias","green","porcentaje"]},
{id:"e056",grupo:"eagles",trimestre:2,semana:10,categoria:"Putting",nombre:"El Putt del Espejo de Ojos",objetivo:"Alinear los ojos correctamente sobre la línea de putt.",descripcion:"Con una regla de putting o línea en el suelo, el alumno comprueba que sus ojos están exactamente sobre la línea de putt. Muchos golpistas tienen los ojos por dentro o por fuera.",duracion:"15 min",material:"Putter, bolas, regla de putting o cinta en el suelo",variantes:["Con espejo en el suelo","Con bola con línea marcada","Video desde arriba"],tags:["putting","ojos","alineación","regla de putting"]},
{id:"e057",grupo:"eagles",trimestre:2,semana:11,categoria:"Chip",nombre:"El Chip Zurdo",objetivo:"Mejorar la sensibilidad y el chip con la mano líder.",descripcion:"15 chips solo con la mano izquierda (diestros). Fuerza al alumno a dominar el movimiento sin la mano derecha. Mejora la postura y el chip descendente.",duracion:"15 min",material:"Wedge, bolas",variantes:["Ojos cerrados","Alternar mano sola y las dos","Desde rough"],tags:["chip","zurdo","mano líder","sensibilidad"]},
{id:"e058",grupo:"eagles",trimestre:2,semana:12,categoria:"Mental",nombre:"Mi Palabra de Enfoque",objetivo:"Establecer una palabra que active la concentración antes del golpe.",descripcion:"Cada alumno elige una palabra personal (suave, ritmo, ahora, fácil...) que repite en voz baja justo antes de iniciar el swing. Se practica en 20 golpes seguidos.",duracion:"15 min",material:"Hierro 7, bolas",variantes:["Frase de dos palabras","Gesto físico como gatillo en vez de palabra","Sin palabra (silencio total)"],tags:["mental","palabra clave","concentración","gatillo"]},
{id:"e059",grupo:"eagles",trimestre:2,semana:13,categoria:"Coordinación",nombre:"La Escalera de Palos",objetivo:"Mejorar la coordinación de pies y ritmo para el golf.",descripcion:"Escalera de agilidad (agility ladder) con patrón específico de golf: entrada lateral con rotación de cadera al final, imitando el paso del swing. 5 series de 3 repeticiones.",duracion:"20 min",material:"Escalera de agilidad, palo de golf",variantes:["Solo los pies","Añadir el swing al salir","Cronometrado"],tags:["coordinación","escalera","pies","ritmo"]},
{id:"e060",grupo:"eagles",trimestre:3,semana:14,categoria:"Juego Largo",nombre:"El Fairway de los Conos",objetivo:"Mejorar la precisión del driver con objetivo visual claro.",descripcion:"Se marcan 5 pasillos de distintos anchos (25m, 20m, 15m) con conos en el campo de prácticas. El alumno elige el pasillo según su confianza ese día. Registro de éxito.",duracion:"25 min",material:"Driver, tees, bolas, conos",variantes:["Solo el pasillo de 15m","Con el 5-hierro para mayor precisión","Registrar qué pasillo consigue cada día"],tags:["driver","fairway","pasillo","precisión"]},
{id:"e061",grupo:"eagles",trimestre:3,semana:15,categoria:"Putting",nombre:"El Putt de la Emoción",objetivo:"Practicar putts con consecuencia positiva (no solo negativa).",descripcion:"Si embocan el putt de 2m, suman +1. Si fallan, se quedan igual (no restan). El objetivo es llegar a 10 puntos. Trabaja la confianza sin miedo al fallo.",duracion:"20 min",material:"Putter, bolas, registro de puntos",variantes:["Con consecuencia (+1 o -1)","Solo suma de emboques","Competición entre 2 alumnos"],tags:["putting","emoción","confianza","puntuación positiva"]},
{id:"e062",grupo:"eagles",trimestre:3,semana:16,categoria:"Chip",nombre:"El Chip del Rough Mojado",objetivo:"Aprender a ajustar el chip cuando la hierba está mojada.",descripcion:"Hierba mojada: la cara se cierra al impacto, la bola sale más baja y rueda más. Ajuste: abrir ligeramente la cara y acelerar más. 15 chips desde rough mojado con el ajuste.",duracion:"20 min",material:"Wedge, bolas, zona de rough (mojada o simulada)",variantes:["Rough muy mojado","Con viento además","Comparar seco vs mojado"],tags:["chip","rough","mojado","ajuste","condiciones"]},
{id:"e063",grupo:"eagles",trimestre:3,semana:17,categoria:"Juego",nombre:"Mi Mejor Hoyo",objetivo:"Identificar y reproducir el mejor juego personal.",descripcion:"El alumno elige su hoyo favorito del campo. Juega ese hoyo 3 veces seguidas intentando mejorar el score. El instructor analiza qué hizo bien y qué puede mejorar.",duracion:"60 min",material:"Set completo, tarjeta de score",variantes:["El hoyo más difícil","El instructor elige el hoyo","Jugar el hoyo al revés (desde el green al tee)"],tags:["campo real","favorito","análisis","repetición"]},
{id:"e064",grupo:"eagles",trimestre:3,semana:18,categoria:"Swing",nombre:"Las Manos en el Impacto",objetivo:"Conseguir manos adelantadas en el momento de impacto.",descripcion:"Con un tee extra 10cm delante de la bola, el alumno debe derribar ESE tee con las manos adelantadas. Si las manos están atrasadas, el palo golpea la bola antes que el tee extra.",duracion:"20 min",material:"Hierro 7, bolas, 2 tees",variantes:["Con hierro 9","Con PW","Video de lado para confirmar"],tags:["manos adelantadas","impacto","tee","técnica"]},
{id:"e065",grupo:"eagles",trimestre:4,semana:20,categoria:"Reglas",nombre:"El Cuaderno de Condiciones Locales",objetivo:"Leer e interpretar las condiciones locales del campo.",descripcion:"Con las condiciones locales del propio campo, el alumno lee y explica en voz alta cada punto. El instructor hace preguntas de situaciones que podrían pasar.",duracion:"25 min",material:"Condiciones locales del campo, reglamento RFEG",variantes:["Quiz sobre las condiciones locales","Situaciones inventadas","Comparar con condiciones locales de otro campo"],tags:["condiciones locales","reglamento","lectura","comprensión"]},
{id:"e066",grupo:"eagles",trimestre:4,semana:21,categoria:"Juego Largo",nombre:"El Approach de las 9 Posiciones",objetivo:"Dominar el approach desde cualquier parte del campo.",descripcion:"9 posiciones alrededor del green a distancias de 50-120m. Desde cada posición, 1 approach. Se cuentan los greens alcanzados. Objetivo mínimo: 5 de 9.",duracion:"30 min",material:"Set de hierros, bolas, green real",variantes:["Solo las 3 posiciones más difíciles","Con bandera en posición difícil","Registrar semana a semana"],tags:["approach","9 posiciones","GIR","campo real"]},
{id:"e067",grupo:"eagles",trimestre:4,semana:22,categoria:"Mental",nombre:"El Diario de Mis Mejores Golpes",objetivo:"Reforzar la memoria muscular de los buenos golpes.",descripcion:"El alumno lleva una libreta donde escribe sus 3 mejores golpes de cada sesión. Antes de la siguiente sesión, lee los mejores golpes del día anterior para activarlos.",duracion:"5 min",material:"Libreta, bolígrafo",variantes:["Con foto o vídeo del mejor golpe","Compartirlo con el instructor","Leérselo en voz alta a un compañero"],tags:["mental","mejores golpes","memoria muscular","diario"]},
{id:"e068",grupo:"eagles",trimestre:1,semana:7,categoria:"Putting",nombre:"El Putt de la Línea de Tiza",objetivo:"Practicar el recorrido exacto del putter por una línea.",descripcion:"Con tiza en el suelo o cinta adhesiva, se marca una línea de 1 metro hasta el hoyo. El alumno practica el putt intentando que la cara del putter recorra exactamente la línea.",duracion:"15 min",material:"Putter, bolas, tiza o cinta",variantes:["Línea de 1,5m","Con pendiente ligera","Video desde arriba"],tags:["putting","línea","cara","tiza"]},
{id:"e069",grupo:"eagles",trimestre:2,semana:14,categoria:"Chip",nombre:"El Chip en Terreno Seco y Duro",objetivo:"Adaptar el chip cuando el terreno está muy seco.",descripcion:"Terreno seco y duro: la bola bota más, el divot es mínimo. Ajuste: hierro más largo, bola ligeramente adelantada, golpe más limpio. 15 chips desde fairway seco.",duracion:"20 min",material:"7-hierro, 8-hierro, bolas, terreno seco",variantes:["Comparar con terreno blando","Con el campo en verano","Ajuste de palo"],tags:["chip","terreno seco","adaptación","ajuste"]},
{id:"e070",grupo:"eagles",trimestre:3,semana:19,categoria:"Coordinación",nombre:"El Equilibrio con Ojos Cerrados",objetivo:"Mejorar el equilibrio propioceptivo para el golf.",descripcion:"De pie en postura de golf con los ojos cerrados. 30 segundos sin perder el equilibrio. Luego hacer pequeños swings sin bola con los ojos cerrados. Desarrolla la propiocepción.",duracion:"15 min",material:"Palo junior",variantes:["Un pie solo","Con swing completo","Con música de fondo"],tags:["equilibrio","propiocepción","ojos cerrados","postura"]},
{id:"e071",grupo:"eagles",trimestre:3,semana:20,categoria:"Juego Largo",nombre:"El Juego de las 3 Salidas",objetivo:"Dominar 3 tipos de salida según el tipo de hoyo.",descripcion:"Hoyo estrecho: 5-hierro al fairway. Hoyo largo: driver. Hoyo con dogleg: 3-madera apuntando a la curva. Se practica cada tipo 5 veces en el campo de prácticas.",duracion:"25 min",material:"Driver, 3-madera, 5-hierro, bolas, conos",variantes:["Solo la salida más difícil","Con descripción del hoyo antes","El alumno decide qué tipo es cada hoyo"],tags:["salida","tipos de hoyo","decisión","3 palos"]},
{id:"e072",grupo:"eagles",trimestre:4,semana:23,categoria:"Swing",nombre:"El Swing Lento de 5 Minutos",objetivo:"Grabar la memoria muscular del swing correcto.",descripcion:"Durante 5 minutos, hacer el swing a velocidad muy lenta (5 segundos en cada dirección). Sin bola. Permite al cerebro registrar la posición correcta en cada punto del swing.",duracion:"10 min",material:"Hierro 7",variantes:["Con bola en tee al final","Video en cámara lenta","Con pausa en P4 y P8"],tags:["swing lento","memoria muscular","conciencia","técnica"]},
{id:"e073",grupo:"eagles",trimestre:4,semana:24,categoria:"Putting",nombre:"El Tour de los 9 Greens",objetivo:"Practicar en todos los greens del campo conociendo sus particularidades.",descripcion:"5 putts en cada uno de los 9 greens del campo. En cada green, el alumno anota: ¿qué pendiente hay? ¿Es rápido o lento? ¿Qué break predomina? Crea su libreta personal de greens.",duracion:"90 min",material:"Putter, bolas, libreta de campo",variantes:["Solo los 4 greens más difíciles","Con compañero comparando lecturas","Repetir en distintas condiciones meteorológicas"],tags:["greens","libreta","velocidad","break","campo real"]},
{id:"e074",grupo:"eagles",trimestre:4,semana:26,categoria:"Juego",nombre:"El Match Play Eagles — Final",objetivo:"Torneo de clausura de match play.",descripcion:"Final del torneo de match play del grupo Eagles. 9 hoyos. El ganador recibe la copa Eagles. Ceremonia en el hoyo 18 con el instructor y compañeros.",duracion:"120 min",material:"Set completo, copa o trofeo Eagles",variantes:["Con padres como espectadores","Hoyo 18 con galería","Vídeo del match point"],tags:["match play","final","torneo","clausura"]},
{id:"e075",grupo:"eagles",trimestre:4,semana:28,categoria:"Mental",nombre:"Mi Carta de Golf",objetivo:"Reflexión profunda sobre el año de golf.",descripcion:"El alumno escribe una carta a su yo del año siguiente: qué aprendí, qué me gustó más, mi promesa de golf para el próximo curso. El instructor la guarda y la entrega en septiembre.",duracion:"20 min",material:"Papel especial, sobre, bolígrafo",variantes:["Con foto dentro del sobre","Audio grabado","Compartir la carta con los padres"],tags:["reflexión","carta","crecimiento","objetivo","cierre"]},

// ── BIRDIES ampliación (b051-b075) ───────────────────────────────
{id:"b051",grupo:"birdies",trimestre:1,semana:1,categoria:"Putting",nombre:"Strokes Gained Putting Básico",objetivo:"Medir el rendimiento en putting con datos objetivos.",descripcion:"10 putts de 2m, 10 de 4m, 10 de 6m. Registrar los emboques. Calcular el % por distancia. Comparar con la sesión anterior. El objetivo es mejorar el % semana a semana.",duracion:"25 min",material:"Putter, bolas, hoja de registro",variantes:["Solo desde 2m","Con pendiente","Comparar con benchmark del Tour Amateur"],tags:["strokes gained","putting","porcentaje","datos"]},
{id:"b052",grupo:"birdies",trimestre:1,semana:2,categoria:"Juego Largo",nombre:"El Control de Spin",objetivo:"Entender y producir distintos tipos de spin en los hierros.",descripcion:"Con el 7-hierro: golpe normal (spin neutro), delante de la bola (backspin), detrás de la bola (topspin aproximado). Observar la diferencia de vuelo y rodado. 10 de cada tipo.",duracion:"25 min",material:"Hierro 7, bolas, zona de práctica amplia",variantes:["Con app de análisis de vuelo","Comparar en vídeo","Solo el backspin"],tags:["spin","backspin","vuelo","control","hierros"]},
{id:"b053",grupo:"birdies",trimestre:1,semana:3,categoria:"Mental",nombre:"El Pre-Torneo de la Mente",objetivo:"Preparación mental estructurada antes de una competición.",descripcion:"La noche antes: (1) revisar el game plan hoyo a hoyo, (2) visualizar 3 hoyos clave con éxito, (3) definir 1 objetivo técnico y 1 objetivo mental para mañana. Máx. 20 minutos.",duracion:"20 min",material:"Libreta de game plan, bolígrafo",variantes:["Solo la visualización","Con audio guiado","Con el instructor la primera vez"],tags:["pre-torneo","mental","visualización","game plan","preparación"]},
{id:"b054",grupo:"birdies",trimestre:1,semana:4,categoria:"Chip",nombre:"El Short Game a Ciegas",objetivo:"Desarrollar sensibilidad táctil en el short game.",descripcion:"10 chips con los ojos cerrados hacia un objetivo a 10m. El alumno debe sentir el impacto y estimar dónde aterrizó la bola antes de abrir los ojos. Mejora la sensibilidad táctil.",duracion:"20 min",material:"Wedge, bolas",variantes:["Con los ojos tapados de verdad","Desde distintas posiciones","Solo pitches a 20m"],tags:["chip","ojos cerrados","sensibilidad","táctil"]},
{id:"b055",grupo:"birdies",trimestre:2,semana:9,categoria:"Swing",nombre:"El Swing en L Avanzado",objetivo:"Dominar el swing en L con distintos palos y distancias.",descripcion:"El swing en L (¾) produce una distancia controlada y consistente. Practicarlo con PW, 9-hierro, 8-hierro y 7-hierro. Medir la distancia de cada palo con swing en L. Crear la tabla.",duracion:"25 min",material:"PW, 9, 8, 7-hierro, bolas, medidor",variantes:["Solo con PW","Comparar swing en L vs swing completo","El swing en L como golpe de approachdefault"],tags:["swing en L","distancias","¾","control","tabla"]},
{id:"b056",grupo:"birdies",trimestre:2,semana:10,categoria:"Putting",nombre:"El Putting de Presión con Testigos",objetivo:"Mantener la calidad del putt cuando hay público observando.",descripcion:"5 putts de 1,5m con 3 personas mirando y en silencio. Luego 5 más con comentarios positivos del grupo. Luego 5 más con los compañeros poniendo dificultad. Analizar diferencias.",duracion:"25 min",material:"Putter, bolas, 3-4 personas observando",variantes:["Solo silencio total","Con comentarios negativos (máxima presión)","Con árbitro evaluando la rutina"],tags:["putting","presión","testigos","público","análisis"]},
{id:"b057",grupo:"birdies",trimestre:2,semana:11,categoria:"Juego Largo",nombre:"El Iron Play de 150m",objetivo:"Dominar el approach desde 150m con consistencia.",descripcion:"20 approach shots desde 150m. Objetivo: alcanzar el green en al menos 10 de 20. Registrar la distancia de la bola al hoyo en los greens alcanzados. Media semanal.",duracion:"30 min",material:"Hierro 6-7 según el alumno, bolas, green real, medidor",variantes:["Con bandera atrás del green","Con viento de cara","Registrar la dispersión lateral"],tags:["iron play","150m","GIR","approach","consistencia"]},
{id:"b058",grupo:"birdies",trimestre:2,semana:12,categoria:"Reglas",nombre:"El Arbitraje en Campo Real",objetivo:"Aplicar las reglas como árbitro en una situación real.",descripcion:"Durante una ronda de 6 hoyos, el alumno actúa de árbitro de su grupo. El instructor prepara 3 situaciones reales (drop incorrecto, bola en agua, bola fuera de límites). El árbitro resuelve.",duracion:"90 min",material:"Reglamento RFEG, campo real",variantes:["Con libro de reglas siempre","Sin libro (de memoria)","Árbitro en pareja con otro alumno"],tags:["árbitro","reglas","campo real","situaciones","responsabilidad"]},
{id:"b059",grupo:"birdies",trimestre:3,semana:14,categoria:"Chip",nombre:"El Flop Shot Controlado",objetivo:"Aprender el flop shot para situaciones de necesidad.",descripcion:"El flop requiere: cara muy abierta (60°), stance muy abierta, bola adelantada, swing de fuera a dentro largo y lento. La bola sube casi verticalmente y para en 1-2m. 15 repeticiones.",duracion:"25 min",material:"SW o LW, bolas, obstáculo delante",variantes:["Con bunker delante","Con agua como límite","Desde rough largo"],tags:["flop","cara abierta","alta trayectoria","parada","técnica avanzada"]},
{id:"b060",grupo:"birdies",trimestre:3,semana:15,categoria:"Mental",nombre:"El Semáforo Avanzado",objetivo:"Aplicar el semáforo emocional con precisión y automatismo.",descripcion:"Durante una ronda, el alumno lleva una ficha donde registra en qué fase del semáforo estuvo tras cada golpe malo y cuánto tardó en llegar al verde. Objetivo: reducir ese tiempo cada semana.",duracion:"120 min",material:"Ficha del semáforo, bolígrafo, campo real",variantes:["Solo los últimos 6 hoyos","Con compañero que evalúa de forma externa","Comparar fichas semana a semana"],tags:["semáforo","emocional","tiempo de recuperación","autocontrol","avanzado"]},
{id:"b061",grupo:"birdies",trimestre:3,semana:17,categoria:"Putting",nombre:"La Lectura Avanzada de Green",objetivo:"Leer putts complejos con doble pendiente.",descripcion:"Putts de doble break: la bola rompe en una dirección y luego en otra. Se aprende a leer el break del hoyo primero (el más importante) y luego el inicial. 10 putts de doble break.",duracion:"25 min",material:"Putter, bolas, green con doble pendiente",variantes:["Solo el break final","Dibujando la línea en el aire","Con compañero prediciendo también"],tags:["lectura avanzada","doble break","green","predicción","pendiente"]},
{id:"b062",grupo:"birdies",trimestre:3,semana:18,categoria:"Swing",nombre:"El Driver al 85%",objetivo:"Encontrar la velocidad óptima del driver para mayor consistencia.",descripcion:"Driver al 85%: swing más corto, finish más controlado, menos tensión. 10 drives al 85% vs 10 drives al 100%. Comparar: % de fairways y distancia. El alumno decide su velocidad óptima.",duracion:"25 min",material:"Driver, tees, bolas, conos de fairway",variantes:["Con cronómetro del swing","Solo el 85%","Al 70% también para comparar"],tags:["driver","85%","velocidad óptima","fairway","consistencia"]},
{id:"b063",grupo:"birdies",trimestre:4,semana:20,categoria:"Juego",nombre:"La Ronda de Estadísticas",objetivo:"Jugar una ronda completa registrando todas las estadísticas.",descripcion:"18 hoyos (o 9) registrando: fairways, GIR, número de putts, bunkers, penalizaciones y notas de cada hoyo. Al terminar, calcular las estadísticas y comparar con el objetivo.",duracion:"240 min",material:"Set completo, hoja de estadísticas, bolígrafo",variantes:["Solo los fairways y putts","Con app de estadísticas","Comparar con la ronda anterior"],tags:["estadísticas","ronda","fairways","GIR","putts","análisis"]},
{id:"b064",grupo:"birdies",trimestre:4,semana:22,categoria:"Juego Largo",nombre:"El Juego desde el Rough Largo",objetivo:"Dominar los golpes desde rough de más de 5cm.",descripcion:"Rough largo (5-8cm): hierro más corto, swing más vertical, cara levemente abierta para evitar que cierre. 15 golpes desde rough muy largo midiendo la distancia conseguida vs rough normal.",duracion:"25 min",material:"Hierros 5-7, bolas, zona de rough largo",variantes:["Rough de 8cm+","Rough mojado y largo","Sin ver el objetivo"],tags:["rough largo","hierro","vertical","adaptar","distancia perdida"]},
{id:"b065",grupo:"birdies",trimestre:4,semana:24,categoria:"Chip",nombre:"El Up & Down de Alta Dificultad",objetivo:"Up & down desde 9 posiciones muy difíciles.",descripcion:"9 posiciones extremas: bola pegada al rough del bunker, en bajada con agua cerca, en subida con rough largo, etc. Objetivo: 3 de 9 up & downs. Máxima dificultad.",duracion:"35 min",material:"Wedges, putter, bolas, 9 posiciones extremas",variantes:["Solo los 3 más difíciles","Con tiempo límite por posición","Competición entre 2 alumnos"],tags:["up&down","alta dificultad","posiciones extremas","superación"]},
{id:"b066",grupo:"birdies",trimestre:1,semana:5,categoria:"Putting",nombre:"El Putting de las 4 Esquinas",objetivo:"Dominar la distancia y dirección desde cualquier punto.",descripcion:"4 pelotas en los 4 lados del hoyo a 3 metros. El alumno debe embocar las 4 sin moverse del punto de partida. Luego repetir desde 4 metros. Registro semanal.",duracion:"20 min",material:"Putter, 4 bolas, hoyo",variantes:["A 4 metros","Con pendiente en todos","Solo la esquina más difícil"],tags:["putting","4 esquinas","distancias","precisión"]},
{id:"b067",grupo:"birdies",trimestre:2,semana:13,categoria:"Juego Largo",nombre:"El Hierro 5 desde el Suelo",objetivo:"Dominar el hierro 5 desde el suelo sin tee.",descripcion:"El hierro 5 desde el suelo es uno de los más difíciles. Posición de bola adelantada. 20 golpes prestando atención al punto de contacto. Medir la distancia conseguida.",duracion:"25 min",material:"Hierro 5, bolas",variantes:["Con tee bajo primero","Comparar con híbrido","Solo la dirección (no la distancia)"],tags:["hierro 5","suelo","difícil","posición de bola"]},
{id:"b068",grupo:"birdies",trimestre:3,semana:16,categoria:"Swing",nombre:"El Análisis de Vídeo Birdies",objetivo:"Analizar el propio swing trimestralmente con vídeo.",descripcion:"Grabación del swing de frente y lateral. Comparación con el trimestre anterior. El alumno identifica 2 mejoras concretas y 1 punto pendiente. El instructor valida.",duracion:"30 min",material:"Hierro 7, bolas, móvil/tablet, vídeo anterior",variantes:["Comparar también con el inicio del curso","Con app de análisis","El alumno anota su propio plan de mejora"],tags:["vídeo","análisis","trimestral","comparativa","evolución"]},
{id:"b069",grupo:"birdies",trimestre:4,semana:25,categoria:"Mental",nombre:"Mi Mejor Temporada",objetivo:"Reflexión positiva sobre el progreso del año completo.",descripcion:"El alumno hace una lista de: los 5 mejores momentos de la temporada, 3 habilidades nuevas adquiridas, 2 situaciones en las que superó sus miedos. Se comparte con el grupo.",duracion:"20 min",material:"Hoja de reflexión, bolígrafo",variantes:["En formato presentación","Solo escrita para el instructor","Con foto de cada momento"],tags:["reflexión","temporada","logros","motivación","cierre"]},
{id:"b070",grupo:"birdies",trimestre:1,semana:6,categoria:"Chip",nombre:"El Pitch de 30m Controlado",objetivo:"Dominar el pitch de 30m con parada rápida.",descripcion:"Pitch de 30m al green: SW con swing de ¾, bola ligeramente adelantada, manos neutras. La bola debe parar en 2-3m. 15 repeticiones desde fairway y 5 desde rough.",duracion:"20 min",material:"SW, bolas, green a 30m",variantes:["Desde rough","Con bandera muy cerca del borde","Con viento en contra"],tags:["pitch","30m","parada","¾","control"]},
{id:"b071",grupo:"birdies",trimestre:2,semana:10,categoria:"Coordinación",nombre:"El Calentamiento del Golfista",objetivo:"Establecer una rutina de calentamiento físico pre-sesión.",descripcion:"10 minutos de calentamiento específico de golf: rotación de cadera 2×15, hip hinge 2×10, shoulder rotation 2×15, wrist circles 2×20, swing lento sin bola 10 repeticiones.",duracion:"10 min",material:"Palo de golf, espacio libre",variantes:["Solo 5 minutos","Pre-ronda acortado","Con banda elástica"],tags:["calentamiento","rutina","pre-sesión","movilidad","físico"]},
{id:"b072",grupo:"birdies",trimestre:3,semana:19,categoria:"Juego Largo",nombre:"El Approach con Viento",objetivo:"Ajustar el approach según la dirección y fuerza del viento.",descripcion:"Viento de cara: más palo, swing suave, bola más baja. Viento a favor: menos palo. Viento cruzado: apuntar compensando o curvar contra el viento. 15 approach shots con cada tipo.",duracion:"25 min",material:"Set de hierros, bolas, campo con viento",variantes:["Solo viento de cara","Comparar todos los tipos en el mismo día","Con app de medición del viento"],tags:["approach","viento","ajuste","compensación","condiciones"]},
{id:"b073",grupo:"birdies",trimestre:3,semana:21,categoria:"Reglas",nombre:"Situaciones de Torneo Real",objetivo:"Resolver situaciones reales de torneo que se puedan dar.",descripcion:"El instructor presenta 5 situaciones reales ocurridas en torneos del club. Los alumnos resuelven en grupo con el reglamento. El instructor confirma la solución correcta.",duracion:"30 min",material:"Reglamento RFEG, tarjetas con situaciones reales",variantes:["Solo las situaciones más comunes","Con árbitro invitado","Simulando en campo real"],tags:["reglas","torneo real","situaciones","grupo","árbitro"]},
{id:"b074",grupo:"birdies",trimestre:4,semana:27,categoria:"Juego",nombre:"18 Hoyos con Game Plan",objetivo:"Jugar 18 hoyos aplicando un game plan completo.",descripcion:"El alumno prepara el día antes un game plan hoyo a hoyo (salida, approach, green, zonas de peligro). Lo ejecuta durante la ronda y al final analiza cuánto siguió el plan.",duracion:"240 min",material:"Set completo, game plan escrito",variantes:["Solo 9 hoyos","El instructor revisa el game plan antes","Calcular % de adherencia al plan"],tags:["game plan","18 hoyos","táctica","planificación","análisis"]},
{id:"b075",grupo:"birdies",trimestre:4,semana:28,categoria:"Juego Largo",nombre:"El Test de Velocidad de Swing Final",objetivo:"Medir la velocidad de swing conseguida a lo largo del curso.",descripcion:"Test final de velocidad de swing con hierro 7 y driver. Comparar con el test de inicio del curso. Calcular el incremento de velocidad conseguido. Objetivo mínimo: +3km/h con hierro 7.",duracion:"20 min",material:"Hierro 7, driver, radar de velocidad si disponible",variantes:["Sin radar (estimación)","Comparar inicio vs final del curso","Premio al mayor incremento"],tags:["velocidad","test final","comparativa","progresión","hierro 7"]},

// ── PARS ampliación (pa051-pa075) ───────────────────────────────
{id:"pa051",grupo:"pars",trimestre:1,semana:1,categoria:"Swing",nombre:"El Análisis Biomecánico de Inicio",objetivo:"Identificar las limitaciones físicas que afectan al swing.",descripcion:"Screening de movilidad: test de cadera, tobillo y columna torácica. Identificar qué limitación física causa el mayor problema técnico. Crear un plan de movilidad específico.",duracion:"30 min",material:"Hierro 7, esterilla, espejo o cámara",variantes:["Con fisioterapeuta deportivo","Solo el test de cadera","Repetir el screening cada trimestre"],tags:["biomecánica","screening","movilidad","limitación","plan físico"]},
{id:"pa052",grupo:"pars",trimestre:1,semana:2,categoria:"Putting",nombre:"El Putting Gate Avanzado",objetivo:"Perfeccionar la cara del putter con margen mínimo.",descripcion:"Dos tees a 1cm a cada lado de la bola (en lugar de 2cm). El putter debe pasar sin tocar ninguno. 30 putts de 1,5m con el gate. Desarrolla una cara perfectamente cuadrada.",duracion:"20 min",material:"Putter, bolas, tees",variantes:["Gate de 0,8cm (experto)","Desde 2m con gate","Con putting mirror también"],tags:["putting gate","1cm","cara cuadrada","precisión extrema"]},
{id:"pa053",grupo:"pars",trimestre:1,semana:3,categoria:"Juego Largo",nombre:"El Smash Factor con Marcadores",objetivo:"Mejorar el punto de impacto para maximizar la eficiencia.",descripcion:"Marcadores de impacto (Impact Tape o dry-erase) en la cara del driver y del 7-hierro. Analizar el patrón de impactos. Objetivo: concentrar los impactos en el centro en el 70% de los golpes.",duracion:"25 min",material:"Driver, 7-hierro, impact tape o spray, bolas",variantes:["Solo con el driver","Con hierro 7 para approach","Comparar antes/después de 4 semanas"],tags:["smash factor","impacto","centro","impact tape","eficiencia"]},
{id:"pa054",grupo:"pars",trimestre:1,semana:4,categoria:"Mental",nombre:"El Perfil Competitivo Personal",objetivo:"Conocer el propio perfil psicológico como competidor.",descripcion:"Cuestionario de 20 preguntas sobre ansiedad competitiva, concentración, motivación intrínseca/extrínseca y gestión del error. Identificar las 2 fortalezas y las 2 debilidades más importantes.",duracion:"30 min",material:"Cuestionario impreso, bolígrafo",variantes:["Con psicólogo deportivo","Solo las preguntas de ansiedad","Repetir al final del curso para comparar"],tags:["perfil competitivo","psicología","ansiedad","fortalezas","debilidades"]},
{id:"pa055",grupo:"pars",trimestre:1,semana:5,categoria:"Chip",nombre:"El Short Game Test Mensual",objetivo:"Medir objetivamente el corto game cada mes.",descripcion:"18 situaciones fijas: 6 chips desde posiciones específicas, 6 pitches desde 20-40m y 6 putts (2m, 3m, 4m). Distancia media al hoyo. Comparar mes a mes. Registro anual.",duracion:"35 min",material:"Wedges, putter, bolas, 18 posiciones marcadas permanentemente",variantes:["Solo las 6 chips","Solo los putts","Comparar con compañeros del grupo"],tags:["short game test","mensual","medición","objetiva","progresión"]},
{id:"pa056",grupo:"pars",trimestre:2,semana:9,categoria:"Swing",nombre:"El Plano de Swing con Varillas",objetivo:"Corregir el plano de swing con ayuda de varillas visuales.",descripcion:"Dos varillas en el suelo: una para los pies, otra formando el plano de swing ideal. El alumno practica el swing asegurando que el palo sigue ese plano. 30 repeticiones con bola.",duracion:"25 min",material:"Hierro 7, 2 varillas de alineación, bolas",variantes:["Con la varilla sujetada por el instructor","Video de lado para confirmar","Sin varillas al final"],tags:["plano de swing","varillas","corrección","visual","técnica"]},
{id:"pa057",grupo:"pars",trimestre:2,semana:10,categoria:"Putting",nombre:"La Zona de No 3-Putt",objetivo:"Eliminar los 3-putts desde cualquier distancia.",descripcion:"Desde 5m, 7m y 10m: el objetivo es siempre dejar la bola dentro de 60cm del hoyo. 15 putts desde cada distancia. Si consiguen el 80% dentro de 60cm, no harán 3-putts.",duracion:"30 min",material:"Putter, bolas, círculo de 60cm marcado",variantes:["Desde 12m","Con pendiente fuerte","Registrar % semanal"],tags:["3-putt","lag putting","zona","60cm","distancia"]},
{id:"pa058",grupo:"pars",trimestre:2,semana:11,categoria:"Juego Largo",nombre:"El Driving con Medición de Dispersión",objetivo:"Cuantificar y mejorar la dispersión lateral del driver.",descripcion:"10 drives midiendo la distancia lateral de cada bola respecto a la línea central del fairway. Calcular la dispersión media. Objetivo: menos de 10m de dispersión media en 4 semanas.",duracion:"25 min",material:"Driver, tees, bolas, cinta métrica o app",variantes:["Con hierro 5 también","Comparar con driver al 85%","Registrar semanalmente"],tags:["driver","dispersión","lateral","medición","mejora"]},
{id:"pa059",grupo:"pars",trimestre:2,semana:12,categoria:"Chip",nombre:"El Bunker de las 5 Distancias",objetivo:"Dominar salidas de bunker a distintas distancias.",descripcion:"5 salidas de bunker a 5m, 10m, 15m, 20m y 25m. Para cada distancia, el alumno ajusta el swing. 3 intentos por distancia. Se cuentan las bolas dentro de un círculo de 2m del objetivo.",duracion:"30 min",material:"SW, bolas, bunker, 5 conos como objetivos",variantes:["Solo las distancias largas","Con bola enterrada en cada distancia","Con viento"],tags:["bunker","5 distancias","control","ajuste","precisión"]},
{id:"pa060",grupo:"pars",trimestre:3,semana:14,categoria:"Mental",nombre:"El Análisis Post-Torneo Completo",objetivo:"Analizar un torneo con metodología de alto rendimiento.",descripcion:"Tras un torneo: (1) Estadísticas por categoría, (2) Las 3 mejores decisiones tácticas, (3) Los 3 peores errores mentales, (4) Las 3 mejores ejecuciones técnicas, (5) Plan de mejora con 2 objetivos.",duracion:"45 min",material:"Tarjeta del torneo, hoja de análisis estructurada",variantes:["Solo con las estadísticas","Con el instructor","Comparar análisis con el anterior torneo"],tags:["post-torneo","análisis completo","estadísticas","táctica","mental","plan"]},
{id:"pa061",grupo:"pars",trimestre:3,semana:15,categoria:"Putting",nombre:"El AimPoint Express Básico",objetivo:"Introducir el sistema AimPoint de lectura de green.",descripcion:"Sentir la pendiente con los pies. 0 dedos = plano (putt recto). 1 dedo = break pequeño. 2 dedos = break medio. 3 dedos = break grande. Practicar en 10 putts con pendiente real.",duracion:"30 min",material:"Putter, bolas, green con pendiente variada",variantes:["Solo 1 y 2 dedos","Con GPS de inclinación para comparar","Comparar AimPoint vs lectura visual"],tags:["AimPoint","lectura","pendiente","pies","sistema"]},
{id:"pa062",grupo:"pars",trimestre:3,semana:16,categoria:"Swing",nombre:"El Trabajo de Velocidad de Swing",objetivo:"Incrementar la velocidad de swing de forma progresiva y segura.",descripcion:"Protocolo de 4 semanas: semana 1 — 20 swings rápidos sin bola. Semana 2 — con bola foam. Semana 3 — con bola real en zona amplia. Semana 4 — con objetivo. Medir velocidad cada semana.",duracion:"20 min por sesión, 4 semanas",material:"Palo ligero o speed sticks, bolas, radar si disponible",variantes:["Con speed sticks SuperSpeed","Solo con el driver","Solo el downswing rápido"],tags:["velocidad","protocolo","4 semanas","incremento","speed sticks"]},
{id:"pa063",grupo:"pars",trimestre:4,semana:20,categoria:"Juego Largo",nombre:"El Iron Play de Precisión",objetivo:"Dominar los approach shots con dispersión mínima.",descripcion:"Desde 130m: 15 approach shots al green. Medir la distancia de cada bola al hoyo. Calcular la media y la dispersión. Objetivo: media menor de 8m del hoyo y 70% en green.",duracion:"30 min",material:"8-hierro, bolas, green real, medidor",variantes:["Desde 150m","Con bandera en borde","Desde posición de rough corto"],tags:["iron play","precision","130m","dispersión","GIR"]},
{id:"pa064",grupo:"pars",trimestre:4,semana:22,categoria:"Chip",nombre:"El Wedge System en Competición",objetivo:"Aplicar el wedge system personal en situaciones de torneo.",descripcion:"Simulación de torneo: 9 approach shots a distancias específicas del wedge system personal (50m, 60m, 70m, 80m). El alumno debe elegir el palo y el swing correcto según su tabla personal.",duracion:"30 min",material:"Wedges, bolas, conos a distintas distancias",variantes:["Solo las distancias intermedias","Con viento","Con la tarjeta personal del wedge system en mano"],tags:["wedge system","torneo","tabla personal","distancias","decisión"]},
{id:"pa065",grupo:"pars",trimestre:4,semana:24,categoria:"Mental",nombre:"La Visualización de Tour",objetivo:"Visualización del nivel de tour para activar el máximo rendimiento.",descripcion:"30 min de visualización guiada: (1) un hoyo perfecto en la salida de un torneo, (2) un putt de 2m que necesitas para ganar, (3) una recuperación perfecta tras un golpe malo.",duracion:"30 min",material:"Espacio tranquilo, audio guiado si disponible",variantes:["Solo la situación 1","Con psicólogo deportivo","Grabando el audio tú mismo"],tags:["visualización","tour","presión","recuperación","guiada"]},
{id:"pa066",grupo:"pars",trimestre:1,semana:6,categoria:"Putting",nombre:"El Putt con Metrónomo Avanzado",objetivo:"Perfeccionar el tempo del putt con metrónomo.",descripcion:"Metrónomo a 72 BPM: backswing en el primer tic, impacto en el segundo, follow-through completo en el tercero. Ritmo 1-2-3 del putt. 30 putts de 2m midiendo la constancia del tempo.",duracion:"20 min",material:"Putter, bolas, app metrónomo, hoyo",variantes:["A 60 BPM (más lento)","A 80 BPM (más rápido)","Con ojos cerrados"],tags:["putting","metrónomo","tempo","72 BPM","ritmo"]},
{id:"pa067",grupo:"pars",trimestre:2,semana:13,categoria:"Reglas",nombre:"El Comité de Competición",objetivo:"Entender el rol del comité y las decisiones de torneo.",descripcion:"El alumno actúa como miembro del comité en un torneo simulado. Debe resolver 3 reclamaciones de los jugadores usando el reglamento y las notas al reglamento.",duracion:"45 min",material:"Reglamento RFEG, notas al reglamento, casos simulados",variantes:["Con árbitro oficial invitado","Solo las reclamaciones más comunes","Examen simulado de árbitro nivel 1"],tags:["comité","competición","reclamación","árbitro","reglamento avanzado"]},
{id:"pa068",grupo:"pars",trimestre:3,semana:18,categoria:"Juego",nombre:"La Ronda de Estadísticas Completa",objetivo:"Registrar y analizar todas las estadísticas en 18 hoyos.",descripcion:"18 hoyos registrando: fairways, GIR, putts, bunkers, penalizaciones, up&downs, Stableford y notas de cada hoyo. Al terminar: análisis completo con el instructor. Plan de mejora.",duracion:"240 min + análisis 30 min",material:"Set completo, hoja de estadísticas completa",variantes:["Solo 9 hoyos","Con app de estadísticas","Comparar con la ronda anterior del mes"],tags:["estadísticas","18 hoyos","análisis","plan de mejora","registro completo"]},
{id:"pa069",grupo:"pars",trimestre:3,semana:20,categoria:"Swing",nombre:"El Trabajo de Fade Avanzado",objetivo:"Producir un fade controlado y repetible en situaciones difíciles.",descripcion:"Fade avanzado: el cuerpo apunta 5° a la izquierda, la cara apunta exactamente al objetivo, el path es levemente de fuera a dentro. 20 repeticiones con hierro 7 y 10 con driver.",duracion:"25 min",material:"Hierro 7, driver, bolas, conos de alineación",variantes:["Solo con hierro 7","Situaciones de dogleg que requieren fade","Comparar fade suave vs fade pronunciado"],tags:["fade","avanzado","alineación","path","repetible"]},
{id:"pa070",grupo:"pars",trimestre:4,semana:26,categoria:"Juego Largo",nombre:"El Driver de Campeonato",objetivo:"El mejor drive bajo presión máxima.",descripcion:"Simulación del primer tee de un campeonato importante. Rutina completa, observadores, cronómetro de 40 segundos para cada golpe. 10 drives. El instructor evalúa la calidad de la rutina.",duracion:"30 min",material:"Driver, tees, bolas, cronómetro, observadores",variantes:["Solo 3 drives pero máxima calidad","Con árbitro externo","Con cámara grabando"],tags:["driver","campeonato","presión","rutina","primer tee"]},
{id:"pa071",grupo:"pars",trimestre:2,semana:14,categoria:"Chip",nombre:"El Chip Escalonado de 5 Distancias",objetivo:"Controlar 5 distancias distintas con el mismo palo.",descripcion:"Con solo el SW: chip a 5m, 8m, 12m, 16m y 20m. Solo cambia el tamaño del swing. 3 intentos por distancia. Medir dónde aterrizan. Crear la tabla de swing-distancia personal.",duracion:"25 min",material:"SW, bolas, conos como objetivos, medidor",variantes:["Con PW también","Solo 3 distancias","Publicar la tabla en el grupo"],tags:["chip","5 distancias","control","mismo palo","tabla"]},
{id:"pa072",grupo:"pars",trimestre:1,semana:7,categoria:"Coordinación",nombre:"La Movilidad del Golfista de Alto Nivel",objetivo:"Programa completo de movilidad específica para el golf de alto nivel.",descripcion:"Sesión de 30 min: movilidad de tobillo (2×10), hip 90/90 (2×30seg), rotación torácica con palo (3×15), shoulder CARs (2×8), hip hinge con palo en la espalda (3×10).",duracion:"30 min",material:"Esterilla, palo de golf, espacio libre",variantes:["Solo 15 minutos","Pre-ronda de 10 min","Con fisioterapeuta"],tags:["movilidad","alto nivel","tobillo","cadera","torácica","programa"]},
{id:"pa073",grupo:"pars",trimestre:4,semana:27,categoria:"Juego",nombre:"El Torneo de Alta Presión",objetivo:"Competir bajo la máxima presión posible antes del torneo de clausura.",descripcion:"Mini-torneo de 9 hoyos con consecuencias reales: el ganador elige el formato del torneo de clausura. Árbitro externo, scoring en tiempo real, galería de padres.",duracion:"120 min",material:"Set completo, árbitro, app de scoring",variantes:["Con apuesta deportiva entre alumnos","Sin galería para comparar","Con transmisión de scores al grupo de WhatsApp"],tags:["alta presión","torneo","consecuencias reales","árbitro","galería"]},
{id:"pa074",grupo:"pars",trimestre:3,semana:21,categoria:"Putting",nombre:"El Putting de las 5 Velocidades",objetivo:"Adaptar el stroke del putter a cualquier velocidad de green.",descripcion:"Green lento (stimp 7): backswing más largo. Green normal (stimp 9): normal. Green rápido (stimp 11): backswing más corto. Practicar las 3 velocidades estimadas con el mismo putting green.",duracion:"25 min",material:"Putter, bolas, tabla inclinada o green de distintas velocidades",variantes:["Solo estimp alto","Medir con Stimpmeter real","Comparar mañana vs tarde (cambia la velocidad)"],tags:["putting","velocidad de green","stimp","adaptación","backswing"]},
{id:"pa075",grupo:"pars",trimestre:4,semana:28,categoria:"Mental",nombre:"El Plan de Alto Rendimiento",objetivo:"Planificar la temporada siguiente con ambición y metodología.",descripcion:"El alumno crea su plan de temporada: hándicap objetivo, torneos a disputar, aspectos técnicos prioritarios (2 máx.), trabajo físico (1 objetivo), trabajo mental (1 objetivo). Plan sellado.",duracion:"35 min",material:"Plantilla de plan de temporada, sobre sellado",variantes:["Con padres","Presentación al grupo","Audio del plan grabado por el alumno"],tags:["plan","temporada","hándicap","ambición","metodología","alto rendimiento"]},

// ── BIRDIE+ ampliación (bp051-bp075) ────────────────────────────
{id:"bp051",grupo:"birdieplus",trimestre:1,semana:1,categoria:"Swing",nombre:"El Baseline de Inicio de Temporada",objetivo:"Establecer todos los parámetros de rendimiento al inicio del año.",descripcion:"Test completo de inicio: velocidad de swing (driver y 7-hierro), distancia media con driver, 5-hierro y PW, % de fairways (10 drives), % GIR (10 approach de 150m), short game test. Base de datos personal.",duracion:"90 min",material:"Set completo, radar si disponible, medidor",variantes:["Sin radar solo estimación","Publicar el baseline del grupo","Comparar con el baseline del año anterior"],tags:["baseline","inicio de temporada","datos","velocidad","distancia","GIR"]},
{id:"bp052",grupo:"birdieplus",trimestre:1,semana:2,categoria:"Putting",nombre:"El Putting Estadístico Avanzado",objetivo:"Analizar el putting con métricas de tour.",descripcion:"Medir el SG (Strokes Gained) putting comparando con un campo de referencia. Datos: % de emboques a 1m, 2m, 3m, 4m, 5m, 7m, 10m, putts por ronda (18 hoyos). Benchmark vs Pars Tour Español.",duracion:"45 min",material:"Putter, bolas, app de estadísticas, hoja de datos",variantes:["Solo SG básico","Con app de Arccos o similar","Comparar con la semana anterior"],tags:["SG","strokes gained","estadísticas avanzadas","benchmark","tour"]},
{id:"bp053",grupo:"birdieplus",trimestre:1,semana:3,categoria:"Juego Largo",nombre:"El Protocolo de Velocidad Máxima",objetivo:"Maximizar la velocidad de swing con un protocolo científico.",descripcion:"Protocolo de 8 semanas: 3 sesiones/semana de 20 min. Calentamiento de velocidad (5 swings máximos sin bola), series de speed sticks (3×5), vuelta al palo normal. Medir velocidad al inicio, semana 4 y semana 8.",duracion:"20 min x 3/semana durante 8 semanas",material:"Speed sticks, driver, radar de velocidad",variantes:["Solo driver","Con hierro 7","Protocolo SuperSpeed oficial"],tags:["velocidad máxima","protocolo","8 semanas","speed sticks","incremento"]},
{id:"bp054",grupo:"birdieplus",trimestre:1,semana:4,categoria:"Mental",nombre:"El Mindfulness en Competición",objetivo:"Aplicar técnicas de mindfulness específicamente durante la competición.",descripcion:"Técnicas de mindfulness entre golpe y golpe: body scan de 30 segundos, respiración 4-4-4 al caminar, anchoring en las sensaciones físicas. Practicar en una ronda de 9 hoyos sin marcar el score.",duracion:"120 min en campo",material:"Ficha de mindfulness, set completo",variantes:["Solo en los últimos 6 hoyos","Con psicólogo deportivo","Comparar score con mindfulness vs score sin mindfulness"],tags:["mindfulness","competición","body scan","anchoring","respiración"]},
{id:"bp055",grupo:"birdieplus",trimestre:1,semana:5,categoria:"Chip",nombre:"El Short Game de Alta Presión Avanzado",objetivo:"Ejecutar el short game bajo la máxima presión psicológica posible.",descripcion:"Circuito de 12 situaciones de short game con consecuencias reales por fallo: chip de rough a 10m, flop sobre obstáculo, bunker a 20m, putt de 2m de presión, etc. Si fallas, vuelta a empezar.",duracion:"40 min",material:"Wedges, putter, bolas, 12 posiciones",variantes:["Sin consecuencias para comparar","Con cronómetro de 30 seg por situación","Con galería de compañeros"],tags:["short game","alta presión","consecuencias","circuito","12 posiciones"]},
{id:"bp056",grupo:"birdieplus",trimestre:2,semana:9,categoria:"Swing",nombre:"El Trabajo de Draw y Fade Bajo Presión",objetivo:"Producir draws y fades bajo presión de torneo.",descripcion:"Simulación: 'el hoyo 18 tiene OB a la derecha — necesitas un draw garantizado'. 10 draws y 10 fades en situación de presión simulada. El instructor y 2 compañeros observan y puntúan.",duracion:"30 min",material:"Driver, hierro 7, bolas, cones de alineación",variantes:["Solo draw o solo fade","Con árbitro externo","Con cuenta atrás de tiempo"],tags:["draw","fade","presión","torneo","simulación","OB"]},
{id:"bp057",grupo:"birdieplus",trimestre:2,semana:10,categoria:"Putting",nombre:"El Lag Putting de Campeonato",objetivo:"Dominar el lag putting para eliminar los 3-putts en torneo.",descripcion:"Desde 8m, 10m y 12m: el objetivo es dejar todas las bolas dentro de 40cm del hoyo (no embocar). 15 putts desde cada distancia. Si el 80% queda dentro de 40cm, los 3-putts desaparecen.",duracion:"35 min",material:"Putter, bolas, círculo de 40cm marcado",variantes:["Círculo de 60cm más fácil","Con pendiente fuerte","Registrar % semanal en 3 distancias"],tags:["lag putting","campeonato","3-putt","distancia","zona"]},
{id:"bp058",grupo:"birdieplus",trimestre:2,semana:11,categoria:"Juego Largo",nombre:"El Approach con Trackman y Datos",objetivo:"Optimizar el approach con datos objetivos del vuelo.",descripcion:"Si hay Trackman: analizar carry, total, spin rate, launch angle y offline de cada approach. Identificar la desviación sistemática (¿siempre corto? ¿siempre derecha?). Plan de corrección.",duracion:"30 min",material:"Hierros, bolas, Trackman o similar",variantes:["Con FlightScope o app alternativa","Sin tecnología — solo medición física","Comparar 5-hierro vs 5-madera"],tags:["Trackman","approach","carry","spin","offline","datos"]},
{id:"bp059",grupo:"birdieplus",trimestre:2,semana:12,categoria:"Chip",nombre:"El Wedge System en Presión Máxima",objetivo:"Aplicar el wedge system personal bajo presión extrema.",descripcion:"El instructor da la distancia en el último segundo: '73 metros, hoyo 18, necesitas par'. El alumno debe seleccionar instantáneamente el palo y el swing correcto según su tabla.",duracion:"30 min",material:"4 wedges, bolas, conos a distintas distancias",variantes:["Con cronómetro de 10 seg para la decisión","Con árbitro evaluando la decisión","Con viento añadido"],tags:["wedge system","presión máxima","decisión rápida","instantáneo","torneo"]},
{id:"bp060",grupo:"birdieplus",trimestre:3,semana:14,categoria:"Mental",nombre:"El Protocolo de Recuperación de Nivel Tour",objetivo:"Recuperarse en menos de 30 segundos de cualquier mal golpe.",descripcion:"Protocolo de 3 pasos: (1) Exhalar lentamente (5 seg), (2) Frase de reset personal en voz baja, (3) Mirar al horizonte y sonreír (aunque no tengas ganas). Practicar en campo durante 9 hoyos.",duracion:"120 min en campo",material:"Ficha de registro, set completo",variantes:["Solo los 3 primeros hoyos","Con compañero que evalúa el tiempo","Comparar tiempo de recuperación antes/después del protocolo"],tags:["recuperación","30 segundos","tour","protocolo","reset","resiliencia"]},
{id:"bp061",grupo:"birdieplus",trimestre:3,semana:15,categoria:"Swing",nombre:"La Sesión de Corrección Técnica 200 Repeticiones",objetivo:"Fijar un cambio técnico complejo mediante repetición masiva.",descripcion:"Los cambios técnicos de alto nivel requieren 2000-5000 repeticiones. Sesión de 200 repeticiones del cambio técnico prioritario del alumno. Sin bola las primeras 50. Con bola foam las siguientes 50. Con bola real las últimas 100.",duracion:"60 min",material:"El palo específico del cambio, bolas foam, bolas reales",variantes:["Solo 100 repeticiones","Video cada 50 para confirmar","Con espejo delante"],tags:["corrección técnica","200 repeticiones","cambio","largo plazo","video"]},
{id:"bp062",grupo:"birdieplus",trimestre:3,semana:16,categoria:"Putting",nombre:"El Green Reading con Sistema Avanzado",objetivo:"Leer greens complejos con un sistema profesional.",descripcion:"AimPoint Express avanzado: doble break con los pies, leer la transición entre pendientes, ajustar por velocidad del green. 15 putts de doble break con el sistema aplicado.",duracion:"35 min",material:"Putter, bolas, green con doble break",variantes:["Solo el break final","Con GPS de inclinación para validar","Comparar AimPoint vs método visual"],tags:["AimPoint avanzado","doble break","pies","velocidad","transición"]},
{id:"bp063",grupo:"birdieplus",trimestre:3,semana:17,categoria:"Juego Largo",nombre:"El Iron Play en Condiciones de Torneo",objetivo:"Reproducir el iron play de torneo bajo presión real.",descripcion:"20 approach shots desde 140m en condiciones de torneo simuladas: árbitro presente, 40 segundos por golpe, scoring en tiempo real. El % de GIR se registra y compara con el rendimiento en entrenamiento.",duracion:"40 min",material:"Hierros, bolas, árbitro, cronómetro, green real",variantes:["Solo 10 approach shots","Con viento real","Con el grupo viendo"],tags:["iron play","torneo","presión","GIR","condiciones reales","árbitro"]},
{id:"bp064",grupo:"birdieplus",trimestre:4,semana:20,categoria:"Chip",nombre:"El Bunker de Competición de Alto Nivel",objetivo:"Dominar el bunker en las situaciones más difíciles posibles.",descripcion:"Circuito de 6 situaciones de bunker: bola en el labio, arena muy suelta, arena mojada, bola enterrada, cuesta abajo a hoyo cerca, bunker de 30m. 3 intentos de cada. Objetivo: 2/3 en green.",duracion:"45 min",material:"SW y LW, bolas, bunker con distintas condiciones",variantes:["Solo la bola enterrada","Solo el bunker de 30m","Con contador de golpes"],tags:["bunker","alto nivel","6 situaciones","labio","enterrada","30m"]},
{id:"bp065",grupo:"birdieplus",trimestre:4,semana:22,categoria:"Mental",nombre:"La Fortaleza Mental en el Último Hoyo",objetivo:"Gestionar la presión extrema del último hoyo de un torneo.",descripcion:"Simulación: 'estás empatado, último hoyo, necesitas par para ganar'. El alumno ejecuta el hoyo completo con árbitro, galería y consecuencias reales. Se evalúa la rutina, la gestión emocional y la ejecución.",duracion:"30 min",material:"Set completo, árbitro, galería de compañeros",variantes:["El hoyo más difícil del campo","Con defensa del lead (necesitas bogey para ganar también)","Sin galería para comparar"],tags:["último hoyo","fortaleza mental","par para ganar","árbitro","galería","presión extrema"]},
{id:"bp066",grupo:"birdieplus",trimestre:1,semana:6,categoria:"Juego",nombre:"El Reconocimiento Estratégico del Campo",objetivo:"Preparar el campo para maximizar el rendimiento en torneo.",descripcion:"9 hoyos de reconocimiento con libreta: para cada hoyo anotar zona A de salida, zona B (fallback), peligro principal, posición de bandera más difícil, break del green cerca del hoyo.",duracion:"150 min",material:"Libreta de campo especial, bolígrafo, set completo",variantes:["18 hoyos si hay tiempo","Con mapa del campo","Comparar notas con las del compañero"],tags:["reconocimiento","estratégico","zona A","fallback","peligro","libreta"]},
{id:"bp067",grupo:"birdieplus",trimestre:2,semana:13,categoria:"Putting",nombre:"El Putting en Green Rápido",objetivo:"Adaptarse a greens rápidos (stimp 10+) con eficiencia.",descripcion:"Green rápido: backswing más corto, mucho más break del esperado, cuesta abajo es muy peligroso. 20 putts en green rápido real o simulado. Calcular el ajuste necesario respecto al green normal.",duracion:"30 min",material:"Putter, bolas, Stimpmeter si disponible, green rápido",variantes:["Solo los cuesta abajo","Medir velocidad real con Stimpmeter","Comparar green 9 vs green 11"],tags:["putting","green rápido","stimp 10","ajuste","backswing corto"]},
{id:"bp068",grupo:"birdieplus",trimestre:3,semana:19,categoria:"Juego Largo",nombre:"El Driving en Condiciones Adversas Avanzado",objetivo:"Mantener el rendimiento con el driver en cualquier condición.",descripcion:"Protocolo de condiciones adversas: (1) viento de cara — más palo y 85%, (2) viento a favor — menos palo y 90%, (3) viento cruzado derecho — draw o apuntar derecha, (4) lluvia — grip seco y 80%.",duracion:"35 min",material:"Driver, bolas, condiciones reales o simuladas",variantes:["Solo viento de cara","Con lluvia real","Con ventilador industrial"],tags:["driver","condiciones adversas","viento","lluvia","protocolo","avanzado"]},
{id:"bp069",grupo:"birdieplus",trimestre:4,semana:23,categoria:"Mental",nombre:"El Diario Competitivo del Alto Rendimiento",objetivo:"Sistema de análisis post-ronda de máximo nivel.",descripcion:"Después de cada torneo o ronda importante: (1) Estadísticas completas en Excel, (2) Las 3 mejores decisiones, (3) Los 3 peores errores (técnico/táctico/mental), (4) SG por categoría, (5) Plan de 2 objetivos para el próximo torneo.",duracion:"45 min",material:"Hoja de análisis detallada, Excel o app",variantes:["Con el instructor revisando","Comparar con los últimos 5 torneos","Identificar patrones de errores repetidos"],tags:["diario competitivo","alto rendimiento","estadísticas","SG","errores","patrones"]},
{id:"bp070",grupo:"birdieplus",trimestre:4,semana:25,categoria:"Chip",nombre:"El Short Game Test de Fin de Temporada",objetivo:"Medir el progreso en short game al final del año completo.",descripcion:"Test idéntico al del inicio de temporada: 18 situaciones fijas. Comparar distancia media al hoyo con el resultado de principios de año. Calcular el porcentaje de mejora.",duracion:"45 min",material:"Wedges, putter, bolas, 18 posiciones idénticas al test inicial",variantes:["Publicar los resultados del grupo","Premio al más mejorado","Comparar con el short game test mensual más bajo del año"],tags:["short game test","fin de temporada","comparativa","mejora anual","porcentaje"]},
{id:"bp071",grupo:"birdieplus",trimestre:2,semana:14,categoria:"Juego",nombre:"El Torneo Simulado Nacional",objetivo:"Simular un torneo de nivel nacional con todas las condiciones.",descripcion:"18 hoyos en condiciones de torneo nacional: salida en hora exacta, árbitro oficial, grupo de 3, scoring en tiempo real en app, reglas federadas estrictas, caddie permitido, galería.",duracion:"300 min",material:"Set completo, árbitro externo, app de scoring, caddie",variantes:["Con jugadores invitados de otros clubes","Con transmisión por redes sociales","Con entrevista post-ronda grabada"],tags:["torneo nacional","simulado","árbitro oficial","condiciones reales","caddie"]},
{id:"bp072",grupo:"birdieplus",trimestre:3,semana:20,categoria:"Swing",nombre:"El Análisis de Swing vs Pro de Tour",objetivo:"Comparar el propio swing con el de un profesional de nivel Tour.",descripcion:"Se graba el swing en las mismas posiciones que las referencias del instructor (P1-P9). Se comparan fotograma a fotograma. Se identifican 2 diferencias clave y se crea un plan de trabajo de 6 semanas.",duracion:"45 min",material:"Video del swing del alumno, referencias de pro de tour, app de análisis",variantes:["Con Coach's Eye o V1","Comparar con el mismo pro que en el trimestre anterior","El alumno elige el pro de referencia"],tags:["análisis vs pro","tour","comparativa","P1-P9","fotograma","plan 6 semanas"]},
{id:"bp073",grupo:"birdieplus",trimestre:1,semana:7,categoria:"Coordinación",nombre:"El Programa Físico de Alto Rendimiento",objetivo:"Programa de fuerza y velocidad específico para el golf de élite.",descripcion:"Programa de 4 sesiones/semana: (1) Fuerza máxima (sentadillas, peso muerto, press banca), (2) Potencia rotacional (medicine ball, cable), (3) Velocidad (speed sticks, sprints cortos), (4) Movilidad y recuperación.",duracion:"60 min x 4/semana",material:"Gimnasio, bandas, medicine ball, speed sticks",variantes:["Con preparador físico","Versión de 2 sesiones/semana","Solo la parte de potencia rotacional"],tags:["físico","alto rendimiento","fuerza","potencia","velocidad","programa semanal"]},
{id:"bp074",grupo:"birdieplus",trimestre:4,semana:27,categoria:"Juego",nombre:"El Gran Premio Final de la Academia",objetivo:"Torneo de clausura de máximo nivel con toda la academia.",descripcion:"Torneo final donde compiten todos los grupos (Pollitos, Pares, Birdies, Eagles, Albatros y Birdie+) en formato adaptado. Los Birdie+ actúan como capitanes de equipos mixtos.",duracion:"300 min + ceremonia de gala",material:"Set completo adaptado por grupos, trofeos, diplomas, galería de padres",variantes:["Formato scramble por equipos mixtos","Con foto de grupo por categorías","Video del año para proyectar en la clausura"],tags:["gran premio","clausura","mixto","equipos","todas las categorías","gala"]},
{id:"bp075",grupo:"birdieplus",trimestre:4,semana:28,categoria:"Mental",nombre:"El Legado y el Futuro del Golf",objetivo:"Reflexión final sobre el camino recorrido y los sueños futuros.",descripcion:"Sesión de cierre del año: (1) Presentación de 3 min sobre lo aprendido al resto de la academia, (2) Carta sellada para dentro de 5 años con los objetivos soñados, (3) Compromiso público de mentor de los grupos menores el próximo año.",duracion:"60 min",material:"Presentación, papel, sobre sellado",variantes:["Video-mensaje grabado","Con padres presentes","Publicación del compromiso en redes sociales del club"],tags:["legado","futuro","presentación","carta 5 años","mentor","compromiso","cierre"]}

];


// ═══════════════════════════════════════════════════════════════════
// COMPONENTE: CAMPANA DE NOTIFICACIONES
// ═══════════════════════════════════════════════════════════════════
function NotifBell({notifs, pendientesCount=0}){
  const [open, setOpen] = useState(false);
  const noLeidas = Math.max((notifs||[]).filter(n=>!n.leida).length, pendientesCount);

  async function marcarLeida(id){
    try {
      await updateDoc(doc(db,"notificaciones",id),{leida:true});
    } catch(e){ console.warn(e); }
  }

  async function marcarTodasLeidas(){
    for(const n of (notifs||[]).filter(x=>!x.leida)){
      try { await updateDoc(doc(db,"notificaciones",n.id),{leida:true}); } catch(e){}
    }
  }

  async function eliminarNotif(id){
    try { await deleteDoc(doc(db,"notificaciones",id)); } catch(e){}
  }

  return <div style={{position:"relative"}}>
    <button onClick={()=>setOpen(o=>!o)}
      style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,
        padding:"6px 12px",cursor:"pointer",color:"white",fontSize:20,position:"relative"}}>
      🔔
      {noLeidas>0&&<span style={{position:"absolute",top:-4,right:-4,
        background:"#c0392b",color:"white",borderRadius:"50%",
        width:18,height:18,fontSize:11,fontWeight:800,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        {noLeidas}
      </span>}
    </button>

    {open&&<div style={{position:"absolute",right:0,top:48,width:340,maxHeight:480,
      overflowY:"auto",background:"white",borderRadius:14,
      boxShadow:"0 8px 32px rgba(0,0,0,.25)",zIndex:9999}}>
      {/* Header */}
      <div style={{background:G.fairway,color:"white",padding:"12px 16px",
        borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:14}}>🔔 Notificaciones</span>
        {noLeidas>0&&<button onClick={marcarTodasLeidas}
          style={{background:"rgba(255,255,255,.2)",border:"none",color:"white",
            borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>
          ✓ Marcar todas leídas
        </button>}
      </div>

      {(notifs||[]).length===0
        ? <div style={{padding:24,textAlign:"center",color:G.soft,fontSize:13}}>
            Sin notificaciones
          </div>
        : (notifs||[]).map(n=>(
          <div key={n.id} onClick={()=>marcarLeida(n.id)}
            style={{padding:"12px 16px",borderBottom:"1px solid #f0f0f0",cursor:"pointer",
              background:n.leida?"white":"#e8f5fb",
              display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{fontSize:22,flexShrink:0}}>
              {n.tipo==="nuevo_registro"?"🧒":n.tipo==="nuevo_alumno_adulto"?"🏌️":"📢"}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:n.leida?400:700,fontSize:13,color:G.ink}}>
                {n.tipo==="nuevo_registro"||n.tipo==="nuevo_alumno_adulto"
                  ? `Nuevo registro: ${n.nombre}`
                  : n.mensaje||"Nueva notificación"}
              </div>
              {n.tipoEscuela&&<div style={{fontSize:11,color:G.soft}}>
                {n.tipoEscuela==="infantil"?"🧒 Escuela Infantil":"🏌️ Escuela Adultos"}
              </div>}
              {n.telefono&&<div style={{fontSize:11,color:G.soft}}>📞 {n.telefono}</div>}
              {n.email&&<div style={{fontSize:11,color:G.soft}}>✉️ {n.email}</div>}
              {!n.leida&&<span style={{fontSize:10,background:G.sky,color:"white",
                borderRadius:6,padding:"1px 6px",marginTop:4,display:"inline-block"}}>NUEVO</span>}
            </div>
            <button onClick={e=>{e.stopPropagation();eliminarNotif(n.id);}}
              style={{background:"none",border:"none",color:G.soft,cursor:"pointer",
                fontSize:16,flexShrink:0}}>✕</button>
          </div>
        ))
      }
    </div>}
  </div>;
}


// ═══════════════════════════════════════════════════════════════════
// MÓDULO: REGISTROS PENDIENTES DE ACTIVACIÓN
// ═══════════════════════════════════════════════════════════════════
function ModRegistrosPendientes({data, setData, notifs}){
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const unsub = onSnapshot(
      query(collection(db,"registros_pendientes"), orderBy("timestamp","desc")),
      snap => {
        setPendientes(snap.docs.map(d=>({_docId:d.id,...d.data()})));
        setLoading(false);
      },
      err => { console.warn(err); setLoading(false); }
    );
    return ()=>unsub();
  },[]);

  async function activar(reg){
    const {_docId,...alumno} = reg;
    // Add to alumnos list as active
    const nuevoAlumno = {...alumno, activo:true, pendienteActivacion:false};
    const nuevosAlumnos = [...(data.alumnos||[]), nuevoAlumno];
    setData({...data, alumnos:nuevosAlumnos});
    // Delete from pending
    try { await deleteDoc(doc(db,"registros_pendientes",_docId)); } catch(e){}
    // Mark related notifications as read
    for(const n of notifs.filter(n=>n.nombre===alumno.nombre&&!n.leida)){
      try { await updateDoc(doc(db,"notificaciones",n.id),{leida:true}); } catch(e){}
    }
  }

  async function rechazar(reg){
    if(!golfConfirm("¿Rechazar y eliminar el registro de "+reg.nombre+"?")) return;
    try { await deleteDoc(doc(db,"registros_pendientes",reg._docId)); } catch(e){}
  }

  if(loading) return <div style={{textAlign:"center",padding:40,color:G.soft}}>
    <div style={{fontSize:28,marginBottom:10}}>🔄</div>Cargando...
  </div>;

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
      <div>
        <h2 style={{margin:0,color:G.fairway}}>🔔 Registros pendientes</h2>
        <div style={{fontSize:13,color:G.soft,marginTop:2}}>
          Alumnos que se han registrado online y esperan activación
        </div>
      </div>
      <div style={{background:pendientes.length>0?"#c0392b":G.grass,color:"white",
        borderRadius:20,padding:"4px 14px",fontWeight:700,fontSize:14}}>
        {pendientes.length} pendiente{pendientes.length!==1?"s":""}
      </div>
    </div>

    {pendientes.length===0
      ? <div style={{textAlign:"center",padding:50,background:G.mist,borderRadius:14,color:G.soft}}>
          <div style={{fontSize:36,marginBottom:10}}>✅</div>
          <div style={{fontWeight:700,fontSize:15}}>Sin registros pendientes</div>
          <div style={{fontSize:13,marginTop:4}}>Cuando un alumno se inscriba online aparecerá aquí</div>
        </div>
      : <div style={{display:"grid",gap:12}}>
          {pendientes.map(reg=>(
            <Card key={reg._docId} style={{borderLeft:"5px solid #c0392b"}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
                <FotoAlumno foto="" nombre={reg.nombre} size={48}/>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{fontWeight:800,fontSize:16,color:G.ink,marginBottom:4}}>{reg.nombre}</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:12,color:G.soft,marginBottom:6}}>
                    {reg.fechaNacimiento&&<span>🎂 {reg.fechaNacimiento}</span>}
                    {reg.telefono&&<span>📞 {reg.telefono}</span>}
                    {reg.email&&<span>✉️ {reg.email}</span>}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                    <span style={{background:reg.tipoEscuela==="infantil"?"#D6E4F7":"#D4EDDA",
                      color:reg.tipoEscuela==="infantil"?"#2e5fa3":"#1a5c2a",
                      borderRadius:8,padding:"2px 8px",fontSize:12,fontWeight:600}}>
                      {reg.tipoEscuela==="infantil"?"🧒 Escuela Infantil":"🏌️ Escuela Adultos"}
                    </span>
                    {reg.nivel&&<span style={{background:G.mist,color:G.fairway,borderRadius:8,padding:"2px 8px",fontSize:12,fontWeight:600}}>
                      {GRUPOS_EDAD.find(g=>g.id===reg.nivel)?.emoji} {reg.nivel}
                    </span>}
                    <span style={{background:"#e8f5eb",color:G.grass,borderRadius:8,padding:"2px 8px",fontSize:12,fontWeight:600}}>
                      ✓ RGPD aceptado
                    </span>
                  </div>
                  {(reg.alergias||reg.intolerancias||reg.lesiones)&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {reg.alergias&&<span style={{background:"#FFF3E0",color:"#E65100",borderRadius:8,padding:"2px 8px",fontSize:11}}>🤧 {reg.alergias}</span>}
                    {reg.intolerancias&&<span style={{background:"#F3E5F5",color:"#6A1B9A",borderRadius:8,padding:"2px 8px",fontSize:11}}>🥛 {reg.intolerancias}</span>}
                    {reg.lesiones&&<span style={{background:"#FCE4EC",color:"#880E4F",borderRadius:8,padding:"2px 8px",fontSize:11}}>🩹 {reg.lesiones}</span>}
                  </div>}
                  {(reg.diasPreferencia?.length>0||reg.horarioPreferencia)&&<div style={{marginTop:6,fontSize:12,color:"#555",background:"#e8f5fb",borderRadius:8,padding:"4px 10px"}}>
                    📅 {reg.diasPreferencia?.join(", ")} {reg.horarioPreferencia&&"· "+reg.horarioPreferencia}
                  </div>}
                  {reg.medicacion&&<div style={{marginTop:4,fontSize:12,color:"#1B5E20",background:"#E8F5E9",borderRadius:8,padding:"4px 10px"}}>
                    💊 {reg.medicacion}
                  </div>}
                  {reg.tutores?.[0]&&<div style={{marginTop:6,fontSize:12,color:"#555",background:"#f0f0f0",borderRadius:8,padding:"4px 10px"}}>
                    👨‍👩‍👦 Tutor: {reg.tutores[0].nombre} ({reg.tutores[0].relacion}) · {reg.tutores[0].telefono}
                  </div>}
                </div>
                <div style={{display:"flex",gap:8,flexDirection:"column",flexShrink:0}}>
                  <Btn color="primary" onClick={()=>activar(reg)}>✅ Activar</Btn>
                  <Btn small color="danger" onClick={()=>rechazar(reg)}>✕ Rechazar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
    }

    {/* ── SOLICITUDES DE CLASE ── */}
    {(data.solicitudesClase||[]).filter(s=>s.estado==="pendiente").length > 0 && <>
      <div style={{marginTop:24,marginBottom:12}}>
        <h2 style={{margin:"0 0 4px",color:G.sky}}>📩 Solicitudes de clase</h2>
        <div style={{fontSize:13,color:G.soft}}>Alumnos que han solicitado una clase desde su portal</div>
      </div>
      <div style={{display:"grid",gap:10}}>
        {(data.solicitudesClase||[]).filter(s=>s.estado==="pendiente").map(s=>(
          <Card key={s.id} style={{borderLeft:`4px solid ${G.sky}`}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:15,color:G.ink,marginBottom:4}}>👤 {s.alumnoNombre}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:13,color:G.soft}}>
                  <span>📅 {s.fecha}</span>
                  <span>🕐 {s.hora}</span>
                  <span>🏌️ {s.tipo}</span>
                  <span>📍 {s.zona}</span>
                </div>
                {s.notas&&<div style={{fontSize:12,color:"#555",marginTop:6,background:"#f0f8ff",borderRadius:8,padding:"4px 10px"}}>
                  💬 {s.notas}
                </div>}
                <div style={{fontSize:11,color:G.soft,marginTop:4}}>Solicitado: {s.fechaSolicitud}</div>
              </div>
              <div style={{display:"flex",gap:8,flexDirection:"column",flexShrink:0}}>
                <Btn small color="primary" onClick={()=>{
                  setData({...data,solicitudesClase:(data.solicitudesClase||[]).map(x=>x.id===s.id?{...x,estado:"aceptada"}:x)});
                }}>✅ Aceptar</Btn>
                <Btn small color="danger" onClick={()=>{
                  setData({...data,solicitudesClase:(data.solicitudesClase||[]).map(x=>x.id===s.id?{...x,estado:"rechazada"}:x)});
                }}>✕ Rechazar</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>}
  </div>;
}

function AdminShell({data,setData,onLogout,savedFlash,notifs,pendientesCount}){
  const [tab,setTab]=useState("calendario");
  return <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",minHeight:"100vh",background:G.sand,color:G.ink}}>
    <div style={{background:G.fairway,color:G.white,padding:"0 16px"}}>
      <div style={{maxWidth:920,margin:"0 auto"}}>
        <div style={{padding:"14px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={LOGO_GCR} alt="Golf Ciudad Real" style={{height:36,objectFit:"contain",filter:"brightness(0) invert(1)",opacity:0.95}}/>
            <img src={LOGO_PGA} alt="PGA España" style={{height:34,objectFit:"contain",marginLeft:4}}/>
            <img src={LOGO_ENG} alt="Escuela Nacional" style={{height:32,objectFit:"contain",marginLeft:4}}/>
            <div style={{marginLeft:6}}>
              <div style={{fontWeight:800,fontSize:16}}>José Caballero Golf Academy</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Panel del Profesor</div>
            </div>
          </div>
          <NotifBell notifs={notifs} pendientesCount={pendientesCount}/>
          <button onClick={onLogout} style={{background:"rgba(255,255,255,.15)",border:"none",color:G.white,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Salir</button>
        </div>
        <div style={{display:"flex",gap:2,marginTop:12,overflowX:"auto",paddingBottom:0}}>
          {ADMIN_TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:tab===t.id?G.white:"transparent",color:tab===t.id?G.fairway:"rgba(255,255,255,.8)",border:"none",borderRadius:"8px 8px 0 0",padding:"8px 10px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",position:"relative",flexShrink:0}}>
            {t.icon} {t.label}{t.id==="pendientes"&&pendientesCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#c0392b",color:"white",borderRadius:"50%",width:16,height:16,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{pendientesCount}</span>}
          </button>)}
        </div>
      </div>
    </div>
    <div style={{maxWidth:920,margin:"0 auto",padding:"22px 14px 60px"}}>
      {pendientesCount>0&&tab!=="pendientes"&&<div onClick={()=>setTab("pendientes")}
        style={{background:"linear-gradient(135deg,#c0392b,#e74c3c)",color:"white",
          borderRadius:14,padding:"16px 20px",marginBottom:18,cursor:"pointer",
          display:"flex",alignItems:"center",gap:14,boxShadow:"0 4px 16px rgba(192,57,43,.3)",
          animation:"pulse 2s infinite"}}>
        <div style={{fontSize:32}}>🔔</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:16}}>
            ¡Tienes {pendientesCount} {pendientesCount===1?"nueva inscripción":"nuevas inscripciones"} pendiente{pendientesCount===1?"":"s"}!
          </div>
          <div style={{fontSize:13,opacity:.9,marginTop:2}}>
            Pulsa aquí para revisar y activar {pendientesCount===1?"al nuevo alumno":"a los nuevos alumnos"}
          </div>
        </div>
        <div style={{fontSize:20}}>→</div>
        <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}`}</style>
      </div>}
      <h2 style={{margin:"0 0 18px",color:G.fairway,fontSize:19,fontWeight:800}}>
        {ADMIN_TABS.find(t=>t.id===tab)?.icon} {ADMIN_TABS.find(t=>t.id===tab)?.label}
      </h2>
      {tab==="calendario"&&<ModCalendario data={data} setData={setData}/>}
      {tab==="alumnos"&&<ModAlumnos data={data} setData={setData}/>}
      {tab==="pendientes"&&<ModRegistrosPendientes data={data} setData={setData} notifs={notifs}/>}
      {tab==="programas"&&<ModProgramas data={data} setData={setData}/>}
      {tab==="clases"&&<ModClases data={data} setData={setData}/>}
      {tab==="estadisticas"&&<ModEstadisticas data={data} setData={setData}/>}
      {tab==="analisis"&&<ModAnalisis data={data} setData={setData}/>}
      {tab==="pagos"&&<ModPagos data={data} setData={setData}/>}
      {tab==="ejercicios"&&<ModEjerciciosAdmin data={data} setData={setData}/>}
      {tab==="informes"&&<ModInformes data={data} setData={setData}/>}
      {tab==="mensajes"&&<ModMensajeria data={data} setData={setData}/>}
      {tab==="tareas"&&<ModTareas data={data} setData={setData}/>}
      {tab==="ajustes"&&<ModAjustes data={data} setData={setData} onLogout={onLogout}/>}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════
export default function App(){
  const [data,setDataRaw]   = useState(loadData);
  const [session,setSession]= useState(null);
  const [savedFlash,setSavedFlash] = useState(false);
  const [fbReady,setFbReady]= useState(false);
  const [notifs,setNotifs]  = useState([]);
  const [pendientesCount,setPendientesCount] = useState(0);

  // ── Conectar Firebase al arrancar ──
  useEffect(()=>{
    signInAnonymously(auth)
      .then(()=>{
        cargarDatosFirebase().then(fbData=>{
          if(fbData){ setDataRaw(fbData); saveData(fbData); }
          setFbReady(true);
        });
        // Escuchar cambios en tiempo real
        const unsub = onSnapshot(doc(db,"academia","datos"), snap=>{
          if(snap.exists()){
            const fbData = { ...makeDefaultData(), ...snap.data() };
            setDataRaw(prev=>{
              // Merge fotos locales (no se guardan en Firebase por tamaño)
              const alumnos = (fbData.alumnos||[]).map(a=>{
                const local = (prev.alumnos||[]).find(x=>x.id===a.id);
                return {...a, foto: local?.foto||a.foto||""};
              });
              return {...fbData, alumnos};
            });
          }
        }, err=>{ console.warn("Snapshot error:", err); setFbReady(true); });
        // Escuchar notificaciones
        const unsubN = onSnapshot(
          query(collection(db,"notificaciones"), orderBy("timestamp","desc")),
          snap=>setNotifs(snap.docs.map(d=>({id:d.id,...d.data()}))),
          err=>console.warn("Notif error:", err)
        );
        // Escuchar registros pendientes para el contador
        const unsubP = onSnapshot(
          collection(db,"registros_pendientes"),
          snap=>setPendientesCount(snap.docs.length),
          err=>console.warn("Pendientes error:", err)
        );
        return ()=>{ unsub(); unsubN(); unsubP(); };
      })
      .catch(err=>{ console.warn("Firebase error:", err); setFbReady(true); });
  },[]);

  function setData(d){
    setDataRaw(d);
    saveData(d);
    setSavedFlash(true);
    setTimeout(()=>setSavedFlash(false),1500);
    guardarDatosFirebase(d);
  }
  function onLogin(s){setSession(s);}
  function onLogout(){
    // Siempre limpiar PIN guardado al cerrar sesión manualmente
    // para evitar que el auto-login entre de nuevo inmediatamente
    localStorage.removeItem("gcr_pin_saved");
    setSession(null);
  }

  // Pantalla de carga
  if(!fbReady) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a5c2a,#0f3518)",
      display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:20}}>
      <div style={{fontSize:48}}>⛳</div>
      <div style={{color:"white",fontSize:20,fontWeight:800}}>Golf Ciudad Real Academy</div>
      <div style={{color:"rgba(255,255,255,.7)",fontSize:14}}>Conectando con el servidor...</div>
      <div style={{width:44,height:44,border:"4px solid rgba(255,255,255,.25)",
        borderTop:"4px solid white",borderRadius:"50%",
        animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );


  if(!session) return <LoginScreen data={data} onLogin={onLogin}/>;
  if(session.role==="alumno"||session.role==="tutor")
    return <PortalAlumno data={data} setData={setData} alumnoId={session.alumnoId} onLogout={onLogout} tutorNombre={session.tutorNombre||null}/>;
  return <AdminShell data={data} setData={setData} onLogout={onLogout}/>;
}


