// Comprobación rápida del parser: node --experimental-strip-types scripts/parse.test.mjs
import assert from 'node:assert/strict'
import { parseTask } from '../src/lib/parse.ts'

const now = new Date(2026, 8, 29) // martes 29 sep 2026
const cases = [
  ['comprar pan', { title: 'Comprar pan', priority: null, scope: 'day', date: '2026-09-29' }],
  ['llamar a Ana mañana prioridad alta', { title: 'Llamar a Ana', priority: 'high', scope: 'day', date: '2026-09-30' }],
  ['Añade enviar presupuesto para pasado mañana', { title: 'Enviar presupuesto', priority: null, scope: 'day', date: '2026-10-01' }],
  ['gimnasio mañana por la mañana', { title: 'Gimnasio por la mañana', priority: null, scope: 'day', date: '2026-09-30' }],
  ['correr por la mañana', { title: 'Correr por la mañana', priority: null, scope: 'day', date: '2026-09-29' }],
  ['revisar contrato esta semana con prioridad media', { title: 'Revisar contrato', priority: 'medium', scope: 'week', date: '2026-09-28' }],
  ['preparar informe la semana que viene', { title: 'Preparar informe', priority: null, scope: 'week', date: '2026-10-05' }],
  ['dentista el viernes', { title: 'Dentista', priority: null, scope: 'day', date: '2026-10-02' }],
  ['reunión el martes', { title: 'Reunión', priority: null, scope: 'day', date: '2026-10-06' }],
  ['recuérdame que pague el seguro hoy, urgente', { title: 'Pague el seguro', priority: 'high', scope: 'day', date: '2026-09-29' }],
  ['aprender piano algún día prioridad baja', { title: 'Aprender piano', priority: 'low', scope: 'later', date: null }],
]

for (const [input, expected] of cases) assert.deepEqual(parseTask(input, now), expected, input)
console.log(`${cases.length} casos correctos`)
