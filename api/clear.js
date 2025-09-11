export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename, owner, repo } = req.body;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  // ✅ PERBAIKAN: HAPUS SPASI DI SINI!
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;

  let sha = "";
  try {
    const resHead = await fetch(url, {
      headers: { Authorization: `token ${token}` }
    });
    if (resHead.ok) {
      const data = await resHead.json();
      sha = data.sha;
    }
  } catch (e) {
    return res.status(404).json({ error: 'File not found' });
  }

  const content = Buffer.from("proxies: []").toString('base64');
  const payload = {
    message: `Clear ${filename}`,
    content: content,
    sha: sha
  };

  const githubRes = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (githubRes.ok) {
    return res.status(200).json({ success: true });
  } else {
    const err = await githubRes.text();
    return res.status(500).json({ error: err });
  }
}
