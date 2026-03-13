export default async function handler(req, res) {
  return res.status(200).json({ 
    ok: true, 
    message: "API is working",
    timestamp: new Date().toISOString()
  });
}
