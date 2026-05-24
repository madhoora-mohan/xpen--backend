const clients = new Map()

function addClient(email, res) {
  if (!clients.has(email)) clients.set(email, new Set())
  clients.get(email).add(res)
}

function removeClient(email, res) {
  const set = clients.get(email)
  if (!set) return
  set.delete(res)
  if (set.size === 0) clients.delete(email)
}

function emit(email, event, data = {}) {
  const set = clients.get(email)
  if (!set) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of set) {
    res.write(payload)
  }
}

module.exports = { addClient, removeClient, emit }
