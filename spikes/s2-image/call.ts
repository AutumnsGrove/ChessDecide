export async function decide(body: any) {
  const t = performance.now();
  const r = await fetch('https://openrouter.ai/api/alpha/decisions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'ChessDecide' }, body: JSON.stringify(body) });
  const text = await r.text(); let json: any; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, ms: Math.round(performance.now() - t), json };
}
