export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { proxies, filename, owner, repo } = req.body;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GitHub token not configured in Vercel' });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;

  // 1. Baca file lama (jika ada)
  let oldProxies = [];
  let sha = "";
  try {
    const resHead = await fetch(url, {
      headers: { Authorization: `token ${token}` }
    });
    if (resHead.ok) {
      const data = await resHead.json();
      sha = data.sha;
      const oldContent = Buffer.from(data.content, 'base64').toString('utf8');
      // Parse YAML lama — ambil array proxies
      const lines = oldContent.split('\n');
      let inProxies = false;
      let currentProxy = null;
      for (let line of lines) {
        if (line.trim() === 'proxies:') {
          inProxies = true;
          continue;
        }
        if (inProxies && line.trim().startsWith('- name:')) {
          if (currentProxy) oldProxies.push(currentProxy);
          currentProxy = { name: line.split('"')[1] || 'Unnamed' };
        } else if (inProxies && currentProxy && line.trim().startsWith('type:')) {
          currentProxy.type = line.split(':')[1].trim();
        } else if (inProxies && currentProxy && line.trim().startsWith('server:')) {
          currentProxy.server = line.split(':')[1].trim();
        } else if (inProxies && currentProxy && line.trim().startsWith('port:')) {
          currentProxy.port = parseInt(line.split(':')[1].trim());
        }
        // Tambahkan field lain jika perlu
      }
      if (currentProxy) oldProxies.push(currentProxy);
    }
  } catch (e) {
    console.log("File belum ada atau error baca:", e);
  }

  // 2. Gabung proxy lama + baru
  const allProxies = [...oldProxies, ...proxies];

  // 3. Hapus duplikat berdasarkan name
  const seen = new Set();
  const uniqueProxies = allProxies.filter(proxy => {
    if (seen.has(proxy.name)) return false;
    seen.add(proxy.name);
    return true;
  });

  // 4. Generate YAML baru
  let yaml = "proxies:\n";
  uniqueProxies.forEach(proxy => {
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

  // 5. Simpan ke GitHub
  const content = Buffer.from(yaml).toString('base64');
  const payload = {
    message: `Update ${filename} via Sub Converter (merge)`,
    content: content,
    sha: sha // penting! tanpa ini, GitHub akan reject
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
