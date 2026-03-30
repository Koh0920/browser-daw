import { Outlet } from "react-router-dom"
import Header from "./Header"

const Layout = () => {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
