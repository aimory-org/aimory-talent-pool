import { useMemo, useState } from 'react'
import './App.css'

type Candidate = {
  id: string
  name: string
  talentCategory: 'IT Resources' | 'Accounting and Finance Resources'
  location: string
  years: number | null
  rate: string
  summary: string
  skills: string[]
}

const CANDIDATES: Candidate[] = [
  {
    id: 'cand-001',
    name: 'Benjamin Cassatt',
    talentCategory: 'IT Resources',
    location: 'Arlington, VA',
    years: 1,
    rate: 'Unknown',
    summary: 'Cloud-native engineer with data platform and CI/CD experience.',
    skills: ['Python', 'AWS', 'React', 'Databricks', 'CI/CD'],
  },
  {
    id: 'cand-002',
    name: 'Jack D. Nickerson',
    talentCategory: 'IT Resources',
    location: 'Arlington, VA',
    years: null,
    rate: 'Unknown',
    summary: 'Full-stack developer focused on secure, user-friendly apps.',
    skills: ['Full-stack', 'PostgreSQL', 'IT support', 'Web apps'],
  },
  {
    id: 'cand-003',
    name: 'Maya Rivera',
    talentCategory: 'Accounting and Finance Resources',
    location: 'Chicago, IL',
    years: 6,
    rate: '$78/hr',
    summary: 'FP&A analyst with budgeting, forecasting, and KPI reporting.',
    skills: ['FP&A', 'Excel', 'Forecasting', 'Power BI'],
  },
  {
    id: 'cand-004',
    name: 'Ethan Patel',
    talentCategory: 'IT Resources',
    location: 'Austin, TX',
    years: 9,
    rate: '$120/hr',
    summary: 'Senior backend engineer specializing in distributed systems.',
    skills: ['Go', 'Kubernetes', 'PostgreSQL', 'AWS'],
  },
  {
    id: 'cand-005',
    name: 'Nora Smith',
    talentCategory: 'Accounting and Finance Resources',
    location: 'Boston, MA',
    years: 4,
    rate: '$62/hr',
    summary: 'Staff accountant with audit support and month-end close.',
    skills: ['GAAP', 'QuickBooks', 'Reconciliations'],
  },
]

const CATEGORIES = ['All', 'IT Resources', 'Accounting and Finance Resources'] as const

const STATES = ['Any', 'VA', 'TX', 'IL', 'MA'] as const

function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [stateFilter, setStateFilter] = useState<(typeof STATES)[number]>('Any')
  const [minYears, setMinYears] = useState('')

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const yearsValue = minYears ? Number(minYears) : null

    return CANDIDATES.filter((candidate) => {
      if (category !== 'All' && candidate.talentCategory !== category) {
        return false
      }

      if (stateFilter !== 'Any' && !candidate.location.endsWith(stateFilter)) {
        return false
      }

      if (yearsValue !== null && candidate.years !== null && candidate.years < yearsValue) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        candidate.name,
        candidate.summary,
        candidate.location,
        candidate.skills.join(' '),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [category, minYears, query, stateFilter])

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Aimory Talent Pool</p>
          <h1>Search, filter, and shortlist candidates in seconds.</h1>
          <p className="subtitle">
            Clean, structured talent profiles generated from resumes. Built for fast discovery and
            confident decisions.
          </p>
        </div>
        <div className="hero-card">
          <div>
            <p className="card-label">Active candidates</p>
            <p className="card-value">{CANDIDATES.length}</p>
          </div>
          <div>
            <p className="card-label">Filtered</p>
            <p className="card-value">{filtered.length}</p>
          </div>
          <div>
            <p className="card-label">Categories</p>
            <p className="card-value">2</p>
          </div>
        </div>
      </header>

      <section className="controls">
        <div className="search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search by name, skills, location..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="filters">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            State
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
            >
              {STATES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Min years
            <input
              type="number"
              min={0}
              placeholder="0"
              value={minYears}
              onChange={(event) => setMinYears(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="table-card">
        <div className="table-header">
          <div>
            <h2>Candidate results</h2>
            <p>Showing {filtered.length} profiles</p>
          </div>
          <button className="primary">Export shortlist</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Location</th>
                <th>Skills</th>
                <th>Experience</th>
                <th>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <div className="candidate">
                      <div>
                        <p className="candidate-name">{candidate.name}</p>
                        <p className="candidate-summary">{candidate.summary}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="pill">{candidate.talentCategory}</span>
                  </td>
                  <td>{candidate.location}</td>
                  <td>
                    <div className="tags">
                      {candidate.skills.map((skill) => (
                        <span key={skill} className="tag">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{candidate.years === null ? 'Unknown' : `${candidate.years} yrs`}</td>
                  <td>{candidate.rate}</td>
                  <td className="actions">
                    <button className="ghost">View</button>
                    <button className="ghost">Resume</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App
