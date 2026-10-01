import { createRoot } from 'react-dom/client'
import { ArApp } from './ArApp'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(<ArApp />)
