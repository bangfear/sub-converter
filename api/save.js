export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { proxies, filename, owner, repo } = req.body;

  // Ambil token dari Environment Variable — AMAN!
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GitHub token not configured in Vercel' });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;

  // Baca file lama untuk dapat SHA
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
    console.log("File belum ada:", e);
  }

  // Generate YAML
  let yaml = "proxies:\n";
  proxies.forEach(proxy => {
    yaml += `  - name: "${proxy.name}"\n`;
    yaml += `    type: ${proxy.type}\n`;
    yaml += `    server: ${proxy.server}\n`;
    yaml += `    port: ${proxy.port}\n`;
    if (proxy.type === 'vless' || proxy.type === 'vmess') yaml += `    uuid: ${proxy.uuid}\n`;
    if (proxy.type === 'trojan') yaml += `    password: ${proxy.password}\n`;
    if (proxy.type === 'vmess') {
      yaml += `    alterId: ${proxy.alterId}\n`;
      yaml += `    cipher: ${proxy.cipher}\n`;
    }
    if (proxy.tls !== undefined) {
      yaml += `    tls: ${proxy.tls}\n`;
      yaml += `    servername: ${proxy.servername}\n`;
    }
    if (proxy.sni !== undefined) yaml += `    sni: ${proxy.sni}\n`;
    yaml += `    skip-cert-verify: true\n`;
    yaml += `    network: ${proxy.network}\n`;
    if (proxy.ws_opts) {
      yaml += `    ws-opts:\n`;
      yaml += `      path: ${proxy.ws_opts.path}\n`;
      yaml += `      headers:\n`;
      yaml += `        Host: ${proxy.ws_opts.headers.Host}\n`;
    }
    yaml += `    interface-name: ${proxy.interface}\n`;
    yaml += `    udp: true\n`;
  });

  const content = Buffer.from(yaml).toString('base64');
  const payload = {
    message: `Update ${filename} via Sub Converter`,
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
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
    return res.status(200).json({ success: true, url: rawUrl });
  } else {
    const err = await githubRes.text();
    return res.status(500).json({ error: err });
  }
}
