import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 10000

const distPath = path.resolve(__dirname, 'dist')

app.use(express.static(distPath))

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend server listening on http://0.0.0.0:${port}`)
})


