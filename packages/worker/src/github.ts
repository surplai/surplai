/**
 * GitHub App Installation Token取得 + PR作成
 *
 * JWT生成 → Installation Token取得 → GitHub API操作
 */

/** RSA-PKCS1-v1_5 で JWT を署名する (Web Crypto API) */
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

  // PEMからバイナリへ
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

/** GitHub App の Installation Token を取得する */
async function getInstallationToken(
  appId: string,
  privateKey: string,
  owner: string,
  repo: string
): Promise<string> {
  const jwt = await createJWT(appId, privateKey);

  // まずinstallation IDを取得
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

  // Installation Tokenを取得
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

/** GitHub APIリクエストのヘルパー */
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

export type CreatePRParams = {
  appId: string;
  privateKey: string;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  patch: string;
  donorHandle: string;
  modelUsed: string;
};

/** patchからPRを作成する */
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
    patch,
    donorHandle,
    modelUsed,
  } = params;

  const token = await getInstallationToken(appId, privateKey, owner, repo);
  const branchName = `surplai/fix-${issueNumber}`;

  // デフォルトブランチ取得
  const repoInfo = (await githubApi(
    token,
    "GET",
    `/repos/${owner}/${repo}`
  )) as { default_branch: string };
  const baseBranch = repoInfo.default_branch;

  // ベースブランチのSHA取得
  const baseRef = (await githubApi(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`
  )) as { object: { sha: string } };
  const baseSha = baseRef.object.sha;

  // ブランチ作成
  await githubApi(token, "POST", `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  // patchの各ファイルをコミット（simplified: 1ファイルずつtree API経由）
  // ここではGit Data APIでpatchを適用する
  // 簡略化: patch内容をPR bodyに含め、直接コミットする方式は複雑なため
  // まずはファイル単位のContent APIを使う

  // TODO: patchをパースしてファイル単位でContent APIを呼ぶ実装
  // Phase 1ではCLI側でpushしてもらう方式も検討
  // 現時点ではPR作成のみ（ブランチへのpush方法は要検討）

  // PR作成
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
