import React, { useState, useEffect, useMemo } from "react";
import { db, auth } from "./firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Target,
  CheckSquare,
  Plus,
  X,
  LogOut,
  TrendingUp,
  TrendingDown,
  Circle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const CLUB_ID = "ciudad-real";

/* ---------- Tema "Refined Golf Club" · acento bronce para Finanzas ---------- */
const theme = {
  bg: "#F7F5F0",
  surface: "#FFFFFF",
  ink: "#1C2B22",
  inkSoft: "#5B6A60",
  border: "#E7E2D8",
  pine: "#22593D",
  accent: "#B8863C",
  accentSoft: "#F3E7D3",
  success: "#2F7D4F",
  danger: "#B3462C",
  warn: "#C69A3C",
};

const fmtEUR = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    Number(n || 0)
  );

const fmtDate = (isoOrTimestamp) => {
  if (!isoOrTimestamp) return "—";
  const d =
    typeof isoOrTimestamp?.toDate === "function"
      ? isoOrTimestamp.toDate()
      : new Date(isoOrTimestamp);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

const monthKey = (isoOrTimestamp) => {
  const d =
    typeof isoOrTimestamp?.toDate === "function"
      ? isoOrTimestamp.toDate()
      : new Date(isoOrTimestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/* ---------------------------- Componentes UI ---------------------------- */

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor =
    pct >= 100 ? theme.danger : pct >= 80 ? theme.warn : color || theme.success;
  return (
    <div style={{ background: "#EDEAE2", borderRadius: 999, height: 8 }}>
      <div
        style={{
          width: `${pct}%`,
          background: barColor,
          height: "100%",
          borderRadius: 999,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#EFEDE6", fg: theme.inkSoft },
    income: { bg: "#E4F1E8", fg: theme.success },
    expense: { bg: "#F5E4DE", fg: theme.danger },
    urgent: { bg: "#F5E4DE", fg: theme.danger },
    high: { bg: "#FBEEDB", fg: theme.warn },
    medium: { bg: theme.accentSoft, fg: theme.accent },
    low: { bg: "#EFEDE6", fg: theme.inkSoft },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="rounded-md"
      style={{
        background: t.bg,
        color: t.fg,
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 8px",
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div
      className="shadow-md rounded-2xl"
      style={{ background: theme.surface, padding: 20, ...style }}
    >
      {children}
    </div>
  );
}

/* ------------------------------- Sidebar -------------------------------- */

function Sidebar({ active, setActive, onLogout, userEmail }) {
  const items = [
    { id: "resumen", label: "Resumen", icon: LayoutDashboard },
    { id: "transacciones", label: "Transacciones", icon: Receipt },
    { id: "presupuestos", label: "Presupuestos", icon: Wallet },
    { id: "metas", label: "Metas", icon: Target },
    { id: "tareas", label: "Tareas", icon: CheckSquare },
  ];

  return (
    <aside
      style={{
        width: 240,
        background: theme.surface,
        borderRight: `1px solid ${theme.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        gap: 4,
        minHeight: "100vh",
      }}
    >
      <div style={{ padding: "0 8px 24px" }}>
        <div
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: 20,
            fontWeight: 700,
            color: theme.pine,
          }}
        >
          Golf B
        </div>
        <div style={{ fontSize: 13, color: theme.accent, fontWeight: 600 }}>
          Finanzas
        </div>
      </div>

      {items.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => setActive(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: isActive ? theme.accentSoft : "transparent",
              color: isActive ? theme.accent : theme.inkSoft,
              fontWeight: isActive ? 700 : 500,
              fontSize: 14,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Icon size={18} />
            {label}
          </button>
        );
      })}

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <div
          style={{
            fontSize: 12,
            color: theme.inkSoft,
            padding: "0 8px 8px",
            wordBreak: "break-all",
          }}
        >
          {userEmail}
        </div>
        <button
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: theme.inkSoft,
            fontSize: 14,
            cursor: "pointer",
            width: "100%",
          }}
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------- Resumen -------------------------------- */

function ResumenView({ transacciones, presupuestos, metas }) {
  const now = new Date();
  const currentMonth = monthKey(now.toISOString());

  const delMes = transacciones.filter((t) => monthKey(t.date) === currentMonth);
  const ingresos = delMes
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const gastos = delMes
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = ingresos - gastos;

  const trend = useMemo(() => {
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(d);
      const mIngresos = transacciones
        .filter((t) => monthKey(t.date) === key && t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0);
      const mGastos = transacciones
        .filter((t) => monthKey(t.date) === key && t.type === "expense")
        .reduce((s, t) => s + Number(t.amount), 0);
      meses.push({ mes: label, Ingresos: mIngresos, Gastos: mGastos });
    }
    return meses;
  }, [transacciones]);

  const presupuestosAlerta = presupuestos
    .map((p) => {
      const gastado = delMes
        .filter((t) => t.type === "expense" && t.category === p.category)
        .reduce((s, t) => s + Number(t.amount), 0);
      return { ...p, gastado, pct: (gastado / Number(p.monthly_limit)) * 100 };
    })
    .filter((p) => p.pct >= 80)
    .sort((a, b) => b.pct - a.pct);

  const metasProximas = [...metas]
    .filter((m) => m.deadline)
    .sort((a, b) => new Date(a.deadline?.toDate?.() || a.deadline) - new Date(b.deadline?.toDate?.() || b.deadline))
    .slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.success }}>
            <TrendingUp size={18} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Ingresos del mes</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: theme.ink }}>
            {fmtEUR(ingresos)}
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.danger }}>
            <TrendingDown size={18} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Gastos del mes</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: theme.ink }}>
            {fmtEUR(gastos)}
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.accent }}>
            <Wallet size={18} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Balance del mes</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: theme.ink }}>
            {fmtEUR(balance)}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: 12, color: theme.ink }}>
          Ingresos vs. Gastos · últimos 6 meses
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={trend}>
              <CartesianGrid stroke={theme.border} vertical={false} />
              <XAxis dataKey="mes" stroke={theme.inkSoft} fontSize={12} />
              <YAxis stroke={theme.inkSoft} fontSize={12} />
              <Tooltip formatter={(v) => fmtEUR(v)} />
              <Line type="monotone" dataKey="Ingresos" stroke={theme.success} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Gastos" stroke={theme.danger} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 12, color: theme.ink }}>
            Presupuestos a vigilar
          </div>
          {presupuestosAlerta.length === 0 && (
            <div style={{ fontSize: 13, color: theme.inkSoft }}>
              Ninguna categoría por encima del 80% este mes.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {presupuestosAlerta.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{p.category}</span>
                  <span style={{ color: theme.inkSoft }}>
                    {fmtEUR(p.gastado)} / {fmtEUR(p.monthly_limit)}
                  </span>
                </div>
                <ProgressBar value={p.gastado} max={Number(p.monthly_limit)} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, marginBottom: 12, color: theme.ink }}>
            Metas más próximas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {metasProximas.map((m) => (
              <div key={m.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{m.title}</span>
                  <span style={{ color: theme.inkSoft }}>{fmtDate(m.deadline)}</span>
                </div>
                <ProgressBar value={Number(m.current_amount)} max={Number(m.target_amount)} color={theme.accent} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------- Transacciones ------------------------------ */

function TransaccionForm({ onClose, onSave }) {
  const [form, setForm] = useState({
    type: "expense",
    category: "",
    subcategory: "",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    activity: "",
    iva_type: "",
    base_amount: "",
    irpf_deductible: "no",
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.category || !form.amount) return;
    onSave({
      ...form,
      amount: Number(form.amount).toFixed(2),
      base_amount: form.base_amount ? Number(form.base_amount).toFixed(2) : null,
      iva_amount:
        form.base_amount && form.iva_type
          ? (Number(form.base_amount) * (Number(form.iva_type) / 100)).toFixed(2)
          : null,
      date: new Date(form.date).toISOString(),
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    fontSize: 14,
    marginTop: 4,
  };
  const label = { fontSize: 12, fontWeight: 600, color: theme.inkSoft };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,43,34,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <form
        onSubmit={submit}
        className="shadow-lg rounded-2xl"
        style={{ background: theme.surface, padding: 24, width: 420, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: theme.ink }}>Nueva transacción</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["expense", "income"].map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setForm({ ...form, type: t })}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: `1px solid ${form.type === t ? theme.accent : theme.border}`,
                background: form.type === t ? theme.accentSoft : "transparent",
                color: form.type === t ? theme.accent : theme.inkSoft,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t === "expense" ? "Gasto" : "Ingreso"}
            </button>
          ))}
        </div>

        <label style={label}>Categoría</label>
        <input style={inputStyle} value={form.category} onChange={set("category")} required />

        <label style={label}>Descripción</label>
        <input style={inputStyle} value={form.description} onChange={set("description")} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>Importe (€)</label>
            <input style={inputStyle} type="number" step="0.01" value={form.amount} onChange={set("amount")} required />
          </div>
          <div>
            <label style={label}>Fecha</label>
            <input style={inputStyle} type="date" value={form.date} onChange={set("date")} />
          </div>
        </div>

        <label style={label}>Actividad (opcional: club / mantenimiento...)</label>
        <input style={inputStyle} value={form.activity} onChange={set("activity")} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>Base imponible (opcional)</label>
            <input style={inputStyle} type="number" step="0.01" value={form.base_amount} onChange={set("base_amount")} />
          </div>
          <div>
            <label style={label}>IVA % (opcional)</label>
            <input style={inputStyle} type="number" value={form.iva_type} onChange={set("iva_type")} />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md"
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 0",
            background: theme.accent,
            color: "#fff",
            border: "none",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Guardar transacción
        </button>
      </form>
    </div>
  );
}

function TransaccionesView({ transacciones, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  const ordenadas = [...transacciones].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: theme.ink }}>Transacciones</div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: theme.accent,
            color: "#fff",
            border: "none",
            padding: "8px 14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={16} /> Nueva
        </button>
      </div>

      <Card style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              {["Fecha", "Categoría", "Descripción", "Tipo", "Importe"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: 12,
                    color: theme.inkSoft,
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((t) => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: "12px 16px", fontSize: 14 }}>{fmtDate(t.date)}</td>
                <td style={{ padding: "12px 16px", fontSize: 14 }}>{t.category}</td>
                <td style={{ padding: "12px 16px", fontSize: 14, color: theme.inkSoft }}>
                  {t.description || "—"}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <Badge tone={t.type === "income" ? "income" : "expense"}>
                    {t.type === "income" ? "Ingreso" : "Gasto"}
                  </Badge>
                </td>
                <td
                  style={{
                    padding: "12px 16px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: t.type === "income" ? theme.success : theme.danger,
                  }}
                >
                  {t.type === "income" ? "+" : "-"} {fmtEUR(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <TransaccionForm
          onClose={() => setShowForm(false)}
          onSave={(data) => {
            onAdd(data);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------- Presupuestos ------------------------------- */

function PresupuestosView({ presupuestos, transacciones }) {
  const now = new Date();
  const currentMonth = monthKey(now.toISOString());
  const delMes = transacciones.filter(
    (t) => monthKey(t.date) === currentMonth && t.type === "expense"
  );

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, color: theme.ink, marginBottom: 16 }}>
        Presupuestos · {new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(now)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {presupuestos.map((p) => {
          const gastado = delMes
            .filter((t) => t.category === p.category)
            .reduce((s, t) => s + Number(t.amount), 0);
          return (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: theme.ink }}>{p.category}</span>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: p.color,
                    marginTop: 4,
                  }}
                />
              </div>
              <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 8 }}>
                {fmtEUR(gastado)} de {fmtEUR(p.monthly_limit)}
              </div>
              <ProgressBar value={gastado} max={Number(p.monthly_limit)} color={p.color} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Metas ---------------------------------- */

function MetasView({ metas }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, color: theme.ink, marginBottom: 16 }}>
        Metas de ahorro e inversión
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {metas.map((m) => {
          const pct = (Number(m.current_amount) / Number(m.target_amount)) * 100;
          return (
            <Card key={m.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 700, color: theme.ink }}>{m.title}</div>
                  <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 2 }}>
                    {m.description}
                  </div>
                </div>
                <Badge>{m.category}</Badge>
              </div>
              <div style={{ margin: "16px 0 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: theme.accent }}>{pct.toFixed(0)}%</span>
                  <span style={{ color: theme.inkSoft }}>
                    {fmtEUR(m.current_amount)} / {fmtEUR(m.target_amount)}
                  </span>
                </div>
                <ProgressBar value={Number(m.current_amount)} max={Number(m.target_amount)} color={theme.accent} />
              </div>
              <div style={{ fontSize: 12, color: theme.inkSoft }}>
                Fecha objetivo: {fmtDate(m.deadline)}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- Tareas ----------------------------------- */

function TareasView({ tareas, onUpdateStatus }) {
  const columnas = [
    { id: "pending", label: "Pendientes", icon: Circle },
    { id: "in_progress", label: "En curso", icon: Clock },
    { id: "done", label: "Hechas", icon: CheckCircle2 },
  ];

  const nextStatus = { pending: "in_progress", in_progress: "done", done: "pending" };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, color: theme.ink, marginBottom: 16 }}>
        Tareas financieras
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {columnas.map(({ id, label, icon: Icon }) => (
          <div key={id}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: theme.inkSoft }}>
              <Icon size={16} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tareas
                .filter((t) => t.status === id)
                .map((t) => (
                  <Card key={t.id} style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: theme.ink }}>{t.title}</span>
                      <Badge tone={t.priority}>{t.priority}</Badge>
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 4 }}>
                        {t.description}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: theme.inkSoft }}>
                        {t.due_date ? fmtDate(t.due_date) : "Sin fecha"}
                      </span>
                      <button
                        onClick={() => onUpdateStatus(t.id, nextStatus[t.status])}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: theme.accent,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Avanzar →
                      </button>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- App ------------------------------------ */

function AccessDenied({ onLogout }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.bg,
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontFamily: "Playfair Display, serif", fontSize: 22, color: theme.ink }}>
        Acceso restringido
      </div>
      <div style={{ color: theme.inkSoft, fontSize: 14 }}>
        Esta sección de Finanzas es solo para el superadministrador.
      </div>
      <button
        onClick={onLogout}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background: theme.pine,
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = cargando, null = sin sesión
  const [role, setRole] = useState(null);
  const [active, setActive] = useState("resumen");

  const [transacciones, setTransacciones] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [metas, setMetas] = useState([]);
  const [tareas, setTareas] = useState([]);

  // Auth + rol (superadmin) — asume colección usuarios/{uid} con campo "role"
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (u) {
        const { getDoc, doc: docRef } = await import("firebase/firestore");
        try {
          const snap = await getDoc(docRef(db, "usuarios", u.uid));
          setRole(snap.exists() ? snap.data().role : null);
        } catch {
          setRole(null);
        }
      } else {
        setRole(null);
      }
    });
    return unsub;
  }, []);

  // Suscripciones en vivo a Firestore
  useEffect(() => {
    if (!user || role !== "superadmin") return;

    const base = `clubes/${CLUB_ID}`;
    const unsubs = [
      onSnapshot(
        query(collection(db, `${base}/finanzas_transacciones`), orderBy("date", "desc")),
        (snap) => setTransacciones(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, `${base}/finanzas_presupuestos`), (snap) =>
        setPresupuestos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, `${base}/finanzas_metas`), (snap) =>
        setMetas(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, `${base}/finanzas_tareas`), (snap) =>
        setTareas(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [user, role]);

  const handleAddTransaccion = async (data) => {
    await addDoc(collection(db, `clubes/${CLUB_ID}/finanzas_transacciones`), {
      ...data,
      created_at: serverTimestamp(),
    });
  };

  const handleUpdateTareaStatus = async (id, status) => {
    await updateDoc(doc(db, `clubes/${CLUB_ID}/finanzas_tareas`, id), {
      status,
      completed_at: status === "done" ? serverTimestamp() : null,
    });
  };

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg }}>
        <span style={{ color: theme.inkSoft }}>Cargando…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg }}>
        <span style={{ color: theme.inkSoft }}>
          Inicia sesión desde Golf B Máster para acceder a Finanzas.
        </span>
      </div>
    );
  }

  if (role !== "superadmin") {
    return <AccessDenied onLogout={() => signOut(auth)} />;
  }

  return (
    <div style={{ display: "flex", background: theme.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      <Sidebar active={active} setActive={setActive} onLogout={() => signOut(auth)} userEmail={user.email} />
      <main style={{ flex: 1, padding: 32 }}>
        {active === "resumen" && (
          <ResumenView transacciones={transacciones} presupuestos={presupuestos} metas={metas} />
        )}
        {active === "transacciones" && (
          <TransaccionesView transacciones={transacciones} onAdd={handleAddTransaccion} />
        )}
        {active === "presupuestos" && (
          <PresupuestosView presupuestos={presupuestos} transacciones={transacciones} />
        )}
        {active === "metas" && <MetasView metas={metas} />}
        {active === "tareas" && (
          <TareasView tareas={tareas} onUpdateStatus={handleUpdateTareaStatus} />
        )}
      </main>
    </div>
  );
}
