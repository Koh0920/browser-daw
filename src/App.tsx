import { HashRouter as Router, Route, Routes } from "react-router-dom"
import HomePage from "./pages/HomePage"
import ProjectPage from "./pages/ProjectPage"
import SharedProjectPage from "./pages/SharedProjectPage"

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/shared/:encodedData" element={<SharedProjectPage />} />
      </Routes>
    </Router>
  )
}

export default App