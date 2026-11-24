import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Serveur de développement accessible seulement depuis cet ordinateur (ajouter --host pour un test sur mobile)
  server: { host: "localhost", port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Les bibliothèques changent rarement : fichiers séparés, gardés en cache par le navigateur entre deux déploiements
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("lucide-react")) return "icons";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return "vendor";
        }
      }
    }
  }
});
