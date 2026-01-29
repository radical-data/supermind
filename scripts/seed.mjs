const base = 'http://localhost:5173'\;

const token = process.env.ADMIN_TOKEN;
const auth = token ? `Basic ${Buffer.from(`admin:${token}`).toString('base64')}` : null;

const NAMES = [
  'Amira','Bas','Caro','Daan','Ella','Finn','Gwen','Hugo','Iris','Jordy','Kiki','Lars',
  'Mara','Noor','Owen','Pia','Quin','Ravi','Sara','Timo','Uma','Vik','Wout','Xena','Yara','Zoe',
  'Bente','Koen','Lena','Sven','Nina','Mick','Jules','Roos','Tygo','Maud','Puck','Jade','Fleur','Siem'
];

const LINES = [
  "Earlier disease detection in greenhouses would cut waste.",
  "We need varieties that handle heat spikes without flavor loss.",
  "Better shelf-life while keeping texture is key for retailers.",
  "Transparent sustainability metrics help our customers choose.",
  "Can we forecast demand swings to plan seed production?",
  "Breeding for fewer inputs reduces grower cost and footprint.",
  "We should align tasting notes with market segments.",
  "Packaging data shows bruising; tougher skins might help.",
  "Trial feedback needs to flow back into breeding faster.",
  "AI could flag anomalous growth patterns from camera feeds.",
  "We need clearer language on ‘resilience’ vs ‘yield’.",
  "Export customers want traceability from seed to shelf.",
  "Shorter R&D cycles without quality compromise is the challenge.",
  "Cross-team review earlier would save rework.",
  "Pilot kits should be easier to register and reorder.",
  "Flavor profiles need a standard scale across regions.",
  "Weather volatility is the new normal—design for it.",
  "Retail demos show consumers love sweeter cherry lines.",
  "Less plastic in trials would help our story.",
  "We should capture grower anecdotes, not just scores."
];

async function post(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  const r = await fetch(base + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

(async () => {
  console.log('Seeding participants + lines…');
  const created = [];
  for (const name of NAMES) {
    const { participantId } = await post('/api/join', { name });
    const count = 1 + Math.floor(Math.random()*3);
    for (let i = 0; i < count; i++) {
      await post('/api/submit', { participantId, kind: 'line', payload: { text: pick(LINES) } });
      await sleep(40);
    }
    created.push(participantId);
  }
  if (auth) {
    try {
      await post('/api/admin/summary', {});
      console.log('Summary triggered via admin endpoint.');
    } catch (err) {
      console.error('Failed to trigger summary from seed script:', err);
    }
  } else {
    console.log('ADMIN_TOKEN not set; skipping summary trigger.');
  }
  console.log(`Done. Seeded ${created.length} people. Open /visualiser to photograph.`);
})();
