import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

const getVendorChunkName = (id: string) => {
  if (!id.includes("node_modules")) {
    return null
  }

  if (
    id.includes("/react/") ||
    id.includes("/react-dom/") ||
    id.includes("/react-router/") ||
    id.includes("/react-router-dom/")
  ) {
    return "react-vendor"
  }

  if (
    id.includes("/@radix-ui/") ||
    id.includes("/lucide-react/") ||
    id.includes("/cmdk/") ||
    id.includes("/embla-carousel-react/") ||
    id.includes("/react-resizable-panels/") ||
    id.includes("/sonner/")
  ) {
    return "ui-vendor"
  }

  if (
    id.includes("/zustand/") ||
    id.includes("/dexie/") ||
    id.includes("/immer/")
  ) {
    return "state-vendor"
  }

  return "vendor"
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getVendorChunkName(id)
        },
      },
    },
  },
})
