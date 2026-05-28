import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 10000

// Use process.cwd() as primary to be safe on different platforms
const baseDir = __dirname
const distPath = path.resolve(baseDir, 'dist')

console.log(`[Frontend] Server starting...`)
console.log(`[Frontend] Directory: ${baseDir}`)
console.log(`[Frontend] Dist path: ${distPath}`)

if (!fs.existsSync(distPath)) {
  console.error(`[Frontend] CRITICAL: Dist directory not found at ${distPath}`)
} else {
  console.log(`[Frontend] Dist directory found. Serving files...`)
}

// Serve static files
app.use(express.static(distPath))

// SPA fallback: Send index.html for any request that doesn't match a static file
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html')

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    console.error(`[Frontend] 404: index.html not found for route: ${req.url}`)
    res.status(404).send('Application build not found. Please check deployment logs.')
  }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`[Frontend] Listening on http://0.0.0.0:${port}`)
})
