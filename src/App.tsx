import { Suspense, lazy } from "react"
import { HashRouter as Router, Route, Routes } from "react-router-dom"

const HomePage = lazy(() => import("./pages/HomePage"))
const ProjectPage = lazy(() => import("./pages/ProjectPage"))
const SharedProjectPage = lazy(() => import("./pages/SharedProjectPage"))

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--daw-surface-2))] text-sm font-medium text-slate-300">
    Loading session...
  </div>
)

function App() {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/shared/:encodedData" element={<SharedProjectPage />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App