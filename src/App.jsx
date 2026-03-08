import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell, ReferenceLine
} from 'recharts'
import {
  Plus, Trash2, Upload, Download, ChevronDown, Trophy, Info, X,
  TrendingUp, TrendingDown, Zap, Target, GripVertical,
  ChevronRight, ChevronUp, Sliders, Lock, Minus, Shuffle
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

function runMultiCriteriaSensitivity(criteria, alternatives, scores, selectedIds) {
  if (criteria.length < 2 || alternatives.length < 2 || selectedIds.length < 2) return null
  const N = 2000
  const base = computeMCDA(criteria, alternatives, scores)
  const baseWinnerId = base.ranking[0]?.id
  const winCount = {}
  alternatives.forEach(a => { winCount[a.id] = { id: a.id, name: a.name, count: 0 } })
  let flipCount = 0
  for (let sim = 0; sim < N; sim++) {
    const overrides = {}
    if (selectedIds.length === criteria.length) {
      const exps = criteria.map(() => -Math.log(Math.random() + 1e-12))
      const total = exps.reduce((s, v) => s + v, 0)
      criteria.forEach((c, i) => { overrides[c.id] = (exps[i] / total) * 100 })
    } else {
      const selectedShare = Math.random() * 100
      const fixedShare = 100 - selectedShare
      const selExps = selectedIds.map(() => -Math.log(Math.random() + 1e-12))
      const selTotal = selExps.reduce((s, v) => s + v, 0)
      selectedIds.forEach((id, i) => { overrides[id] = (selExps[i] / selTotal) * selectedShare })
      const fixedCriteria = criteria.filter(c => !selectedIds.includes(c.id))
      const fixedOrigTotal = fixedCriteria.reduce((s, c) => s + c.weight, 0)
      fixedCriteria.forEach(c => {
        overrides[c.id] = fixedOrigTotal > 0 ? (c.weight / fixedOrigTotal) * fixedShare : fixedShare / fixedCriteria.length
      })
    }
    const result = computeMCDA(criteria, alternatives, scores, overrides)
    const winner = result.ranking[0]?.id
    if (winner) winCount[winner].count++
    if (winner !== baseWinnerId) flipCount++
  }
  return {
    simulations: N,
    selectedCount: selectedIds.length,
    totalCriteria: criteria.length,
    winFrequency: Object.values(winCount).map(w => ({ ...w, pct: w.count / N * 100 })).sort((a, b) => b.count - a.count),
    baseWinner: base.ranking[0]?.name,
    baseWinPct: ((N - flipCount) / N * 100).toFixed(1),
    flipPct: (flipCount / N * 100).toFixed(1),
  }
}

function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x])
  const result = []
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = getCombinations(arr.slice(i + 1), k - 1)
    rest.forEach(combo => result.push([arr[i], ...combo]))
  }
  return result
}

function runCombinationSweep(criteria, alternatives, scores, selectedIds, step = 5) {
  const selected = criteria.filter(c => selectedIds.includes(c.id))
  const fixed = criteria.filter(c => !selectedIds.includes(c.id))
  const fixedTotal = fixed.reduce((s, c) => s + c.weight, 0)
  const base = computeMCDA(criteria, alternatives, scores)
  const baseWinnerId = base.ranking[0]?.id
  const k = selected.length
  if (k < 2) return null
  const winCount = {}
  alternatives.forEach(a => { winCount[a.id] = { id: a.id, name: a.name, count: 0 } })
  let totalCells = 0, flipCount = 0
  const grid = []
  const w = Array(k).fill(0)
  const go = (idx, rem) => {
    if (idx === k) {
      const ov = {}
      selected.forEach((c, i) => { ov[c.id] = w[i] })
      fixed.forEach(c => { ov[c.id] = fixedTotal > 0 ? (c.weight / fixedTotal) * rem : rem / Math.max(fixed.length, 1) })
      const r = computeMCDA(criteria, alternatives, scores, ov)
      const winner = r.ranking[0]
      totalCells++
      if (winner) winCount[winner.id].count++
      if (winner?.id !== baseWinnerId) flipCount++
      if (k === 2) grid.push({ w1: w[0], w2: w[1], winnerId: winner?.id, winnerName: winner?.name })
      return
    }
    for (let v = 0; v <= rem; v += step) { w[idx] = v; go(idx + 1, rem - v) }
  }
  go(0, 100)
  // For 2D heatmap: also add invalid cells (w1+w2>100)
  if (k === 2) {
    const steps = Math.floor(100 / step) + 1
    const fullGrid = []
    for (let xi = 0; xi < steps; xi++) {
      for (let yi = 0; yi < steps; yi++) {
        const ww1 = xi * step, ww2 = yi * step
        const existing = grid.find(g => g.w1 === ww1 && g.w2 === ww2)
        fullGrid.push(existing || { w1: ww1, w2: ww2, winnerId: null, winnerName: null })
      }
    }
    return {
      selectedIds, selectedNames: selected.map(c => c.name), k,
      grid: fullGrid, step, steps,
      winFrequency: Object.values(winCount).map(ww => ({ ...ww, pct: totalCells > 0 ? ww.count / totalCells * 100 : 0 })).sort((a, b) => b.count - a.count),
      totalCells, flipCount,
      flipPct: totalCells > 0 ? (flipCount / totalCells * 100).toFixed(1) : '0',
      baseWinner: base.ranking[0]?.name, baseWinnerId,
      baseWinPct: totalCells > 0 ? ((totalCells - flipCount) / totalCells * 100).toFixed(1) : '0',
      crit1: selected[0], crit2: selected[1],
      currentW1: selected[0]?.weight, currentW2: selected[1]?.weight,
    }
  }
  return {
    selectedIds, selectedNames: selected.map(c => c.name), k,
    grid: null, step, steps: null,
    winFrequency: Object.values(winCount).map(ww => ({ ...ww, pct: totalCells > 0 ? ww.count / totalCells * 100 : 0 })).sort((a, b) => b.count - a.count),
    totalCells, flipCount,
    flipPct: totalCells > 0 ? (flipCount / totalCells * 100).toFixed(1) : '0',
    baseWinner: base.ranking[0]?.name, baseWinnerId,
    baseWinPct: totalCells > 0 ? ((totalCells - flipCount) / totalCells * 100).toFixed(1) : '0',
    crit1: selected[0], crit2: selected[1],
    currentW1: selected[0]?.weight, currentW2: selected[1]?.weight,
  }
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
  const [pairAnswers, setPairAnswers] = useState({})
  const [pcsAnswers, setPcsAnswers] = useState({})
  const [resetConfirm, setResetConfirm] = useState(null) // null | 'likert' | 'pairwise' | 'pcs'
  const [showPcsInfo, setShowPcsInfo] = useState(false)
  const [multiSensSelected, setMultiSensSelected] = useState({})
  const [multiSensResults, setMultiSensResults] = useState(null)
  const [analysisTab, setAnalysisTab] = useState('oat')
  const [dualResults, setDualResults] = useState(null)
  const [allCritResults, setAllCritResults] = useState(null)
  const [allCritRunning, setAllCritRunning] = useState(false)
  const [allCritProgress, setAllCritProgress] = useState(null)
  const [sensStep, setSensStep] = useState(5)
  const [mcSimCount, setMcSimCount] = useState(2000)
  const [mcRunning, setMcRunning] = useState(false)
  const mcAbortRef = useRef(false)
  const exRef = useRef(null)
  const sectionRefs = useRef({})

  // ─── Dependencies ───────────────────────────────────────────────────────────
  const hasProblem = title.trim().length >= 1
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

  // Pairwise comparison pairs + AHP logic
  const pairPairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < criteria.length; i++) {
      for (let j = i + 1; j < criteria.length; j++) {
        pairs.push({ a: criteria[i], b: criteria[j] })
      }
    }
    return pairs
  }, [criteria])

  const applyPairwiseWeights = (answers) => {
    const n = criteria.length
    if (n < 2) return
    // Build AHP matrix
    const matrix = Array.from({ length: n }, () => Array(n).fill(1))
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const key = `${criteria[i].id}_${criteria[j].id}`
        const ans = answers[key] // positive = i preferred, negative = j preferred
        const val = ans || 1
        matrix[i][j] = val > 0 ? val : 1 / Math.abs(val)
        matrix[j][i] = 1 / matrix[i][j]
      }
    }
    // Compute eigenvector approximation (column normalization)
    const colSums = Array(n).fill(0)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) colSums[j] += matrix[i][j]
    const weights = Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) weights[i] += matrix[i][j] / (colSums[j] || 1)
      weights[i] /= n
    }
    setCriteria(prev => prev.map((c, i) => ({ ...c, weight: Math.round(weights[i] * 100) })))
  }

  // PCS: Pairwise Comparison Simplified (Koczkodaj & Szybowski 2015)
  // Only n−1 adjacent pairs (PC principal generators) → always consistent
  const pcsAdjacentPairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < criteria.length - 1; i++) {
      pairs.push({ a: criteria[i], b: criteria[i + 1] })
    }
    return pairs
  }, [criteria])

  const applyPCSWeights = (answers) => {
    const n = criteria.length
    if (n < 2) return
    // Build n×n matrix from n−1 adjacent pair judgments
    const matrix = Array.from({ length: n }, () => Array(n).fill(1))
    // Step 1: Fill superdiagonal from answers
    for (let i = 0; i < n - 1; i++) {
      const key = `${criteria[i].id}_${criteria[i + 1].id}`
      const ans = answers[key] || 1
      matrix[i][i + 1] = ans > 0 ? ans : 1 / Math.abs(ans)
    }
    // Step 2: Fill rest via transitivity — m[i][l] = ∏ m[j][j+1] for j=i..l−1
    for (let i = 0; i < n - 1; i++) {
      for (let l = i + 2; l < n; l++) {
        let product = 1
        for (let j = i; j < l; j++) product *= matrix[j][j + 1]
        matrix[i][l] = product
      }
    }
    // Step 3: Fill lower triangle via reciprocity — m[l][i] = 1/m[i][l]
    for (let i = 0; i < n; i++) {
      for (let l = i + 1; l < n; l++) matrix[l][i] = 1 / matrix[i][l]
    }
    // Step 4: Geometric mean of each row → normalize → weights
    const geoMeans = []
    for (let i = 0; i < n; i++) {
      let product = 1
      for (let j = 0; j < n; j++) product *= matrix[i][j]
      geoMeans.push(Math.pow(product, 1 / n))
    }
    const total = geoMeans.reduce((s, v) => s + v, 0)
    setCriteria(prev => prev.map((c, i) => ({ ...c, weight: total > 0 ? Math.round((geoMeans[i] / total) * 100) : 0 })))
  }

  const handleMethodSwitch = (newMethod) => {
    if (newMethod === 'direct') {
      setWeightMethod('direct')
      setResetConfirm(null)
      return
    }
    // For likert, pairwise & pcs: warn that weights will be reset
    if (newMethod === 'likert' || newMethod === 'pairwise' || newMethod === 'pcs') {
      if (totalWeight > 0) {
        setResetConfirm(newMethod)
        return
      }
    }
    confirmMethodSwitch(newMethod)
  }
  const confirmMethodSwitch = (method) => {
    setWeightMethod(method)
    setResetConfirm(null)
    if (method === 'pairwise') { setPairAnswers({}); applyPairwiseWeights({}) }
    if (method === 'pcs') { setPcsAnswers({}); applyPCSWeights({}) }
    if (method === 'likert') { setLikertRatings({}) }
  }

  // ─── Monte Carlo (animated) ────────────────────────────────────────────────
  const startMonteCarlo = () => {
    const selIds = criteria.filter(c => multiSensSelected[c.id] !== false).map(c => c.id)
    if (selIds.length < 2) return
    const crit = criteria.map(c => ({ ...c }))
    const alts = alternatives.map(a => ({ ...a }))
    const scr = JSON.parse(JSON.stringify(scores))
    const base = computeMCDA(crit, alts, scr)
    const baseWinnerId = base.ranking[0]?.id
    const baseName = base.ranking[0]?.name
    const totalSims = mcSimCount
    const wc = {}
    alts.forEach(a => { wc[a.id] = { id: a.id, name: a.name, count: 0 } })
    let flipCount = 0, done = 0
    mcAbortRef.current = false
    setMcRunning(true)
    setMultiSensResults(null)
    const tick = () => {
      if (mcAbortRef.current) { setMcRunning(false); return }
      const batch = Math.min(100, totalSims - done)
      for (let i = 0; i < batch; i++) {
        const ov = {}
        if (selIds.length === crit.length) {
          const e = crit.map(() => -Math.log(Math.random() + 1e-12))
          const t = e.reduce((a, b) => a + b, 0)
          crit.forEach((c, j) => { ov[c.id] = (e[j] / t) * 100 })
        } else {
          const ss = Math.random() * 100, fs = 100 - ss
          const e = selIds.map(() => -Math.log(Math.random() + 1e-12))
          const t = e.reduce((a, b) => a + b, 0)
          selIds.forEach((id, j) => { ov[id] = (e[j] / t) * ss })
          const fc = crit.filter(c => !selIds.includes(c.id))
          const ft = fc.reduce((a, c) => a + c.weight, 0)
          fc.forEach(c => { ov[c.id] = ft > 0 ? (c.weight / ft) * fs : fs / fc.length })
        }
        const r = computeMCDA(crit, alts, scr, ov)
        const w = r.ranking[0]?.id
        if (w) wc[w].count++
        if (w !== baseWinnerId) flipCount++
        done++
      }
      setMultiSensResults({
        simulations: done, totalPlanned: totalSims,
        selectedCount: selIds.length, totalCriteria: crit.length,
        winFrequency: Object.values(wc).map(w => ({ ...w, pct: done > 0 ? w.count / done * 100 : 0 })).sort((a, b) => b.count - a.count),
        baseWinner: baseName,
        baseWinPct: done > 0 ? ((done - flipCount) / done * 100).toFixed(1) : '0',
        flipPct: done > 0 ? (flipCount / done * 100).toFixed(1) : '0',
      })
      if (done < totalSims) { setTimeout(tick, 16) } else { setMcRunning(false) }
    }
    tick()
  }

  // ─── Dual + All-Criteria Sweeps ────────────────────────────────────────────
  const runAllDualSweeps = () => {
    const results = []
    for (let i = 0; i < criteria.length; i++) {
      for (let j = i + 1; j < criteria.length; j++) {
        const r = runCombinationSweep(criteria, alternatives, scores, [criteria[i].id, criteria[j].id], sensStep)
        if (r) results.push(r)
      }
    }
    results.sort((a, b) => parseFloat(a.baseWinPct) - parseFloat(b.baseWinPct))
    setDualResults(results)
  }

  const startAllCritSweep = () => {
    const ids = criteria.map(c => c.id)
    const allCombos = []
    for (let k = 2; k <= ids.length; k++) {
      getCombinations(ids, k).forEach(combo => allCombos.push(combo))
    }
    const crit = criteria.map(c => ({ ...c }))
    const alts = alternatives.map(a => ({ ...a }))
    const scr = JSON.parse(JSON.stringify(scores))
    const step = sensStep
    setAllCritRunning(true)
    setAllCritResults([])
    setAllCritProgress({ done: 0, total: allCombos.length })
    let idx = 0
    const results = []
    const tick = () => {
      if (idx >= allCombos.length) {
        results.sort((a, b) => parseFloat(a.baseWinPct) - parseFloat(b.baseWinPct))
        setAllCritResults([...results])
        setAllCritRunning(false)
        return
      }
      const combo = allCombos[idx]
      const result = runCombinationSweep(crit, alts, scr, combo, step)
      if (result) results.push(result)
      idx++
      const sorted = [...results].sort((a, b) => parseFloat(a.baseWinPct) - parseFloat(b.baseWinPct))
      setAllCritResults(sorted)
      setAllCritProgress({ done: idx, total: allCombos.length })
      setTimeout(tick, 0)
    }
    tick()
  }

  // ─── Alternatives ───────────────────────────────────────────────────────────
  const addAlternative = () => setAlternatives(p => [...p, { id: uid('a'), name: '', description: '' }])
  const updateAlternative = (id, f, v) => setAlternatives(p => p.map(a => a.id === id ? { ...a, [f]: v } : a))
  const removeAlternative = (id) => { setAlternatives(p => p.filter(a => a.id !== id)); setScores(p => { const { [id]: _, ...r } = p; return r }) }
  const setScore = (aId, cId, v) => setScores(p => ({ ...p, [aId]: { ...(p[aId] || {}), [cId]: v } }))

  // ─── Load / Export ──────────────────────────────────────────────────────────
  const loadExample = (k) => { const e = EXAMPLES[k]; setTitle(e.title || ''); setProblem(e.problem); setCriteria(e.criteria.map(c => ({ ...c }))); setAlternatives(e.alternatives.map(a => ({ ...a }))); setScores(JSON.parse(JSON.stringify(e.scores))); setSensitivityResults(null); setLikertRatings({}); setPairAnswers({}); setPcsAnswers({}); setExampleOpen(false) }
  const exportJSON = () => { const b = new Blob([JSON.stringify({ v: 2, title, problem, criteria, alternatives, scores }, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'mcda.json'; a.click(); URL.revokeObjectURL(u) }
  const fileRef = useRef(null)
  const importJSON = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); setTitle(d.title || ''); setProblem(d.problem || ''); setCriteria(d.criteria || []); setAlternatives(d.alternatives || []); setScores(d.scores || {}); setSensitivityResults(null); setLikertRatings({}); setPairAnswers({}); setPcsAnswers({}) } catch { alert('Invalid JSON') } }; r.readAsText(f); e.target.value = '' }

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
                    {/* Section heading */}
                    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-sm font-bold text-primary shrink-0">{sec.num}</span>
                      <h3 className="text-[15px] font-bold text-slate-800 tracking-tight">{sec.label}</h3>
                    </div>

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
                        {title.length > 0 && title.trim().length < 1 && (
                          <p className="text-[11px] text-amber-500">Enter a title to unlock next steps.</p>
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

                        {/* Toggle method panel */}
                        <button onClick={() => setWeightMethodOpen(!weightMethodOpen)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${weightMethodOpen ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/15'}`}>
                          <Sliders size={13} /> {weightMethodOpen ? 'Close Method Panel' : 'Open Method Panel'}
                          <ChevronRight size={12} className={`transition-transform duration-200 ${weightMethodOpen ? 'rotate-90' : ''}`} />
                        </button>

                        {/* Reset confirmation dialog */}
                        {resetConfirm && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                            <div className="text-sm font-semibold text-amber-800">Reset current weights?</div>
                            <p className="text-xs text-amber-700">
                              {resetConfirm === 'likert'
                                ? 'The Likert scale uses discrete 1–6 ratings which cannot precisely represent arbitrary continuous weight values. Switching will reset your current weights and start fresh from the Likert inputs.'
                                : resetConfirm === 'pcs'
                                ? 'PC Simplified uses only n−1 adjacent comparisons (Koczkodaj & Szybowski, 2015) to reconstruct a fully consistent matrix. This resets your current weights.'
                                : 'Pairwise comparison derives weights from relative preference judgments. This process starts from scratch and will overwrite your current weights with the computed result.'}
                            </p>
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => setResetConfirm(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
                              <button onClick={() => confirmMethodSwitch(resetConfirm)} className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition">Reset & Continue</button>
                            </div>
                          </div>
                        )}

                        {/* Method panel (above the bars) */}
                        {weightMethodOpen && !resetConfirm && (
                          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                            <div className="flex gap-1 flex-wrap">
                              {[
                                { id: 'direct', label: 'Direct Rating' },
                                { id: 'likert', label: 'Likert Scale' },
                                { id: 'pairwise', label: 'Pairwise (AHP)' },
                                { id: 'pcs', label: 'PC Simplified' },
                              ].map(m => (
                                <button key={m.id} onClick={() => handleMethodSwitch(m.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${weightMethod === m.id ? 'bg-primary text-white' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                                  {m.label}
                                </button>
                              ))}
                            </div>

                            {/* Direct Rating */}
                            {weightMethod === 'direct' && (
                              <div className="space-y-2">
                                <p className="text-[10px] text-slate-400">Rate each criterion 0–100. Weights update live below.</p>
                                {criteria.map(c => (
                                  <div key={c.id} className="flex items-center gap-2">
                                    <span className="text-[11px] w-32 truncate font-medium text-slate-700">{c.name || '—'}</span>
                                    <input type="range" min="0" max="100" value={directFromWeights[c.id] || 0} onChange={e => setWeightDirect(c.id, parseInt(e.target.value))} className="flex-1 accent-primary h-1.5" />
                                    <input type="number" min="0" max="100" value={directFromWeights[c.id] || 0} onChange={e => setWeightDirect(c.id, Math.max(0, parseInt(e.target.value) || 0))} className="w-12 border border-slate-200 rounded-md px-1 py-0.5 text-[11px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/25" />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Likert Scale */}
                            {weightMethod === 'likert' && (
                              <div className="space-y-2.5">
                                <p className="text-[10px] text-slate-400">Rate each criterion's importance 1–6. Weights update live below.</p>
                                {criteria.map(c => {
                                  const cur = likertRatings[c.id] || 3
                                  return (
                                    <div key={c.id}>
                                      <span className="text-[11px] font-medium text-slate-700">{c.name || '—'}</span>
                                      <div className="flex gap-0.5 mt-1">
                                        {LIKERT.map(l => (
                                          <button key={l.value} onClick={() => setLikertRating(c.id, l.value)} title={l.label}
                                            className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition border ${cur === l.value ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}>
                                            {l.value}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="flex justify-between text-[9px] text-slate-300 mt-0.5 px-0.5"><span>Not important</span><span>Critical</span></div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Pairwise Comparison — full list view */}
                            {weightMethod === 'pairwise' && (
                              <div className="space-y-3">
                                {pairPairs.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Need at least 2 criteria for pairwise comparison.</p>
                                ) : (
                                  <>
                                    <p className="text-[10px] text-slate-400">
                                      Compare each pair — which criterion is more important? Default is <strong>1 (equal)</strong>.
                                      {Object.keys(pairAnswers).length < pairPairs.length && <span className="text-amber-500 font-medium"> Highlighted pairs still at default.</span>}
                                    </p>

                                    {/* Progress */}
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(Object.keys(pairAnswers).length / pairPairs.length) * 100}%` }} />
                                      </div>
                                      <span className="text-[10px] font-mono text-slate-400">{Object.keys(pairAnswers).length} / {pairPairs.length} rated</span>
                                    </div>

                                    {/* All pairs list */}
                                    <div className="space-y-2">
                                      {pairPairs.map((pair, idx) => {
                                        const key = `${pair.a.id}_${pair.b.id}`
                                        const answered = key in pairAnswers
                                        const currentVal = pairAnswers[key] ?? 1
                                        const scaleValues = [9, 7, 5, 3, 1, -3, -5, -7, -9]
                                        return (
                                          <div key={key} className={`rounded-xl p-3 border transition-all ${answered ? 'bg-white border-slate-200' : 'bg-amber-50/50 border-amber-200/70 ring-1 ring-amber-100'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className="text-[10px] font-mono text-slate-300 w-4 text-right shrink-0">{idx + 1}.</span>
                                              <span className="text-[11px] font-bold text-primary flex-1 truncate">{pair.a.name || '—'}</span>
                                              <span className="text-[10px] text-slate-300 font-medium shrink-0">vs</span>
                                              <span className="text-[11px] font-bold text-secondary flex-1 truncate text-right">{pair.b.name || '—'}</span>
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                              <span className="text-[8px] text-primary w-4 text-center shrink-0 font-bold">◀</span>
                                              {scaleValues.map(val => {
                                                const isSelected = currentVal === val
                                                const isCenter = val === 1
                                                const isLeft = val > 1
                                                return (
                                                  <button key={val}
                                                    onClick={() => {
                                                      const newAnswers = { ...pairAnswers, [key]: val }
                                                      setPairAnswers(newAnswers)
                                                      applyPairwiseWeights(newAnswers)
                                                    }}
                                                    title={`${Math.abs(val)} — ${val === 1 ? 'Equal' : val > 0 ? pair.a.name + ' preferred' : pair.b.name + ' preferred'}`}
                                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold transition border ${
                                                      isSelected
                                                        ? isCenter ? 'border-slate-600 bg-slate-600 text-white shadow-sm'
                                                          : isLeft ? 'border-primary bg-primary text-white shadow-sm'
                                                          : 'border-secondary bg-secondary text-white shadow-sm'
                                                        : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                                                    }`}
                                                  >
                                                    {Math.abs(val)}
                                                  </button>
                                                )
                                              })}
                                              <span className="text-[8px] text-secondary w-4 text-center shrink-0 font-bold">▶</span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>

                                    {Object.keys(pairAnswers).length === pairPairs.length && (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                                        <span>✓</span> All {pairPairs.length} pairs rated — AHP eigenvector weights applied.
                                      </div>
                                    )}

                                    <button onClick={() => { setPairAnswers({}); applyPairwiseWeights({}) }} className="text-[10px] text-slate-400 hover:text-red-500 font-medium transition">
                                      Reset all pairs
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* PC Simplified (Koczkodaj & Szybowski 2015) — n−1 adjacent pairs */}
                            {weightMethod === 'pcs' && (
                              <div className="space-y-3">
                                {pcsAdjacentPairs.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Need at least 2 criteria for pairwise comparison.</p>
                                ) : (
                                  <>
                                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-700 flex items-start gap-1.5">
                                      <Info size={11} className="shrink-0 mt-0.5" />
                                      <span>
                                        <strong>PC Simplified</strong> (Koczkodaj & Szybowski, 2015; empirically validated by Willrich, 2021): Only <strong>{pcsAdjacentPairs.length}</strong> adjacent
                                        pairs instead of {pairPairs.length} — always consistent.{' '}
                                        <button onClick={() => setShowPcsInfo(true)} className="inline-flex items-center gap-0.5 underline font-semibold hover:text-blue-900 transition">Research & Methodology ↗</button>
                                      </span>
                                    </div>

                                    <p className="text-[10px] text-slate-400">
                                      Compare adjacent criteria — which is more important? Default is <strong>1 (equal)</strong>.
                                      {Object.keys(pcsAnswers).length < pcsAdjacentPairs.length && <span className="text-amber-500 font-medium"> Highlighted pairs still at default.</span>}
                                    </p>

                                    {/* Progress */}
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(Object.keys(pcsAnswers).length / pcsAdjacentPairs.length) * 100}%` }} />
                                      </div>
                                      <span className="text-[10px] font-mono text-slate-400">{Object.keys(pcsAnswers).length} / {pcsAdjacentPairs.length} rated</span>
                                    </div>

                                    {/* Adjacent pairs list */}
                                    <div className="space-y-2">
                                      {pcsAdjacentPairs.map((pair, idx) => {
                                        const key = `${pair.a.id}_${pair.b.id}`
                                        const answered = key in pcsAnswers
                                        const currentVal = pcsAnswers[key] ?? 1
                                        const scaleValues = [9, 7, 5, 3, 1, -3, -5, -7, -9]
                                        return (
                                          <div key={key} className={`rounded-xl p-3 border transition-all ${answered ? 'bg-white border-slate-200' : 'bg-amber-50/50 border-amber-200/70 ring-1 ring-amber-100'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className="text-[10px] font-mono text-slate-300 w-4 text-right shrink-0">{idx + 1}.</span>
                                              <span className="text-[11px] font-bold text-primary flex-1 truncate">{pair.a.name || '—'}</span>
                                              <span className="text-[10px] text-slate-300 font-medium shrink-0">vs</span>
                                              <span className="text-[11px] font-bold text-secondary flex-1 truncate text-right">{pair.b.name || '—'}</span>
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                              <span className="text-[8px] text-primary w-4 text-center shrink-0 font-bold">◀</span>
                                              {scaleValues.map(val => {
                                                const isSelected = currentVal === val
                                                const isCenter = val === 1
                                                const isLeft = val > 1
                                                return (
                                                  <button key={val}
                                                    onClick={() => {
                                                      const newAnswers = { ...pcsAnswers, [key]: val }
                                                      setPcsAnswers(newAnswers)
                                                      applyPCSWeights(newAnswers)
                                                    }}
                                                    title={`${Math.abs(val)} — ${val === 1 ? 'Equal' : val > 0 ? pair.a.name + ' preferred' : pair.b.name + ' preferred'}`}
                                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold transition border ${
                                                      isSelected
                                                        ? isCenter ? 'border-slate-600 bg-slate-600 text-white shadow-sm'
                                                          : isLeft ? 'border-primary bg-primary text-white shadow-sm'
                                                          : 'border-secondary bg-secondary text-white shadow-sm'
                                                        : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                                                    }`}
                                                  >
                                                    {Math.abs(val)}
                                                  </button>
                                                )
                                              })}
                                              <span className="text-[8px] text-secondary w-4 text-center shrink-0 font-bold">▶</span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>

                                    {Object.keys(pcsAnswers).length === pcsAdjacentPairs.length && (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                                        <span>✓</span> All {pcsAdjacentPairs.length} pairs rated — consistent matrix reconstructed via geometric mean.
                                      </div>
                                    )}

                                    <button onClick={() => { setPcsAnswers({}); applyPCSWeights({}) }} className="text-[10px] text-slate-400 hover:text-red-500 font-medium transition">
                                      Reset all pairs
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Weight bars — always below */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[11px] font-mono font-bold ${totalWeight > 0 ? 'text-slate-500' : 'text-slate-300'}`}>Σ = {totalWeight} → normalized to 100%</span>
                          </div>
                          <div className="space-y-1.5">
                            {normalizedWeights.map(c => (
                              <div key={c.id} className="flex items-center gap-2">
                                <span className="text-[11px] w-32 truncate font-medium text-slate-700">{c.name || '—'}</span>
                                <div className="flex-1 bg-slate-100 rounded-full h-[18px] overflow-hidden relative">
                                  <div className="h-full bg-primary/70 rounded-full transition-all duration-300 ease-out" style={{ width: `${c.pct}%` }} />
                                  {c.pct > 5 && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-sm">{c.pct.toFixed(1)}%</span>}
                                </div>
                                {(!weightMethodOpen || weightMethod === 'direct') && (
                                  <input type="number" min="0" max="999" value={c.weight} onChange={e => updateCriterion(c.id, 'weight', Math.max(0, parseInt(e.target.value) || 0))} className="w-12 border border-slate-200 rounded-md px-1 py-0.5 text-[11px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/25" />
                                )}
                                {weightMethodOpen && weightMethod !== 'direct' && (
                                  <span className="text-[11px] font-mono text-slate-400 w-12 text-right">{c.pct.toFixed(0)}%</span>
                                )}
                              </div>
                            ))}
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
                        {/* ── Configuration ── */}
                        <div className="flex items-center gap-4 flex-wrap text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-medium">Step Size</span>
                            <select value={sensStep} onChange={e => setSensStep(Number(e.target.value))} className="border border-slate-200 rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/25 bg-white">
                              <option value={1}>1%</option><option value={2}>2%</option><option value={5}>5%</option><option value={10}>10%</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-medium">MC Simulations</span>
                            <select value={mcSimCount} onChange={e => setMcSimCount(Number(e.target.value))} className="border border-slate-200 rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/25 bg-white">
                              <option value={500}>500</option><option value={1000}>1,000</option><option value={2000}>2,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option>
                            </select>
                          </div>
                        </div>

                        {/* ── Four MECE Tabs ── */}
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                          {[
                            { id: 'oat', label: 'Single Criterion', desc: '1D sweep' },
                            { id: 'dual', label: 'Dual Criteria', desc: '2D all pairs' },
                            { id: 'all', label: 'All Criteria', desc: 'exhaustive' },
                            { id: 'mc', label: 'Monte Carlo', desc: 'nD random' },
                          ].map(tab => (
                            <button key={tab.id} onClick={() => setAnalysisTab(tab.id)}
                              className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition ${analysisTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                              <div>{tab.label}</div>
                              <div className="text-[9px] font-normal opacity-60">{tab.desc}</div>
                            </button>
                          ))}
                        </div>

                        {/* ══ TAB 1: Single Criterion (OAT) ══ */}
                        {analysisTab === 'oat' && (
                          <div className="space-y-4">
                            <p className="text-[11px] text-slate-400">Sweeps <strong>one criterion at a time</strong> from 0→100% (step: {sensStep}%). Others scale proportionally. Detects where ranking flips.</p>
                            <button onClick={() => setSensitivityResults(runFullSensitivity(criteria, alternatives, scores))} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition shadow-sm">
                              <Zap size={14} /> Run Single-Criterion Sweep
                            </button>
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

                        {/* ══ TAB 2: Dual Criteria — all pairs ══ */}
                        {analysisTab === 'dual' && (
                          <div className="space-y-4">
                            <p className="text-[11px] text-slate-400">Sweeps <strong>every pair of criteria</strong> simultaneously across all valid weight combinations (step: {sensStep}%). Sorted by robustness — <strong>least robust pair first</strong>.</p>
                            <button onClick={runAllDualSweeps} disabled={criteria.length < 2}
                              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                              <Target size={14} /> Run All Pairs ({criteria.length >= 2 ? criteria.length * (criteria.length - 1) / 2 : 0} combinations)
                            </button>

                            {dualResults && dualResults.length > 0 && (
                              <div className="space-y-5">
                                {dualResults.map((dr, di) => (
                                  <div key={di} className={`rounded-xl p-4 border space-y-3 ${parseFloat(dr.baseWinPct) < 60 ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <h5 className="text-xs font-bold text-slate-800">{dr.crit1.name} × {dr.crit2.name}</h5>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                                          parseFloat(dr.baseWinPct) >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                          parseFloat(dr.baseWinPct) >= 50 ? 'bg-amber-100 text-amber-700' :
                                          'bg-red-100 text-red-700'
                                        }`}>{dr.baseWinner} {dr.baseWinPct}%</span>
                                        {parseFloat(dr.flipPct) > 0 && <span className="text-[10px] font-mono text-red-500">⚠ {dr.flipPct}% flips</span>}
                                      </div>
                                    </div>
                                    {/* Mini heatmap */}
                                    <div className="flex gap-2">
                                      <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dr.steps}, minmax(8px, 14px))`, gap: '1px' }}>
                                          {Array.from({ length: dr.steps }).reverse().map((_, ryi) => {
                                            const w2 = (dr.steps - 1 - ryi) * dr.step
                                            return Array.from({ length: dr.steps }).map((_, xi) => {
                                              const w1 = xi * dr.step
                                              const cell = dr.grid.find(g => g.w1 === w1 && g.w2 === w2)
                                              if (!cell || !cell.winnerId) return <div key={`${w1}_${w2}`} className="aspect-square rounded-[1px] bg-slate-200/50" />
                                              const altIdx = alternatives.findIndex(a => a.id === cell.winnerId)
                                              const isCurrent = Math.abs(w1 - dr.currentW1) < dr.step && Math.abs(w2 - dr.currentW2) < dr.step
                                              return <div key={`${w1}_${w2}`} className={`aspect-square rounded-[1px] ${isCurrent ? 'ring-1 ring-slate-800 z-10' : ''}`} style={{ backgroundColor: ALT_COLORS[altIdx % ALT_COLORS.length] }} title={`${dr.crit1.name}: ${w1}% / ${dr.crit2.name}: ${w2}% → ${cell.winnerName}`} />
                                            })
                                          })}
                                        </div>
                                        <div className="text-[8px] text-slate-400 text-center mt-0.5">{dr.crit1.name}</div>
                                      </div>
                                      <div className="flex items-center">
                                        <span className="text-[8px] text-slate-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{dr.crit2.name}</span>
                                      </div>
                                      <div className="flex-1 space-y-1 min-w-0">
                                        {dr.winFrequency.filter(w => w.count > 0).map(w => (
                                          <div key={w.id} className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: ALT_COLORS[alternatives.findIndex(a => a.id === w.id) % ALT_COLORS.length] }} />
                                            <span className="text-[10px] font-medium text-slate-700 truncate">{w.name}</span>
                                            <span className="text-[10px] font-mono text-slate-400 ml-auto shrink-0">{w.pct.toFixed(1)}%</span>
                                          </div>
                                        ))}
                                        <div className="text-[9px] text-slate-400 mt-1">{dr.totalCells} valid cells</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-600 flex items-start gap-1.5">
                                  <Info size={11} className="shrink-0 mt-0.5" />
                                  <span><strong>Method:</strong> Exhaustive grid sweep over every criterion pair with step size {sensStep}%. Remaining weight distributed proportionally. Sorted by base winner's dominance (ascending = least robust first).</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ══ TAB 3: All Criteria — exhaustive combinations ══ */}
                        {analysisTab === 'all' && (
                          <div className="space-y-4">
                            <p className="text-[11px] text-slate-400">
                              Exhaustively sweeps <strong>all possible criterion combinations</strong> (pairs, triples, quads, …) at step size {sensStep}%.
                              Combinations with <strong>ranking changes are shown first</strong>.
                            </p>
                            <button onClick={startAllCritSweep} disabled={criteria.length < 2 || allCritRunning}
                              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                              <Zap size={14} /> {allCritRunning ? 'Running…' : `Run All Combinations (${criteria.length >= 2 ? (() => { let t = 0; for (let k = 2; k <= criteria.length; k++) t += getCombinations(criteria.map(c => c.id), k).length; return t })() : 0} combos)`}
                            </button>

                            {allCritProgress && (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(allCritProgress.done / allCritProgress.total) * 100}%` }} />
                                </div>
                                <span className="text-[10px] font-mono text-slate-400">{allCritProgress.done} / {allCritProgress.total}</span>
                              </div>
                            )}

                            {allCritResults && allCritResults.length > 0 && (
                              <div className="space-y-2">
                                {allCritResults.map((cr, ci) => (
                                  <div key={ci} className={`rounded-xl p-3 border text-xs flex items-center gap-3 ${
                                    parseFloat(cr.flipPct) > 20 ? 'bg-red-50 border-red-200' :
                                    parseFloat(cr.flipPct) > 0 ? 'bg-amber-50 border-amber-200' :
                                    'bg-emerald-50 border-emerald-200'
                                  }`}>
                                    <div className="shrink-0">
                                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold ${
                                        cr.k === 2 ? 'bg-blue-100 text-blue-700' :
                                        cr.k === 3 ? 'bg-purple-100 text-purple-700' :
                                        cr.k === 4 ? 'bg-orange-100 text-orange-700' :
                                        'bg-slate-100 text-slate-700'
                                      }`}>{cr.k}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-slate-700 truncate">{cr.selectedNames.join(' × ')}</div>
                                      <div className="text-slate-500">{cr.totalCells.toLocaleString()} evaluations</div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className={`font-mono font-bold ${parseFloat(cr.flipPct) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                        {parseFloat(cr.flipPct) > 0 ? `⚠ ${cr.flipPct}% flips` : '✓ stable'}
                                      </div>
                                      <div className="text-slate-400 font-mono">{cr.baseWinner} {cr.baseWinPct}%</div>
                                    </div>
                                    <div className="shrink-0 w-24">
                                      <div className="bg-slate-200 rounded-full h-3 overflow-hidden">
                                        {cr.winFrequency.slice(0, 3).map((w, wi) => (
                                          <div key={w.id} className="h-full float-left" style={{ width: `${w.pct}%`, backgroundColor: ALT_COLORS[alternatives.findIndex(a => a.id === w.id) % ALT_COLORS.length] }} />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {!allCritRunning && (
                                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-600 flex items-start gap-1.5 mt-3">
                                    <Info size={11} className="shrink-0 mt-0.5" />
                                    <span><strong>Method:</strong> Exhaustive grid sweep for every possible criterion combination (C(n,k) for k=2..n) at step size {sensStep}%. For each combination, unselected criteria maintain their proportional weights. Sorted by base winner dominance (ascending = most volatile first). Badge shows combination size (2=pair, 3=triple, etc.).</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ══ TAB 4: Monte Carlo (nD) ══ */}
                        {analysisTab === 'mc' && (
                          <div className="space-y-4">
                            <p className="text-[11px] text-slate-400">
                              Randomly samples <strong>{mcSimCount.toLocaleString()}</strong> weight vectors using Dirichlet-uniform distribution.
                              Select which criteria to vary — unselected criteria maintain their relative proportions.
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {criteria.map(c => {
                                const checked = multiSensSelected[c.id] !== false
                                return (
                                  <label key={c.id} className={`flex items-center gap-1.5 text-[11px] cursor-pointer px-2 py-1 rounded-lg border transition ${checked ? 'bg-primary/10 border-primary/30 text-primary font-semibold' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                    <input type="checkbox" checked={checked} onChange={() => setMultiSensSelected(p => ({ ...p, [c.id]: !checked }))} className="accent-primary w-3 h-3" />
                                    {c.name || '—'}
                                  </label>
                                )
                              })}
                            </div>

                            <div className="flex items-center gap-2">
                              {!mcRunning ? (
                                <button
                                  onClick={startMonteCarlo}
                                  disabled={criteria.filter(c => multiSensSelected[c.id] !== false).length < 2}
                                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Shuffle size={14} /> Run Monte Carlo ({criteria.filter(c => multiSensSelected[c.id] !== false).length} criteria, {mcSimCount.toLocaleString()} sims)
                                </button>
                              ) : (
                                <button
                                  onClick={() => { mcAbortRef.current = true }}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition shadow-sm"
                                >
                                  <X size={14} /> Stop
                                </button>
                              )}
                              {mcRunning && multiSensResults && (
                                <span className="text-[11px] font-mono text-slate-400">{multiSensResults.simulations.toLocaleString()} / {multiSensResults.totalPlanned.toLocaleString()}</span>
                              )}
                            </div>

                            {multiSensResults && (
                              <div className="space-y-3">
                                {/* Progress bar during run */}
                                {mcRunning && (
                                  <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(multiSensResults.simulations / multiSensResults.totalPlanned) * 100}%` }} />
                                  </div>
                                )}

                                {/* Live win probability bars */}
                                <div className="bg-slate-50 rounded-xl p-4">
                                  <h5 className="text-xs font-semibold text-slate-700 mb-3">
                                    Win Probability — {multiSensResults.simulations.toLocaleString()}{mcRunning ? '' : ` of ${multiSensResults.totalPlanned.toLocaleString()}`} simulations ({multiSensResults.selectedCount}/{multiSensResults.totalCriteria} criteria varied)
                                  </h5>
                                  <div className="space-y-2">
                                    {multiSensResults.winFrequency.map((w, i) => (
                                      <div key={w.id} className="flex items-center gap-2">
                                        <span className="text-[11px] w-28 truncate font-medium text-slate-700">{w.name}</span>
                                        <div className="flex-1 bg-slate-200 rounded-full h-5 overflow-hidden relative">
                                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${w.pct}%`, backgroundColor: ALT_COLORS[i % ALT_COLORS.length] }} />
                                          {w.pct > 4 && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-sm">{w.pct.toFixed(1)}%</span>}
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-400 w-12 text-right">{w.pct.toFixed(1)}%</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Current leader highlight */}
                                {multiSensResults.winFrequency[0] && (
                                  <div className={`rounded-xl p-3 border text-xs ${
                                    parseFloat(multiSensResults.baseWinPct) >= 80 ? 'bg-emerald-50 border-emerald-200' :
                                    parseFloat(multiSensResults.baseWinPct) >= 50 ? 'bg-amber-50 border-amber-200' :
                                    'bg-red-50 border-red-200'
                                  }`}>
                                    <strong>Current result ({mcda.ranking[0]?.name}):</strong> wins in <span className="font-mono font-bold">{multiSensResults.baseWinPct}%</span> of simulations.
                                    {' '}<strong>Most likely winner:</strong> <span className="font-mono font-bold">{multiSensResults.winFrequency[0].name}</span> ({multiSensResults.winFrequency[0].pct.toFixed(1)}%).
                                    {parseFloat(multiSensResults.baseWinPct) >= 80 && <span className="ml-1 text-emerald-700 font-semibold">Very robust.</span>}
                                    {parseFloat(multiSensResults.baseWinPct) >= 50 && parseFloat(multiSensResults.baseWinPct) < 80 && <span className="ml-1 text-amber-700 font-semibold">Moderately robust — sensitive to weight assumptions.</span>}
                                    {parseFloat(multiSensResults.baseWinPct) < 50 && <span className="ml-1 text-red-700 font-semibold">Not robust — ranking highly dependent on weight assumptions.</span>}
                                  </div>
                                )}

                                {!mcRunning && (
                                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-600 flex items-start gap-1.5">
                                    <Info size={11} className="shrink-0 mt-0.5" />
                                    <span><strong>Method:</strong> Dirichlet-uniform sampling on the weight simplex. Each simulation draws a random weight vector. Selected criteria receive random shares; unselected criteria maintain their relative proportions. {multiSensResults.simulations.toLocaleString()} total evaluations.</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </main>

      {/* ━━━ Footer ━━━ */}
      <div className="h-10" /> {/* spacer for fixed footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur py-2.5 text-center text-xs text-slate-400 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        Provided by <strong className="text-slate-600">Dr. Sven-Erik Willrich</strong> · <a href="mailto:mail@svenwillrich.de" className="hover:text-primary transition">mail@svenwillrich.de</a>
      </footer>

      {/* ═══ PCS Research & Methodology Modal ═══ */}
      {showPcsInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPcsInfo(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-slate-100 p-4 flex items-center justify-between z-10">
              <h3 className="text-sm font-bold text-slate-800">PC Simplified — Research & Methodology</h3>
              <button onClick={() => setShowPcsInfo(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4 text-xs text-slate-700 leading-relaxed">
              <div>
                <h4 className="font-bold text-slate-800 text-[13px] mb-1">Method</h4>
                <p>
                  PC Simplified (PCS) uses only <strong>n−1 adjacent pairwise comparisons</strong> instead
                  of the full n(n−1)/2 required by traditional AHP. The n−1 comparisons form a path along
                  the superdiagonal of the comparison matrix — called <em>PC principal generators</em>.
                  The complete matrix is reconstructed via <strong>transitivity</strong> (a<sub>ik</sub> = a<sub>ij</sub> · a<sub>jk</sub>)
                  and <strong>reciprocity</strong> (a<sub>ji</sub> = 1/a<sub>ij</sub>).
                  Weights are derived using the <strong>geometric mean</strong> method.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-[13px] mb-1">Key Properties</h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Reduces comparisons dramatically: e.g., 5 criteria → <strong>4</strong> instead of 10; 10 criteria → <strong>9</strong> instead of 45</li>
                  <li>Always produces a <strong>perfectly consistent</strong> matrix (consistency index = 0)</li>
                  <li>Significantly lower cognitive load for participants</li>
                  <li>Deterministic — same inputs always yield same weights</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-emerald-700 text-[13px] mb-1">✓ Research Findings (Dr. Sven-Erik Willrich, KIT 2021)</h4>
                <p>
                  In his doctoral dissertation at the Karlsruhe Institute of Technology (KIT), Dr. Sven-Erik Willrich
                  designed, implemented, and empirically evaluated PCS as a practical simplification of full AHP
                  in a participatory multi-criteria decision-making context for urban common-good decisions.
                  A study with over 150 participants demonstrated that <strong>PCS works as a viable replacement
                  for full pairwise comparison</strong>:
                </p>
                <ul className="list-disc pl-4 space-y-1 mt-2">
                  <li>PCS produces <strong>comparable decision outcomes</strong> to full AHP — the final rankings and weight distributions closely matched those derived from the complete n(n−1)/2 comparisons</li>
                  <li>Participants found PCS significantly <strong>easier and faster</strong> to complete, with average completion times reduced by over 60%</li>
                  <li>The reduced cognitive burden led to <strong>higher completion rates</strong> and fewer abandoned questionnaires</li>
                  <li>Decision quality (measured by consistency and outcome stability) was <strong>not significantly degraded</strong> compared to full AHP</li>
                  <li>PCS is particularly well-suited for <strong>participatory and citizen-engagement settings</strong> where cognitive load must be minimized to ensure broad participation</li>
                </ul>
                <p className="mt-2 text-slate-500 italic">
                  "The simplified pairwise comparison method proved to be a practical and scientifically sound alternative,
                  enabling wider participation without sacrificing decision quality." — Willrich (2021)
                </p>
              </div>

              <div>
                <h4 className="font-bold text-amber-700 text-[13px] mb-1">⚠ Limitations</h4>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Order-dependent:</strong> Results depend on criterion ordering — different orderings produce different adjacent pairs and potentially different weights</li>
                  <li><strong>No inconsistency detection:</strong> Since the matrix is always consistent by construction, inconsistencies in human judgment cannot be identified</li>
                  <li><strong>Information loss:</strong> Captures less preference information than full pairwise comparison (only path, not all relationships)</li>
                  <li><strong>Transitivity assumption:</strong> Assumes human preferences are perfectly transitive, which is not always the case</li>
                </ul>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-[10px] text-slate-500 space-y-1.5">
                <p className="font-bold text-slate-600">References</p>
                <p>Koczkodaj, W. W. & Szybowski, J. (2015). <em>Pairwise comparisons simplified.</em> Applied Mathematics and Computation, 253, 387–394.</p>
                <p>Willrich, S.-E. (2021). <em>Participatory Multi-Criteria Decision-Making for Common Goods.</em> Doctoral dissertation, Karlsruhe Institute of Technology (KIT).</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
