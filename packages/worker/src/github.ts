/**
 * GitHub App: Installation Token取得 + Git Data APIでコミット + PR作成
 */

async function createJWT(
  appId: string,
  privateKeyPem: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: appId, iat: now - 60, exp: now + 600 };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signingInput}.${sigB64}`;
}

async function getInstallationToken(
  appId: string,
  privateKey: string,
  owner: string,
  repo: string
): Promise<string> {
  const jwt = await createJWT(appId, privateKey);

  const installRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/installation`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "surplai-bot",
      },
    }
  );
  if (!installRes.ok) {
    throw new Error(
      `Failed to get installation: ${installRes.status} ${await installRes.text()}`
    );
  }
  const { id: installationId } = (await installRes.json()) as { id: number };

  const tokenRes = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "surplai-bot",
      },
    }
  );
  if (!tokenRes.ok) {
    throw new Error(
      `Failed to get token: ${tokenRes.status} ${await tokenRes.text()}`
    );
  }
  const { token } = (await tokenRes.json()) as { token: string };
  return token;
}

async function githubApi(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "surplai-bot",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(
      `GitHub API error: ${method} ${path} → ${res.status} ${await res.text()}`
    );
  }
  return res.json();
}

export type ChangedFile = {
  path: string;
  content: string;
};

export type CreatePRParams = {
  appId: string;
  privateKey: string;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  files: ChangedFile[];
  donorHandle: string;
  modelUsed: string;
};

/** 変更ファイルからコミットを作成してPRを出す */
export async function createPullRequest(
  params: CreatePRParams
): Promise<string> {
  const {
    appId,
    privateKey,
    owner,
    repo,
    issueNumber,
    issueTitle,
    files,
    donorHandle,
    modelUsed,
  } = params;

  const token = await getInstallationToken(appId, privateKey, owner, repo);
  const suffix = Date.now().toString(36);
  const branchName = `surplai/fix-${issueNumber}-${suffix}`;

  // 1. デフォルトブランチとそのHEAD SHA取得
  const repoInfo = (await githubApi(
    token,
    "GET",
    `/repos/${owner}/${repo}`
  )) as { default_branch: string };
  const baseBranch = repoInfo.default_branch;

  const baseRef = (await githubApi(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`
  )) as { object: { sha: string } };
  const baseSha = baseRef.object.sha;

  // 2. ベースコミットのtree SHA取得
  const baseCommit = (await githubApi(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/commits/${baseSha}`
  )) as { tree: { sha: string } };
  const baseTreeSha = baseCommit.tree.sha;

  // 3. 各ファイルのblobを作成
  const treeItems = [];
  for (const file of files) {
    const blob = (await githubApi(
      token,
      "POST",
      `/repos/${owner}/${repo}/git/blobs`,
      { content: file.content, encoding: "utf-8" }
    )) as { sha: string };

    treeItems.push({
      path: file.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    });
  }

  // 4. 新しいtreeを作成
  const newTree = (await githubApi(
    token,
    "POST",
    `/repos/${owner}/${repo}/git/trees`,
    { base_tree: baseTreeSha, tree: treeItems }
  )) as { sha: string };

  // 5. コミット作成
  const commit = (await githubApi(
    token,
    "POST",
    `/repos/${owner}/${repo}/git/commits`,
    {
      message: `fix: ${issueTitle}\n\nFixes #${issueNumber}\nPowered-by: ${donorHandle}\nGenerated-by: surplai (${modelUsed})`,
      tree: newTree.sha,
      parents: [baseSha],
    }
  )) as { sha: string };

  // 6. ブランチ作成（既存なら更新）
  try {
    await githubApi(token, "POST", `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: commit.sha,
    });
  } catch {
    // ブランチが既に存在する場合は force update
    await githubApi(
      token,
      "PATCH",
      `/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
      { sha: commit.sha, force: true }
    );
  }

  // 7. PR作成
  const pr = (await githubApi(
    token,
    "POST",
    `/repos/${owner}/${repo}/pulls`,
    {
      title: `fix: ${issueTitle}`,
      head: branchName,
      base: baseBranch,
      body: [
        `Fixes #${issueNumber}`,
        "",
        `Powered-by: ${donorHandle}`,
        `Generated-by: surplai (${modelUsed})`,
        "",
        "---",
        "*This PR was automatically generated by [surplai](https://surplai.dev).*",
      ].join("\n"),
    }
  )) as { html_url: string };

  return pr.html_url;
}
