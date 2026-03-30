import { Link, useParams } from "react-router-dom"

const SharedProjectPage = () => {
  const { encodedData } = useParams<{ encodedData: string }>()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-lg shadow-slate-950/20">
        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-cyan-300">Shared Project</p>
        <h1 className="text-2xl font-semibold">Sharing is not rebuilt yet</h1>
        <p className="mt-4 text-sm text-slate-400">
          Shared project import is out of the first MVP slice. The requested payload was {encodedData ? "detected" : "missing"}, but this route is currently informational only.
        </p>
        <Link to="/" className="mt-6 inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-400 hover:text-cyan-200">
          Back to projects
        </Link>
      </div>
    </div>
  )
}

export default SharedProjectPage