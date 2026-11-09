export function parseGitHubRepo(input) {
  if (!input || typeof input !== 'string') return null;
  let trimmed = input.trim();
  if (!trimmed) return null;

  trimmed = trimmed.replace(/^git@github\.com:/i, '');
  trimmed = trimmed.replace(new RegExp('^git://github\\.com/', 'i'), '');

  try {
    let url = null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      url = new URL(trimmed);
    } else if (trimmed.startsWith('github.com/')) {
      url = new URL('https://' + trimmed);
    }

    if (url) {
      if (url.hostname.toLowerCase() !== 'github.com') {
        return null;
      }
      trimmed = url.pathname;
    }
  } catch {
  }

  trimmed = trimmed.replace(/^\/+|\/+$/g, '');

  const parts = trimmed.split('/');
  if (parts.length < 2) return null;

  const owner = parts[0].trim();
  let repo = parts[1].trim();

  if (repo.toLowerCase().endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  if (!owner || !repo) return null;

  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
    return null;
  }

  let branch = null;
  if (parts.length >= 4 && parts[2] === 'tree') {
    branch = parts.slice(3).join('/').trim();
  } else if (parts.length > 2) {
    if (parts[2] !== 'tree') {
      return null;
    }
  }

  return { owner, repo, branch: branch || null };
}

export function buildGitHubUrls(owner, repo, branch, filePath) {
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  return {
    blobUrl: 'https://github.com/' + encOwner + '/' + encRepo + '/blob/' + encodedBranch + '/' + encodedPath,
    rawUrl: 'https://raw.githubusercontent.com/' + encOwner + '/' + encRepo + '/' + encodedBranch + '/' + encodedPath,
  };
}
