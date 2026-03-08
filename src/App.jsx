import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell, ReferenceLine
} from 'recharts'
import {
  Plus, Trash2, Upload, Download, ChevronDown, Trophy, Info,
  TrendingUp, TrendingDown, Zap, Target, GripVertical,
  ChevronRight, ChevronUp, Sliders, Lock, Minus
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'problem', label: 'Problem', num: 1 },
  { id: 'criteria', label: 'Criteria', num: 2 },
  { id: 'weights', label: 'Weights', num: 3 },
  { id: 'alternatives', label: 'Alternatives', num: 4 },
  { id: 'scoring', label: 'Scoring', num: 5 },
  { id: 'results', label: 'Results', num: 6 },
  { id: 'analysis', label: 'Analysis', num: 7 },
]
const ALT_COLORS = ['#4f6ef7', '#00b4b4', '#f59e0b', '#e84040', '#8b5cf6', '#ec4899', '#10b981', '#6366f1']
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']
let _id = 200
const uid = (p) => `${p}${++_id}`

// ─── Examples ───────────────────────────────────────────────────────────────────
const EXAMPLES = {
  apartment: {
    title: 'Berlin Apartment Selection',
    problem: 'Choose the best apartment to rent in Berlin considering budget, space, commute, and quality of living.',
    criteria: [
      { id: 'c1', name: 'Monthly Rent (€)', direction: 'minimize', weight: 30 },
      { id: 'c2', name: 'Size (m²)', direction: 'maximize', weight: 20 },
      { id: 'c3', name: 'Commute Time (min)', direction: 'minimize', weight: 20 },
      { id: 'c4', name: 'Building Condition (1–5)', direction: 'maximize', weight: 15 },
      { id: 'c5', name: 'Noise Level (1–5)', direction: 'minimize', weight: 15 },
    ],
    alternatives: [
      { id: 'a1', name: 'Apartment A', description: 'Mitte, 72 m², bright, new kitchen' },
      { id: 'a2', name: 'Apartment B', description: 'Prenzlauer Berg, 85 m², large balcony' },
      { id: 'a3', name: 'Apartment C', description: 'Friedrichshain, 65 m², garden' },
      { id: 'a4', name: 'Apartment D', description: 'Neukölln, 90 m², top floor, needs renovation' },
    ],
    scores: {
      a1: { c1: 1800, c2: 72, c3: 18, c4: 4, c5: 3 },
      a2: { c1: 2100, c2: 85, c3: 22, c4: 5, c5: 2 },
      a3: { c1: 1650, c2: 65, c3: 25, c4: 3, c5: 4 },
      a4: { c1: 1550, c2: 90, c3: 35, c4: 2, c5: 2 },
    },
  },
  dataplatform: {
    title: 'Enterprise Data Platform',
    problem: 'Select the best enterprise data platform for analytics, data engineering, and governed data sharing.',
    criteria: [
      { id: 'c1', name: 'Data Engineering', direction: 'maximize', weight: 20 },
      { id: 'c2', name: 'Analytics & BI', direction: 'maximize', weight: 15 },
      { id: 'c3', name: 'Governance & Lineage', direction: 'maximize', weight: 15 },
      { id: 'c4', name: 'Scalability', direction: 'maximize', weight: 12 },
      { id: 'c5', name: 'TCO 3yr (€k)', direction: 'minimize', weight: 20 },
      { id: 'c6', name: 'Lock-in Risk (1–5)', direction: 'minimize', weight: 10 },
      { id: 'c7', name: 'Ecosystem (1–5)', direction: 'maximize', weight: 8 },
    ],
    alternatives: [
      { id: 'a1', name: 'Databricks', description: 'Lakehouse — unified analytics + ML' },
      { id: 'a2', name: 'Snowflake', description: 'Cloud DWH — elastic scaling' },
      { id: 'a3', name: 'Palantir Foundry', description: 'Ontology-driven governance' },
    ],
    scores: {
      a1: { c1: 5, c2: 4, c3: 3, c4: 5, c5: 980, c6: 3, c7: 5 },
      a2: { c1: 3, c2: 5, c3: 4, c4: 4, c5: 850, c6: 4, c7: 4 },
      a3: { c1: 4, c2: 3, c3: 5, c4: 4, c5: 1100, c6: 2, c7: 3 },
    },
  }
}

// ─── MCDA Engine ────────────────────────────────────────────────────────────────
function computeMCDA(criteria, alternatives, scores, weightOverrides = null) {
  if (!criteria.length || !alternatives.length) return { ranking: [], normalized: {}, utilities: {}, partWorths: {}, weights: {} }
  const rawW = {}; let totalW = 0
  criteria.forEach(c => { const w = weightOverrides ? (weightOverrides[c.id] ?? c.weight) : c.weight; rawW[c.id] = w; totalW += w })
  const weights = {}; criteria.forEach(c => { weights[c.id] = totalW > 0 ? rawW[c.id] / totalW : 0 })
  const normalized = {}; const mm = {}
  criteria.forEach(c => {
    const vals = alternatives.map(a => Number(scores[a.id]?.[c.id]) || 0)
    mm[c.id] = { min: Math.min(...vals), max: Math.max(...vals), range: Math.max(...vals) - Math.min(...vals) || 1 }
  })
  alternatives.forEach(a => {
    normalized[a.id] = {}
    criteria.forEach(c => { const n = (Number(scores[a.id]?.[c.id] || 0) - mm[c.id].min) / mm[c.id].range; normalized[a.id][c.id] = c.direction === 'minimize' ? 1 - n : n })
  })
  const partWorths = {}; const utilities = {}
  alternatives.forEach(a => { partWorths[a.id] = {}; let t = 0; criteria.forEach(c => { const pw = normalized[a.id][c.id] * weights[c.id]; partWorths[a.id][c.id] = pw; t += pw }); utilities[a.id] = t })
  const ranking = alternatives.map(a => ({ id: a.id, name: a.name, utility: utilities[a.id], partWorths: partWorths[a.id], normalized: normalized[a.id] })).sort((a, b) => b.utility - a.utility)
  return { ranking, normalized, utilities, partWorths, weights }
}

function runFullSensitivity(criteria, alternatives, scores) {
  if (criteria.length < 2 || alternatives.length < 2) return []
  const base = computeMCDA(criteria, alternatives, scores)
  const bw = base.ranking[0]; if (!bw) return []
  return criteria.map(tc => {
    const oc = criteria.filter(c => c.id !== tc.id); const ot = oc.reduce((s, c) => s + c.weight, 0)
    const sweep = []; let bp = null; let bpw = null
    for (let w = 0; w <= 100; w++) {
      const ov = {}; oc.forEach(c => { ov[c.id] = ot > 0 ? (c.weight / ot) * (100 - w) : (100 - w) / oc.length }); ov[tc.id] = w
      const r = computeMCDA(criteria, alternatives, scores, ov); const pt = { weight: w }
      r.ranking.forEach(x => { pt[x.name] = Math.round(x.utility * 1000) / 10 }); sweep.push(pt)
      if (r.ranking[0]?.id !== bw.id && bp === null) { bp = w; bpw = r.ranking[0]?.name }
    }
    return { criterion: tc, currentWeight: tc.weight, sweepData: sweep, breakpoint: bp, breakWinner: bpw, isStable: bp === null }
  })
}

const LIKERT = [
  { value: 1, label: 'Not important' }, { value: 2, label: 'Slightly' }, { value: 3, label: 'Moderate' },
  { value: 4, label: 'Important' }, { value: 5, label: 'Very important' }, { value: 6, label: 'Critical' },
]

// ─── Stepper Input Component ────────────────────────────────────────────────────
function StepperInput({ value, onChange, step = 1, min, max }) {
  const v = value === '' || value === undefined || value === null ? '' : value
  const isEmpty = v === ''
  return (
    <div className={`inline-flex items-center border rounded-lg overflow-hidden transition ${isEmpty ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
      <button
        onClick={() => { if (v !== '') onChange(Math.max(min ?? -Infinity, Number(v) - step)) }}
        className="px-1.5 py-1.5 text-slate-400 hover:text-primary hover:bg-slate-50 transition border-r border-slate-200"
        tabIndex={-1}
      ><Minus size={12} /></button>
      <input
        type="number"
        value={v}
        onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
        className="w-16 text-center text-xs font-mono py-1.5 bg-transparent focus:outline-none"
        placeholder="—"
      />
      <button
        onClick={() => { const base = v === '' ? 0 : Number(v); onChange(Math.min(max ?? Infinity, base + step)) }}
        className="px-1.5 py-1.5 text-slate-400 hover:text-primary hover:bg-slate-50 transition border-l border-slate-200"
        tabIndex={-1}
      ><Plus size={12} /></button>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [criteria, setCriteria] = useState([])
  const [alternatives, setAlternatives] = useState([])
  const [scores, setScores] = useState({})
  const [activeSection, setActiveSection] = useState('problem')
  const [exampleOpen, setExampleOpen] = useState(false)
  const [sensitivityResults, setSensitivityResults] = useState(null)
  const [weightMethodOpen, setWeightMethodOpen] = useState(false)
  const [weightMethod, setWeightMethod] = useState('direct')
  const [likertRatings, setLikertRatings] = useState({})
  const [dragCrit, setDragCrit] = useState(null)
  const exRef = useRef(null)
  const sectionRefs = useRef({})

  // ─── Dependencies ───────────────────────────────────────────────────────────
  const hasProblem = problem.trim().length >= 5
  const hasCriteria = criteria.length >= 1
  const hasAlternatives = alternatives.length >= 1
  const scoringComplete = useMemo(() => {
    if (!hasCriteria || !hasAlternatives) return false
    return alternatives.every(a => criteria.every(c => { const v = scores[a.id]?.[c.id]; return v !== undefined && v !== '' && v !== null }))
  }, [criteria, alternatives, scores, hasCriteria, hasAlternatives])

  const unlocked = useMemo(() => ({
    problem: true,
    criteria: hasProblem,
    weights: hasProblem && hasCriteria,
    alternatives: hasProblem,
    scoring: hasProblem && hasCriteria && hasAlternatives,
    results: scoringComplete,
    analysis: scoringComplete,
  }), [hasProblem, hasCriteria, hasAlternatives, scoringComplete])

  const mcda = useMemo(() => computeMCDA(criteria, alternatives, scores), [criteria, alternatives, scores])
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0)
  const normalizedWeights = useMemo(() => {
    const t = criteria.reduce((s, c) => s + c.weight, 0)
    return criteria.map(c => ({ ...c, pct: t > 0 ? (c.weight / t * 100) : 0 }))
  }, [criteria])

  // ─── Scroll spy (robust: top of page → always "problem") ─────────────────
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        // If near the top of the page, always select "problem"
        if (window.scrollY < 100) {
          setActiveSection('problem')
          ticking = false
          return
        }
        const offset = window.innerHeight * 0.4
        let current = 'problem'
        for (const sec of SECTIONS) {
          if (!unlocked[sec.id]) continue
          const el = sectionRefs.current[sec.id]
          if (!el) continue
          const rect = el.getBoundingClientRect()
          if (rect.top <= offset) current = sec.id
        }
        setActiveSection(current)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [unlocked])

  useEffect(() => {
    const h = (e) => { if (exRef.current && !exRef.current.contains(e.target)) setExampleOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  // ─── Criteria CRUD ──────────────────────────────────────────────────────────
  const addCriterion = () => setCriteria(p => [...p, { id: uid('c'), name: '', direction: 'maximize', weight: 0 }])
  const updateCriterion = (id, f, v) => setCriteria(p => p.map(c => c.id === id ? { ...c, [f]: v } : c))
  const removeCriterion = (id) => { setCriteria(p => p.filter(c => c.id !== id)); setScores(p => { const n = { ...p }; Object.keys(n).forEach(a => { const { [id]: _, ...r } = n[a]; n[a] = r }); return n }) }

  const onDragStart = (e, i) => { setDragCrit(i); e.dataTransfer.effectAllowed = 'move'; e.target.style.opacity = '0.3' }
  const onDragEnd = (e) => { e.target.style.opacity = '1'; setDragCrit(null) }
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const onDrop = (e, di) => { e.preventDefault(); if (dragCrit === null || dragCrit === di) return; setCriteria(p => { const n = [...p]; const [m] = n.splice(dragCrit, 1); n.splice(di, 0, m); return n }); setDragCrit(null) }

  // ─── Weights ────────────────────────────────────────────────────────────────
  const setWeightDirect = (id, v) => setCriteria(p => p.map(c => c.id === id ? { ...c, weight: Math.max(0, v) } : c))
  const setLikertRating = (id, v) => {
    const nr = { ...likertRatings, [id]: v }; setLikertRatings(nr)
    const total = criteria.reduce((s, c) => s + (nr[c.id] || 1), 0)
    setCriteria(p => p.map(c => ({ ...c, weight: total > 0 ? Math.round(((nr[c.id] || 1) / total) * 100) : 0 })))
  }
  const directFromWeights = useMemo(() => { const o = {}; criteria.forEach(c => { o[c.id] = c.weight }); return o }, [criteria])
  const likertFromWeights = useMemo(() => { const mx = Math.max(...criteria.map(c => c.weight), 1); const o = {}; criteria.forEach(c => { o[c.id] = Math.max(1, Math.min(6, Math.round((c.weight / mx) * 6))) }); return o }, [criteria])

  // ─── Alternatives ───────────────────────────────────────────────────────────
  const addAlternative = () => setAlternatives(p => [...p, { id: uid('a'), name: '', description: '' }])
  const updateAlternative = (id, f, v) => setAlternatives(p => p.map(a => a.id === id ? { ...a, [f]: v } : a))
  const removeAlternative = (id) => { setAlternatives(p => p.filter(a => a.id !== id)); setScores(p => { const { [id]: _, ...r } = p; return r }) }
  const setScore = (aId, cId, v) => setScores(p => ({ ...p, [aId]: { ...(p[aId] || {}), [cId]: v } }))

  // ─── Load / Export ──────────────────────────────────────────────────────────
  const loadExample = (k) => { const e = EXAMPLES[k]; setTitle(e.title || ''); setProblem(e.problem); setCriteria(e.criteria.map(c => ({ ...c }))); setAlternatives(e.alternatives.map(a => ({ ...a }))); setScores(JSON.parse(JSON.stringify(e.scores))); setSensitivityResults(null); setLikertRatings({}); setExampleOpen(false) }
  const exportJSON = () => { const b = new Blob([JSON.stringify({ v: 2, title, problem, criteria, alternatives, scores }, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'mcda.json'; a.click(); URL.revokeObjectURL(u) }
  const fileRef = useRef(null)
  const importJSON = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); setTitle(d.title || ''); setProblem(d.problem || ''); setCriteria(d.criteria || []); setAlternatives(d.alternatives || []); setScores(d.scores || {}); setSensitivityResults(null); setLikertRatings({}) } catch { alert('Invalid JSON') } }; r.readAsText(f); e.target.value = '' }

  const scrollTo = (id) => { if (!unlocked[id]) return; sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const sectionIdx = SECTIONS.findIndex(s => s.id === activeSection)

  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">

      {/* ━━━ Sticky Header ━━━ */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-11">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center shrink-0"><Target size={13} className="text-white" /></div>
              {title ? (
                <span className="text-sm font-bold text-slate-800 truncate">{title}</span>
              ) : (
                <span className="text-sm font-bold text-slate-400 italic">Untitled Decision</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input ref={fileRef} type="file" accept=".json" onChange={importJSON} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition flex items-center gap-1"><Upload size={11} /> Import</button>
              <button onClick={exportJSON} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition flex items-center gap-1"><Download size={11} /> Export</button>
              <div className="relative" ref={exRef}>
                <button onClick={() => setExampleOpen(!exampleOpen)} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition flex items-center gap-1">Examples <ChevronDown size={11} /></button>
                {exampleOpen && (
                  <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 min-w-[200px]">
                    <button onClick={() => loadExample('apartment')} className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 rounded-t-lg transition">🏠 Berlin Apartment</button>
                    <button onClick={() => loadExample('dataplatform')} className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 rounded-b-lg border-t border-slate-100 transition">💾 Data Platform</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Nav */}
          <nav className="flex items-center gap-1 pb-2 overflow-x-auto">
            {SECTIONS.map((s) => {
              const ok = unlocked[s.id]; const active = activeSection === s.id
              return (
                <button key={s.id} onClick={() => scrollTo(s.id)} disabled={!ok}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                    !ok ? 'text-slate-300 cursor-not-allowed' : active ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  {!ok && <Lock size={9} />}
                  <span className="tabular-nums">{s.num}</span> {s.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* ━━━ Main ━━━ */}
      <main className="max-w-5xl mx-auto px-4 pt-8 pb-32">
        {SECTIONS.map((sec, idx) => {
          const ok = unlocked[sec.id]
          const active = activeSection === sec.id
          const done = sectionIdx > idx && ok
          return (
            <div key={sec.id} ref={el => sectionRefs.current[sec.id] = el} style={{ scrollMarginTop: '6rem' }}>
              {/* ── Centered journey node ── */}
              <div className="flex flex-col items-center">
                {idx > 0 && <div className={`w-px h-8 transition-colors duration-500 ${done || active ? 'bg-primary/30' : ok ? 'bg-slate-300' : 'bg-slate-200'}`} />}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2 ${
                  !ok ? 'bg-slate-100 text-slate-300 border-slate-200'
                  : active ? 'bg-primary text-white border-primary shadow-xl shadow-primary/25 scale-115 ring-4 ring-primary/10'
                  : done ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-white text-slate-400 border-slate-300'
                }`}>
                  {!ok ? <Lock size={13} /> : sec.num}
                </div>
                <div className={`mt-1 text-[11px] font-semibold transition-colors ${!ok ? 'text-slate-300' : active ? 'text-primary' : 'text-slate-400'}`}>{sec.label}</div>
                <div className={`w-px h-3 ${!ok ? 'bg-slate-200' : active ? 'bg-primary/30' : 'bg-slate-200'}`} />
              </div>

              {/* ── Content card ── */}
              <div className={`transition-all duration-300 mb-1 ${!ok ? 'opacity-30 pointer-events-none select-none' : ''}`}>
                <div className={`bg-white rounded-2xl border transition-all duration-300 ${
                  active && ok ? 'border-primary/30 shadow-xl shadow-primary/[0.06] ring-1 ring-primary/10' : 'border-slate-200 shadow-sm'
                }`}>
                  <div className="p-5 sm:p-6">

                    {/* ═══ 1. PROBLEM ═══ */}
                    {sec.id === 'problem' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Decision Title</label>
                          <input
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-base font-bold bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition placeholder:text-slate-300 placeholder:font-normal"
                            placeholder="e.g. 'Berlin Apartment Selection'"
                            value={title} onChange={e => setTitle(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Description</label>
                          <textarea
                            className="w-full border border-slate-200 rounded-xl p-3.5 text-sm bg-white resize-y min-h-[70px] focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition placeholder:text-slate-300"
                            placeholder="What are you trying to decide? (min. 5 characters to unlock next steps)"
                            value={problem} onChange={e => setProblem(e.target.value)}
                          />
                        </div>
                        {problem.length > 0 && problem.trim().length < 5 && (
                          <p className="text-[11px] text-amber-500">Keep typing — need 5+ characters to unlock.</p>
                        )}
                      </div>
                    )}

                    {/* ═══ 2. CRITERIA ═══ */}
                    {sec.id === 'criteria' && (
                      <div className="space-y-1">
                        <p className="text-[11px] text-slate-400 mb-2">Drag ⠿ to reorder priority. Toggle max/min.</p>
                        {criteria.map((c, i) => (
                          <div key={c.id} draggable onDragStart={e => onDragStart(e, i)} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={e => onDrop(e, i)}
                            className={`flex items-center gap-2 group rounded-lg px-1 py-1.5 transition ${dragCrit === i ? 'opacity-20 scale-95' : 'hover:bg-slate-50'}`}>
                            <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"><GripVertical size={15} /></div>
                            <span className="text-[11px] text-slate-400 w-4 text-right font-mono">{i + 1}</span>
                            <input className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 transition" value={c.name} onChange={e => updateCriterion(c.id, 'name', e.target.value)} placeholder="Criterion name…" />
                            <button onClick={() => updateCriterion(c.id, 'direction', c.direction === 'maximize' ? 'minimize' : 'maximize')}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition min-w-[85px] justify-center ${c.direction === 'maximize' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                              {c.direction === 'maximize' ? <><TrendingUp size={12} /> Max</> : <><TrendingDown size={12} /> Min</>}
                            </button>
                            <button onClick={() => removeCriterion(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"><Trash2 size={14} /></button>
                          </div>
                        ))}
                        <button onClick={addCriterion} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition mt-1 ml-7"><Plus size={14} /> Add Criterion</button>
                      </div>
                    )}

                    {/* ═══ 3. WEIGHTS ═══ */}
                    {sec.id === 'weights' && (
                      <div className="space-y-4">
                        <p className="text-[11px] text-slate-400">Relative importance — auto-normalized to 100%.</p>
                        <button onClick={() => setWeightMethodOpen(!weightMethodOpen)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${weightMethodOpen ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/15'}`}>
                          <Sliders size={13} /> {weightMethodOpen ? 'Close Method Panel' : 'Open Method Panel'}
                          <ChevronRight size={12} className={`transition-transform duration-200 ${weightMethodOpen ? 'rotate-90' : ''}`} />
                        </button>

                        <div className={`flex gap-5 ${weightMethodOpen ? 'flex-col lg:flex-row' : ''}`}>
                          {weightMethodOpen && (
                            <div className="lg:w-[45%] bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                              <div className="flex gap-1">
                                {['direct', 'likert'].map(m => (
                                  <button key={m} onClick={() => setWeightMethod(m)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${weightMethod === m ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                                    {m === 'direct' ? 'Direct Rating' : 'Likert Scale'}
                                  </button>
                                ))}
                              </div>
                              {weightMethod === 'direct' ? (
                                <div className="space-y-2">
                                  <p className="text-[10px] text-slate-400">Rate 0–100. Updates live →</p>
                                  {criteria.map(c => (
                                    <div key={c.id} className="flex items-center gap-2">
                                      <span className="text-[11px] w-28 truncate font-medium text-slate-700">{c.name || '—'}</span>
                                      <input type="range" min="0" max="100" value={directFromWeights[c.id] || 0} onChange={e => setWeightDirect(c.id, parseInt(e.target.value))} className="flex-1 accent-primary h-1.5" />
                                      <input type="number" min="0" max="100" value={directFromWeights[c.id] || 0} onChange={e => setWeightDirect(c.id, Math.max(0, parseInt(e.target.value) || 0))} className="w-11 border border-slate-200 rounded-md px-1 py-0.5 text-[11px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/25" />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  <p className="text-[10px] text-slate-400">Rate 1–6. Updates live →</p>
                                  {criteria.map(c => {
                                    const cur = likertRatings[c.id] || likertFromWeights[c.id] || 3
                                    return (
                                      <div key={c.id}>
                                        <span className="text-[11px] font-medium text-slate-700">{c.name || '—'}</span>
                                        <div className="flex gap-0.5 mt-1">
                                          {LIKERT.map(l => (
                                            <button key={l.value} onClick={() => setLikertRating(c.id, l.value)} title={l.label}
                                              className={`flex-1 py-1 rounded-md text-[10px] font-bold transition border ${cur === l.value ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}>
                                              {l.value}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                          <div className={weightMethodOpen ? 'lg:w-[55%]' : 'w-full'}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-[11px] font-mono font-bold ${totalWeight > 0 ? 'text-slate-500' : 'text-slate-300'}`}>Σ = {totalWeight} → normalized to 100%</span>
                            </div>
                            <div className="space-y-1.5">
                              {normalizedWeights.map(c => (
                                <div key={c.id} className="flex items-center gap-2">
                                  <span className="text-[11px] w-28 truncate font-medium text-slate-700">{c.name || '—'}</span>
                                  <div className="flex-1 bg-slate-100 rounded-full h-[18px] overflow-hidden relative">
                                    <div className="h-full bg-primary/70 rounded-full transition-all duration-300 ease-out" style={{ width: `${c.pct}%` }} />
                                    {c.pct > 5 && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-sm">{c.pct.toFixed(1)}%</span>}
                                  </div>
                                  {!weightMethodOpen && (
                                    <input type="number" min="0" max="999" value={c.weight} onChange={e => updateCriterion(c.id, 'weight', Math.max(0, parseInt(e.target.value) || 0))} className="w-11 border border-slate-200 rounded-md px-1 py-0.5 text-[11px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/25" />
                                  )}
                                  {weightMethodOpen && <span className="text-[11px] font-mono text-slate-400 w-11 text-right">{c.pct.toFixed(0)}%</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ═══ 4. ALTERNATIVES (table) ═══ */}
                    {sec.id === 'alternatives' && (
                      <div>
                        <p className="text-[11px] text-slate-400 mb-3">What options are you comparing?</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 px-2 w-8 text-[10px] text-slate-400 font-medium">#</th>
                                <th className="text-left py-2 px-2 w-8"></th>
                                <th className="text-left py-2 px-2 text-[10px] text-slate-400 font-medium uppercase tracking-wide">Name</th>
                                <th className="text-left py-2 px-2 text-[10px] text-slate-400 font-medium uppercase tracking-wide">Description</th>
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {alternatives.map((a, i) => (
                                <tr key={a.id} className="border-b border-slate-100 group hover:bg-slate-50/50 transition">
                                  <td className="py-2 px-2 text-[11px] text-slate-400 font-mono">{i + 1}</td>
                                  <td className="py-2 px-1">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: ALT_COLORS[i % ALT_COLORS.length] }}>{String.fromCharCode(65 + i)}</div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 transition" value={a.name} onChange={e => updateAlternative(a.id, 'name', e.target.value)} placeholder="Alternative name" />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 transition" value={a.description} onChange={e => updateAlternative(a.id, 'description', e.target.value)} placeholder="Short description (optional)" />
                                  </td>
                                  <td className="py-2 px-2">
                                    <button onClick={() => removeAlternative(a.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"><Trash2 size={14} /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button onClick={addAlternative} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition mt-3"><Plus size={14} /> Add Alternative</button>
                      </div>
                    )}

                    {/* ═══ 5. SCORING (transposed + stepper) ═══ */}
                    {sec.id === 'scoring' && (
                      <div>
                        <p className="text-[11px] mb-3">
                          {scoringComplete ? <span className="text-emerald-600 font-semibold">✓ All cells filled — results live below.</span> : <span className="text-slate-400">Enter raw performance values. Use +/− buttons or type directly.</span>}
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr>
                                <th className="text-left py-2 px-2 bg-slate-50/80 rounded-tl-lg font-medium text-[10px] text-slate-400 uppercase tracking-wide min-w-[150px] sticky left-0 z-10">Criterion</th>
                                {alternatives.map((a, i) => (
                                  <th key={a.id} className="text-center py-2 px-2 bg-slate-50/80 font-semibold text-xs min-w-[100px]">
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: ALT_COLORS[i % ALT_COLORS.length] }} />
                                      <span className="truncate max-w-[80px]">{a.name || '—'}</span>
                                    </span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {criteria.map((c, ci) => (
                                <tr key={c.id} className={ci % 2 ? 'bg-slate-50/30' : ''}>
                                  <td className={`py-2 px-2 sticky left-0 z-10 ${ci % 2 ? 'bg-slate-50/30' : 'bg-white'}`}>
                                    <div className="text-xs font-medium text-slate-700">{c.name || '—'}</div>
                                    <div className={`text-[10px] ${c.direction === 'maximize' ? 'text-emerald-500' : 'text-blue-500'}`}>{c.direction === 'maximize' ? '▲ higher better' : '▼ lower better'}</div>
                                  </td>
                                  {alternatives.map(a => (
                                    <td key={a.id} className="py-2 px-2 text-center">
                                      <StepperInput value={scores[a.id]?.[c.id]} onChange={v => setScore(a.id, c.id, v)} />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ═══ 6. RESULTS (combined stacked bar) ═══ */}
                    {sec.id === 'results' && (
                      <div className="space-y-5">
                        {mcda.ranking.length > 0 && (
                          <div className="bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border border-primary/15 rounded-xl p-4 flex items-center gap-3">
                            <Trophy size={28} className="text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="text-base font-bold text-slate-800 truncate">{mcda.ranking[0].name}</div>
                              <div className="text-xs text-slate-500">Weighted Utility: <span className="font-mono font-bold text-primary">{(mcda.ranking[0].utility * 100).toFixed(1)}%</span></div>
                            </div>
                          </div>
                        )}

                        {/* Combined stacked bar chart (replaces separate bar + decomposition) */}
                        <div className="bg-slate-50 rounded-xl p-4">
                          <h4 className="text-xs font-semibold text-slate-600 mb-3">Utility Breakdown by Criterion</h4>
                          <ResponsiveContainer width="100%" height={Math.max(160, mcda.ranking.length * 50)}>
                            <BarChart
                              data={mcda.ranking.map(r => {
                                const d = { name: r.name, _total: Math.round(r.utility * 1000) / 10 }
                                criteria.forEach(c => { d[c.name] = Math.round((r.partWorths[c.id] || 0) * 1000) / 10 })
                                return d
                              })}
                              layout="vertical" margin={{ left: 100, right: 50 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={100} />
                              <Tooltip formatter={v => `${v}%`} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              {criteria.map((c, i) => <Bar key={c.id} dataKey={c.name} stackId="a" fill={ALT_COLORS[i % ALT_COLORS.length]} radius={i === criteria.length - 1 ? [0, 4, 4, 0] : undefined} />)}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Ranking detail table with part-worths inline */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b-2 border-slate-200">
                                <th className="text-left py-2 px-2 w-6 text-slate-400">#</th>
                                <th className="text-left py-2 px-2 text-slate-700">Alternative</th>
                                {criteria.map(c => (
                                  <th key={c.id} className="text-center py-2 px-1 text-[10px] text-slate-400 font-medium">
                                    <div className="truncate max-w-[70px] mx-auto" title={c.name}>{c.name}</div>
                                    <div className="text-[9px] text-slate-300 font-normal">{normalizedWeights.find(w => w.id === c.id)?.pct.toFixed(0)}%</div>
                                  </th>
                                ))}
                                <th className="text-right py-2 px-2 text-slate-700 font-bold">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mcda.ranking.map((r, i) => (
                                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition">
                                  <td className="py-2.5 px-2">
                                    <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold ${i < 3 ? 'text-white' : 'bg-slate-200 text-slate-500'}`} style={i < 3 ? { backgroundColor: RANK_COLORS[i] } : {}}>{i + 1}</span>
                                  </td>
                                  <td className="py-2.5 px-2 font-semibold text-sm text-slate-800">{r.name}</td>
                                  {criteria.map(c => {
                                    const pw = r.partWorths[c.id] || 0
                                    return (
                                      <td key={c.id} className="py-2.5 px-1 text-center">
                                        <span className="font-mono text-[11px] text-slate-600">{(pw * 100).toFixed(1)}</span>
                                      </td>
                                    )
                                  })}
                                  <td className="py-2.5 px-2 text-right"><span className="font-mono font-bold text-primary text-sm">{(r.utility * 100).toFixed(1)}%</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-600 flex items-start gap-1.5">
                          <Info size={11} className="shrink-0 mt-0.5" /><span><strong>Method:</strong> Min-max normalization [0,1]. Utility = Σ(norm × weight). Part-worth = each criterion's utility contribution.</span>
                        </div>
                      </div>
                    )}

                    {/* ═══ 7. ANALYSIS ═══ */}
                    {sec.id === 'analysis' && (
                      <div className="space-y-5">
                        <p className="text-[11px] text-slate-400">Sweeps each criterion's weight 0→100% and detects where ranking flips.</p>
                        <button onClick={() => setSensitivityResults(runFullSensitivity(criteria, alternatives, scores))} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition shadow-sm"><Zap size={14} /> Run Full Sensitivity Analysis</button>
                        {sensitivityResults && (<>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {sensitivityResults.map(sr => (
                              <div key={sr.criterion.id} className={`rounded-xl p-3.5 border text-xs ${sr.isStable ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                                <div className="font-semibold text-slate-700 mb-0.5">{sr.criterion.name}</div>
                                <div className="text-slate-500">Current weight: <span className="font-mono font-bold">{sr.currentWeight}</span></div>
                                {sr.isStable ? <div className="text-emerald-700 font-semibold mt-1.5">✓ Stable — winner doesn't change</div> : <div className="text-amber-700 font-semibold mt-1.5">⚠ Ranking flips at <span className="font-mono">{sr.breakpoint}%</span> → {sr.breakWinner} wins</div>}
                              </div>
                            ))}
                          </div>
                          {sensitivityResults.map(sr => (
                            <div key={sr.criterion.id} className="bg-slate-50 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-slate-700">{sr.criterion.name}</h4>
                                {!sr.isStable && <span className="text-[10px] font-mono bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">flip @ {sr.breakpoint}%</span>}
                              </div>
                              <ResponsiveContainer width="100%" height={190}>
                                <LineChart data={sr.sweepData} margin={{ left: 5, right: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="weight" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} domain={[0, 100]} /><Tooltip formatter={v => `${v}%`} labelFormatter={v => `Weight: ${v}%`} /><Legend wrapperStyle={{ fontSize: 10 }} />
                                  <ReferenceLine x={sr.currentWeight} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'now', fontSize: 9, fill: '#64748b' }} />
                                  {!sr.isStable && <ReferenceLine x={sr.breakpoint} stroke="#e84040" strokeDasharray="4 4" label={{ value: 'flip', fontSize: 9, fill: '#e84040' }} />}
                                  {alternatives.map((a, i) => <Line key={a.id} type="monotone" dataKey={a.name} stroke={ALT_COLORS[i % ALT_COLORS.length]} strokeWidth={2} dot={false} />)}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ))}
                          <div className="bg-primary/5 border border-primary/15 rounded-xl p-3.5 text-xs">
                            <strong>Summary:</strong>{' '}
                            {(() => {
                              const st = sensitivityResults.filter(s => s.isStable).length; const tot = sensitivityResults.length; const w = mcda.ranking[0]?.name || '—'; const un = sensitivityResults.filter(s => !s.isStable)
                              if (st === tot) return <>{w} is <span className="text-emerald-600 font-semibold">robust</span> — no single criterion flips the ranking.</>
                              return <>{w} wins but is <span className="text-amber-600 font-semibold">sensitive</span> to: {un.map((s, i) => <React.Fragment key={s.criterion.id}>{i > 0 && ', '}<strong>{s.criterion.name}</strong> ({s.breakpoint}%)</React.Fragment>)}. Stable in {st}/{tot}.</>
                            })()}
                          </div>
                        </>)}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}
