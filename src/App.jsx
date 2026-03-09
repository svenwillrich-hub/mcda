import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
  LineChart, Line, Cell, ReferenceLine
} from 'recharts'
import {
  Plus, Trash2, Upload, Download, ChevronDown, Trophy, Info, X,
  TrendingUp, TrendingDown, Zap, Target, GripVertical,
  ChevronRight, ChevronUp, Sliders, Lock, Minus, Shuffle,
  Eye, EyeOff, BookOpen, BarChart3, Shield, Sparkles
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'problem', label: 'Problem', num: 1, desc: 'Define the decision problem and title' },
  { id: 'criteria', label: 'Criteria', num: 2, desc: 'Set evaluation criteria with direction (max/min)' },
  { id: 'weights', label: 'Weights', num: 3, desc: 'Assign relative importance via 4 elicitation methods' },
  { id: 'alternatives', label: 'Alternatives', num: 4, desc: 'Add the options you are comparing' },
  { id: 'scoring', label: 'Scoring', num: 5, desc: 'Rate each alternative on every criterion' },
  { id: 'results', label: 'Results', num: 6, desc: 'View rankings and part-worth decomposition' },
  { id: 'analysis', label: 'Analysis', num: 7, desc: 'Sensitivity analysis: OAT, dual, MC simulation' },
]
const ALT_COLORS = ['#4f6ef7', '#00b4b4', '#f59e0b', '#e84040', '#8b5cf6', '#ec4899', '#10b981', '#6366f1']
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']
let _id = 200
const uid = (p) => `${p}${++_id}`
const LIKERT = [
  { value: 1, label: 'Not important' }, { value: 2, label: 'Slightly important' },
  { value: 3, label: 'Moderately important' }, { value: 4, label: 'Important' },
  { value: 5, label: 'Very important' }, { value: 6, label: 'Critical' },
]

// ─── AHP Shared Engine (Saaty 1980 / Crawford 1987 / Alonso & Lamata 2006) ──
// Random Index table (Alonso & Lamata, 2006) — RI for n=1..10
const RI_TABLE = [0, 0, 0, 0.5247, 0.8816, 1.1086, 1.2479, 1.3417, 1.4057, 1.4499, 1.4854]

/**
 * Build a pairwise comparison matrix from criteria and answer objects.
 * @param {'full'|'pcs'} mode - 'full' for AHP n(n-1)/2, 'pcs' for n-1 adjacent
 */
function buildPCMatrix(criteria, answers, mode = 'full') {
  const n = criteria.length
  const matrix = Array.from({ length: n }, () => Array(n).fill(1))
  if (mode === 'full') {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const key = `${criteria[i].id}_${criteria[j].id}`
        const ans = answers[key] || 1
        matrix[i][j] = ans > 0 ? ans : 1 / Math.abs(ans)
        matrix[j][i] = 1 / matrix[i][j]
      }
    }
  } else {
    // PCS: fill superdiagonal, then transitivity
    for (let i = 0; i < n - 1; i++) {
      const key = `${criteria[i].id}_${criteria[i + 1].id}`
      const ans = answers[key] || 1
      matrix[i][i + 1] = ans > 0 ? ans : 1 / Math.abs(ans)
    }
    for (let i = 0; i < n - 1; i++) for (let l = i + 2; l < n; l++) { let p = 1; for (let j = i; j < l; j++) p *= matrix[j][j + 1]; matrix[i][l] = p }
    for (let i = 0; i < n; i++) for (let l = i + 1; l < n; l++) matrix[l][i] = 1 / matrix[i][l]
  }
  return matrix
}

/** Geometric Mean method (Crawford 1987, Eq. 3.6) */
function weightsGeometricMean(matrix) {
  const n = matrix.length
  const gm = []
  for (let i = 0; i < n; i++) {
    let product = 1
    for (let j = 0; j < n; j++) product *= matrix[i][j]
    gm.push(Math.pow(product, 1 / n))
  }
  const total = gm.reduce((s, v) => s + v, 0)
  return gm.map(v => total > 0 ? v / total : 0)
}

/** Eigenvector approximation via column normalization (Saaty, Eq. 3.5) */
function weightsEigenvector(matrix) {
  const n = matrix.length
  const colSums = Array(n).fill(0)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) colSums[j] += matrix[i][j]
  const w = Array(n).fill(0)
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) w[i] += matrix[i][j] / (colSums[j] || 1); w[i] /= n }
  return w
}

/** Compute λ_max from matrix and weight vector */
function computeLambdaMax(matrix, weights) {
  const n = matrix.length
  // Aw = λ_max * w → λ_max ≈ mean of (Aw)_i / w_i
  let sum = 0
  for (let i = 0; i < n; i++) {
    let aw = 0
    for (let j = 0; j < n; j++) aw += matrix[i][j] * weights[j]
    if (weights[i] > 0) sum += aw / weights[i]
  }
  return sum / n
}

/** Consistency Index and Ratio */
function computeConsistency(matrix, weights) {
  const n = matrix.length
  if (n <= 2) return { lambdaMax: n, ci: 0, cr: 0, consistent: true }
  const lambdaMax = computeLambdaMax(matrix, weights)
  const ci = (lambdaMax - n) / (n - 1)
  const ri = n <= 10 ? (RI_TABLE[n] || 0) : 1.49 // fallback for n>10
  const cr = ri > 0 ? ci / ri : 0
  return { lambdaMax, ci, cr, consistent: cr <= 0.1 }
}

/** Full AHP pipeline: build matrix → compute weights → CI/CR */
function computeAHP(criteria, answers, mode = 'full', method = 'eigenvector') {
  const n = criteria.length
  if (n < 2) return { weights: criteria.map(() => 0), matrix: [], consistency: { lambdaMax: 0, ci: 0, cr: 0, consistent: true } }
  const matrix = buildPCMatrix(criteria, answers, mode)
  const w = method === 'geometric' ? weightsGeometricMean(matrix) : weightsEigenvector(matrix)
  const consistency = computeConsistency(matrix, w)
  return { weights: w, matrix, consistency }
}

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
  if (!criteria.length || !alternatives.length) return { ranking: [], normalized: {}, utilities: {}, partWorths: {}, weights: {}, koFails: {} }
  const rawW = {}; let totalW = 0
  criteria.forEach(c => { const w = weightOverrides ? (weightOverrides[c.id] ?? c.weight) : c.weight; rawW[c.id] = w; totalW += w })
  const weights = {}; criteria.forEach(c => { weights[c.id] = totalW > 0 ? rawW[c.id] / totalW : 0 })
  const normalized = {}; const mm = {}
  criteria.forEach(c => {
    const vals = alternatives.map(a => Number(scores[a.id]?.[c.id]) || 0)
    mm[c.id] = { min: Math.min(...vals), max: Math.max(...vals), range: Math.max(...vals) - Math.min(...vals) || 1 }
  })
  // K.O. check
  const koFails = {}
  alternatives.forEach(a => {
    const fails = []
    criteria.forEach(c => {
      if (c.ko && c.koValue !== '' && c.koValue !== undefined) {
        const val = Number(scores[a.id]?.[c.id]) || 0
        const threshold = Number(c.koValue)
        if (c.koDirection === 'min' && val < threshold) fails.push({ criterion: c.name, value: val, threshold, direction: 'min' })
        if (c.koDirection === 'max' && val > threshold) fails.push({ criterion: c.name, value: val, threshold, direction: 'max' })
      }
    })
    if (fails.length > 0) koFails[a.id] = fails
  })
  alternatives.forEach(a => {
    normalized[a.id] = {}
    criteria.forEach(c => { const n = (Number(scores[a.id]?.[c.id] || 0) - mm[c.id].min) / mm[c.id].range; normalized[a.id][c.id] = c.direction === 'minimize' ? 1 - n : n })
  })
  const partWorths = {}; const utilities = {}
  alternatives.forEach(a => { partWorths[a.id] = {}; let t = 0; criteria.forEach(c => { const pw = normalized[a.id][c.id] * weights[c.id]; partWorths[a.id][c.id] = pw; t += pw }); utilities[a.id] = t })
  const ranking = alternatives.map(a => ({ id: a.id, name: a.name, utility: utilities[a.id], partWorths: partWorths[a.id], normalized: normalized[a.id], koFailed: !!koFails[a.id] })).sort((a, b) => {
    // K.O. failed alternatives always rank last
    if (a.koFailed && !b.koFailed) return 1
    if (!a.koFailed && b.koFailed) return -1
    return b.utility - a.utility
  })
  return { ranking, normalized, utilities, partWorths, weights, koFails }
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
  const [ahpMethod, setAhpMethod] = useState('eigenvector') // 'eigenvector' | 'geometric'
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
  const [showPartWorths, setShowPartWorths] = useState(false)
  const [expandedDualPairs, setExpandedDualPairs] = useState({})
  const [showAbout, setShowAbout] = useState(false)
  const [showPrefLab, setShowPrefLab] = useState(false)
  // Preference Lab — independent criteria weighting
  const [plCriteria, setPlCriteria] = useState([])
  const [plMethod, setPlMethod] = useState('direct')
  const [plLikertRatings, setPlLikertRatings] = useState({})
  const [plPairAnswers, setPlPairAnswers] = useState({})
  const [plPcsAnswers, setPlPcsAnswers] = useState({})
  const [plStep, setPlStep] = useState('criteria') // 'criteria' | 'rate' | 'results'
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
  const addCriterion = () => setCriteria(p => [...p, { id: uid('c'), name: '', direction: 'maximize', weight: 0, ko: false, koDirection: 'min', koValue: '' }])
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

  const applyPairwiseWeights = (answers, method) => {
    const m = method || ahpMethod
    const { weights: w } = computeAHP(criteria, answers, 'full', m)
    setCriteria(prev => prev.map((c, i) => ({ ...c, weight: Math.round(w[i] * 100) })))
  }

  // Computed AHP result for pairwise (for CI/CR display)
  const pairwiseResult = useMemo(() => {
    if (weightMethod !== 'pairwise' || criteria.length < 2) return null
    return computeAHP(criteria, pairAnswers, 'full', ahpMethod)
  }, [criteria, pairAnswers, weightMethod, ahpMethod])

  const pcsAdjacentPairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < criteria.length - 1; i++) {
      pairs.push({ a: criteria[i], b: criteria[i + 1] })
    }
    return pairs
  }, [criteria])

  const applyPCSWeights = (answers, method) => {
    const m = method || ahpMethod
    const { weights: w } = computeAHP(criteria, answers, 'pcs', m)
    setCriteria(prev => prev.map((c, i) => ({ ...c, weight: Math.round(w[i] * 100) })))
  }

  // Computed AHP result for PCS (for CI/CR display)
  const pcsResult = useMemo(() => {
    if (weightMethod !== 'pcs' || criteria.length < 2) return null
    return computeAHP(criteria, pcsAnswers, 'pcs', ahpMethod)
  }, [criteria, pcsAnswers, weightMethod, ahpMethod])

  // PCS transitivity visualization for main weights panel
  const pcsTransitivityData = useMemo(() => {
    const n = criteria.length
    if (n < 2 || weightMethod !== 'pcs') return null
    const { matrix } = computeAHP(criteria, pcsAnswers, 'pcs', ahpMethod)
    const distances = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        distances.push({ from: i, to: j, fromName: criteria[i].name || `C${i+1}`, toName: criteria[j].name || `C${j+1}`, ratio: matrix[i][j], distance: Math.abs(Math.log(matrix[i][j] || 1)), isAdjacent: j === i + 1 })
      }
    }
    return { matrix, distances, criteria }
  }, [criteria, pcsAnswers, weightMethod, ahpMethod])

  // Pairwise matrix visualization for main weights panel
  const pairwiseMatrixData = useMemo(() => {
    const n = criteria.length
    if (n < 2 || weightMethod !== 'pairwise') return null
    const { matrix } = computeAHP(criteria, pairAnswers, 'full', ahpMethod)
    return { matrix, criteria }
  }, [criteria, pairAnswers, weightMethod, ahpMethod])

  // Re-apply weights when ahpMethod toggle changes
  useEffect(() => {
    if (weightMethod === 'pairwise' && Object.keys(pairAnswers).length > 0) applyPairwiseWeights(pairAnswers, ahpMethod)
    if (weightMethod === 'pcs' && Object.keys(pcsAnswers).length > 0) applyPCSWeights(pcsAnswers, ahpMethod)
  }, [ahpMethod])

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

  // ─── Preference Lab helpers ───────────────────────────────────────────────
  const plAddCriterion = () => setPlCriteria(p => [...p, { id: uid('pl'), name: '', weight: 0 }])
  const plRemoveCriterion = (id) => { setPlCriteria(p => p.filter(c => c.id !== id)); setPlLikertRatings(p => { const { [id]: _, ...r } = p; return r }) }
  const plUpdateCriterion = (id, f, v) => setPlCriteria(p => p.map(c => c.id === id ? { ...c, [f]: v } : c))

  const plPairPairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < plCriteria.length; i++)
      for (let j = i + 1; j < plCriteria.length; j++)
        pairs.push({ a: plCriteria[i], b: plCriteria[j] })
    return pairs
  }, [plCriteria])

  const plPcsAdjacentPairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < plCriteria.length - 1; i++)
      pairs.push({ a: plCriteria[i], b: plCriteria[i + 1] })
    return pairs
  }, [plCriteria])

  // Preference Lab: use shared AHP engine
  const plComputeWeights = (method, crit, likert, pairAns, pcsAns) => {
    const n = crit.length
    if (n < 1) return crit
    if (method === 'direct') return crit
    if (method === 'likert') {
      const total = crit.reduce((s, c) => s + (likert[c.id] || 0), 0)
      return crit.map(c => ({ ...c, weight: total > 0 ? Math.round(((likert[c.id] || 0) / total) * 100) : 0 }))
    }
    if ((method === 'pairwise' || method === 'pcs') && n >= 2) {
      const mode = method === 'pcs' ? 'pcs' : 'full'
      const ans = method === 'pcs' ? pcsAns : pairAns
      const { weights: w } = computeAHP(crit, ans, mode, ahpMethod)
      return crit.map((c, i) => ({ ...c, weight: Math.round(w[i] * 100) }))
    }
    return crit
  }

  const plWeighted = useMemo(() => plComputeWeights(plMethod, plCriteria, plLikertRatings, plPairAnswers, plPcsAnswers), [plMethod, plCriteria, plLikertRatings, plPairAnswers, plPcsAnswers, ahpMethod])
  const plTotalWeight = plWeighted.reduce((s, c) => s + c.weight, 0)
  const plNormalized = useMemo(() => {
    const t = plWeighted.reduce((s, c) => s + c.weight, 0)
    return plWeighted.map(c => ({ ...c, pct: t > 0 ? (c.weight / t * 100) : 0 }))
  }, [plWeighted])

  // PL: AHP result for CI/CR display
  const plAhpResult = useMemo(() => {
    if (plCriteria.length < 2) return null
    if (plMethod === 'pairwise') return computeAHP(plCriteria, plPairAnswers, 'full', ahpMethod)
    if (plMethod === 'pcs') return computeAHP(plCriteria, plPcsAnswers, 'pcs', ahpMethod)
    return null
  }, [plCriteria, plPairAnswers, plPcsAnswers, plMethod, ahpMethod])

  // PCS transitivity visualization data
  const plPcsTransitivityData = useMemo(() => {
    const n = plCriteria.length
    if (n < 2 || plMethod !== 'pcs') return null
    const { matrix } = computeAHP(plCriteria, plPcsAnswers, 'pcs', ahpMethod)
    const distances = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        distances.push({ from: i, to: j, fromName: plCriteria[i].name || `C${i+1}`, toName: plCriteria[j].name || `C${j+1}`, ratio: matrix[i][j], distance: Math.abs(Math.log(matrix[i][j] || 1)), isAdjacent: j === i + 1 })
      }
    }
    return { matrix, distances, criteria: plCriteria }
  }, [plCriteria, plPcsAnswers, plMethod, ahpMethod])

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

      {/* ━━━ Hero Branding ━━━ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1e293b] via-[#334155] to-[#1e293b]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(79,110,247,0.25),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,180,180,0.15),transparent_50%)]" />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="max-w-5xl mx-auto px-4 py-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/10 shadow-lg shadow-primary/10">
                <BarChart3 size={24} className="text-white" />
              </div>
              <div>
                <h1><a href="/mcda/" className="text-xl sm:text-2xl font-bold text-white tracking-tight hover:text-white/80 transition-colors no-underline">Multi-Criteria Decision Analysis</a></h1>
                <p className="text-white/50 text-xs sm:text-sm mt-0.5">Structured decision-making with quantitative sensitivity analysis</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => setShowPrefLab(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/5 transition backdrop-blur-sm">
                <Sliders size={13} /> Preference Lab
              </button>
              <button onClick={() => setShowAbout(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/5 transition backdrop-blur-sm">
                <BookOpen size={13} /> About
              </button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />
      </div>

      {/* ━━━ Sticky Header ━━━ */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        {/* Top bar: title + actions */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-5 h-5 bg-primary rounded flex items-center justify-center shrink-0"><Target size={11} className="text-white" /></div>
            {title ? (
              <span className="text-[13px] font-bold text-slate-800 truncate">{title}</span>
            ) : (
              <span className="text-[13px] font-bold text-slate-400 italic">Untitled Decision</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input ref={fileRef} type="file" accept=".json" onChange={importJSON} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition flex items-center gap-1"><Upload size={11} /> Import</button>
            <button onClick={exportJSON} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition flex items-center gap-1"><Download size={11} /> Export</button>
            <button onClick={() => setShowAbout(true)} className="px-2 py-1 text-[11px] text-primary hover:text-primary/80 border border-primary/20 rounded-md hover:bg-primary/5 transition flex items-center gap-1 sm:hidden"><BookOpen size={11} /></button>
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
        {/* Step Nav — connected circles + progress line */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2.5 pt-1">
          <div className="flex items-start">
            {SECTIONS.map((s, i) => {
              const ok = unlocked[s.id]; const active = activeSection === s.id
              const done = sectionIdx > i && ok
              return (
                <React.Fragment key={s.id}>
                  {/* Connector line before (not for first) */}
                  {i > 0 && (
                    <div className="flex-1 flex items-center pt-[11px]">
                      <div className={`h-[2px] w-full rounded-full transition-colors duration-300 ${done ? 'bg-primary' : ok ? 'bg-slate-200' : 'bg-slate-100'}`} />
                    </div>
                  )}
                  {/* Step node */}
                  <button onClick={() => scrollTo(s.id)} disabled={!ok}
                    className="group relative flex flex-col items-center shrink-0" title={s.desc}>
                    {/* Circle */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                      !ok ? 'bg-slate-100 text-slate-300 border border-slate-200'
                      : active ? 'bg-primary text-white shadow-lg shadow-primary/30 ring-[3px] ring-primary/15 scale-110'
                      : done ? 'bg-primary text-white'
                      : 'bg-white text-slate-400 border-2 border-slate-300 group-hover:border-primary/40 group-hover:text-primary'
                    }`}>
                      {!ok ? <Lock size={9} /> : done && !active ? <span className="text-[10px]">✓</span> : s.num}
                    </div>
                    {/* Label */}
                    <span className={`mt-1 text-[10px] font-semibold transition-colors leading-tight ${
                      !ok ? 'text-slate-300' : active ? 'text-primary' : done ? 'text-slate-600' : 'text-slate-400 group-hover:text-slate-600'
                    }`}>{s.label}</span>
                    {/* Tooltip */}
                    <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-800 text-white text-[10px] rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                      {s.desc}
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                    </div>
                  </button>
                </React.Fragment>
              )
            })}
          </div>
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
                        <p className="text-[11px] text-slate-400 mb-2">Drag ⠿ to reorder priority. Toggle max/min. Optionally set K.O. thresholds.</p>
                        {criteria.map((c, i) => (
                          <div key={c.id} draggable onDragStart={e => onDragStart(e, i)} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={e => onDrop(e, i)}
                            className={`group rounded-lg px-1 py-1.5 transition ${dragCrit === i ? 'opacity-20 scale-95' : 'hover:bg-slate-50'} ${c.ko ? 'ring-1 ring-red-200 bg-red-50/30' : ''}`}>
                            <div className="flex items-center gap-2">
                              <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"><GripVertical size={15} /></div>
                              <span className="text-[11px] text-slate-400 w-4 text-right font-mono">{i + 1}</span>
                              <input className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 transition" value={c.name} onChange={e => updateCriterion(c.id, 'name', e.target.value)} placeholder="Criterion name…" />
                              <button onClick={() => updateCriterion(c.id, 'direction', c.direction === 'maximize' ? 'minimize' : 'maximize')}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition min-w-[85px] justify-center ${c.direction === 'maximize' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                                {c.direction === 'maximize' ? <><TrendingUp size={12} /> Max</> : <><TrendingDown size={12} /> Min</>}
                              </button>
                              {/* K.O. toggle */}
                              <button onClick={() => updateCriterion(c.id, 'ko', !c.ko)}
                                title={c.ko ? 'K.O. criterion active — click to remove' : 'Set as K.O. criterion (knockout threshold)'}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition ${c.ko ? 'bg-red-100 text-red-700 hover:bg-red-200 ring-1 ring-red-300' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}>
                                <Shield size={11} /> K.O.
                              </button>
                              <button onClick={() => removeCriterion(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"><Trash2 size={14} /></button>
                            </div>
                            {/* K.O. configuration row */}
                            {c.ko && (
                              <div className="ml-12 mt-1.5 flex items-center gap-2 text-[11px]">
                                <span className="text-red-600 font-semibold">K.O.:</span>
                                <span className="text-slate-500">Alternative fails if value is</span>
                                <button onClick={() => updateCriterion(c.id, 'koDirection', c.koDirection === 'min' ? 'max' : 'min')}
                                  className={`px-2 py-0.5 rounded font-semibold transition ${c.koDirection === 'min' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {c.koDirection === 'min' ? '< below' : '> above'}
                                </button>
                                <input type="number" value={c.koValue ?? ''} onChange={e => updateCriterion(c.id, 'koValue', e.target.value)}
                                  placeholder="threshold" className="w-20 border border-red-200 rounded px-2 py-0.5 text-[11px] font-mono bg-white focus:outline-none focus:ring-1 focus:ring-red-300" />
                              </div>
                            )}
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

                                    {/* AHP method toggle */}
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-slate-400 font-medium">Priority vector:</span>
                                      <button onClick={() => setAhpMethod('eigenvector')} className={`px-2 py-0.5 rounded font-semibold transition ${ahpMethod === 'eigenvector' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Eigenvector (Saaty)</button>
                                      <button onClick={() => setAhpMethod('geometric')} className={`px-2 py-0.5 rounded font-semibold transition ${ahpMethod === 'geometric' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Geometric Mean (Crawford)</button>
                                    </div>

                                    {/* CI/CR display */}
                                    {pairwiseResult && pairwiseResult.consistency && criteria.length >= 3 && (
                                      <div className={`flex items-center gap-3 rounded-lg p-2 text-[10px] border ${pairwiseResult.consistency.consistent ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                        <span className="font-semibold">{pairwiseResult.consistency.consistent ? '✓ Consistent' : '✗ Inconsistent'}</span>
                                        <span className="font-mono">CI = {pairwiseResult.consistency.ci.toFixed(4)}</span>
                                        <span className="font-mono">CR = {(pairwiseResult.consistency.cr * 100).toFixed(1)}%</span>
                                        <span className="text-slate-400">(threshold ≤ 10%)</span>
                                      </div>
                                    )}

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

                                    {/* Pairwise Comparison Matrix */}
                                    {pairwiseMatrixData && Object.keys(pairAnswers).length > 0 && (
                                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                                        <h5 className="text-[10px] font-bold text-slate-600">Comparison Matrix</h5>
                                        <div className="overflow-x-auto">
                                          <table className="text-[9px] font-mono">
                                            <thead><tr><th className="p-1"></th>{pairwiseMatrixData.criteria.map((c, i) => <th key={i} className="p-1 text-slate-500 font-bold">{(c.name || `C${i+1}`).slice(0, 6)}</th>)}</tr></thead>
                                            <tbody>{pairwiseMatrixData.matrix.map((row, i) => (
                                              <tr key={i}><td className="p-1 font-bold text-slate-500">{(pairwiseMatrixData.criteria[i].name || `C${i+1}`).slice(0, 6)}</td>
                                                {row.map((val, j) => <td key={j} className={`p-1 text-center ${i === j ? 'text-slate-300' : 'text-slate-600'}`}>{val >= 1 ? val.toFixed(1) : `1/${(1/val).toFixed(1)}`}</td>)}
                                              </tr>
                                            ))}</tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {Object.keys(pairAnswers).length === pairPairs.length && (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                                        <span>✓</span> All {pairPairs.length} pairs rated — weights applied via {ahpMethod === 'geometric' ? 'Geometric Mean (Crawford)' : 'Eigenvector (Saaty)'}.
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

                                    {/* AHP method toggle */}
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-slate-400 font-medium">Priority vector:</span>
                                      <button onClick={() => setAhpMethod('eigenvector')} className={`px-2 py-0.5 rounded font-semibold transition ${ahpMethod === 'eigenvector' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Eigenvector (Saaty)</button>
                                      <button onClick={() => setAhpMethod('geometric')} className={`px-2 py-0.5 rounded font-semibold transition ${ahpMethod === 'geometric' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Geometric Mean (Crawford)</button>
                                    </div>

                                    {/* CI/CR display */}
                                    {pcsResult && pcsResult.consistency && criteria.length >= 3 && (
                                      <div className={`flex items-center gap-3 rounded-lg p-2 text-[10px] border ${pcsResult.consistency.consistent ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                        <span className="font-semibold">{pcsResult.consistency.consistent ? '✓ Consistent' : '✗ Inconsistent'}</span>
                                        <span className="font-mono">CI = {pcsResult.consistency.ci.toFixed(4)}</span>
                                        <span className="font-mono">CR = {(pcsResult.consistency.cr * 100).toFixed(1)}%</span>
                                        <span className="text-slate-400">(threshold ≤ 10%)</span>
                                      </div>
                                    )}

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

                                    {/* Transitivity SVG map + matrix */}
                                    {pcsTransitivityData && Object.keys(pcsAnswers).length > 0 && (
                                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                          <Eye size={12} className="text-primary" /> Transitivity Map
                                        </h4>
                                        <p className="text-[10px] text-slate-500">
                                          Direct comparisons (solid) and derived ratios (dashed). Circle size = weight, distance = preference strength.
                                        </p>
                                        <div className="bg-white rounded-lg border border-slate-100 p-2">
                                          <svg viewBox="0 0 500 300" className="w-full" style={{ maxHeight: '280px' }}>
                                            {(() => {
                                              const n = pcsTransitivityData.criteria.length
                                              if (n < 2) return null
                                              const positions = []
                                              let cumX = 60
                                              positions.push({ x: cumX, y: 150 })
                                              for (let i = 1; i < n; i++) {
                                                const key = `${pcsTransitivityData.criteria[i-1].id}_${pcsTransitivityData.criteria[i].id}`
                                                const ans = pcsAnswers[key] || 1
                                                const ratio = ans > 0 ? ans : 1 / Math.abs(ans)
                                                const dist = Math.abs(Math.log(ratio))
                                                cumX += 40 + dist * 40
                                                const yOffset = (i % 2 === 0 ? -1 : 1) * (20 + dist * 15)
                                                positions.push({ x: Math.min(cumX, 440), y: 150 + yOffset })
                                              }
                                              const maxX = Math.max(...positions.map(p => p.x))
                                              positions.forEach(p => { p.x = 30 + (p.x - 60) * (380 / (maxX - 60 || 1)) + 30 })
                                              return (
                                                <>
                                                  {pcsTransitivityData.distances.filter(d => !d.isAdjacent).map((d, i) => (
                                                    <line key={`der-${i}`} x1={positions[d.from].x} y1={positions[d.from].y} x2={positions[d.to].x} y2={positions[d.to].y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,3" />
                                                  ))}
                                                  {pcsTransitivityData.distances.filter(d => d.isAdjacent).map((d, i) => (
                                                    <line key={`adj-${i}`} x1={positions[d.from].x} y1={positions[d.from].y} x2={positions[d.to].x} y2={positions[d.to].y} stroke="#4f6ef7" strokeWidth="2.5" />
                                                  ))}
                                                  {pcsTransitivityData.distances.map((d, i) => {
                                                    const mx = (positions[d.from].x + positions[d.to].x) / 2
                                                    const my = (positions[d.from].y + positions[d.to].y) / 2 - 8
                                                    return (
                                                      <text key={`lbl-${i}`} x={mx} y={my} textAnchor="middle" className={`text-[9px] font-mono ${d.isAdjacent ? 'fill-primary font-bold' : 'fill-slate-400'}`}>
                                                        {d.ratio >= 1 ? d.ratio.toFixed(1) : `1/${(1/d.ratio).toFixed(1)}`}
                                                      </text>
                                                    )
                                                  })}
                                                  {positions.map((pos, i) => {
                                                    const w = normalizedWeights[i]?.pct || 0
                                                    const r = Math.max(14, 10 + w * 0.3)
                                                    return (
                                                      <g key={i}>
                                                        <circle cx={pos.x} cy={pos.y} r={r} fill="#4f6ef7" fillOpacity="0.15" stroke="#4f6ef7" strokeWidth="2" />
                                                        <circle cx={pos.x} cy={pos.y} r={r - 4} fill="#4f6ef7" fillOpacity={0.1 + w * 0.008} />
                                                        <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" className="text-[9px] font-bold fill-primary">
                                                          {(pcsTransitivityData.criteria[i].name || `C${i+1}`).slice(0, 4)}
                                                        </text>
                                                        <text x={pos.x} y={pos.y + r + 12} textAnchor="middle" className="text-[8px] font-mono fill-slate-500">
                                                          {w.toFixed(0)}%
                                                        </text>
                                                      </g>
                                                    )
                                                  })}
                                                </>
                                              )
                                            })()}
                                          </svg>
                                        </div>
                                        <h5 className="text-[10px] font-bold text-slate-600">Reconstructed Matrix</h5>
                                        <div className="overflow-x-auto">
                                          <table className="text-[9px] font-mono">
                                            <thead><tr><th className="p-1"></th>{pcsTransitivityData.criteria.map((c, i) => <th key={i} className="p-1 text-slate-500 font-bold">{(c.name || `C${i+1}`).slice(0, 6)}</th>)}</tr></thead>
                                            <tbody>{pcsTransitivityData.matrix.map((row, i) => (
                                              <tr key={i}><td className="p-1 font-bold text-slate-500">{(pcsTransitivityData.criteria[i].name || `C${i+1}`).slice(0, 6)}</td>
                                                {row.map((val, j) => <td key={j} className={`p-1 text-center ${i === j ? 'text-slate-300' : Math.abs(i-j) === 1 ? 'text-primary font-bold bg-primary/5' : 'text-slate-500 bg-amber-50/50'}`}>{val >= 1 ? val.toFixed(1) : `1/${(1/val).toFixed(1)}`}</td>)}
                                              </tr>
                                            ))}</tbody>
                                          </table>
                                        </div>
                                        <div className="flex gap-3 text-[9px] text-slate-400">
                                          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-primary/20 rounded-sm" /> Direct (adjacent)</span>
                                          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-100 rounded-sm" /> Derived (transitivity)</span>
                                        </div>
                                      </div>
                                    )}

                                    {Object.keys(pcsAnswers).length === pcsAdjacentPairs.length && (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                                        <span>✓</span> All {pcsAdjacentPairs.length} pairs rated — weights applied via {ahpMethod === 'geometric' ? 'Geometric Mean (Crawford)' : 'Eigenvector (Saaty)'}.
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
                          <div className={`border rounded-xl p-4 flex items-center gap-3 ${mcda.ranking[0].koFailed ? 'bg-gradient-to-r from-red-50 to-amber-50 border-red-200' : 'bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border-primary/15'}`}>
                            <Trophy size={28} className={mcda.ranking[0].koFailed ? 'text-red-400 shrink-0' : 'text-primary shrink-0'} />
                            <div className="min-w-0">
                              <div className="text-base font-bold text-slate-800 truncate">{mcda.ranking[0].name}</div>
                              <div className="text-xs text-slate-500">Weighted Utility: <span className="font-mono font-bold text-primary">{(mcda.ranking[0].utility * 100).toFixed(1)}%</span></div>
                              {mcda.ranking[0].koFailed && <div className="text-[10px] text-red-600 font-semibold mt-0.5">Warning: Winner failed K.O. criteria</div>}
                            </div>
                          </div>
                        )}

                        {/* K.O. failures */}
                        {Object.keys(mcda.koFails || {}).length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-red-700"><Shield size={13} /> K.O. Criteria Violations</div>
                            {alternatives.filter(a => mcda.koFails[a.id]).map(a => (
                              <div key={a.id} className="text-[11px] text-red-600">
                                <strong>{a.name}:</strong> {mcda.koFails[a.id].map(f => `${f.criterion} (${f.value} ${f.direction === 'min' ? '<' : '>'} ${f.threshold})`).join(', ')}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Combined stacked bar chart */}
                        <div className="bg-slate-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-slate-600">Utility Breakdown by Criterion</h4>
                            <button
                              onClick={() => setShowPartWorths(!showPartWorths)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${showPartWorths ? 'bg-primary text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
                            >
                              {showPartWorths ? <EyeOff size={11} /> : <Eye size={11} />}
                              {showPartWorths ? 'Hide' : 'Show'} Part-Worth Details
                            </button>
                          </div>
                          <ResponsiveContainer width="100%" height={Math.max(160, mcda.ranking.length * 50)}>
                            <BarChart
                              data={mcda.ranking.map(r => {
                                const d = { name: r.name, _total: Math.round(r.utility * 1000) / 10 }
                                criteria.forEach(c => { d[c.name] = Math.round((r.partWorths[c.id] || 0) * 1000) / 10 })
                                return d
                              })}
                              layout="vertical" margin={{ left: 100, right: 55 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={100} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              {criteria.map((c, i) => (
                                <Bar key={c.id} dataKey={c.name} stackId="a" fill={ALT_COLORS[i % ALT_COLORS.length]} radius={i === criteria.length - 1 ? [0, 4, 4, 0] : undefined}>
                                  {i === criteria.length - 1 && (
                                    <LabelList
                                      dataKey="_total"
                                      position="right"
                                      formatter={v => `${v}%`}
                                      style={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                                    />
                                  )}
                                </Bar>
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Part-worth detail table (toggleable) */}
                        {showPartWorths && (
                          <div className="overflow-x-auto animate-in slide-in-from-top-2">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b-2 border-slate-200">
                                  <th className="text-left py-2 px-2 w-6 text-slate-400">#</th>
                                  <th className="text-left py-2 px-2 text-slate-700">Alternative</th>
                                  {criteria.map((c, ci) => (
                                    <th key={c.id} className="text-center py-2 px-1 text-[10px] text-slate-400 font-medium">
                                      <div className="flex items-center justify-center gap-1">
                                        <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: ALT_COLORS[ci % ALT_COLORS.length] }} />
                                        <span className="truncate max-w-[70px]" title={c.name}>{c.name}</span>
                                      </div>
                                      <div className="text-[9px] text-slate-300 font-normal mt-0.5">{normalizedWeights.find(w => w.id === c.id)?.pct.toFixed(0)}% weight</div>
                                    </th>
                                  ))}
                                  <th className="text-right py-2 px-2 text-slate-700 font-bold">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mcda.ranking.map((r, i) => (
                                  <tr key={r.id} className={`border-b border-slate-100 transition ${i === 0 ? 'bg-primary/[0.03]' : 'hover:bg-slate-50/50'}`}>
                                    <td className="py-2.5 px-2">
                                      <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold ${i < 3 ? 'text-white' : 'bg-slate-200 text-slate-500'}`} style={i < 3 ? { backgroundColor: RANK_COLORS[i] } : {}}>{i + 1}</span>
                                    </td>
                                    <td className="py-2.5 px-2 font-semibold text-sm text-slate-800">
                                      {r.name}
                                      {r.koFailed && <span className="ml-1.5 text-[9px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded">K.O.</span>}
                                    </td>
                                    {criteria.map(c => {
                                      const pw = r.partWorths[c.id] || 0
                                      const maxPw = Math.max(...mcda.ranking.map(x => x.partWorths[c.id] || 0))
                                      const isMax = pw === maxPw && pw > 0
                                      return (
                                        <td key={c.id} className="py-2.5 px-1 text-center">
                                          <span className={`font-mono text-[11px] ${isMax ? 'text-primary font-bold' : 'text-slate-500'}`}>{(pw * 100).toFixed(1)}</span>
                                        </td>
                                      )
                                    })}
                                    <td className="py-2.5 px-2 text-right"><span className="font-mono font-bold text-primary text-sm">{(r.utility * 100).toFixed(1)}%</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-600 flex items-start gap-1.5">
                          <Info size={11} className="shrink-0 mt-0.5" /><span><strong>Method:</strong> Min-max normalization [0,1]. Utility = Σ(norm × weight). Part-worth = each criterion's weighted utility contribution.</span>
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

                        {/* ══ TAB 2: Dual Criteria — all pairs (collapsible table) ══ */}
                        {analysisTab === 'dual' && (
                          <div className="space-y-4">
                            <p className="text-[11px] text-slate-400">Sweeps <strong>every pair of criteria</strong> simultaneously across all valid weight combinations (step: {sensStep}%). Sorted by robustness — <strong>critical pairs first</strong>.</p>
                            <button onClick={() => { runAllDualSweeps(); setExpandedDualPairs({}) }} disabled={criteria.length < 2}
                              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                              <Target size={14} /> Run All Pairs ({criteria.length >= 2 ? criteria.length * (criteria.length - 1) / 2 : 0} combinations)
                            </button>

                            {dualResults && dualResults.length > 0 && (
                              <div className="space-y-3">
                                {/* Summary table */}
                                <div className="rounded-xl border border-slate-200 overflow-hidden">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left py-2.5 px-3 text-[10px] text-slate-500 uppercase tracking-wide font-semibold w-6">#</th>
                                        <th className="text-left py-2.5 px-3 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Criterion Pair</th>
                                        <th className="text-center py-2.5 px-2 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Winner</th>
                                        <th className="text-center py-2.5 px-2 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Robustness</th>
                                        <th className="text-center py-2.5 px-2 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Flips</th>
                                        <th className="text-center py-2.5 px-2 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Cells</th>
                                        <th className="w-8"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dualResults.map((dr, di) => {
                                        const isExpanded = expandedDualPairs[di]
                                        const isCritical = parseFloat(dr.baseWinPct) < 60
                                        const isWarning = parseFloat(dr.baseWinPct) < 80 && !isCritical
                                        const robustColor = parseFloat(dr.baseWinPct) >= 80 ? 'bg-emerald-500' : parseFloat(dr.baseWinPct) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                        return (
                                          <React.Fragment key={di}>
                                            <tr
                                              onClick={() => setExpandedDualPairs(p => ({ ...p, [di]: !p[di] }))}
                                              className={`border-b border-slate-100 cursor-pointer transition-colors group ${
                                                isCritical ? 'bg-red-50/40 hover:bg-red-50/70' :
                                                isWarning ? 'bg-amber-50/30 hover:bg-amber-50/50' :
                                                'hover:bg-slate-50/80'
                                              }`}
                                            >
                                              <td className="py-3 px-3">
                                                {isCritical ? (
                                                  <span className="inline-flex w-5 h-5 rounded-full items-center justify-center text-[9px] font-bold bg-red-100 text-red-600">!</span>
                                                ) : (
                                                  <span className="text-[11px] font-mono text-slate-400">{di + 1}</span>
                                                )}
                                              </td>
                                              <td className="py-3 px-3">
                                                <span className="font-semibold text-slate-800">{dr.crit1.name}</span>
                                                <span className="text-slate-300 mx-1.5">×</span>
                                                <span className="font-semibold text-slate-800">{dr.crit2.name}</span>
                                              </td>
                                              <td className="py-3 px-2 text-center">
                                                <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                                  parseFloat(dr.baseWinPct) >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                                  parseFloat(dr.baseWinPct) >= 60 ? 'bg-amber-100 text-amber-700' :
                                                  'bg-red-100 text-red-700'
                                                }`}>{dr.baseWinner}</span>
                                              </td>
                                              <td className="py-3 px-2 text-center">
                                                <div className="inline-flex items-center gap-1.5">
                                                  <div className="w-14 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all ${robustColor}`} style={{ width: `${dr.baseWinPct}%` }} />
                                                  </div>
                                                  <span className={`font-mono font-bold text-[11px] ${
                                                    parseFloat(dr.baseWinPct) >= 80 ? 'text-emerald-600' :
                                                    parseFloat(dr.baseWinPct) >= 60 ? 'text-amber-600' :
                                                    'text-red-600'
                                                  }`}>{dr.baseWinPct}%</span>
                                                </div>
                                              </td>
                                              <td className="py-3 px-2 text-center">
                                                <span className={`font-mono font-bold text-[11px] ${parseFloat(dr.flipPct) > 20 ? 'text-red-500' : parseFloat(dr.flipPct) > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                  {parseFloat(dr.flipPct) > 0 ? `${dr.flipPct}%` : '0%'}
                                                </span>
                                              </td>
                                              <td className="py-3 px-2 text-center font-mono text-[11px] text-slate-400">{dr.totalCells}</td>
                                              <td className="py-3 px-2 text-right">
                                                <ChevronRight size={14} className={`text-slate-300 group-hover:text-slate-500 transition-all duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                              </td>
                                            </tr>
                                            {isExpanded && (
                                              <tr>
                                                <td colSpan={7} className="p-0">
                                                  <div className={`px-4 py-4 border-b-2 ${isCritical ? 'bg-red-50/30 border-red-100' : isWarning ? 'bg-amber-50/20 border-amber-100' : 'bg-slate-50/50 border-slate-100'}`}>
                                                    <div className="flex gap-4 flex-wrap">
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
                                                      </div>
                                                      {/* Win frequency legend */}
                                                      <div className="flex-1 min-w-[140px] space-y-1.5">
                                                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Win Distribution</div>
                                                        {dr.winFrequency.filter(w => w.count > 0).map(w => (
                                                          <div key={w.id} className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: ALT_COLORS[alternatives.findIndex(a => a.id === w.id) % ALT_COLORS.length] }} />
                                                            <span className="text-[11px] font-medium text-slate-700 truncate">{w.name}</span>
                                                            <div className="flex-1 bg-slate-200 rounded-full h-1 overflow-hidden ml-1">
                                                              <div className="h-full rounded-full" style={{ width: `${w.pct}%`, backgroundColor: ALT_COLORS[alternatives.findIndex(a => a.id === w.id) % ALT_COLORS.length] }} />
                                                            </div>
                                                            <span className="text-[11px] font-mono font-bold text-slate-600 shrink-0">{w.pct.toFixed(1)}%</span>
                                                          </div>
                                                        ))}
                                                        <div className="text-[9px] text-slate-400 mt-2 pt-1 border-t border-slate-200">
                                                          Current weights: {dr.crit1.name} = {dr.currentW1}%, {dr.crit2.name} = {dr.currentW2}%
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[10px] text-blue-600 flex items-start gap-1.5">
                                  <Info size={11} className="shrink-0 mt-0.5" />
                                  <span><strong>Method:</strong> Exhaustive grid sweep over every criterion pair with step size {sensStep}%. Remaining weight distributed proportionally. Sorted by base winner dominance (ascending = least robust first). Click any row to expand the heatmap.</span>
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
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur py-2.5 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Provided by <a href="https://svenwillrich.de" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-600 hover:text-primary transition">Dr. Sven-Erik Willrich</a> · <a href="mailto:mail@svenwillrich.de" className="hover:text-primary transition">mail@svenwillrich.de</a>
          </span>
          <button onClick={() => setShowAbout(true)} className="text-[10px] text-primary/60 hover:text-primary font-medium transition">About this tool</button>
        </div>
      </footer>

      {/* ═══ Preference Lab Modal — vertical, dynamic ═══ */}
      {showPrefLab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPrefLab(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-br from-[#1e293b] via-[#334155] to-[#1e293b] rounded-t-2xl p-5 relative overflow-hidden z-10">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(79,110,247,0.3),transparent_50%)]" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                    <Sliders size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Preference Lab</h3>
                    <p className="text-white/50 text-xs">Independent criteria weighting — all sections update dynamically</p>
                  </div>
                </div>
                <button onClick={() => setShowPrefLab(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><X size={18} /></button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* ── Section 1: Criteria ── */}
              <div className="space-y-2">
                <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">1</span>
                  Criteria
                </h4>
                <p className="text-[11px] text-slate-400">Add criteria — independent from the MCDA above.</p>
                {plCriteria.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 group">
                    <span className="text-[11px] text-slate-400 w-5 text-right font-mono">{i + 1}</span>
                    <input className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 transition" value={c.name} onChange={e => plUpdateCriterion(c.id, 'name', e.target.value)} placeholder="Criterion name…" />
                    <button onClick={() => plRemoveCriterion(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={plAddCriterion} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition ml-7"><Plus size={14} /> Add Criterion</button>
              </div>

              {/* ── Section 2: Method & Rating (only if ≥2 criteria) ── */}
              {plCriteria.length >= 2 && (
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">2</span>
                    Weight Elicitation
                  </h4>
                  {/* Method selector */}
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { id: 'direct', label: 'Direct Rating' },
                      { id: 'likert', label: 'Likert Scale' },
                      { id: 'pairwise', label: 'Pairwise (AHP)' },
                      { id: 'pcs', label: 'PC Simplified' },
                    ].map(m => (
                      <button key={m.id} onClick={() => { setPlMethod(m.id); if (m.id === 'pairwise') setPlPairAnswers({}); if (m.id === 'pcs') setPlPcsAnswers({}); if (m.id === 'likert') setPlLikertRatings({}) }}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${plMethod === m.id ? 'bg-primary text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* AHP method toggle (for pairwise/pcs) */}
                  {(plMethod === 'pairwise' || plMethod === 'pcs') && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-400 font-medium">Priority vector:</span>
                      <button onClick={() => setAhpMethod('eigenvector')} className={`px-2 py-0.5 rounded font-semibold transition ${ahpMethod === 'eigenvector' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Eigenvector (Saaty)</button>
                      <button onClick={() => setAhpMethod('geometric')} className={`px-2 py-0.5 rounded font-semibold transition ${ahpMethod === 'geometric' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Geometric Mean (Crawford)</button>
                    </div>
                  )}

                  {/* Direct Rating */}
                  {plMethod === 'direct' && (
                    <div className="space-y-2">
                      {plCriteria.map(c => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className="text-[11px] w-28 truncate font-medium text-slate-700">{c.name || '—'}</span>
                          <input type="range" min="0" max="100" value={c.weight} onChange={e => plUpdateCriterion(c.id, 'weight', parseInt(e.target.value))} className="flex-1 accent-primary" />
                          <input type="number" min="0" max="100" value={c.weight} onChange={e => plUpdateCriterion(c.id, 'weight', Math.max(0, parseInt(e.target.value) || 0))} className="w-14 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/25" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Likert Scale */}
                  {plMethod === 'likert' && (
                    <div className="space-y-2.5">
                      {plCriteria.map(c => {
                        const cur = plLikertRatings[c.id] || 0
                        return (
                          <div key={c.id} className="space-y-1">
                            <span className="text-[11px] font-medium text-slate-700">{c.name || '—'}</span>
                            <div className="flex gap-1">
                              {LIKERT.map(l => (
                                <button key={l.value} onClick={() => setPlLikertRatings(p => ({ ...p, [c.id]: l.value }))}
                                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition border ${cur === l.value ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'}`}>
                                  {l.value}
                                </button>
                              ))}
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-300 px-0.5"><span>Not important</span><span>Critical</span></div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Pairwise AHP */}
                  {plMethod === 'pairwise' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(Object.keys(plPairAnswers).length / (plPairPairs.length || 1)) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{Object.keys(plPairAnswers).length} / {plPairPairs.length}</span>
                      </div>
                      {plPairPairs.map((pair, idx) => {
                        const key = `${pair.a.id}_${pair.b.id}`
                        const answered = key in plPairAnswers
                        const currentVal = plPairAnswers[key] ?? 1
                        const scaleValues = [9, 7, 5, 3, 1, -3, -5, -7, -9]
                        return (
                          <div key={key} className={`rounded-xl p-3 border transition-all ${answered ? 'bg-white border-slate-200' : 'bg-amber-50/50 border-amber-200/70'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-mono text-slate-300 w-4 text-right shrink-0">{idx + 1}.</span>
                              <span className="text-[11px] font-bold text-primary flex-1 truncate">{pair.a.name || '—'}</span>
                              <span className="text-[10px] text-slate-300 font-medium shrink-0">vs</span>
                              <span className="text-[11px] font-bold text-secondary flex-1 truncate text-right">{pair.b.name || '—'}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <span className="text-[8px] text-primary w-4 text-center shrink-0 font-bold">◀</span>
                              {scaleValues.map(val => (
                                <button key={val} onClick={() => setPlPairAnswers(p => ({ ...p, [key]: val }))}
                                  className={`flex-1 py-1.5 rounded text-[10px] font-bold transition border ${
                                    currentVal === val ? (val === 1 ? 'border-slate-600 bg-slate-600 text-white' : val > 1 ? 'border-primary bg-primary text-white' : 'border-secondary bg-secondary text-white') : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                                  }`}>{Math.abs(val)}</button>
                              ))}
                              <span className="text-[8px] text-secondary w-4 text-center shrink-0 font-bold">▶</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* PC Simplified */}
                  {plMethod === 'pcs' && (
                    <div className="space-y-2">
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] text-blue-700 flex items-start gap-1.5">
                        <Info size={11} className="shrink-0 mt-0.5" />
                        <span><strong>PC Simplified</strong>: Only <strong>{plPcsAdjacentPairs.length}</strong> adjacent pairs instead of {plPairPairs.length}. Transitivity reconstructs the full matrix.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(Object.keys(plPcsAnswers).length / (plPcsAdjacentPairs.length || 1)) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{Object.keys(plPcsAnswers).length} / {plPcsAdjacentPairs.length}</span>
                      </div>
                      {plPcsAdjacentPairs.map((pair, idx) => {
                        const key = `${pair.a.id}_${pair.b.id}`
                        const answered = key in plPcsAnswers
                        const currentVal = plPcsAnswers[key] ?? 1
                        const scaleValues = [9, 7, 5, 3, 1, -3, -5, -7, -9]
                        return (
                          <div key={key} className={`rounded-xl p-3 border transition-all ${answered ? 'bg-white border-slate-200' : 'bg-amber-50/50 border-amber-200/70'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-mono text-slate-300 w-4 text-right shrink-0">{idx + 1}.</span>
                              <span className="text-[11px] font-bold text-primary flex-1 truncate">{pair.a.name || '—'}</span>
                              <span className="text-[10px] text-slate-300 font-medium shrink-0">vs</span>
                              <span className="text-[11px] font-bold text-secondary flex-1 truncate text-right">{pair.b.name || '—'}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <span className="text-[8px] text-primary w-4 text-center shrink-0 font-bold">◀</span>
                              {scaleValues.map(val => (
                                <button key={val} onClick={() => setPlPcsAnswers(p => ({ ...p, [key]: val }))}
                                  className={`flex-1 py-1.5 rounded text-[10px] font-bold transition border ${
                                    currentVal === val ? (val === 1 ? 'border-slate-600 bg-slate-600 text-white' : val > 1 ? 'border-primary bg-primary text-white' : 'border-secondary bg-secondary text-white') : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                                  }`}>{Math.abs(val)}</button>
                              ))}
                              <span className="text-[8px] text-secondary w-4 text-center shrink-0 font-bold">▶</span>
                            </div>
                          </div>
                        )
                      })}
                      {/* Transitivity SVG map + matrix */}
                      {plPcsTransitivityData && Object.keys(plPcsAnswers).length > 0 && (
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Eye size={12} className="text-primary" /> Transitivity Map
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Direct comparisons (solid) and derived ratios (dashed). Circle size = weight, distance = preference strength.
                          </p>
                          <div className="bg-white rounded-lg border border-slate-100 p-2">
                            <svg viewBox="0 0 500 300" className="w-full" style={{ maxHeight: '280px' }}>
                              {(() => {
                                const n = plPcsTransitivityData.criteria.length
                                if (n < 2) return null
                                const weighted = plNormalized
                                const positions = []
                                let cumX = 60
                                positions.push({ x: cumX, y: 150 })
                                for (let i = 1; i < n; i++) {
                                  const key = `${plPcsTransitivityData.criteria[i-1].id}_${plPcsTransitivityData.criteria[i].id}`
                                  const ans = plPcsAnswers[key] || 1
                                  const ratio = ans > 0 ? ans : 1 / Math.abs(ans)
                                  const dist = Math.abs(Math.log(ratio))
                                  cumX += 40 + dist * 40
                                  const yOffset = (i % 2 === 0 ? -1 : 1) * (20 + dist * 15)
                                  positions.push({ x: Math.min(cumX, 440), y: 150 + yOffset })
                                }
                                const maxX = Math.max(...positions.map(p => p.x))
                                const scale = maxX > 440 ? 440 / maxX : 1
                                positions.forEach(p => { p.x = 30 + (p.x - 60) * scale * (380 / (maxX - 60 || 1)) + 30 })
                                return (
                                  <>
                                    {plPcsTransitivityData.distances.filter(d => !d.isAdjacent).map((d, i) => (
                                      <line key={`der-${i}`} x1={positions[d.from].x} y1={positions[d.from].y} x2={positions[d.to].x} y2={positions[d.to].y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,3" />
                                    ))}
                                    {plPcsTransitivityData.distances.filter(d => d.isAdjacent).map((d, i) => (
                                      <line key={`adj-${i}`} x1={positions[d.from].x} y1={positions[d.from].y} x2={positions[d.to].x} y2={positions[d.to].y} stroke="#4f6ef7" strokeWidth="2.5" />
                                    ))}
                                    {plPcsTransitivityData.distances.map((d, i) => {
                                      const mx = (positions[d.from].x + positions[d.to].x) / 2
                                      const my = (positions[d.from].y + positions[d.to].y) / 2 - 8
                                      return (
                                        <text key={`lbl-${i}`} x={mx} y={my} textAnchor="middle" className={`text-[9px] font-mono ${d.isAdjacent ? 'fill-primary font-bold' : 'fill-slate-400'}`}>
                                          {d.ratio >= 1 ? d.ratio.toFixed(1) : `1/${(1/d.ratio).toFixed(1)}`}
                                        </text>
                                      )
                                    })}
                                    {positions.map((pos, i) => {
                                      const w = weighted[i]?.pct || 0
                                      const r = Math.max(14, 10 + w * 0.3)
                                      return (
                                        <g key={i}>
                                          <circle cx={pos.x} cy={pos.y} r={r} fill="#4f6ef7" fillOpacity="0.15" stroke="#4f6ef7" strokeWidth="2" />
                                          <circle cx={pos.x} cy={pos.y} r={r - 4} fill="#4f6ef7" fillOpacity={0.1 + w * 0.008} />
                                          <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" className="text-[9px] font-bold fill-primary">
                                            {(plPcsTransitivityData.criteria[i].name || `C${i+1}`).slice(0, 4)}
                                          </text>
                                          <text x={pos.x} y={pos.y + r + 12} textAnchor="middle" className="text-[8px] font-mono fill-slate-500">
                                            {w.toFixed(0)}%
                                          </text>
                                        </g>
                                      )
                                    })}
                                  </>
                                )
                              })()}
                            </svg>
                          </div>
                          <h5 className="text-[10px] font-bold text-slate-600">Reconstructed Matrix</h5>
                          <div className="overflow-x-auto">
                            <table className="text-[9px] font-mono">
                              <thead><tr><th className="p-1"></th>{plPcsTransitivityData.criteria.map((c, i) => <th key={i} className="p-1 text-slate-500 font-bold">{(c.name || `C${i+1}`).slice(0, 6)}</th>)}</tr></thead>
                              <tbody>{plPcsTransitivityData.matrix.map((row, i) => (
                                <tr key={i}><td className="p-1 font-bold text-slate-500">{(plPcsTransitivityData.criteria[i].name || `C${i+1}`).slice(0, 6)}</td>
                                  {row.map((val, j) => <td key={j} className={`p-1 text-center ${i === j ? 'text-slate-300' : Math.abs(i-j) === 1 ? 'text-primary font-bold bg-primary/5' : 'text-slate-500 bg-amber-50/50'}`}>{val >= 1 ? val.toFixed(1) : `1/${(1/val).toFixed(1)}`}</td>)}
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                          <div className="flex gap-3 text-[9px] text-slate-400">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-primary/20 rounded-sm" /> Direct (adjacent)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-100 rounded-sm" /> Derived (transitivity)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Consistency Index (for pairwise/pcs) */}
                  {plAhpResult && (plMethod === 'pairwise' || plMethod === 'pcs') && (
                    <div className={`rounded-lg p-2.5 text-[11px] flex items-center gap-3 border ${plAhpResult.consistency.consistent ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                      <div className="font-bold">{plAhpResult.consistency.consistent ? '✓ Consistent' : '✗ Inconsistent'}</div>
                      <div className="flex gap-3 font-mono text-[10px]">
                        <span>λ<sub>max</sub> = {plAhpResult.consistency.lambdaMax.toFixed(3)}</span>
                        <span>CI = {plAhpResult.consistency.ci.toFixed(4)}</span>
                        <span>CR = {(plAhpResult.consistency.cr * 100).toFixed(1)}%</span>
                      </div>
                      <span className="text-[9px] opacity-70">(threshold ≤ 10%)</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Section 3: Results (dynamic, always visible when weights exist) ── */}
              {plCriteria.length >= 2 && plTotalWeight > 0 && (
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">3</span>
                    Results
                    <span className="text-[10px] font-normal text-slate-400 ml-1">({plMethod === 'direct' ? 'Direct' : plMethod === 'likert' ? 'Likert' : plMethod === 'pairwise' ? 'AHP' : 'PCS'} · {ahpMethod === 'geometric' && (plMethod === 'pairwise' || plMethod === 'pcs') ? 'Geometric Mean' : (plMethod === 'pairwise' || plMethod === 'pcs') ? 'Eigenvector' : ''})</span>
                  </h4>
                  <div className="space-y-1.5">
                    {[...plNormalized].sort((a, b) => b.pct - a.pct).map((c, i) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <span className="text-[11px] w-5 text-right font-bold text-slate-400">{i + 1}.</span>
                        <span className="text-[11px] w-28 truncate font-semibold text-slate-700">{c.name || '—'}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                          <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${c.pct}%`, background: ALT_COLORS[i % ALT_COLORS.length] }} />
                        </div>
                        <span className="text-[12px] font-mono font-bold text-slate-700 w-14 text-right">{c.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ About This Tool Modal ═══ */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAbout(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-br from-[#1e293b] via-[#334155] to-[#1e293b] rounded-t-2xl p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(79,110,247,0.3),transparent_50%)]" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                      <BarChart3 size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">About This Tool</h3>
                      <p className="text-white/50 text-xs">Multi-Criteria Decision Analysis Framework</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAbout(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><X size={18} /></button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5 text-sm text-slate-700 leading-relaxed">
              {/* Intro */}
              <div>
                <p className="text-base text-slate-800 font-medium leading-relaxed">
                  This <strong>Multi-Criteria Decision Analysis (MCDA)</strong> tool was designed and developed
                  by <strong>Dr. Sven-Erik Willrich</strong> — a professional-grade decision analysis framework built on
                  rigorous quantitative methods, designed to transform complex multi-criteria decisions into structured,
                  transparent, and defensible outcomes.
                </p>
              </div>

              {/* Key Features */}
              <div>
                <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[13px] mb-3">
                  <Sparkles size={14} className="text-primary" /> What Makes This Tool Unique
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { icon: '🎓', title: 'Academically Grounded', desc: 'Based on the doctoral research of Dr. Sven-Erik Willrich at the Karlsruhe Institute of Technology (KIT), integrating state-of-the-art MCDA methodology with practical usability.' },
                    { icon: '⚖️', title: '4 Weight Elicitation Methods', desc: 'Direct Rating, Likert Scale, full AHP (Analytic Hierarchy Process), and PC Simplified — a method empirically validated by Dr. Willrich with over 150 participants.' },
                    { icon: '🔬', title: '4-Dimensional Sensitivity Analysis', desc: 'Single-criterion sweeps, exhaustive dual-criteria grid analysis, full n-dimensional combinatorial sweeps, and Monte Carlo simulation with Dirichlet-uniform sampling.' },
                    { icon: '⚡', title: 'Real-Time Computation', desc: 'Live weight updates, min-max normalization with directional scoring (maximize/minimize), and instant part-worth decomposition.' },
                  ].map((f, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg shrink-0 mt-0.5">{f.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-slate-800 mb-0.5">{f.title}</div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{f.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Research Foundation */}
              <div className="bg-gradient-to-br from-primary/5 via-secondary/5 to-primary/5 rounded-xl p-4 border border-primary/10">
                <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[13px] mb-2">
                  <Shield size={14} className="text-primary" /> Research Foundation
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Dr. Sven-Erik Willrich's doctoral dissertation at KIT demonstrated that <strong>simplified pairwise comparison
                  methods (PCS)</strong> can achieve comparable decision quality to full AHP while dramatically reducing cognitive
                  load — making rigorous MCDA accessible to broader audiences including citizen participation contexts. The study
                  with over 150 participants confirmed that PCS produces comparable rankings with 60%+ faster completion times.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed mt-2">
                  The <strong>sensitivity analysis suite</strong> in this tool goes beyond traditional one-at-a-time approaches:
                  the exhaustive pairwise grid sweep reveals exactly which criterion weight combinations lead to ranking changes,
                  while Monte Carlo simulation provides probabilistic robustness assessment across the entire weight space.
                  This comprehensive approach ensures that decision-makers understand not only <em>what</em> the best option is,
                  but <em>how stable</em> that conclusion is under varying assumptions.
                </p>
              </div>

              {/* Best Practices */}
              <div>
                <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[13px] mb-2">
                  <Target size={14} className="text-secondary" /> Best Practices Integrated
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold mt-px">✓</span> <span><strong>Min-max normalization</strong> for commensurable utility scores across heterogeneous criteria</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold mt-px">✓</span> <span><strong>Directional scoring</strong> — automatic handling of maximize vs. minimize criteria</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold mt-px">✓</span> <span><strong>AHP eigenvector method</strong> for deriving consistent weights from pairwise comparisons (Saaty, 1980)</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold mt-px">✓</span> <span><strong>PC Simplified</strong> with n-1 adjacent comparisons for guaranteed consistency (Koczkodaj & Szybowski, 2015; Willrich, 2021)</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold mt-px">✓</span> <span><strong>Dirichlet-uniform sampling</strong> for unbiased Monte Carlo weight space exploration</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500 font-bold mt-px">✓</span> <span><strong>Exhaustive combinatorial sweeps</strong> for complete robustness characterization across all criterion pairs and higher-order combinations</span></li>
                </ul>
              </div>

              {/* Use Cases */}
              <div>
                <h4 className="font-bold text-slate-800 text-[13px] mb-2">Built For</h4>
                <div className="flex flex-wrap gap-1.5">
                  {['Strategic business decisions', 'Technology platform selection', 'Investment analysis', 'Urban planning', 'Public participation', 'Academic research', 'Consulting engagements', 'Product evaluation'].map(u => (
                    <span key={u} className="px-2.5 py-1 bg-slate-100 rounded-full text-[10px] font-medium text-slate-600">{u}</span>
                  ))}
                </div>
              </div>

              {/* Reference */}
              <div className="bg-slate-50 rounded-xl p-3 text-[10px] text-slate-500 space-y-1.5 border border-slate-100">
                <p className="font-bold text-slate-600 text-[11px]">References</p>
                <p>Willrich, S.-E. (2021). <em>Participatory Multi-Criteria Decision-Making for Common Goods.</em> Doctoral dissertation, Karlsruhe Institute of Technology (KIT).</p>
                <p>Koczkodaj, W. W. & Szybowski, J. (2015). <em>Pairwise comparisons simplified.</em> Applied Mathematics and Computation, 253, 387–394.</p>
                <p>Saaty, T. L. (1980). <em>The Analytic Hierarchy Process.</em> McGraw-Hill, New York.</p>
              </div>

              {/* Contact */}
              <div className="text-center pt-2 pb-1">
                <p className="text-xs text-slate-500">
                  Designed & developed by <strong className="text-slate-700">Dr. Sven-Erik Willrich</strong>
                </p>
                <p className="text-[11px] text-slate-400 mt-1 space-x-2">
                  <a href="https://svenwillrich.de" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition font-medium">svenwillrich.de</a>
                  <span className="text-slate-300">·</span>
                  <a href="mailto:mail@svenwillrich.de" className="text-primary/70 hover:text-primary transition">mail@svenwillrich.de</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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
